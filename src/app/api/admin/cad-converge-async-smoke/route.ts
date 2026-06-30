/**
 * POST /api/admin/cad-converge-async-smoke - Slice A2b
 * Kicks off an async self-correcting CAD convergence run. Each modeler->reviewer
 * cycle is its own queue message; on a FAIL verdict the reviewer-subtask hook
 * (advanceConvergence) spawns the next modeler+reviewer pair, capped by
 * max_cycles. No synchronous loop, no timeout.
 * Body: { spec?: string, max_cycles?: number, seed_flaw?: boolean }
 * Auth required.
 */
import { createClient } from '@/lib/supabase-server'
import { getBindings } from '@/lib/cloudflare'
import { createConvergenceRun } from '@/lib/cad-convergence'

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return json({ ok: false, error: 'unauthorized' }, 401)
    const userId = user.id

    let body: { spec?: string; max_cycles?: number; seed_flaw?: boolean }
    try {
      body = await req.json()
    } catch {
      body = {}
    }
    const spec = (body.spec ?? '').trim() || 'Design a solid cube, exactly 100 mm on every side.'
    const maxCycles = Math.min(Math.max(body.max_cycles ?? 3, 1), 5)
    const seedFlaw = body.seed_flaw === true

    const env = getBindings()
    const r = await createConvergenceRun(env, userId, spec, maxCycles, seedFlaw)

    return json({
      ok: true,
      ...r,
      maxCycles,
      seedFlaw,
      status: 'enqueued',
      note: 'async self-correcting loop — poll cad_convergence_runs + agent_subtasks',
    }, 200)
  } catch (err) {
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500)
  }
}
