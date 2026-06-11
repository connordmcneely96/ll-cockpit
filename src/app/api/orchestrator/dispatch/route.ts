/**
 * POST /api/orchestrator/dispatch — Sprint 13 v0.1 routed via LLM Router.
 */

import { NextRequest } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { createClient } from '@/lib/supabase-server'
import { getBindings } from '@/lib/cloudflare'
import { decomposeTask, persistDecomposition, HermesError } from '@/lib/hermes'
import { openGatesForRun } from '@/lib/permission-gate'

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

  const env = getBindings()
  const apiKey = env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }),
      { status: 500 },
    )
  }

  let result
  try {
    result = await decomposeTask(env, apiKey, user.id, task)
  } catch (err) {
    if (err instanceof HermesError) {
      return new Response(
        JSON.stringify({ error: 'HERMES decomposition failed', detail: err.message }),
        { status: 502 },
      )
    }
    throw err
  }

  const { runId, decompositionId } = await persistDecomposition(env.DB, {
    userId: user.id,
    originalTask: task,
    decomposition: result.decomposition,
    raw: result.raw,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    costUsd: result.costUsd,
    modelId: result.modelId,
  })

  if (autoExecute) {
    const origin = new URL(req.url).origin
    const cookieHeader = req.headers.get('cookie') ?? ''
    const { ctx } = getCloudflareContext()

    ctx.waitUntil(
      (async () => {
        try {
          if (!forceHitl) {
            await openGatesForRun(env.DB, user.id, runId)
          }
          const readyQuery = forceHitl
            ? `SELECT id FROM agent_subtasks WHERE pipeline_run_id = ? AND user_id = ? AND status = 'ready' ORDER BY short_id ASC LIMIT 10`
            : `SELECT id FROM agent_subtasks WHERE pipeline_run_id = ? AND user_id = ? AND status = 'ready' AND human_required = 0 ORDER BY short_id ASC LIMIT 10`
          const ready = await env.DB.prepare(readyQuery)
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
              }).catch(() => {}),
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
        decomposition_model: result.modelId,
        auto_execute: autoExecute,
        force_hitl: forceHitl,
      },
      null,
      2,
    ),
    { headers: { 'Content-Type': 'application/json' } },
  )
}
