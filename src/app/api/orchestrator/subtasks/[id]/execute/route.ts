/**
 * POST /api/orchestrator/subtasks/[id]/execute — v0.1 synchronous execution
 *
 * v0.1 enhancements (this revision):
 *  • Pulls outputs from dependency subtasks and prepends them as context
 *    so downstream agents (SENTINEL review, DISPATCH packaging, etc.) see
 *    the actual upstream work, not just task descriptions.
 *  • Accepts ?force=true query param to bypass HITL check for v0.1 testing
 *    (will be removed once Sprint 15 HITL approval flow lands).
 *
 * v0.2 will replace synchronous with Cloudflare Queue consumer for true async parallel.
 */

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getBindings } from '@/lib/cloudflare'
import { getAgent } from '@/lib/agents'
import { calculateCost } from '@/lib/cost'
import { cascadeReady, refreshRunAggregates } from '@/lib/hermes'

export async function POST(
  req: NextRequest,
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
  const url = new URL(req.url)
  const force = url.searchParams.get('force') === 'true'

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
      depends_on: string | null
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
  if (subtask.human_required && !force) {
    return new Response(
      JSON.stringify({
        error:
          'Subtask marked human_required — must be approved via HITL (Sprint 15). Use ?force=true to bypass for v0.1 testing.',
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

  // ── 2. Pull dependency outputs for context ──
  let dependencyContext = ''
  const depShortIds: string[] = subtask.depends_on
    ? JSON.parse(subtask.depends_on)
    : []
  if (depShortIds.length > 0) {
    const placeholders = depShortIds.map(() => '?').join(',')
    const depRows = await DB.prepare(
      `SELECT short_id, agent_name, title, output FROM agent_subtasks
        WHERE pipeline_run_id = ? AND user_id = ?
          AND short_id IN (${placeholders})
          AND output IS NOT NULL
        ORDER BY short_id ASC`,
    )
      .bind(subtask.pipeline_run_id, user.id, ...depShortIds)
      .all<{
        short_id: string
        agent_name: string
        title: string
        output: string
      }>()

    if (depRows.results && depRows.results.length > 0) {
      dependencyContext =
        '## Context from upstream subtasks\n\n' +
        depRows.results
          .map(
            (r) =>
              `### ${r.short_id} — ${r.agent_name.toUpperCase()} — ${r.title}\n\n${r.output}`,
          )
          .join('\n\n---\n\n') +
        '\n\n---\n\n'
    }
  }

  // ── 3. Mark running ──
  const startedAt = Math.floor(Date.now() / 1000)
  await DB.prepare(
    `UPDATE agent_subtasks SET status = 'running', started_at = ? WHERE id = ?`,
  )
    .bind(startedAt, id)
    .run()

  // ── 4. Call Claude with the agent's system prompt + context + the subtask task ──
  let output = ''
  let inputTokens = 0
  let outputTokens = 0
  let costUsd = 0
  let failedReason: string | null = null

  const userMessage = dependencyContext + subtask.task

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
        messages: [{ role: 'user', content: userMessage }],
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

  // ── 5. Persist result ──
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

  // ── 6. Cascade + refresh aggregates ──
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
        dependency_context_chars: dependencyContext.length,
        output: failedReason ? null : output,
      },
      null,
      2,
    ),
    { headers: { 'Content-Type': 'application/json' } },
  )
}
