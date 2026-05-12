-- COCKPIT D1 SCHEMA · Migration 0006 — Orchestration (Sprint 14 v0.1)
-- HERMES decomposer + agent_subtasks DAG + file_locks + decompositions audit
-- Run: wrangler d1 execute ll-cockpit-db --file=migrations/0006_orchestration.sql --remote

-- ── orchestrator_runs: one row per HERMES decomposition + execution ─────────
CREATE TABLE IF NOT EXISTS orchestrator_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  original_task TEXT NOT NULL,         -- the user's prompt to NEXUS/HERMES
  summary TEXT,                         -- HERMES one-liner
  status TEXT NOT NULL DEFAULT 'planning',
  -- planning | running | paused | completed | failed | cancelled
  subtask_count INTEGER NOT NULL DEFAULT 0,
  subtasks_completed INTEGER NOT NULL DEFAULT 0,
  subtasks_failed INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd REAL,
  estimated_duration_minutes INTEGER,
  actual_cost_usd REAL NOT NULL DEFAULT 0,
  tokens INTEGER NOT NULL DEFAULT 0,
  decomposition_id TEXT,                -- FK to decompositions
  started_at INTEGER NOT NULL,
  last_active_at INTEGER NOT NULL,
  completed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_orch_runs_user ON orchestrator_runs(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_orch_runs_status ON orchestrator_runs(status, last_active_at DESC);

-- ── agent_subtasks: nodes of the DAG ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_subtasks (
  id TEXT PRIMARY KEY,
  pipeline_run_id TEXT NOT NULL,        -- FK to orchestrator_runs.id
  user_id TEXT NOT NULL,
  short_id TEXT NOT NULL,               -- HERMES-assigned local id like 'st_1' (unique within run)
  agent_name TEXT NOT NULL,             -- which agent will execute it
  title TEXT NOT NULL,
  task TEXT NOT NULL,                   -- full instruction to the agent
  depends_on TEXT,                      -- JSON array of short_ids
  estimated_cost_usd REAL,
  estimated_duration_seconds INTEGER,
  risk_level TEXT DEFAULT 'low',        -- low | medium | high
  human_required INTEGER NOT NULL DEFAULT 0,  -- bool, routes to HITL when 1
  status TEXT NOT NULL DEFAULT 'pending',
  -- pending | ready | running | done | failed | blocked | cancelled
  output TEXT,                          -- agent's response
  error_log TEXT,
  task_id TEXT,                         -- optional FK to agent_tasks if/when wired
  cost_usd REAL NOT NULL DEFAULT 0,
  tokens INTEGER NOT NULL DEFAULT 0,
  started_at INTEGER,
  completed_at INTEGER,
  created_at INTEGER NOT NULL,
  UNIQUE(pipeline_run_id, short_id)
);
CREATE INDEX IF NOT EXISTS idx_subtasks_run ON agent_subtasks(pipeline_run_id, status);
CREATE INDEX IF NOT EXISTS idx_subtasks_agent ON agent_subtasks(agent_name, status, created_at);
CREATE INDEX IF NOT EXISTS idx_subtasks_user ON agent_subtasks(user_id, created_at DESC);

-- ── decompositions: audit/replay of HERMES outputs ──────────────────────────
CREATE TABLE IF NOT EXISTS decompositions (
  id TEXT PRIMARY KEY,
  pipeline_run_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  original_task TEXT NOT NULL,
  summary TEXT,
  subtask_count INTEGER NOT NULL,
  estimated_total_cost_usd REAL,
  raw_response TEXT,                    -- HERMES's full JSON response for audit
  model_id TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cost_usd REAL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_decomp_run ON decompositions(pipeline_run_id);

-- ── file_locks: prevent two agents from clobbering the same file ────────────
CREATE TABLE IF NOT EXISTS file_locks (
  id TEXT PRIMARY KEY,
  pipeline_run_id TEXT NOT NULL,
  subtask_id TEXT NOT NULL,
  file_path TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  lock_token TEXT NOT NULL,
  locked_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  released_at INTEGER                   -- null = active lock
);
-- only one active lock per file (released_at IS NULL)
CREATE UNIQUE INDEX IF NOT EXISTS idx_file_locks_active ON file_locks(file_path) WHERE released_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_file_locks_subtask ON file_locks(subtask_id);
