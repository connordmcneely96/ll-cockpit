/**
 * Duty-resolution precedence for POST /api/cad/requests, extracted out of the route
 * module: a Next.js App Router route.ts may only export HTTP verb handlers, so this pure
 * helper (and its type) live here instead. No behavior change — a byte-for-byte move.
 */
import { PumpShaftDutySchema, type PumpShaftDuty } from '@/lib/cad/duty'
import { runSpecIntake, type IntakeAssumption, type IntakeLlm, type IntakeResult } from '@/lib/cad/intake'
import type { CloudflareEnv } from '@/types'

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
