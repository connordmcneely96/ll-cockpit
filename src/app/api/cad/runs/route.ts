/**
 * GET /api/cad/runs - the caller's CAD runs (read-only, owner-scoped, newest first).
 * Returns { ok, runs }. 401 if no session. No writes, no new table.
 */
import { createClient } from '@/lib/supabase-server'
import { getBindings } from '@/lib/cloudflare'

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

interface RunRow {
  run_id: string
  spec: string
  max_cycles: number
  cycle: number
  status: string
  design_status: string | null
  created_at: number
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return json({ ok: false, error: 'unauthorized' }, 401)

    const env = getBindings()
    const rows = await env.DB
      .prepare(`SELECT run_id, spec, max_cycles, cycle, status, design_status, created_at FROM cad_convergence_runs WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`)
      .bind(user.id)
      .all<RunRow>()

    return json({ ok: true, runs: rows.results ?? [] }, 200)
  } catch (err) {
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500)
  }
}
