/**
 * POST /api/design/briefs/[id]/resume — Sprint 18G v1.1
 *
 * Resumes a brief whose pipeline has failed subtasks. Resets all failed
 * COMPOSER/DESIGNER/CRITIC subtasks back to 'ready' (or 'pending' if their
 * dependencies aren't done yet), clears their error_log, then re-runs
 * runAutoWave to push the pipeline to completion.
 *
 * Use cases:
 *   - Rate-limit failures that have since resolved (Anthropic recovered)
 *   - Transient network failures
 *   - Recovering briefs from before Sprint 18G's retry logic was deployed
 *
 * Auth: Bearer token (from design Worker) or @supabase/ssr cookie.
 * Tenant isolation: only resumes briefs owned by the authenticated user.
 */

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getBindings } from '@/lib/cloudflare'
import { runAutoWave } from '@/lib/orchestrator'
import { cascadeReady } from '@/lib/hermes'
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
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: briefId } = await params
  const user = await getUserFromRequest(req)
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const env = getBindings()
  const apiKey = env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }),
      { status: 500 },
    )
  }

  // Tenant-isolated lookup
  const brief = await env.DB
    .prepare(
      `SELECT id, user_id, status, orchestrator_run_id, client_name
         FROM design_briefs WHERE id = ? AND user_id = ?`,
    )
    .bind(briefId, user.id)
    .first<{
      id: string
      user_id: string
      status: string
      orchestrator_run_id: string | null
      client_name: string
    }>()

  if (!brief) {
    return new Response(JSON.stringify({ error: 'not_found' }), { status: 404 })
  }

  if (!brief.orchestrator_run_id) {
    return new Response(
      JSON.stringify({ error: 'no_pipeline_run', message: 'Brief has no orchestrator run to resume' }),
      { status: 400 },
    )
  }

  // Reset failed subtasks
  const failedBefore = await env.DB
    .prepare(
      `SELECT id, short_id, agent_name, title, error_log FROM agent_subtasks
         WHERE pipeline_run_id = ? AND user_id = ? AND status = 'failed'`,
    )
    .bind(brief.orchestrator_run_id, user.id)
    .all<{ id: string; short_id: string; agent_name: string; title: string; error_log: string | null }>()

  const failedRows = failedBefore.results ?? []

  if (failedRows.length === 0) {
    return new Response(
      JSON.stringify({
        ok: true,
        brief_id: briefId,
        message: 'No failed subtasks to resume',
        failed_count: 0,
      }),
      { headers: { 'Content-Type': 'application/json' } },
    )
  }

  // Reset to 'pending' (cascadeReady will promote to 'ready' as deps complete)
  await env.DB
    .prepare(
      `UPDATE agent_subtasks
         SET status = 'pending', error_log = NULL, started_at = NULL, completed_at = NULL
         WHERE pipeline_run_id = ? AND user_id = ? AND status = 'failed'`,
    )
    .bind(brief.orchestrator_run_id, user.id)
    .run()

  // Re-mark the orchestrator run as running (in case it was failed/completed)
  await env.DB
    .prepare(
      `UPDATE orchestrator_runs
         SET status = 'running', last_active_at = ?, completed_at = NULL
         WHERE id = ?`,
    )
    .bind(Math.floor(Date.now() / 1000), brief.orchestrator_run_id)
    .run()

  // Re-mark the brief as building
  await env.DB
    .prepare(
      `UPDATE design_briefs SET status = 'building', updated_at = ? WHERE id = ?`,
    )
    .bind(Math.floor(Date.now() / 1000), briefId)
    .run()

  // Cascade ready: promote subtasks whose deps are 'done'
  const promoted = await cascadeReady(env.DB, brief.orchestrator_run_id)

  // Run the wave loop — picks up any 'ready' subtasks and runs them
  // Same Sprint 18G tuning: 4 parallel, retry on 429/529 inside provider
  const waveResult = await runAutoWave(
    env,
    apiKey,
    user.id,
    brief.orchestrator_run_id,
    { force: true, maxWaves: 10, maxParallel: 4 },
  )

  return new Response(
    JSON.stringify(
      {
        ok: true,
        brief_id: briefId,
        client_name: brief.client_name,
        failed_count_before: failedRows.length,
        failed_subtasks: failedRows.map((r) => ({
          short_id: r.short_id,
          title: r.title,
          previous_error: r.error_log?.slice(0, 120),
        })),
        promoted_after_cascade: promoted,
        wave: waveResult,
      },
      null,
      2,
    ),
    { headers: { 'Content-Type': 'application/json' } },
  )
}
