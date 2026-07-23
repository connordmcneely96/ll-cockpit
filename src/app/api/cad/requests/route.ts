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
import { PumpShaftDutySchema, type PumpShaftDuty } from '@/lib/cad/duty'
import { runSpecIntake, type IntakeAssumption, type IntakeLlm, type IntakeResult } from '@/lib/cad/intake'
import type { CloudflareEnv } from '@/types'

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// Cheap pre-filter: does the prose even look like a rotating pump shaft? A non-match
// keeps the ungrounded path (cubes/brackets/generic parts) without paying for an LLM call.
const PUMP_KEYWORDS = /pump|shaft|impeller|volute|gpm|api ?610/i

/** The outcome of the duty-resolution precedence: either proceed to a run (optionally with an
 *  INTAKE-derived duty + assumptions), or short-circuit with an HTTP response. */
export type IntakeDecision =
  | { action: 'run'; duty?: PumpShaftDuty; assumptions?: IntakeAssumption[]; intake: boolean }
  | { action: 'respond'; status: number; body: Record<string, unknown> }

/**
 * Pure precedence logic, extracted so it can be tested without the Supabase/next server
 * deps of the route handler. Decides whether to run INTAKE, what duty/assumptions to hand
 * downstream, or what response to short-circuit with. Does NO DB work.
 *
 * runIntake/llm are injection seams for tests; runtime uses the real runSpecIntake.
 */
export async function intakeDecision(args: {
  env: CloudflareEnv
  spec: string
  rawDuty: unknown
  apiKey: string | undefined
  runIntake?: (a: { env: CloudflareEnv; apiKey: string; spec: string; llm?: IntakeLlm }) => Promise<IntakeResult>
  llm?: IntakeLlm
}): Promise<IntakeDecision> {
  const { env, spec, rawDuty, apiKey } = args
  const runIntake = args.runIntake ?? runSpecIntake

  // 1. Duty SUPPLIED -> validate exactly as before and SKIP INTAKE entirely.
  if (rawDuty !== undefined && rawDuty !== null) {
    const parsed = PumpShaftDutySchema.safeParse(rawDuty)
    if (!parsed.success) {
      return { action: 'respond', status: 400, body: { ok: false, error: 'invalid duty', issues: parsed.error.issues } }
    }
    return { action: 'run', duty: parsed.data, intake: false }
  }

  // 2. Duty ABSENT. If the spec doesn't look like a pump shaft, OR no API key is
  //    configured, take the existing UNGROUNDED path — never fabricate a duty.
  if (!PUMP_KEYWORDS.test(spec) || !apiKey) {
    return { action: 'run', intake: false }
  }

  // 3. Looks like a pump shaft -> INTAKE reads the prose.
  const result = await runIntake({ env, apiKey, spec, llm: args.llm })
  switch (result.status) {
    case 'filled':
      return { action: 'run', duty: result.duty, assumptions: result.assumptions, intake: true }
    case 'needs_clarification':
      return {
        action: 'respond',
        status: 200,
        body: {
          ok: true,
          status: 'needs_clarification',
          questions: result.questions,
          note: 'no run was created — the duty is incomplete. Answer these and resubmit.',
        },
      }
    case 'not_applicable':
      // Not a pump shaft after all -> ungrounded path (generic part), never an error.
      return { action: 'run', intake: false }
    case 'intake_error':
      return {
        action: 'respond',
        status: 400,
        body: {
          ok: false,
          error: 'intake_error',
          reason: result.reason,
          note: 'the spec could not be read — this is a fault, not an engineering result',
        },
      }
  }
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
