-- Migration 0032 — ATLAS query log (Sprint 30E SENTINEL hook)
-- Applied via Cloudflare MCP 2026-06-04 (tracker id 34); committed for repo↔DB lockstep.
-- Named 0032 in repo (0031 already used by design_deployments_slug); DB table created as 0031.
-- IF NOT EXISTS ensures safe re-apply.
CREATE TABLE IF NOT EXISTS atlas_query_log (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'system',
  question TEXT NOT NULL,
  project_context TEXT,
  answer TEXT,
  sources_json TEXT,
  confidence REAL,
  calc_units_verified INTEGER NOT NULL DEFAULT 1,
  requires_connor_review INTEGER NOT NULL DEFAULT 1,
  rejected INTEGER NOT NULL DEFAULT 0,
  reject_reason TEXT,
  model_id TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_atlas_query_log_created ON atlas_query_log(created_at);
CREATE INDEX IF NOT EXISTS idx_atlas_query_log_review ON atlas_query_log(requires_connor_review, rejected);
