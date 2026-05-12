/**
 * GET /api/orchestrator/runs/[id] — run detail + ordered subtask list
 * Returns: { run, subtasks: [...], decomposition }
 */

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getBindings } from '@/lib/cloudflare'

export async function GET(
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
  const { DB } = getBindings()

  const run = await DB.prepare(
    `SELECT * FROM orchestrator_runs WHERE id = ? AND user_id = ?`,
  )
    .bind(id, user.id)
    .first()
  if (!run) {
    return new Response(JSON.stringify({ error: 'Run not found' }), { status: 404 })
  }

  const subtasks = await DB.prepare(
    `SELECT * FROM agent_subtasks WHERE pipeline_run_id = ? AND user_id = ?
       ORDER BY short_id ASC`,
  )
    .bind(id, user.id)
    .all()

  const decomposition = await DB.prepare(
    `SELECT id, summary, subtask_count, estimated_total_cost_usd,
            model_id, input_tokens, output_tokens, cost_usd, created_at
       FROM decompositions WHERE pipeline_run_id = ? LIMIT 1`,
  )
    .bind(id)
    .first()

  return new Response(
    JSON.stringify(
      { run, subtasks: subtasks.results ?? [], decomposition },
      null,
      2,
    ),
    { headers: { 'Content-Type': 'application/json' } },
  )
}
