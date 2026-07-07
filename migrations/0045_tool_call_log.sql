-- 0045_tool_call_log.sql
-- Lane B telemetry: per-tool-call and per-LLM-iteration rows for the agent tool
-- loop. Already applied in prod D1 (reconciled as migration 0045); committed here
-- for repo/fresh-deploy consistency only — do not run.
CREATE TABLE tool_call_log (
  id TEXT PRIMARY KEY,
  subtask_id TEXT,
  pipeline_run_id TEXT,
  agent_name TEXT,
  user_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  ok INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER,
  input_preview TEXT,
  result_preview TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_tool_call_log_run ON tool_call_log(pipeline_run_id);
CREATE INDEX idx_tool_call_log_subtask ON tool_call_log(subtask_id);
