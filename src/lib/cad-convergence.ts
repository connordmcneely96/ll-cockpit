/**
 * Slice A2b — async self-correcting CAD convergence loop.
 *
 * A convergence run is a chain of modeler->reviewer subtask pairs in the real
 * async DAG. Each cycle is its own queue message (no synchronous timeout). When
 * a reviewer subtask completes, executeOneSubtask calls advanceConvergence:
 *   - reviewer PASS  -> mark the run 'converged' (stop).
 *   - reviewer FAIL  -> if cycles remain, spawn the next modeler+reviewer pair
 *                       (status 'ready'/'pending'); the consumer enqueues the
 *                       new 'ready' modeler automatically. Otherwise 'exhausted'.
 *
 * Verdict parsing is FAIL-CLOSED: an unparseable reviewer verdict is treated as
 * a failure, never a pass.
 */
import type { CloudflareEnv } from '@/types'
import { enqueueReadySubtasks } from '@/workers/subtask-consumer'
import type { PumpShaftDuty } from './cad/duty'
import { solvePumpShaft, type SolvedDesign, type DesignFeature, type DesignCheck, type DesignAssumption } from './cad/solve-design'

/**
 * Result of createConvergenceRun. 'infeasible' means the design gate closed BEFORE
 * any geometry — no modeler, no reviewer, no subtasks. 'created' means a converged
 * (or ungrounded) design produced the modeler+reviewer pair.
 */
export type CreateConvergenceResult =
  | { runId: string; status: 'infeasible'; diagnosis: string }
  | { runId: string; status: 'created'; modelerId: string; reviewerId: string; designStatus: 'converged' | 'ungrounded' }

export interface Verdict {
  pass: boolean
  discrepancies: string[]
}

/**
 * Parse the CAD-REVIEWER's JSON verdict. Strips ```json/``` fences. FAIL-CLOSED:
 * any parse failure returns pass:false so a malformed verdict can never be
 * mistaken for approval.
 */
export function parseVerdict(text: string): Verdict {
  try {
    let t = (text ?? '').trim()
    t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
    const obj = JSON.parse(t)
    return {
      pass: obj.pass === true,
      discrepancies: Array.isArray(obj.discrepancies) ? obj.discrepancies.map(String) : [],
    }
  } catch {
    return { pass: false, discrepancies: ['reviewer verdict could not be parsed'] }
  }
}

/** The instruction handed to a reviewer subtask (modeler output is prepended as dependencyContext). */
export function reviewerTaskFor(spec: string): string {
  return `SPEC:\n${spec}\n\nThe upstream MODELER output is provided above as context and includes the measured GEOMETRY_METRICS. Judge the produced geometry against this SPEC and return ONLY your verdict JSON.`
}

/** Parse a cad_convergence_runs.design_json blob back into a SolvedDesign (null on absent/invalid). */
export function parseDesign(designJson: string | null | undefined): SolvedDesign | null {
  if (!designJson) return null
  try {
    const d = JSON.parse(designJson)
    return d && typeof d === 'object' ? (d as SolvedDesign) : null
  } catch {
    return null
  }
}

function num(v: unknown): string {
  return v === null || v === undefined || v === '' ? '(unspecified)' : String(v)
}

function renderFeatures(features?: DesignFeature[]): string {
  if (!Array.isArray(features) || features.length === 0) {
    return '    (none — build the plain shaft to the diameter and length above)'
  }
  return features.map((f) => {
    const parts: string[] = []
    if (f.type != null) parts.push(String(f.type))
    if (f.axialPosition != null) parts.push(`axial ${f.axialPosition}`)
    if (f.diameter != null) parts.push(`Ø${f.diameter} in`)
    if (f.notes != null) parts.push(String(f.notes))
    return `    - ${parts.join(' — ')}`
  }).join('\n')
}

function renderChecks(checks?: DesignCheck[]): string {
  if (!Array.isArray(checks) || checks.length === 0) return '    (none reported)'
  return checks.map((c) =>
    `    - ${num(c.criterion)}: computed ${num(c.computed)} vs limit ${num(c.limit)} [${num(c.citation)}]`,
  ).join('\n')
}

function renderAssumptions(assumptions?: DesignAssumption[]): string {
  if (!Array.isArray(assumptions) || assumptions.length === 0) return '    (none reported)'
  return assumptions.map((a) =>
    `    - ${num(a.parameter)}: ${num(a.basis)} (impact: ${num(a.impact)})`,
  ).join('\n')
}

/**
 * The instruction handed to a MODELER subtask. When a converged design exists the
 * task is TRANSCRIPTION — the modeler builds the SOLVED numbers exactly and never
 * designs. When design is null (the generic path) the original free-text spec is
 * returned UNCHANGED so cubes/brackets/pipes keep working.
 */
export function modelerTaskFor(spec: string, design: SolvedDesign | null): string {
  if (!design) return spec
  return `SOLVED DESIGN — these dimensions are the OUTPUT of a calc-grounded solver (API 610 / ISO 13709). They are NOT suggestions. Build EXACTLY these.

  shaft diameter : ${num(design.diameter)} in
  overall length : ${num(design.length)} in
  material       : ${num(design.material)}
  features       :
${renderFeatures(design.features)}

CHECKS (each with its standard):
${renderChecks(design.checks)}

ASSUMPTIONS:
${renderAssumptions(design.assumptions)}

You are TRANSCRIBING a solved design into build123d. You will NOT choose, round, adjust, or "improve" any dimension. If a dimension appears wrong, STOP and say so in your output — do NOT silently substitute your own value. Do NOT call engineering_calc. The design is already solved. Emit GEOMETRY_METRICS exactly as today.`
}

// Deterministic seed flaw (test only, designed for the default cube spec): the cycle-1
// modeler is handed a normal, self-consistent WRONG spec instead of the real one, so it
// faithfully builds the wrong part with no fight against its grounding. The reviewer still
// judges against the real spec, so cycle 1 deterministically fails and the correction loop
// (including the cycle-2 modeler) always runs.
const SEED_FLAW_SPEC = 'Design a solid cube, exactly 50 mm on every side.'

/**
 * Create a fresh convergence run: orchestrator_run + cad_convergence_runs row +
 * the first modeler (ready) / reviewer (pending) subtask pair, then enqueue the
 * ready modeler.
 */
export async function createConvergenceRun(
  env: CloudflareEnv,
  userId: string,
  spec: string,
  maxCycles: number,
  seedFlaw: boolean,
  duty?: PumpShaftDuty,
): Promise<CreateConvergenceResult> {
  const db = env.DB
  const now = Math.floor(Date.now() / 1000)
  const runId = crypto.randomUUID()

  // ── THE GATE: solve the design FIRST when a duty is supplied. ──
  // No geometry without a converged design. An infeasible design is not a failure —
  // it is a correct ANSWER, so it is persisted with its verbatim diagnosis and NO
  // subtasks are created. A duty that solves is grounded ('converged'); a run with
  // no duty is the generic path, marked 'ungrounded' so the gap is visible/countable.
  let designStatus: 'converged' | 'ungrounded' = 'ungrounded'
  let design: SolvedDesign | null = null

  if (duty) {
    const outcome = await solvePumpShaft(env, duty)
    if (outcome.status === 'infeasible') {
      await db.prepare(
        `INSERT INTO orchestrator_runs
          (id, user_id, original_task, summary, status, subtask_count, subtasks_completed, subtasks_failed, actual_cost_usd, tokens, started_at, last_active_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(runId, userId, spec, 'CAD design gate — infeasible (196D)', 'infeasible', 0, 0, 0, 0, 0, now, now).run()

      await db.prepare(
        `INSERT INTO cad_convergence_runs
          (run_id, user_id, spec, max_cycles, cycle, status, created_at, updated_at, duty_json, design_status, design_diagnosis)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(runId, userId, spec, maxCycles, 1, 'infeasible', now, now, JSON.stringify(duty), 'infeasible', outcome.diagnosis).run()

      // NO subtasks. No modeler. No reviewer. Enqueue nothing. Geometry is FORBIDDEN.
      return { runId, status: 'infeasible', diagnosis: outcome.diagnosis }
    }
    designStatus = 'converged'
    design = outcome.design
  }

  const modelerId = crypto.randomUUID()
  const reviewerId = crypto.randomUUID()

  await db.prepare(
    `INSERT INTO orchestrator_runs
      (id, user_id, original_task, summary, status, subtask_count, subtasks_completed, subtasks_failed, actual_cost_usd, tokens, started_at, last_active_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(runId, userId, spec, 'CAD async convergence (A2b)', 'running', 2, 0, 0, 0, 0, now, now).run()

  await db.prepare(
    `INSERT INTO cad_convergence_runs
      (run_id, user_id, spec, max_cycles, cycle, status, created_at, updated_at, duty_json, design_json, design_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(runId, userId, spec, maxCycles, 1, 'running', now, now, duty ? JSON.stringify(duty) : null, design ? JSON.stringify(design) : null, designStatus).run()

  // Transcription task when a design was solved; raw spec on the generic path.
  const modelerTask = seedFlaw ? SEED_FLAW_SPEC : modelerTaskFor(spec, design)
  await db.prepare(
    `INSERT INTO agent_subtasks
      (id, pipeline_run_id, user_id, short_id, agent_name, title, task, depends_on, status, cost_usd, tokens, created_at, task_type)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(modelerId, runId, userId, 'st_m1', 'modeler', 'CAD model (cycle 1)', modelerTask, null, 'ready', 0, 0, now, 'default').run()

  await db.prepare(
    `INSERT INTO agent_subtasks
      (id, pipeline_run_id, user_id, short_id, agent_name, title, task, depends_on, status, cost_usd, tokens, created_at, task_type)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(reviewerId, runId, userId, 'st_r1', 'reviewer', 'Geometry review (cycle 1)', reviewerTaskFor(spec), JSON.stringify(['st_m1']), 'pending', 0, 0, now, 'default').run()

  await enqueueReadySubtasks(env, runId, userId, true)

  return { runId, status: 'created', modelerId, reviewerId, designStatus }
}

/**
 * Called when a reviewer subtask completes. Advances the convergence state:
 * pass -> converged; fail with cycles left -> spawn the next modeler+reviewer
 * pair; fail at the cap -> exhausted. Never enqueues (the consumer enqueues the
 * newly-'ready' modeler after executeOneSubtask returns). No-op for runs that
 * are not convergence runs or are no longer 'running'.
 */
export async function advanceConvergence(
  env: CloudflareEnv,
  userId: string,
  runId: string,
  reviewerOutput: string,
): Promise<void> {
  const db = env.DB
  const row = await db
    .prepare(`SELECT run_id, spec, max_cycles, cycle, status, design_json FROM cad_convergence_runs WHERE run_id = ? AND user_id = ?`)
    .bind(runId, userId)
    .first<{ run_id: string; spec: string; max_cycles: number; cycle: number; status: string; design_json: string | null }>()

  if (!row || row.status !== 'running') return

  const now = Math.floor(Date.now() / 1000)
  const verdict = parseVerdict(reviewerOutput)

  if (verdict.pass) {
    await db.prepare(`UPDATE cad_convergence_runs SET status = 'converged', updated_at = ? WHERE run_id = ?`)
      .bind(now, runId).run()
    // Stamp the run's CAD binary artifacts as SENTINEL-passed on converge.
    await db.prepare(
      `UPDATE artifact_registry SET sentinel_pass = 1
        WHERE pipeline_run_id = ? AND artifact_type = 'cad-model'`,
    ).bind(runId).run()
    return
  }

  if (row.cycle >= row.max_cycles) {
    await db.prepare(`UPDATE cad_convergence_runs SET status = 'exhausted', updated_at = ? WHERE run_id = ?`)
      .bind(now, runId).run()
    return
  }

  const nextCycle = row.cycle + 1
  const modelerId = crypto.randomUUID()
  const reviewerId = crypto.randomUUID()
  const modelerShort = `st_m${nextCycle}`
  const reviewerShort = `st_r${nextCycle}`

  // Rebuild from the SOLVED design (when grounded) so a correction never loses the
  // calc-grounded dimensions; falls back to the raw spec on the generic path.
  const baseTask = modelerTaskFor(row.spec, parseDesign(row.design_json))
  const feedbackTask = `ORIGINAL TASK:\n${baseTask}\n\nYour previous attempt was REJECTED by an independent geometry reviewer. Findings:\n${verdict.discrepancies.map((d, i) => `${i + 1}. ${d}`).join('\n')}\n\nThis is a direct correction, not a research task. Apply the findings above and rebuild — do NOT call query_knowledge; no standards lookup is needed to correct a geometry or dimensional discrepancy. Revise your build123d, rebuild to the dimensions above, re-export, and re-report metrics.`

  await db.prepare(
    `INSERT INTO agent_subtasks
      (id, pipeline_run_id, user_id, short_id, agent_name, title, task, depends_on, status, cost_usd, tokens, created_at, task_type)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(modelerId, runId, userId, modelerShort, 'modeler', `CAD model (cycle ${nextCycle})`, feedbackTask, null, 'ready', 0, 0, now, 'default').run()

  await db.prepare(
    `INSERT INTO agent_subtasks
      (id, pipeline_run_id, user_id, short_id, agent_name, title, task, depends_on, status, cost_usd, tokens, created_at, task_type)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(reviewerId, runId, userId, reviewerShort, 'reviewer', `Geometry review (cycle ${nextCycle})`, reviewerTaskFor(row.spec), JSON.stringify([modelerShort]), 'pending', 0, 0, now, 'default').run()

  await db.prepare(`UPDATE orchestrator_runs SET subtask_count = subtask_count + 2 WHERE id = ?`)
    .bind(runId).run()
  await db.prepare(`UPDATE cad_convergence_runs SET cycle = ?, updated_at = ? WHERE run_id = ?`)
    .bind(nextCycle, now, runId).run()
}

/**
 * Called from executeOneSubtask when a MODELER subtask FAILS outright (errored /
 * empty output, so there is no GEOMETRY_METRICS to gate). Neither advanceConvergence
 * (fires only when a REVIEWER completes) nor runGateA (fires only when a modeler
 * COMPLETES) runs in that case, so without this the cycle's reviewer stays 'pending'
 * forever and cad_convergence_runs.status stays 'running' — an orphaned run that never
 * completes. This marks the run 'failed' and removes the unrun reviewer.
 *
 * Mirrors runGateA's cleanup so COUNT(*)-based run-completion accounting stays sound.
 * No-op for non-convergence runs or runs no longer 'running'. Does NOT spawn a next
 * cycle: a hard modeler failure (vs. a Gate A geometry rejection) ends the run.
 */
export async function failConvergenceOnModelerFailure(
  env: CloudflareEnv,
  userId: string,
  runId: string,
  errorText: string,
): Promise<void> {
  const db = env.DB
  const row = await db
    .prepare(`SELECT run_id, cycle, status FROM cad_convergence_runs WHERE run_id = ? AND user_id = ?`)
    .bind(runId, userId)
    .first<{ run_id: string; cycle: number; status: string }>()
  if (!row || row.status !== 'running') return

  const now = Math.floor(Date.now() / 1000)
  console.error(`convergence run ${runId} failed: cycle ${row.cycle} modeler errored: ${errorText}`)
  // Remove this cycle's unrun reviewer so it never judges missing geometry and does
  // not hang COUNT(*) completion. Guarded to the current cycle + pending only —
  // identical shape to runGateA's cleanup.
  await db
    .prepare(`DELETE FROM agent_subtasks WHERE pipeline_run_id = ? AND short_id = ? AND agent_name = 'reviewer' AND status = 'pending'`)
    .bind(runId, `st_r${row.cycle}`)
    .run()
  await db
    .prepare(`UPDATE cad_convergence_runs SET status = 'failed', updated_at = ? WHERE run_id = ?`)
    .bind(now, runId)
    .run()
}

export interface GateAResult { pass: boolean; failures: string[] }

// Deterministic geometry gate. Parses the LAST GEOMETRY_METRICS JSON line from
// the modeler's output. FAIL-CLOSED: missing/unparseable metrics => fail.
export function evaluateGateA(modelerOutput: string): GateAResult {
  const failures: string[] = []
  const matches = [...(modelerOutput ?? '').matchAll(/GEOMETRY_METRICS:[^{]*(\{.*\})/g)]
  if (matches.length === 0) return { pass: false, failures: ['GEOMETRY_METRICS line not found in modeler output (fail-closed)'] }
  let m: Record<string, unknown>
  try { m = JSON.parse(matches[matches.length - 1][1]) } catch { return { pass: false, failures: ['GEOMETRY_METRICS JSON unparseable (fail-closed)'] } }
  const solids = Number(m.solids)
  const volume = Number(m.volume_mm3)
  if (!(solids >= 1)) failures.push(`solid_count ${String(m.solids)} is not >= 1`)
  if (!(volume > 0)) failures.push(`volume_mm3 ${String(m.volume_mm3)} is not > 0`)
  if (m.is_valid !== true) failures.push('is_valid is not true — invalid B-rep; STEP would not be manufacturable')
  return { pass: failures.length === 0, failures }
}

// Called from executeOneSubtask when a MODELER subtask completes, BEFORE the
// reviewer runs. On PASS: no-op (reviewer proceeds as Gate B). On FAIL: delete
// this cycle's unrun pending reviewer (keeps run-completion accounting sound —
// COUNT(*)-based), then either spawn the next modeler+reviewer pair with the
// Gate A failure fed back, or mark the convergence run exhausted at the cap.
// No-op for non-convergence runs or runs no longer 'running'.
export async function runGateA(env: CloudflareEnv, userId: string, runId: string, modelerOutput: string): Promise<void> {
  const db = env.DB
  const row = await db.prepare(`SELECT run_id, spec, max_cycles, cycle, status, design_json FROM cad_convergence_runs WHERE run_id = ? AND user_id = ?`)
    .bind(runId, userId).first<{ run_id: string; spec: string; max_cycles: number; cycle: number; status: string; design_json: string | null }>()
  if (!row || row.status !== 'running') return
  const result = evaluateGateA(modelerOutput)
  if (result.pass) return
  const now = Math.floor(Date.now() / 1000)
  // Remove this cycle's unrun reviewer so it never judges bad geometry and does
  // not hang COUNT(*) completion. Guarded to the current cycle + pending only.
  await db.prepare(`DELETE FROM agent_subtasks WHERE pipeline_run_id = ? AND short_id = ? AND agent_name = 'reviewer' AND status = 'pending'`)
    .bind(runId, `st_r${row.cycle}`).run()
  if (row.cycle >= row.max_cycles) {
    await db.prepare(`UPDATE cad_convergence_runs SET status = 'exhausted', updated_at = ? WHERE run_id = ?`).bind(now, runId).run()
    return
  }
  const nextCycle = row.cycle + 1
  const modelerId = crypto.randomUUID()
  const reviewerId = crypto.randomUUID()
  const modelerShort = `st_m${nextCycle}`
  const reviewerShort = `st_r${nextCycle}`
  const baseTask = modelerTaskFor(row.spec, parseDesign(row.design_json))
  const feedbackTask = `ORIGINAL TASK:\n${baseTask}\n\nYour previous attempt FAILED automated geometry validation (Gate A) before review. Failures:\n${result.failures.map((f, i) => `${i + 1}. ${f}`).join('\n')}\n\nThese are deterministic geometry errors — the produced part is not a valid manufacturable solid. Rebuild your build123d so part.is_valid() is True, the part is a single closed solid with positive volume, and re-export GLB + STEP. Re-emit the exact GEOMETRY_METRICS line (including is_valid) verbatim in your final summary. Do NOT call query_knowledge — this is a geometry construction fix, not a standards lookup.`
  await db.prepare(`INSERT INTO agent_subtasks (id, pipeline_run_id, user_id, short_id, agent_name, title, task, depends_on, status, cost_usd, tokens, created_at, task_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(modelerId, runId, userId, modelerShort, 'modeler', `CAD model (cycle ${nextCycle})`, feedbackTask, null, 'ready', 0, 0, now, 'default').run()
  await db.prepare(`INSERT INTO agent_subtasks (id, pipeline_run_id, user_id, short_id, agent_name, title, task, depends_on, status, cost_usd, tokens, created_at, task_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(reviewerId, runId, userId, reviewerShort, 'reviewer', `Geometry review (cycle ${nextCycle})`, reviewerTaskFor(row.spec), JSON.stringify([modelerShort]), 'pending', 0, 0, now, 'default').run()
  await db.prepare(`UPDATE orchestrator_runs SET subtask_count = subtask_count + 2 WHERE id = ?`).bind(runId).run()
  await db.prepare(`UPDATE cad_convergence_runs SET cycle = ?, updated_at = ? WHERE run_id = ?`).bind(nextCycle, now, runId).run()
}
