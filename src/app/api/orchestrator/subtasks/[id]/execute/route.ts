/**
 * POST /api/orchestrator/subtasks/[id]/execute — v0.1 synchronous execution
 *
 * Runs ONE subtask: calls Claude with the assigned agent's system prompt,
 * writes output to subtask row, cascades dependents pending→ready, refreshes run aggregates.
 *
 * v0.2 will replace with Cloudflare Queue consumer for true async parallel.
 */

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getBindings } from '@/lib/cloudflare'
import { getAgent } from '@/lib/agents'
import { calculateCost } from '@/lib/cost'
import { cascadeReady, refreshRunAggregates } from '@/lib/hermes'

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const { id } = await ctx.params
  const { DB, ANTHROPIC_API_KEY } = getBindings()
  const apiKey = ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }),
      { status: 500 },
    )
  }

  // ── 1. Load subtask, verify ownership + ready state ──
  const subtask = await DB.prepare(
    `SELECT * FROM agent_subtasks WHERE id = ? AND user_id = ?`,
  )
    .bind(id, user.id)
    .first<{
      id: string
      pipeline_run_id: string
      agent_name: string
      title: string
      task: string
      status: string
      human_required: number
    }>()
  if (!subtask) {
    return new Response(JSON.stringify({ error: 'Subtask not found' }), { status: 404 })
  }
  if (subtask.status !== 'ready') {
    return new Response(
      JSON.stringify({
        error: `Subtask is in status '${subtask.status}', expected 'ready'`,
      }),
      { status: 409 },
    )
  }
  if (subtask.human_required) {
    return new Response(
      JSON.stringify({
        error: 'Subtask marked human_required — must be approved via HITL (Sprint 15)',
      }),
      { status: 403 },
    )
  }

  const agent = getAgent(subtask.agent_name)
  if (!agent) {
    return new Response(
      JSON.stringify({ error: `Unknown agent: ${subtask.agent_name}` }),
      { status: 400 },
    )
  }

  // ── 2. Mark running ──
  const startedAt = Math.floor(Date.now() / 1000)
  await DB.prepare(
    `UPDATE agent_subtasks SET status = 'running', started_at = ? WHERE id = ?`,
  )
    .bind(startedAt, id)
    .run()

  // ── 3. Call Claude with the agent's system prompt + the subtask description ──
  let output = ''
  let inputTokens = 0
  let outputTokens = 0
  let costUsd = 0
  let failedReason: string | null = null

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 2048,
        system: agent.systemPrompt,
        messages: [{ role: 'user', content: subtask.task }],
      }),
    })
    if (!res.ok) {
      failedReason = `Anthropic API ${res.status}: ${(await res.text()).slice(0, 200)}`
    } else {
      const data = (await res.json()) as {
        content: Array<{ type: string; text?: string }>
        usage: { input_tokens: number; output_tokens: number }
      }
      const text = data.content.find((c) => c.type === 'text')?.text ?? ''
      output = text
      inputTokens = data.usage.input_tokens
      outputTokens = data.usage.output_tokens
      costUsd = calculateCost(inputTokens, outputTokens)
    }
  } catch (err) {
    failedReason = err instanceof Error ? err.message : String(err)
  }

  // ── 4. Persist result ──
  const completedAt = Math.floor(Date.now() / 1000)
  if (failedReason) {
    await DB.prepare(
      `UPDATE agent_subtasks SET
         status = 'failed', error_log = ?, completed_at = ?
       WHERE id = ?`,
    )
      .bind(failedReason, completedAt, id)
      .run()
  } else {
    await DB.prepare(
      `UPDATE agent_subtasks SET
         status = 'done',
         output = ?,
         cost_usd = ?,
         tokens = ?,
         completed_at = ?
       WHERE id = ?`,
    )
      .bind(output, costUsd, inputTokens + outputTokens, completedAt, id)
      .run()
  }

  // ── 5. Cascade + refresh aggregates ──
  const promoted = await cascadeReady(DB, subtask.pipeline_run_id)
  await refreshRunAggregates(DB, subtask.pipeline_run_id)

  return new Response(
    JSON.stringify(
      {
        ok: failedReason === null,
        subtask_id: id,
        status: failedReason ? 'failed' : 'done',
        error: failedReason,
        cost_usd: costUsd,
        tokens: inputTokens + outputTokens,
        promoted_dependents: promoted,
        output: failedReason ? null : output,
      },
      null,
      2,
    ),
    { headers: { 'Content-Type': 'application/json' } },
  )
}
