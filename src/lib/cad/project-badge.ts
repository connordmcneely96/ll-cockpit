/**
 * Sprint 196E — projected CAD trust-badge.
 *
 * Status is TWO RAW AXES (RunStatus × DesignStatus), never crammed into one. This module
 * projects those two axes into a SINGLE color badge for presentation only — both raw axes
 * survive downstream; statusDetailFor carries the nuance. The projection mirrors the frozen
 * VerticalStage §3 contract (Lane 5, nexus-shell) VERBATIM:
 *
 *   RunStatus            DesignStatus     projected badge
 *   converged            converged        converged      (the only true pass)
 *   converged            ungrounded       pending        (never green)
 *   converged            null             pending        (never green)
 *   infeasible           infeasible       infeasible     (violet, distinct)
 *   exhausted            (any)            exhausted      (gold — its OWN treatment, NOT failed)
 *   running              (any)            running
 *   failed               (any)            failed
 *   solver_error (either axis)            failed
 *   (anything unmatched)                  failed         (fail-closed)
 *
 * Do not invent states, do not collapse `exhausted` into `failed`, and let nothing but
 * (converged,converged) be green.
 */
export type RunStatus = 'pending' | 'running' | 'converged' | 'exhausted' | 'failed' | 'infeasible'
export type DesignStatus = 'converged' | 'infeasible' | 'solver_error' | 'ungrounded' | null
// FiveState + 'exhausted'. Named explicitly so the mismatch with Lane 5's current
// FiveState (which lacks 'exhausted') is VISIBLE, not silently coerced.
export type BadgeState = 'pending' | 'running' | 'converged' | 'infeasible' | 'exhausted' | 'failed'

export function projectBadge(
  runStatus: string | null | undefined,
  designStatus: string | null | undefined,
): BadgeState {
  // exhausted is gold — its OWN treatment, NEVER failed — and the §3 table lists it ABOVE
  // the solver_error row, so it must win even when design==='solver_error'. Checked first
  // (test 4 pins (exhausted, solver_error) -> exhausted, not failed).
  if (runStatus === 'exhausted') return 'exhausted'          // BEFORE any converged/design logic
  // solver_error on EITHER axis -> failed (for every non-exhausted run).
  if (runStatus === 'failed' || designStatus === 'solver_error') return 'failed'
  if (runStatus === 'infeasible' || designStatus === 'infeasible') return 'infeasible'
  if (runStatus === 'running') return 'running'
  if (runStatus === 'converged') {
    return designStatus === 'converged' ? 'converged' : 'pending'  // ungrounded/null/anything -> pending, NEVER green
  }
  if (runStatus === 'pending') return 'pending'
  return 'failed'                                             // fail-closed
}

export function statusDetailFor(args: {
  runStatus: string | null | undefined
  designStatus: string | null | undefined
  cycle?: number | null
  maxCycles?: number | null
}): string {
  const { runStatus, designStatus, cycle, maxCycles } = args
  if (runStatus === 'exhausted' && cycle != null && maxCycles != null) return `exhausted ${cycle}/${maxCycles}`
  if (runStatus === 'converged' && designStatus === 'ungrounded') return 'ungrounded — no duty'
  if (runStatus === 'converged' && (designStatus == null)) return 'legacy — no design'
  if (designStatus === 'solver_error') return 'solver fault'
  return ''
}
