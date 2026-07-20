import type { CloudflareEnv } from '@/types'
import type { PumpShaftDuty } from './duty'

/**
 * Sprint 196D — solve first, then gate.
 *
 * solvePumpShaft calls the engineering-calcs worker (API 610 / ISO 13709 shaft
 * solver) through the ENGINEERING_CALCS service binding and returns a converged,
 * calc-grounded design OR an infeasible outcome carrying the solver's diagnosis
 * VERBATIM. Geometry is forbidden unless this returns 'converged'.
 */

// The calc-grounded design. Field names mirror what the solver returns and what
// modelerTaskFor renders; the index signature preserves any extra fields so the
// full solver output survives round-trips through design_json.
export interface DesignFeature {
  type?: string
  axialPosition?: number | string
  diameter?: number
  notes?: string
  [k: string]: unknown
}
export interface DesignCheck {
  criterion?: string
  computed?: number | string
  limit?: number | string
  citation?: string
  [k: string]: unknown
}
export interface DesignAssumption {
  parameter?: string
  basis?: string
  impact?: string
  [k: string]: unknown
}
export interface SolvedDesign {
  diameter?: number   // shaft diameter, in
  length?: number     // overall length, in
  material?: string
  features?: DesignFeature[]
  checks?: DesignCheck[]
  assumptions?: DesignAssumption[]
  [k: string]: unknown
}

export type SolveOutcome =
  | { status: 'converged'; design: SolvedDesign }
  | { status: 'infeasible'; diagnosis: string }   // engineering: the design does not close
  | { status: 'solver_error'; reason: string }    // fault: bad request / auth / transport / timeout / bad envelope

// A dimension the design gate can verify: a finite number strictly greater than 0.
function isFinitePositive(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0
}

const CALC_PATH = '/api/shafts/generate'
const TIMEOUT_MS = 30000

export async function solvePumpShaft(env: CloudflareEnv, duty: PumpShaftDuty): Promise<SolveOutcome> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    // The engineering-calcs binding is an internal service binding and today
    // requires no auth (the live caller sends none). Send X-Calc-Secret ONLY when a
    // secret is configured, so we match current behaviour and start authenticating
    // the moment CALC_SECRET is provisioned — never emitting an "undefined" header.
    if (env.CALC_SECRET) headers['X-Calc-Secret'] = env.CALC_SECRET

    const res = await env.ENGINEERING_CALCS.fetch(
      new Request('https://engineering-calcs' + CALC_PATH, {
        method: 'POST',
        headers,
        body: JSON.stringify(duty),
        signal: controller.signal,
      }),
    )
    const text = await res.text()
    let parsed: unknown = null
    try { parsed = JSON.parse(text) } catch { parsed = null }
    const obj = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null

    // The worker returns 400 { success:false, error:{ code, message } } on BOTH
    // validation failure AND infeasibility, and distinguishes them by error.code:
    //   'CALCULATION_ERROR' -> the shaft does not converge: a genuine ENGINEERING
    //                          verdict (message begins "shaft design infeasible: ...").
    //   everything else ('VALIDATION_ERROR', 'UNAUTHORIZED', 'NOT_FOUND', missing
    //                          code, any non-2xx with no usable message) -> a FAULT.
    // Surface the worker's message VERBATIM — it IS the deliverable, never reworded.
    if (!res.ok || obj?.success === false) {
      const errField = obj?.error
      const errObj = errField && typeof errField === 'object' ? (errField as Record<string, unknown>) : null
      const code = errObj && typeof errObj.code === 'string' ? errObj.code : undefined
      let message: string
      if (errObj && 'message' in errObj) {
        message = String(errObj.message)
      } else if (typeof errField === 'string') {
        message = errField
      } else {
        message = text ? text.slice(0, 1000) : `shaft solver returned HTTP ${res.status}`
      }
      if (code === 'CALCULATION_ERROR') return { status: 'infeasible', diagnosis: message }
      return { status: 'solver_error', reason: message }
    }

    // SUCCESS. The worker wraps the design as { success:true, result:<SolvedDesign>, metadata }.
    // FAIL-CLOSED: a design we cannot dimensionally verify is NOT a converged design.
    // If result is not an object, or diameter/length are not BOTH finite-positive, this
    // is a solver fault (bad envelope) — never a silent pass to the modeler.
    const result = obj?.result
    if (
      !result || typeof result !== 'object' ||
      !isFinitePositive((result as Record<string, unknown>).diameter) ||
      !isFinitePositive((result as Record<string, unknown>).length)
    ) {
      return {
        status: 'solver_error',
        reason: 'solver reported success but returned no usable dimensions: ' + text.slice(0, 200),
      }
    }
    return { status: 'converged', design: result as SolvedDesign }
  } catch (err) {
    // Abort (timeout) or transport error is a FAULT, never an engineering verdict.
    const reason =
      err instanceof Error && err.name === 'AbortError'
        ? `shaft solver timed out after ${TIMEOUT_MS / 1000}s with no response — design cannot be confirmed`
        : `shaft solver call failed: ${err instanceof Error ? err.message : String(err)}`
    return { status: 'solver_error', reason }
  } finally {
    clearTimeout(timer)
  }
}
