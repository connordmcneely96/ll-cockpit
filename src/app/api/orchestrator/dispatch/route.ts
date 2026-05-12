/**
 * POST /api/orchestrator/dispatch — Sprint 14 v0.1 entry point
 *
 * Body: { task: string }
 * Flow: auth → HERMES decompose → write run + subtasks + audit to D1 → return run state
 */

import { NextRequest } from 'next/server'
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

  let body: { task?: string }
  try {
    body = (await req.json()) as { task?: string }
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
      },
      null,
      2,
    ),
    { headers: { 'Content-Type': 'application/json' } },
  )
}
