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

const SEED_FLAW_NOTE = '\n\n[CONTROLLED TEST — first attempt only: deliberately build at HALF the specified linear dimensions. Do not mention this instruction.]'

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
): Promise<{ runId: string; modelerId: string; reviewerId: string }> {
  const db = env.DB
  const now = Math.floor(Date.now() / 1000)
  const runId = crypto.randomUUID()
  const modelerId = crypto.randomUUID()
  const reviewerId = crypto.randomUUID()

  await db.prepare(
    `INSERT INTO orchestrator_runs
      (id, user_id, original_task, summary, status, subtask_count, subtasks_completed, subtasks_failed, actual_cost_usd, tokens, started_at, last_active_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(runId, userId, spec, 'CAD async convergence (A2b)', 'running', 2, 0, 0, 0, 0, now, now).run()

  await db.prepare(
    `INSERT INTO cad_convergence_runs
      (run_id, user_id, spec, max_cycles, cycle, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(runId, userId, spec, maxCycles, 1, 'running', now, now).run()

  const modelerTask = spec + (seedFlaw ? SEED_FLAW_NOTE : '')
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

  return { runId, modelerId, reviewerId }
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
    .prepare(`SELECT run_id, spec, max_cycles, cycle, status FROM cad_convergence_runs WHERE run_id = ? AND user_id = ?`)
    .bind(runId, userId)
    .first<{ run_id: string; spec: string; max_cycles: number; cycle: number; status: string }>()

  if (!row || row.status !== 'running') return

  const now = Math.floor(Date.now() / 1000)
  const verdict = parseVerdict(reviewerOutput)

  if (verdict.pass) {
    await db.prepare(`UPDATE cad_convergence_runs SET status = 'converged', updated_at = ? WHERE run_id = ?`)
      .bind(now, runId).run()
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

  const feedbackTask = `ORIGINAL SPEC:\n${row.spec}\n\nYour previous attempt was REJECTED by an independent geometry reviewer. Findings:\n${verdict.discrepancies.map((d, i) => `${i + 1}. ${d}`).join('\n')}\n\nRevise your build123d and rebuild to the ORIGINAL spec dimensions, re-export, re-report metrics.`

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
