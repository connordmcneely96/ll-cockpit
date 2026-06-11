/**
 * GET /api/orchestrator/approvals — list this user's pending approval gates.
 * Sprint 7 · PermissionGate (Option B). Surface-agnostic (web + Telegram).
 */

import { createClient } from '@/lib/supabase-server'
import { getBindings } from '@/lib/cloudflare'

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const { DB } = getBindings()
  const pending = await DB.prepare(
    `SELECT p.id, p.agent, p.action_type, p.payload, p.subtask_id,
            p.pipeline_run_id, p.created_at,
            s.title AS subtask_title, s.risk_level, s.status AS subtask_status
       FROM pending_approvals p
       LEFT JOIN agent_subtasks s ON s.id = p.subtask_id
      WHERE p.user_id = ? AND p.status = 'pending'
      ORDER BY p.created_at ASC
      LIMIT 100`,
  )
    .bind(user.id)
    .all()

  return new Response(
    JSON.stringify({ ok: true, pending: pending.results ?? [] }, null, 2),
    { headers: { 'Content-Type': 'application/json' } },
  )
}
