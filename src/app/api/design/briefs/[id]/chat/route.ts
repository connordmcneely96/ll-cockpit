/**
 * POST /api/design/briefs/[id]/chat — Sprint 16 v0.5.0 (live streaming)
 *
 * Returns Server-Sent Events when the client requests `Accept: text/event-stream`.
 * Otherwise returns the legacy JSON response with turn_messages (v0.4).
 *
 * SSE events:
 *   data: { type: "turn_start", turn_index }
 *   data: { type: "agent_text", turn_index, text }
 *   data: { type: "tool_use", turn_index, tool_use_id, tool_name, tool_input }
 *   data: { type: "tool_result", tool_use_id, content, is_error }
 *   data: { type: "done", final_text, tool_hops, cost_usd, input_tokens, output_tokens, latency_ms }
 *   data: { type: "error", message }
 */

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getBindings } from '@/lib/cloudflare'
import { runIterationAgent } from '@/lib/design/iteration-agent'
import type { StreamEvent } from '@/lib/design/iteration-agent'
import { loadDesignChatHistory, listDesignChatMessages } from '@/lib/design/iteration-chat'
import type { DesignBriefRow } from '@/types'
import type { User } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

async function getUserFromRequest(req: NextRequest): Promise<User | null> {
  const authHeader = req.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser(token)
    return user ?? null
  }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user ?? null
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getUserFromRequest(req)
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  const { id: briefId } = await ctx.params
  let body: { message?: string }
  try { body = (await req.json()) as { message?: string } }
  catch { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 }) }
  if (!body.message || !body.message.trim()) return new Response(JSON.stringify({ error: 'message is required' }), { status: 400 })

  const env = getBindings()
  const apiKey = env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY
  if (!apiKey) return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), { status: 500 })

  const brief = await env.DB
    .prepare(`SELECT * FROM design_briefs WHERE id = ? AND user_id = ?`)
    .bind(briefId, user.id)
    .first<DesignBriefRow>()
  if (!brief) return new Response(JSON.stringify({ error: 'Brief not found' }), { status: 404 })
  if (brief.status === 'building') return new Response(JSON.stringify({ error: 'Brief is still building.' }), { status: 409 })

  const priorTurns = await loadDesignChatHistory(env.DB, briefId, user.id)

  // v0.5.0 — SSE path when client requests streaming.
  const acceptHeader = req.headers.get('accept') ?? ''
  if (acceptHeader.includes('text/event-stream')) {
    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const emit = async (event: StreamEvent) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
          } catch (err) {
            console.error('SSE enqueue failed', err)
          }
        }

        try {
          await runIterationAgent({
            env,
            apiKey,
            userId: user.id,
            brief,
            userMessage: body.message!,
            priorTurns,
            emit,
          })
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          console.error('streaming iteration agent crashed', message)
          await emit({ type: 'error', message })
        } finally {
          try { controller.close() } catch { /* already closed */ }
        }
      },
      cancel() {
        // Client disconnected. The agent run will continue in the background
        // because runIterationAgent is awaited inside start(), but writes to
        // a closed controller will throw and be swallowed by the try/catch in
        // emit(). Persistence to D1 still completes.
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    })
  }

  // Legacy JSON path — unchanged from v0.4.
  try {
    const result = await runIterationAgent({
      env,
      apiKey,
      userId: user.id,
      brief,
      userMessage: body.message,
      priorTurns,
    })
    return new Response(
      JSON.stringify({
        ok: true,
        final_text: result.finalText,
        reply: result.finalText,
        agent: 'DESIGNER',
        tool_hops: result.toolHops,
        cost_usd: result.totalCostUsd,
        input_tokens: result.totalInputTokens,
        output_tokens: result.totalOutputTokens,
        latency_ms: result.latencyMs,
        turn_messages: result.turnMessages,
      }),
      { headers: { 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : 'iteration agent crashed' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getUserFromRequest(req)
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  const { id: briefId } = await ctx.params
  const env = getBindings()
  const messages = await listDesignChatMessages(env.DB, briefId, user.id)
  return new Response(JSON.stringify({ messages }), { headers: { 'Content-Type': 'application/json' } })
}
