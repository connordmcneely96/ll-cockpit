import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getBindings } from '@/lib/cloudflare'
import { getAgent } from '@/lib/agents'
import { calculateCost, SESSION_TOKEN_LIMIT } from '@/lib/cost'
import { captureTrainingData } from '@/lib/training'
import type { SSEEvent } from '@/types'

const encoder = new TextEncoder()

function sseChunk(event: SSEEvent): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
}

interface AnthropicMessageStart {
  type: 'message_start'
  message: { usage: { input_tokens: number } }
}
interface AnthropicContentBlockStart {
  type: 'content_block_start'
  index: number
  content_block: { type: string; id?: string; name?: string; text?: string }
}
interface AnthropicContentBlockDelta {
  type: 'content_block_delta'
  index: number
  delta: { type: string; text?: string; partial_json?: string }
}
interface AnthropicMessageDelta {
  type: 'message_delta'
  delta: { stop_reason: string }
  usage?: { output_tokens: number }
}
type AnthropicEvent =
  | AnthropicMessageStart
  | AnthropicContentBlockStart
  | AnthropicContentBlockDelta
  | AnthropicMessageDelta
  | { type: string }

export async function POST(req: NextRequest) {
  // ── 1. Auth ──
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  // ── 1b. Agent permission check ──
  let agentNameEarly: string
  try {
    const rawBody = await req.clone().json() as { agentName: string; message: string }
    agentNameEarly = rawBody.agentName
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 })
  }

  const { data: permission } = await supabase
    .from('user_agent_permissions')
    .select('can_access')
    .eq('user_id', user.id)
    .eq('agent_id', agentNameEarly.toUpperCase())
    .single()

  if (permission && !permission.can_access) {
    return new Response(
      JSON.stringify({ error: 'Agent access denied' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // ── 2. Parse body ──
  let agentName: string, message: string
  try {
    const body = await req.json() as { agentName: string; message: string }
    agentName = body.agentName
    message = body.message
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 })  
  }

  // ── 3. Load agent ──
  const agent = getAgent(agentName)
  if (!agent) {
    return new Response(JSON.stringify({ error: `Unknown agent: ${agentName}` }), { status: 404 })
  }

  // ── 4. Get bindings ──
  const { DB, KV, ANTHROPIC_API_KEY } = getBindings()
  const apiKey = ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), { status: 500 })
  }

  // ── 5. Token budget check ──
  const kvKey = `session_tokens:${user.id}`
  const storedTokens = await KV.get(kvKey)
  const currentTokens = storedTokens ? parseInt(storedTokens, 10) : 0
  if (currentTokens >= SESSION_TOKEN_LIMIT) {
    return new Response(
      JSON.stringify({ error: 'Session token limit reached (100k). Start a new session.' }),
      { status: 429 }
    )
  }

  // ── 6. Create task record ──
  const taskId = crypto.randomUUID()
  await DB.prepare(
    `INSERT INTO agent_tasks (id, user_id, agent_name, task_type, input, status, created_at)
     VALUES (?, ?, ?, 'chat', ?, 'running', unixepoch())`
  ).bind(taskId, user.id, agentName, message).run()

  // ── 7. Call Anthropic ──
  const anthropicBody: Record<string, unknown> = {
    model: 'claude-sonnet-4-5',
    max_tokens: 8096,
    stream: true,
    system: agent.systemPrompt,
    messages: [{ role: 'user', content: message }],
  }

  if (agent.tools.length > 0) {
    anthropicBody.tools = agent.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema,
    }))
  }

  let anthropicRes: Response
  try {
    anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(anthropicBody),
    })
  } catch (fetchErr) {
    console.error('[stream] fetch to Anthropic failed:', fetchErr)
    return new Response(
      JSON.stringify({ error: 'Failed to reach Anthropic API' }),
      { status: 502 }
    )
  }

  if (!anthropicRes.ok) {
    const errText = await anthropicRes.text()
    console.error('[stream] Anthropic error response:', anthropicRes.status, errText)
    return new Response(
      JSON.stringify({ error: `Anthropic API error: ${anthropicRes.status}` }),
      { status: 502 }
    )
  }

  // ── 8. Stream ──
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: SSEEvent) => controller.enqueue(sseChunk(event))

      let fullResponse = ''
      let totalInputTokens = 0
      let totalOutputTokens = 0
      let currentToolId = ''
      let currentToolName = ''  // fix: was using .text, now correctly uses .name
      let currentToolInput = ''
      const startMs = Date.now()

      try {
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

            let evt: AnthropicEvent
            try {
              evt = JSON.parse(raw) as AnthropicEvent
            } catch {
              continue
            }

            if (evt.type === 'message_start') {
              const e = evt as AnthropicMessageStart
              totalInputTokens = e.message.usage.input_tokens

            } else if (evt.type === 'content_block_start') {
              const e = evt as AnthropicContentBlockStart
              if (e.content_block.type === 'tool_use') {
                currentToolId = e.content_block.id ?? ''
                // FIX: tool name is in .name, not .text
                currentToolName = e.content_block.name ?? ''
                currentToolInput = ''
              }

            } else if (evt.type === 'content_block_delta') {
              const e = evt as AnthropicContentBlockDelta
              if (e.delta.type === 'text_delta' && e.delta.text) {
                fullResponse += e.delta.text
                send({ type: 'text', content: e.delta.text })
              } else if (e.delta.type === 'input_json_delta' && e.delta.partial_json) {
                currentToolInput += e.delta.partial_json
              }

            } else if (evt.type === 'content_block_stop') {
              if (currentToolId && currentToolName) {
                let parsedInput: Record<string, unknown> = {}
                try { parsedInput = JSON.parse(currentToolInput) } catch { /* ok */ }

                const requiresApproval = agent.permissions.requires_approval.includes(currentToolName)
                send({
                  type: 'tool_call',
                  id: currentToolId,
                  name: currentToolName,
                  input: parsedInput,
                  requiresApproval,
                })

                await DB.prepare(
                  `INSERT INTO tool_calls (id, task_id, user_id, tool_name, user_approved, created_at)
                   VALUES (?, ?, ?, ?, ?, unixepoch())`
                ).bind(currentToolId, taskId, user.id, currentToolName, requiresApproval ? 0 : 1).run()

                currentToolId = ''
                currentToolName = ''
                currentToolInput = ''
              }

            } else if (evt.type === 'message_delta') {
              const e = evt as AnthropicMessageDelta
              if (e.usage?.output_tokens) {
                totalOutputTokens = e.usage.output_tokens
              }
            }
          }
        }

        // ── 9. Finalize ──
        const totalTokens = totalInputTokens + totalOutputTokens
        const costUsd = calculateCost(totalInputTokens, totalOutputTokens)
        const latencyMs = Date.now() - startMs

        await KV.put(kvKey, String(currentTokens + totalTokens), { expirationTtl: 86400 })

        await DB.prepare(
          `UPDATE agent_tasks SET output = ?, status = 'complete', tokens_used = ?, cost_usd = ? WHERE id = ?`
        ).bind(fullResponse, totalTokens, costUsd, taskId).run()

        await DB.prepare(
          `INSERT INTO ai_completions (id, agent_name, model_key, task_type, input_tokens, output_tokens, cost_usd, latency_ms, success, created_at)
           VALUES (?, ?, ?, 'chat', ?, ?, ?, ?, 1, datetime('now'))`
        ).bind(crypto.randomUUID(), agentName, 'claude-sonnet-4-5', totalInputTokens, totalOutputTokens, costUsd, latencyMs).run()

        await DB.prepare(
          `INSERT INTO analytics_events (id, event_name, page_path, session_id, metadata_json, created_at)
           VALUES (?, 'agent_message', '/agent', ?, ?, datetime('now'))`
        ).bind(crypto.randomUUID(), taskId, JSON.stringify({ agent: agentName, tokens: totalTokens, cost: costUsd })).run()

        if (fullResponse.length > 100) {
          await captureTrainingData({ db: DB, agentName, instruction: message, response: fullResponse })
        }

        send({ type: 'done', tokensUsed: totalTokens, costUsd, taskId })

      } catch (e) {
        console.error('[stream] stream error:', e)
        const errMsg = e instanceof Error ? `${e.name}: ${e.message}` : 'Unknown streaming error'
        send({ type: 'error', message: errMsg })

        await DB.prepare(
          `INSERT INTO ai_completions (id, agent_name, model_key, task_type, input_tokens, output_tokens, cost_usd, latency_ms, success, created_at)
           VALUES (?, ?, 'claude-sonnet-4-5', 'chat', 0, 0, 0, ?, 0, datetime('now'))`
        ).bind(crypto.randomUUID(), agentName, Date.now() - startMs).run().catch(() => {})

        await DB.prepare(
          `UPDATE agent_tasks SET status = 'error', error_log = ? WHERE id = ?`
        ).bind(errMsg, taskId).run()

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
