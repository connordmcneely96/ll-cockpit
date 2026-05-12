/**
 * GET /api/design/briefs/[id] — brief detail + iterations + lazy finalization
 */

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getBindings } from '@/lib/cloudflare'
import { finalizeIterationIfReady, type FinalizationResult } from '@/lib/design/pipeline'
import type { DesignBriefRow, DesignIterationRow, OrchestratorRunRow } from '@/types'

export async function GET(
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
  const env = await getBindings()

  const brief = await env.DB
    .prepare(`SELECT * FROM design_briefs WHERE id = ? AND user_id = ?`)
    .bind(id, user.id)
    .first<DesignBriefRow>()
  if (!brief) {
    return new Response(JSON.stringify({ error: 'Brief not found' }), { status: 404 })
  }

  const iterations = await env.DB
    .prepare(
      `SELECT * FROM design_iterations WHERE brief_id = ? ORDER BY iteration_number DESC`,
    )
    .bind(id)
    .all<DesignIterationRow>()

  const latest = iterations.results?.[0]
  let finalization: FinalizationResult | null = null
  if (latest && brief.orchestrator_run_id) {
    const run = await env.DB
      .prepare(`SELECT * FROM orchestrator_runs WHERE id = ?`)
      .bind(brief.orchestrator_run_id)
      .first<OrchestratorRunRow>()
    if (run) {
      finalization = await finalizeIterationIfReady(
        env,
        new URL(req.url).origin,
        brief,
        latest,
        run,
      )
      if (finalization.finalized) {
        const refreshedIter = await env.DB
          .prepare(`SELECT * FROM design_iterations WHERE id = ?`)
          .bind(latest.id)
          .first<DesignIterationRow>()
        const refreshedBrief = await env.DB
          .prepare(`SELECT * FROM design_briefs WHERE id = ?`)
          .bind(id)
          .first<DesignBriefRow>()
        if (refreshedIter && iterations.results) iterations.results[0] = refreshedIter
        if (refreshedBrief) Object.assign(brief, refreshedBrief)
      }
    }
  }

  let run: OrchestratorRunRow | null = null
  let subtasks: unknown[] = []
  if (brief.orchestrator_run_id) {
    run = await env.DB
      .prepare(`SELECT * FROM orchestrator_runs WHERE id = ?`)
      .bind(brief.orchestrator_run_id)
      .first<OrchestratorRunRow>()
    const subtaskRows = await env.DB
      .prepare(
        `SELECT * FROM agent_subtasks WHERE pipeline_run_id = ? ORDER BY short_id ASC`,
      )
      .bind(brief.orchestrator_run_id)
      .all()
    subtasks = subtaskRows.results ?? []
  }

  return new Response(
    JSON.stringify(
      { brief, iterations: iterations.results ?? [], run, subtasks, finalization },
      null, 2,
    ),
    { headers: { 'Content-Type': 'application/json' } },
  )
}
