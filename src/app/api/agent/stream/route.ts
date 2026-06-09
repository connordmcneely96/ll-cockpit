import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getBindings } from '@/lib/cloudflare'
import { getAgent } from '@/lib/agents'
import { calculateCost, SESSION_TOKEN_LIMIT } from '@/lib/cost'
import { captureTrainingData } from '@/lib/training'
import {
  loadChatHistory, getChat, createChat, persistMessage, type AnthropicMessage,
} from '@/lib/agent-chat'
import { getRoute } from '@/lib/model-router'
import type { RouteResult } from '@/lib/model-router'
import type { SSEEvent } from '@/types'

const encoder = new TextEncoder()
function sseChunk(event: SSEEvent): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  let agentName: string,
      message: string,
      providedChatId: string | undefined,
      source: string,
      qualityTier: 'standard' | 'premium',
      taskTypeOverride: string | undefined

  try {
    const body = await req.json() as {
      agentName: string
      message: string
      chatId?: string
      source?: string
      quality_tier?: 'standard' | 'premium'
      task_type?: string
    }
    agentName       = body.agentName
    message         = body.message
    providedChatId  = body.chatId
    source          = body.source ?? 'chat'
    qualityTier     = body.quality_tier ?? 'standard'
    taskTypeOverride = body.task_type
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 })
  }

  const { data: permission } = await supabase
    .from('user_agent_permissions')
    .select('can_access')
    .eq('user_id', user.id)
    .eq('agent_id', agentName.toUpperCase())
    .single()
  if (permission && !permission.can_access) {
    return new Response(JSON.stringify({ error: 'Agent access denied' }), { status: 403 })
  }

  const agent = getAgent(agentName)
  if (!agent) return new Response(JSON.stringify({ error: `Unknown agent: ${agentName}` }), { status: 404 })

  const { DB, KV, ANTHROPIC_API_KEY, OPENROUTER_API_KEY } = getBindings()
  const apiKey = ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY
  if (!apiKey) return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), { status: 500 })

  // Resolve winning model from NEXUS routing tables (KV-cached 60s)
  const route: RouteResult = await getRoute(DB, KV, agentName, taskTypeOverride, qualityTier)
  console.log(`[stream] routing ${agentName}/${taskTypeOverride ?? 'default'} → ${route.model_id} (${route.provider}, ${route.tier})`)

  const kvKey = `session_tokens:${user.id}`
  const storedTokens = await KV.get(kvKey)
  const currentTokens = storedTokens ? parseInt(storedTokens, 10) : 0
  if (currentTokens >= SESSION_TOKEN_LIMIT) {
    return new Response(JSON.stringify({ error: 'Session token limit reached (100k).' }), { status: 429 })
  }

  let chatId = providedChatId
  let priorMessages: AnthropicMessage[] = []

  if (chatId) {
    const existing = await getChat(DB, chatId, user.id)
    if (!existing) return new Response(JSON.stringify({ error: `Chat ${chatId} not found` }), { status: 404 })
    if (existing.agent_name !== agentName) {
      return new Response(JSON.stringify({ error: `Chat belongs to ${existing.agent_name}, not ${agentName}` }), { status: 400 })
    }
    priorMessages = await loadChatHistory(DB, chatId, user.id)
  } else {
    chatId = await createChat(DB, { userId: user.id, agentName, firstUserMessage: message })
  }

  await persistMessage(DB, { chatId, userId: user.id, role: 'user', content: message })

  const taskId = crypto.randomUUID()
  await DB.prepare(
    `INSERT INTO agent_tasks (id, user_id, agent_name, task_type, input, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'running', unixepoch())`
  ).bind(taskId, user.id, agentName, source, message).run()

  const messages: AnthropicMessage[] = [...priorMessages, { role: 'user', content: message }]

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: SSEEvent) => controller.enqueue(sseChunk(event))
      let fullResponse = ''
      let totalInputTokens = 0
      let totalOutputTokens = 0
      const startMs = Date.now()

      try {
        // ── Anthropic provider ────────────────────────────────────────────
        if (route.provider === 'anthropic') {
          const anthropicBody: Record<string, unknown> = {
            model: route.model_id,
            max_tokens: 16000,
            stream: true,
            system: agent.systemPrompt,
            messages,
          }
          if (agent.tools.length > 0) {
            anthropicBody.tools = agent.tools.map((t) => ({
              name: t.name,
              description: t.description,
              input_schema: t.input_schema,
            }))
          }

          const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify(anthropicBody),
          })

          if (!anthropicRes.ok) {
            const errText = await anthropicRes.text()
            console.error('[stream] Anthropic error:', anthropicRes.status, errText)
            send({ type: 'error', message: `Anthropic API error: ${anthropicRes.status}` })
            controller.close()
            return
          }

          let stopReason = ''
          let currentToolId = '', currentToolName = '', currentToolInput = ''
          const collectedToolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }> = []
          const reader = anthropicRes.body!.getReader()
          const dec = new TextDecoder()
          let buffer = ''

          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            buffer += dec.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() ?? ''

            for (const line of lines) {
              if (!line.startsWith('data: ')) continue
              const raw = line.slice(6).trim()
              if (raw === '[DONE]') continue
              let evt: Record<string, unknown>
              try { evt = JSON.parse(raw) as Record<string, unknown> } catch { continue }

              if (evt.type === 'message_start') {
                totalInputTokens = ((evt.message as Record<string, unknown>)?.usage as Record<string, unknown>)?.input_tokens as number ?? 0
              } else if (evt.type === 'content_block_start') {
                const cb = evt.content_block as Record<string, unknown>
                if (cb?.type === 'tool_use') {
                  currentToolId   = (cb.id   as string) ?? ''
                  currentToolName = (cb.name as string) ?? ''
                  currentToolInput = ''
                }
              } else if (evt.type === 'content_block_delta') {
                const d = evt.delta as Record<string, unknown>
                if (d?.type === 'text_delta' && d.text) {
                  fullResponse += d.text as string
                  send({ type: 'text', content: d.text as string })
                } else if (d?.type === 'input_json_delta' && d.partial_json) {
                  currentToolInput += d.partial_json as string
                }
              } else if (evt.type === 'content_block_stop') {
                if (currentToolId && currentToolName) {
                  let parsedInput: Record<string, unknown> = {}
                  try { parsedInput = JSON.parse(currentToolInput) } catch {}
                  const requiresApproval = agent.permissions.requires_approval.includes(currentToolName)
                  send({ type: 'tool_call', id: currentToolId, name: currentToolName, input: parsedInput, requiresApproval })
                  collectedToolCalls.push({ id: currentToolId, name: currentToolName, input: parsedInput })
                  await DB.prepare(
                    `INSERT INTO tool_calls (id, task_id, user_id, tool_name, user_approved, created_at)
                     VALUES (?, ?, ?, ?, ?, unixepoch())`
                  ).bind(currentToolId, taskId, user.id, currentToolName, requiresApproval ? 0 : 1).run()
                  currentToolId = ''; currentToolName = ''; currentToolInput = ''
                }
              } else if (evt.type === 'message_delta') {
                const md = evt as Record<string, unknown>
                if ((md.usage as Record<string, unknown>)?.output_tokens) {
                  totalOutputTokens = (md.usage as Record<string, unknown>).output_tokens as number
                }
                if ((md.delta as Record<string, unknown>)?.stop_reason) {
                  stopReason = (md.delta as Record<string, unknown>).stop_reason as string
                }
              }
            }
          }

          if (stopReason === 'max_tokens') {
            const notice = '\n\n---\n\n_⚠️ Output reached the length limit and may be truncated. Re-run with a more focused brief for complete results._'
            fullResponse += notice
            send({ type: 'text', content: notice })
          }

          // Persist tool calls if any (Anthropic-only; OpenRouter tool support is a future sprint)
          if (collectedToolCalls.length > 0) {
            await persistMessage(DB, {
              chatId: chatId!, userId: user.id, role: 'assistant', content: fullResponse,
              toolCallsJson: JSON.stringify(collectedToolCalls), taskId,
              modelId: route.model_id, inputTokens: totalInputTokens,
              outputTokens: totalOutputTokens, costUsd: 0,
            })
          }

        // ── OpenRouter / OpenAI provider ──────────────────────────────────
        } else {
          const orKey = (OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY) ?? ''
          const baseUrl = route.provider === 'openai'
            ? 'https://api.openai.com/v1'
            : 'https://openrouter.ai/api/v1'

          // Flatten messages for OpenAI-compatible format
          const orMessages: Array<{ role: string; content: string }> = [
            ...(agent.systemPrompt ? [{ role: 'system', content: agent.systemPrompt }] : []),
            ...messages.map(m => ({
              role: m.role,
              content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
            })),
          ]

          // Note: tool_calls not yet wired for non-Anthropic providers — future sprint
          const orRes = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${orKey}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': 'https://ll-cockpit.connorpattern.workers.dev',
            },
            body: JSON.stringify({
              model: route.model_id,
              messages: orMessages,
              stream: true,
              max_tokens: 16000,
            }),
          })

          if (!orRes.ok) {
            const errText = await orRes.text()
            console.error('[stream] OpenRouter/OpenAI error:', orRes.status, errText)
            send({ type: 'error', message: `Model API error: ${orRes.status}` })
            controller.close()
            return
          }

          const reader = orRes.body!.getReader()
          const dec = new TextDecoder()
          let buffer = ''

          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            buffer += dec.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() ?? ''

            for (const line of lines) {
              if (!line.startsWith('data: ')) continue
              const raw = line.slice(6).trim()
              if (raw === '[DONE]') continue
              let chunk: {
                choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }>
                usage?: { prompt_tokens?: number; completion_tokens?: number }
              }
              try { chunk = JSON.parse(raw) } catch { continue }

              const text = chunk.choices?.[0]?.delta?.content
              if (text) {
                fullResponse += text
                send({ type: 'text', content: text })
              }
              if (chunk.usage) {
                totalInputTokens  = chunk.usage.prompt_tokens     ?? totalInputTokens
                totalOutputTokens = chunk.usage.completion_tokens ?? totalOutputTokens
              }
              if (chunk.choices?.[0]?.finish_reason === 'length') {
                const notice = '\n\n---\n\n_⚠️ Output reached the length limit and may be truncated._'
                fullResponse += notice
                send({ type: 'text', content: notice })
              }
            }
          }
        }

        // ── Shared post-stream logging (both providers) ───────────────────
        const totalTokens = totalInputTokens + totalOutputTokens
        const costUsd = totalInputTokens > 0
          ? (totalInputTokens * route.cost_input_per_1m + totalOutputTokens * route.cost_output_per_1m) / 1_000_000
          : calculateCost(totalInputTokens, totalOutputTokens)
        const latencyMs = Date.now() - startMs

        await KV.put(kvKey, String(currentTokens + totalTokens), { expirationTtl: 86400 })
        await DB.prepare(
          `UPDATE agent_tasks SET output = ?, status = 'complete', tokens_used = ?, cost_usd = ? WHERE id = ?`
        ).bind(fullResponse, totalTokens, costUsd, taskId).run()

        await persistMessage(DB, {
          chatId: chatId!,
          userId: user.id,
          role: 'assistant',
          content: fullResponse,
          toolCallsJson: null,
          taskId,
          modelId: route.model_id,
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          costUsd,
        })

        await DB.prepare(
          `INSERT INTO ai_completions (id, agent_name, model_key, task_type, input_tokens, output_tokens, cost_usd, latency_ms, success, created_at)
           VALUES (?, ?, ?, 'chat', ?, ?, ?, ?, 1, datetime('now'))`
        ).bind(crypto.randomUUID(), agentName, route.model_id, totalInputTokens, totalOutputTokens, costUsd, latencyMs).run()

        await DB.prepare(
          `INSERT INTO analytics_events (id, event_name, page_path, session_id, metadata_json, created_at)
           VALUES (?, 'agent_message', '/agent', ?, ?, datetime('now'))`
        ).bind(
          crypto.randomUUID(), taskId,
          JSON.stringify({ agent: agentName, model: route.model_id, tier: route.tier, tokens: totalTokens, cost: costUsd, chat_id: chatId })
        ).run()

        if (fullResponse.length > 100) {
          await captureTrainingData({ db: DB, agentName, instruction: message, response: fullResponse })
        }

        send({ type: 'done', tokensUsed: totalTokens, costUsd, taskId, chatId })

      } catch (e) {
        console.error('[stream] error:', e)
        const errMsg = e instanceof Error ? `${e.name}: ${e.message}` : 'Unknown'
        send({ type: 'error', message: errMsg })
        await DB.prepare(
          `INSERT INTO ai_completions (id, agent_name, model_key, task_type, input_tokens, output_tokens, cost_usd, latency_ms, success, created_at)
           VALUES (?, ?, ?, 'chat', 0, 0, 0, ?, 0, datetime('now'))`
        ).bind(crypto.randomUUID(), agentName, route.model_id, Date.now() - startMs).run().catch(() => {})
        await DB.prepare(`UPDATE agent_tasks SET status = 'error', error_log = ? WHERE id = ?`).bind(errMsg, taskId).run()
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
