/**
 * /api/admin/cad-converge-async-smoke - Slice A2b
 * Kicks off an async self-correcting CAD convergence run. Each modeler->reviewer
 * cycle is its own queue message; on a FAIL verdict the reviewer-subtask hook
 * (advanceConvergence) spawns the next modeler+reviewer pair, capped by
 * max_cycles. No synchronous loop, no timeout.
 *
 * POST body:  { spec?: string, max_cycles?: number, seed_flaw?: boolean }
 * GET  query: ?seed_flaw=1 (&max_cycles=3&spec=...) — phone-friendly trigger.
 *             A visit with NO seed_flaw param returns help and does NOT fire a run.
 * Auth required (Supabase session) on both.
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

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const seedFlawParam = url.searchParams.get('seed_flaw')

    // Safety: a bare visit (no seed_flaw param) does NOT fire a run — returns help.
    if (seedFlawParam === null) {
      return json({
        ok: true,
        help: 'Add ?seed_flaw=1 to fire a seeded convergence run. Optional: &max_cycles=3&spec=<text>',
        example: '/api/admin/cad-converge-async-smoke?seed_flaw=1',
      }, 200)
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return json({ ok: false, error: 'unauthorized' }, 401)
    const userId = user.id

    const spec = (url.searchParams.get('spec') ?? '').trim() || 'Design a solid cube, exactly 100 mm on every side.'
    const maxCyclesRaw = Number(url.searchParams.get('max_cycles') ?? 3)
    const maxCycles = Math.min(Math.max(Number.isFinite(maxCyclesRaw) ? maxCyclesRaw : 3, 1), 5)
    const seedFlaw = seedFlawParam === '1' || seedFlawParam === 'true'

    const env = getBindings()
    const r = await createConvergenceRun(env, userId, spec, maxCycles, seedFlaw)

    return json({
      ok: true,
      ...r,
      maxCycles,
      seedFlaw,
      status: 'enqueued',
      note: 'triggered via GET — poll cad_convergence_runs + agent_subtasks',
    }, 200)
  } catch (err) {
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500)
  }
}
