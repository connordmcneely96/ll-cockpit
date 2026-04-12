import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase-server'
import { getBindings } from '@/lib/cloudflare'
import { getAgent } from '@/lib/agents'
import { calculateCost, SESSION_TOKEN_LIMIT } from '@/lib/cost'
import { captureTrainingData } from '@/lib/training'
import type { SSEEvent } from '@/types'

export const runtime = 'edge'

const encoder = new TextEncoder()

function sseChunk(event: SSEEvent): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
}

export async function POST(req: NextRequest) {
  // ── 1. Auth ──────────────────────────────────────────────────────────────────
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  // ── 2. Parse body ─────────────────────────────────────────────────────────────
  let agentName: string, message: string
  try {
    const body = await req.json()
    agentName = body.agentName
    message = body.message
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 })
  }

  // ── 3. Load agent ─────────────────────────────────────────────────────────────
  const agent = getAgent(agentName)
  if (!agent) {
    return new Response(JSON.stringify({ error: `Unknown agent: ${agentName}` }), { status: 404 })
  }

  // ── 4. Get bindings ───────────────────────────────────────────────────────────
  const { DB, KV, ANTHROPIC_API_KEY } = getBindings()
  const apiKey = ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), { status: 500 })
  }

  // ── 5. Token budget check ──────────────────────────────────────────────────────
  const kvKey = `session_tokens:${user.id}`
  const storedTokens = await KV.get(kvKey)
  const currentTokens = storedTokens ? parseInt(storedTokens, 10) : 0
  if (currentTokens >= SESSION_TOKEN_LIMIT) {
    return new Response(
      JSON.stringify({ error: 'Session token limit reached (100k). Start a new session.' }),
      { status: 429 }
    )
  }

  // ── 6. Create task record ──────────────────────────────────────────────────────
  const taskId = crypto.randomUUID()
  await DB.prepare(
    `INSERT INTO agent_tasks (id, user_id, agent_name, task_type, input, status, created_at)
     VALUES (?, ?, ?, 'chat', ?, 'running', unixepoch())`
  ).bind(taskId, user.id, agentName, message).run()

  // ── 7. Stream ─────────────────────────────────────────────────────────────────
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: SSEEvent) => controller.enqueue(sseChunk(event))

      let fullResponse = ''
      let totalInputTokens = 0
      let totalOutputTokens = 0

      try {
        const anthropic = new Anthropic({ apiKey })

        const anthropicTools: Anthropic.Tool[] = agent.tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.input_schema as Anthropic.Tool['input_schema'],
        }))

        const streamParams: Anthropic.MessageStreamParams = {
          model: 'claude-sonnet-4-6',
          max_tokens: 8096,
          system: agent.systemPrompt,
          messages: [{ role: 'user', content: message }],
          ...(anthropicTools.length > 0 ? { tools: anthropicTools } : {}),
        }

        const msgStream = anthropic.messages.stream(streamParams)

        for await (const chunk of msgStream) {
          if (chunk.type === 'content_block_delta') {
            if (chunk.delta.type === 'text_delta') {
              fullResponse += chunk.delta.text
              send({ type: 'text', content: chunk.delta.text })
            }
          } else if (chunk.type === 'content_block_start') {
            if (chunk.content_block.type === 'tool_use') {
              const requiresApproval = agent.permissions.requires_approval.includes(
                chunk.content_block.name
              )
              send({
                type: 'tool_call',
                id: chunk.content_block.id,
                name: chunk.content_block.name,
                input: {},
                requiresApproval,
              })

              // Log tool call to D1
              await DB.prepare(
                `INSERT INTO tool_calls (id, task_id, user_id, tool_name, user_approved, created_at)
                 VALUES (?, ?, ?, ?, ?, unixepoch())`
              ).bind(
                chunk.content_block.id,
                taskId,
                user.id,
                chunk.content_block.name,
                requiresApproval ? 0 : 1
              ).run()
            }
          } else if (chunk.type === 'message_delta') {
            if (chunk.usage) {
              totalOutputTokens += chunk.usage.output_tokens
            }
          } else if (chunk.type === 'message_start') {
            totalInputTokens = chunk.message.usage.input_tokens
          }
        }

        // ── 8. Finalize ──────────────────────────────────────────────────────────
        const totalTokens = totalInputTokens + totalOutputTokens
        const costUsd = calculateCost(totalInputTokens, totalOutputTokens)

        // Update token budget in KV (expire after 24h)
        await KV.put(kvKey, String(currentTokens + totalTokens), { expirationTtl: 86400 })

        // Update task in D1
        await DB.prepare(
          `UPDATE agent_tasks SET output = ?, status = 'complete', tokens_used = ?, cost_usd = ? WHERE id = ?`
        ).bind(fullResponse, totalTokens, costUsd, taskId).run()

        // Capture training data
        if (fullResponse.length > 100) {
          await captureTrainingData({ db: DB, agentName, instruction: message, response: fullResponse })
        }

        send({ type: 'done', tokensUsed: totalTokens, costUsd, taskId })
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : 'Unknown streaming error'
        send({ type: 'error', message: errMsg })

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
