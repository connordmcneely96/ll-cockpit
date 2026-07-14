/**
 * POST /api/cad/requests - production CAD request entry point.
 * Kicks off the self-correcting CAD convergence pipeline for a real spec:
 * MODELER builds the part (build123d), CAD-REVIEWER verifies measured geometry
 * vs the spec, and it auto-corrects up to max_cycles. Unlike the admin smoke
 * route this is POST-only, requires a real spec (no cube fallback), and does
 * NOT expose seed_flaw.
 *
 * Body: { spec: string, max_cycles?: number, duty?: PumpShaftDuty }
 * When a duty is supplied it is solved FIRST; an infeasible design returns 200
 * with a negative answer and NO geometry. Auth required (Supabase session).
 */
import { createClient } from '@/lib/supabase-server'
import { getBindings } from '@/lib/cloudflare'
import { createConvergenceRun } from '@/lib/cad-convergence'
import { PumpShaftDutySchema } from '@/lib/cad/duty'

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

    let body: { spec?: string; max_cycles?: number; duty?: unknown }
    try {
      body = await req.json()
    } catch {
      body = {}
    }

    const spec = (body.spec ?? '').trim()
    if (!spec) return json({ ok: false, error: 'spec is required' }, 400)
    if (spec.length > 4000) return json({ ok: false, error: 'spec too long (max 4000 chars)' }, 400)

    const maxCycles = Math.min(Math.max(body.max_cycles ?? 3, 1), 5)

    // Validate the duty when present — a strict, typed duty is the gate's input.
    let duty
    if (body.duty !== undefined && body.duty !== null) {
      const parsed = PumpShaftDutySchema.safeParse(body.duty)
      if (!parsed.success) {
        return json({ ok: false, error: 'invalid duty', issues: parsed.error.issues }, 400)
      }
      duty = parsed.data
    }

    const env = getBindings()
    const r = await createConvergenceRun(env, userId, spec, maxCycles, false, duty)

    // An infeasible design is a SUCCESSFUL request with a NEGATIVE answer, not a 500:
    // the design does not close, so NO geometry was generated.
    if (r.status === 'infeasible') {
      return json({
        ok: true,
        runId: r.runId,
        status: 'infeasible',
        diagnosis: r.diagnosis,
        note: 'no geometry was generated — the design does not close',
      }, 200)
    }

    return json({
      ok: true,
      runId: r.runId,
      modelerId: r.modelerId,
      reviewerId: r.reviewerId,
      designStatus: r.designStatus,
      maxCycles,
      status: 'enqueued',
      note: 'async self-correcting CAD loop — poll cad_convergence_runs + agent_subtasks',
    }, 200)
  } catch (err) {
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500)
  }
}
