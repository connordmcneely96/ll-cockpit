/**
 * POST /api/orchestrator/dispatch — Sprint 14 v0.2.1 entry point
 *
 * Body:
 *   {
 *     task: string,
 *     auto_execute?: boolean,  // default true — fire self-tick fan-out after planning
 *     force_hitl?: boolean,    // default true when auto_execute — bypass HITL for v0.1 testing
 *   }
 *
 * Flow:
 *   1. auth
 *   2. HERMES decompose
 *   3. persist run + subtasks + audit to D1
 *   4. if auto_execute: fan-out via fetch to /internal/process-subtask for each ready subtask
 *      — each call is a FRESH Worker invocation with its own ~30s budget (avoids the
 *        ctx.waitUntil time-limit bug from v0.2)
 *   5. return run state immediately — UI polling animates progress
 */

import { NextRequest } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { createClient } from '@/lib/supabase-server'
import { getBindings } from '@/lib/cloudflare'
import { decomposeTask, persistDecomposition, HermesError } from '@/lib/hermes'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  let body: {
    task?: string
    auto_execute?: boolean
    force_hitl?: boolean
  }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 })
  }
  const task = (body.task ?? '').trim()
  if (!task) {
    return new Response(JSON.stringify({ error: 'task is required' }), { status: 400 })
  }
  if (task.length > 4000) {
    return new Response(
      JSON.stringify({ error: 'task too long (max 4000 chars)' }),
      { status: 400 },
    )
  }

  const autoExecute = body.auto_execute !== false
  const forceHitl = body.force_hitl !== false

  const { DB, ANTHROPIC_API_KEY } = getBindings()
  const apiKey = ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }),
      { status: 500 },
    )
  }

  let result
  try {
    result = await decomposeTask(apiKey, task)
  } catch (err) {
    if (err instanceof HermesError) {
      return new Response(
        JSON.stringify({ error: 'HERMES decomposition failed', detail: err.message }),
        { status: 502 },
      )
    }
    throw err
  }

  const { runId, decompositionId } = await persistDecomposition(DB, {
    userId: user.id,
    originalTask: task,
    decomposition: result.decomposition,
    raw: result.raw,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    costUsd: result.costUsd,
  })

  // Fan out to self-tick endpoint. Each call is a fresh Worker invocation
  // with its own ~30s ctx.waitUntil budget.
  if (autoExecute) {
    const origin = new URL(req.url).origin
    const cookieHeader = req.headers.get('cookie') ?? ''
    const { ctx } = getCloudflareContext()

    ctx.waitUntil(
      (async () => {
        try {
          const readyQuery = forceHitl
            ? `SELECT id FROM agent_subtasks WHERE pipeline_run_id = ? AND user_id = ? AND status = 'ready' ORDER BY short_id ASC LIMIT 10`
            : `SELECT id FROM agent_subtasks WHERE pipeline_run_id = ? AND user_id = ? AND status = 'ready' AND human_required = 0 ORDER BY short_id ASC LIMIT 10`

          const ready = await DB.prepare(readyQuery)
            .bind(runId, user.id)
            .all<{ id: string }>()

          const ids = (ready.results ?? []).map((r) => r.id)
          if (ids.length === 0) return

          await Promise.all(
            ids.map((id) =>
              fetch(`${origin}/api/orchestrator/internal/process-subtask`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Cookie: cookieHeader,
                },
                body: JSON.stringify({ subtaskId: id, runId, force: forceHitl }),
              }).catch(() => {
                /* best-effort */
              }),
            ),
          )
        } catch {
          /* best-effort */
        }
      })(),
    )
  }

  return new Response(
    JSON.stringify(
      {
        ok: true,
        run_id: runId,
        decomposition_id: decompositionId,
        summary: result.decomposition.summary,
        subtask_count: result.decomposition.subtasks.length,
        estimated_cost_usd: result.decomposition.estimated_total_cost_usd,
        estimated_duration_minutes: result.decomposition.estimated_duration_minutes,
        decomposition_cost_usd: result.costUsd,
        auto_execute: autoExecute,
        force_hitl: forceHitl,
      },
      null,
      2,
    ),
    { headers: { 'Content-Type': 'application/json' } },
  )
}
