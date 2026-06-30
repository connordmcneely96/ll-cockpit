/**
 * POST /api/admin/cad-handoff-smoke - Slice A2a
 * MODELER -> CAD-REVIEWER handoff in the real async DAG. Creates a run with
 * two subtasks: st_1 (modeler) and st_2 (reviewer, depends_on st_1). Only st_1
 * is enqueued; once it completes, cascadeReady promotes st_2 and the consumer
 * enqueues it. executeOneSubtask builds dependencyContext from st_1's output
 * (which includes the GEOMETRY_METRICS line) and prepends it to the reviewer's
 * userMessage. No executor/consumer change; no loop-back (that's A2b).
 * Body: { spec?: string }
 * Auth required.
 */
import { createClient } from '@/lib/supabase-server'
import { getBindings } from '@/lib/cloudflare'
import { enqueueReadySubtasks } from '@/workers/subtask-consumer'

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

    let body: { spec?: string }
    try {
      body = await req.json()
    } catch {
      body = {}
    }
    const spec = (body.spec ?? '').trim() || 'Design a solid cube, exactly 100 mm on every side.'

    const env = getBindings()
    const db = env.DB

    const now = Math.floor(Date.now() / 1000)
    const runId = crypto.randomUUID()
    const modelerId = crypto.randomUUID()
    const reviewerId = crypto.randomUUID()

    // orchestrator_runs: 2 subtasks (modeler + reviewer).
    await db.prepare(
      `INSERT INTO orchestrator_runs
        (id, user_id, original_task, summary, status, subtask_count, subtasks_completed, subtasks_failed, actual_cost_usd, tokens, started_at, last_active_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(runId, userId, spec, 'CAD handoff smoke (A2a)', 'running', 2, 0, 0, 0, 0, now, now).run()

    // st_1: modeler — ready now, gets enqueued immediately.
    await db.prepare(
      `INSERT INTO agent_subtasks
        (id, pipeline_run_id, user_id, short_id, agent_name, title, task, depends_on, status, cost_usd, tokens, created_at, task_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(modelerId, runId, userId, 'st_1', 'modeler', 'CAD model (A2a)', spec, null, 'ready', 0, 0, now, 'default').run()

    // st_2: reviewer — pending, depends_on st_1. cascadeReady promotes it once
    // st_1 is done; dependencyContext then injects st_1's output (with metrics).
    const reviewerTask = `SPEC:\n${spec}\n\nThe upstream MODELER output is provided above as context and includes the measured GEOMETRY_METRICS. Judge the produced geometry against this SPEC and return ONLY your verdict JSON.`
    await db.prepare(
      `INSERT INTO agent_subtasks
        (id, pipeline_run_id, user_id, short_id, agent_name, title, task, depends_on, status, cost_usd, tokens, created_at, task_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(reviewerId, runId, userId, 'st_2', 'reviewer', 'Geometry review (A2a)', reviewerTask, JSON.stringify(['st_1']), 'pending', 0, 0, now, 'default').run()

    // force=true enqueues only the 'ready' subtask (st_1); st_2 is 'pending'.
    await enqueueReadySubtasks(env, runId, userId, true)

    return json({
      ok: true,
      runId,
      modelerSubtaskId: modelerId,
      reviewerSubtaskId: reviewerId,
      status: 'enqueued',
      note: 'async — poll agent_subtasks; st_2 fires after st_1 via cascadeReady',
    }, 200)
  } catch (err) {
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500)
  }
}
