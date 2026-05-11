/**
 * GET /api/leads/[id] — fetch a lead with full pipeline state
 * Returns: { lead, pipeline_run, messages: [...] }
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

  const lead = await DB.prepare(`SELECT * FROM leads WHERE id = ? AND user_id = ?`)
    .bind(id, user.id)
    .first()
  if (!lead) {
    return new Response(JSON.stringify({ error: 'Lead not found' }), { status: 404 })
  }

  const pipelineRun = await DB.prepare(
    `SELECT * FROM pipeline_runs WHERE lead_id = ? AND user_id = ? ORDER BY started_at DESC LIMIT 1`,
  )
    .bind(id, user.id)
    .first<{ id: string }>()

  let messages: unknown[] = []
  if (pipelineRun) {
    const msgRows = await DB.prepare(
      `SELECT id, from_agent, to_agent, via_agent, message_type, status, subject,
              body, payload_json, pipeline_stage, created_at, routed_at,
              delivered_at, processed_at, error_log
         FROM agent_messages
        WHERE pipeline_id = ? AND user_id = ?
        ORDER BY created_at ASC`,
    )
      .bind(pipelineRun.id, user.id)
      .all()
    messages = msgRows.results ?? []
  }

  return new Response(
    JSON.stringify({ lead, pipeline_run: pipelineRun, messages }, null, 2),
    { headers: { 'Content-Type': 'application/json' } },
  )
}
