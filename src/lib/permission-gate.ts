// src/lib/permission-gate.ts
// Sprint 7 · PermissionGate (Option B)
// Opens human-approval gates for human_required subtasks and resolves them.
// approve -> subtask back to 'ready' (route then resumes the wave);
// reject  -> subtask 'cancelled'. Pure D1 ops; resume fetch lives in the route.
// D1Database / D1PreparedStatement are GLOBAL types — do NOT import them.

export type GateDecision = 'approve' | 'reject';

export interface OpenGatesResult {
  opened: number;
  gateIds: string[];
}

export interface ResolveGateResult {
  ok: boolean;
  subtaskId: string | null;
  runId: string | null;
  status: 'approved' | 'rejected' | 'pending' | 'unknown';
  error?: string;
}

interface ReadySubtaskRow {
  id: string;
  agent_name: string;
  title: string;
  task: string;
  task_type: string | null;
  risk_level: string | null;
}

/**
 * Opens an approval gate for every ready, human_required subtask in a run that
 * does not already have a pending gate. Each gate = one pending_approvals row +
 * the subtask flipped to 'blocked'. Idempotent: safe to call repeatedly.
 */
export async function openGatesForRun(
  db: D1Database,
  userId: string,
  runId: string,
): Promise<OpenGatesResult> {
  const { results } = await db
    .prepare(
      `SELECT id, agent_name, title, task, task_type, risk_level
         FROM agent_subtasks
        WHERE pipeline_run_id = ?1
          AND user_id = ?2
          AND status = 'ready'
          AND human_required = 1
          AND NOT EXISTS (
            SELECT 1 FROM pending_approvals p
             WHERE p.subtask_id = agent_subtasks.id
               AND p.status = 'pending'
          )`,
    )
    .bind(runId, userId)
    .all<ReadySubtaskRow>();

  const rows = results ?? [];
  if (rows.length === 0) return { opened: 0, gateIds: [] };

  const gateIds: string[] = [];
  const statements: D1PreparedStatement[] = [];

  for (const row of rows) {
    const gateId = `pa_${crypto.randomUUID()}`;
    gateIds.push(gateId);
    const payload = JSON.stringify({
      subtaskId: row.id,
      title: row.title,
      task: row.task,
      taskType: row.task_type ?? 'default',
      riskLevel: row.risk_level ?? 'low',
    });
    statements.push(
      db
        .prepare(
          `INSERT INTO pending_approvals
             (id, user_id, agent, action_type, payload, subtask_id, pipeline_run_id, status)
           VALUES (?1, ?2, ?3, 'subtask_execution', ?4, ?5, ?6, 'pending')`,
        )
        .bind(gateId, userId, row.agent_name, payload, row.id, runId),
    );
    statements.push(
      db
        .prepare(
          `UPDATE agent_subtasks SET status = 'blocked'
            WHERE id = ?1 AND user_id = ?2 AND status = 'ready'`,
        )
        .bind(row.id, userId),
    );
  }

  await db.batch(statements);
  return { opened: rows.length, gateIds };
}

/**
 * Resolves a pending gate, tenant-scoped by userId. Idempotent guard: returns
 * ok:false if missing or already resolved. On approve the subtask returns to
 * 'ready' (the route resumes the wave); on reject it is 'cancelled'.
 */
export async function resolveGate(
  db: D1Database,
  userId: string,
  approvalId: string,
  decision: GateDecision,
  opts: { notes?: string; resolvedBy?: string; surface?: string } = {},
): Promise<ResolveGateResult> {
  const gate = await db
    .prepare(
      `SELECT id, subtask_id, pipeline_run_id, status
         FROM pending_approvals
        WHERE id = ?1 AND user_id = ?2`,
    )
    .bind(approvalId, userId)
    .first<{
      id: string;
      subtask_id: string | null;
      pipeline_run_id: string | null;
      status: string;
    }>();

  if (!gate) {
    return { ok: false, subtaskId: null, runId: null, status: 'unknown', error: 'not_found' };
  }
  if (gate.status !== 'pending') {
    return {
      ok: false,
      subtaskId: gate.subtask_id,
      runId: gate.pipeline_run_id,
      status: gate.status as ResolveGateResult['status'],
      error: 'already_resolved',
    };
  }

  const now = new Date().toISOString();
  const notes = opts.notes ?? null;
  const resolvedBy = opts.resolvedBy ?? null;
  const surface = opts.surface ?? null;
  const nextStatus = decision === 'approve' ? 'approved' : 'rejected';
  const subtaskStatus = decision === 'approve' ? 'ready' : 'cancelled';
  const subtaskError = decision === 'approve' ? null : 'Rejected by human approval';

  await db.batch([
    db
      .prepare(
        `UPDATE pending_approvals
            SET status = ?2, decision = ?3, decision_notes = ?4,
                resolved_by = ?5, resolved_surface = ?6, resolved_at = ?7
          WHERE id = ?1 AND status = 'pending'`,
      )
      .bind(approvalId, nextStatus, decision, notes, resolvedBy, surface, now),
    db
      .prepare(
        `UPDATE agent_subtasks
            SET status = ?3, error_log = COALESCE(?4, error_log)
          WHERE id = ?1 AND user_id = ?2 AND status = 'blocked'`,
      )
      .bind(gate.subtask_id, userId, subtaskStatus, subtaskError),
  ]);

  return {
    ok: true,
    subtaskId: gate.subtask_id,
    runId: gate.pipeline_run_id,
    status: nextStatus,
  };
}
