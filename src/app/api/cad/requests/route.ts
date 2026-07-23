/**
 * POST /api/cad/requests - production CAD request entry point.
 * Kicks off the self-correcting CAD convergence pipeline for a real spec:
 * MODELER builds the part (build123d), CAD-REVIEWER verifies measured geometry
 * vs the spec, and it auto-corrects up to max_cycles. Unlike the admin smoke
 * route this is POST-only, requires a real spec (no cube fallback), and does
 * NOT expose seed_flaw.
 *
 * Body: { spec: string, max_cycles?: number, duty?: PumpShaftDuty }
 * Duty resolution precedence (see intakeDecision):
 *   1. duty SUPPLIED  -> validate with PumpShaftDutySchema (INTAKE skipped entirely).
 *   2. duty ABSENT + spec doesn't look like a pump shaft (or no API key) -> ungrounded path.
 *   3. duty ABSENT + pump-shaft keywords -> INTAKE reads the prose and fills the duty,
 *      asks (no run) when incomplete, or defers to the ungrounded path when not_applicable.
 * When a duty is present it is solved FIRST; an infeasible design returns 200 with a
 * negative answer and NO geometry. Auth required (Supabase session).
 */
import { createClient } from '@/lib/supabase-server'
import { getBindings } from '@/lib/cloudflare'
import { createConvergenceRun } from '@/lib/cad-convergence'
import { intakeDecision } from '@/lib/cad/intake-decision'

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

    const env = getBindings()

    // Resolve the duty: supplied+validated, INTAKE-derived, or none (ungrounded).
    const decision = await intakeDecision({ env, spec, rawDuty: body.duty, apiKey: env.ANTHROPIC_API_KEY })
    if (decision.action === 'respond') {
      return json(decision.body, decision.status)
    }

    const r = await createConvergenceRun(env, userId, spec, maxCycles, false, decision.duty, decision.assumptions)

    // A solver_error is a FAULT, not an engineering result: the shaft solver could
    // not be run (bad request / auth / transport / timeout / bad envelope). Surface it
    // as a 400 so it is never mistaken for a converged or infeasible design.
    if (r.status === 'solver_error') {
      return json({
        ok: false,
        error: 'solver_error',
        reason: r.reason,
        note: 'the shaft solver could not be run — this is a fault, not an engineering result',
      }, 400)
    }

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
      // Only present (true) when INTAKE derived the duty from prose — a caller can then
      // tell an INTAKE-derived duty from a hand-written one. Omitted on every other path
      // so the ungrounded / duty-supplied responses stay byte-identical to before.
      ...(decision.intake ? { intake: true } : {}),
      status: 'enqueued',
      note: 'async self-correcting CAD loop — poll cad_convergence_runs + agent_subtasks',
    }, 200)
  } catch (err) {
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500)
  }
}
