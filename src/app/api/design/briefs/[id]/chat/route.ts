/**
 * POST /api/design/briefs/[id]/chat — Sprint 16 v0.4.0
 *
 * Chat with the design iteration agent to refine a finished brief.
 * Loads prior chat history, runs the tool-use loop, persists all turns,
 * and returns the per-turn message rows so the design Worker can render
 * inline tool-call cards.
 *
 * Request:  { message: string }
 * Response: {
 *   ok, final_text, reply, agent, tool_hops, cost_usd,
 *   input_tokens, output_tokens, latency_ms,
 *   turn_messages: Array<{                       // v0.4.0
 *     id, role, content, tool_calls_json,
 *     tool_results_json, cost_usd, created_at
 *   }>
 * }
 */

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getBindings } from '@/lib/cloudflare'
import { runIterationAgent } from '@/lib/design/iteration-agent'
import { loadDesignChatHistory, listDesignChatMessages } from '@/lib/design/iteration-chat'
import type { DesignBriefRow } from '@/types'
import type { User } from '@supabase/supabase-js'

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
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const { id: briefId } = await ctx.params
  let body: { message?: string }
  try {
    body = (await req.json()) as { message?: string }
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 })
  }
  if (!body.message || !body.message.trim()) {
    return new Response(JSON.stringify({ error: 'message is required' }), { status: 400 })
  }

  const env = getBindings()
  const apiKey = env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }),
      { status: 500 },
    )
  }

  const brief = await env.DB
    .prepare(`SELECT * FROM design_briefs WHERE id = ? AND user_id = ?`)
    .bind(briefId, user.id)
    .first<DesignBriefRow>()
  if (!brief) {
    return new Response(JSON.stringify({ error: 'Brief not found' }), { status: 404 })
  }
  if (brief.status === 'building') {
    return new Response(
      JSON.stringify({ error: 'Brief is still building. Wait for the initial run to complete.' }),
      { status: 409 },
    )
  }

  const priorTurns = await loadDesignChatHistory(env.DB, briefId, user.id)

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
        // v0.4.0 — per-turn assistant + tool_result rows so the design
        // Worker can render inline tool-call cards next to the chat reply.
        turn_messages: result.turnMessages,
      }),
      { headers: { 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: err instanceof Error ? err.message : 'iteration agent crashed',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getUserFromRequest(req)
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }
  const { id: briefId } = await ctx.params
  const env = getBindings()
  const messages = await listDesignChatMessages(env.DB, briefId, user.id)
  return new Response(JSON.stringify({ messages }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
