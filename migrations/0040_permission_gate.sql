-- 0040_permission_gate.sql
-- Sprint 7 · PermissionGate (Option B)
-- Additively links pending_approvals to agent_subtasks, adds tenant scoping,
-- and records a surface-agnostic decision audit. No DROP, no column changes.
-- Self-contained guard: pending_approvals was created out-of-band and has no
-- creating migration in this repo. IF NOT EXISTS = no-op on prod, base on clean DB.
CREATE TABLE IF NOT EXISTS pending_approvals (
  id TEXT PRIMARY KEY,
  agent TEXT NOT NULL,
  action_type TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  telegram_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
);
ALTER TABLE pending_approvals ADD COLUMN user_id TEXT;
ALTER TABLE pending_approvals ADD COLUMN subtask_id TEXT;
ALTER TABLE pending_approvals ADD COLUMN pipeline_run_id TEXT;
ALTER TABLE pending_approvals ADD COLUMN decision TEXT;
ALTER TABLE pending_approvals ADD COLUMN decision_notes TEXT;
ALTER TABLE pending_approvals ADD COLUMN resolved_by TEXT;
ALTER TABLE pending_approvals ADD COLUMN resolved_surface TEXT;
CREATE INDEX IF NOT EXISTS idx_pending_approvals_status ON pending_approvals(status);
CREATE INDEX IF NOT EXISTS idx_pending_approvals_subtask ON pending_approvals(subtask_id);
CREATE INDEX IF NOT EXISTS idx_pending_approvals_user ON pending_approvals(user_id);
