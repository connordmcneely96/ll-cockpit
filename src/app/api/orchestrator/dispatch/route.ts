/**
 * POST /api/orchestrator/dispatch — Sprint 14 v0.2 entry point
 *
 * Body:
 *   {
 *     task: string,
 *     auto_execute?: boolean,    // default true — kick off runAutoWave after planning
 *     force_hitl?: boolean,      // default true when auto_execute — bypass HITL for v0.1 testing
 *     max_waves?: number,
 *     max_parallel?: number
 *   }
 *
 * Flow:
 *   1. auth
 *   2. HERMES decompose
 *   3. persist run + subtasks + audit to D1
 *   4. if auto_execute: kick off runAutoWave via ctx.waitUntil (fire and forget)
 *   5. return run state immediately — UI polling animates progress
 */

import { NextRequest } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { createClient } from '@/lib/supabase-server'
import { getBindings } from '@/lib/cloudflare'
import { decomposeTask, persistDecomposition, HermesError } from '@/lib/hermes'
import { runAutoWave } from '@/lib/orchestrator'

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
    max_waves?: number
    max_parallel?: number
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
  const maxWaves = body.max_waves ?? 20
  const maxParallel = body.max_parallel ?? 8

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

  // Kick off the auto-wave in the background. UI polling will animate progress.
  if (autoExecute) {
    const { ctx } = getCloudflareContext()
    ctx.waitUntil(
      runAutoWave(DB, apiKey, user.id, runId, {
        force: forceHitl,
        maxWaves,
        maxParallel,
      }).catch(() => {
        // best-effort; failures surface in D1 status
      }),
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
