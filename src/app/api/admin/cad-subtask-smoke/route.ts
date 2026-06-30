/**
 * POST /api/admin/cad-subtask-smoke - Slice A1
 * Runs the MODELER as a real async agent_subtask through the existing
 * subtask-queue -> consumer -> executeOneSubtask path. This route only
 * CREATES the run + subtask and enqueues it; the executor and consumer are
 * unchanged (executeOneSubtask already runs tool-enabled agents via
 * runToolLoop, and modeler has execute_cad_code + query_knowledge).
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
    const subtaskId = crypto.randomUUID()

    // orchestrator_runs: (id, user_id, original_task, summary, status,
    //   subtask_count, subtasks_completed, subtasks_failed, actual_cost_usd,
    //   tokens, started_at, last_active_at)
    await db.prepare(
      `INSERT INTO orchestrator_runs
        (id, user_id, original_task, summary, status, subtask_count, subtasks_completed, subtasks_failed, actual_cost_usd, tokens, started_at, last_active_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(runId, userId, spec, 'CAD subtask smoke (A1)', 'running', 1, 0, 0, 0, 0, now, now).run()

    // agent_subtasks: (id, pipeline_run_id, user_id, short_id, agent_name,
    //   title, task, depends_on, status, cost_usd, tokens, created_at, task_type)
    await db.prepare(
      `INSERT INTO agent_subtasks
        (id, pipeline_run_id, user_id, short_id, agent_name, title, task, depends_on, status, cost_usd, tokens, created_at, task_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(subtaskId, runId, userId, 'st_1', 'modeler', 'CAD model (A1)', spec, null, 'ready', 0, 0, now, 'default').run()

    // force=true: skip HITL gating and enqueue the ready subtask onto SUBTASK_QUEUE.
    await enqueueReadySubtasks(env, runId, userId, true)

    return json({
      ok: true,
      runId,
      subtaskId,
      status: 'enqueued',
      note: 'async — poll agent_subtasks + artifact_registry',
    }, 200)
  } catch (err) {
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500)
  }
}
