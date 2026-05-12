-- COCKPIT D1 SCHEMA · Migration 0008 — Design Build (Sprint 16 v0.1)
-- Optimized website design build pipeline: briefs → HERMES DAG → iterations → R2 preview URL
-- Run: wrangler d1 execute ll-cockpit-db --file=migrations/0008_design_build.sql --remote

CREATE TABLE IF NOT EXISTS design_briefs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  client_name TEXT NOT NULL,
  business_description TEXT NOT NULL,
  target_audience TEXT NOT NULL,
  mood_tone TEXT NOT NULL,
  style_references TEXT,                -- JSON array of reference URLs
  must_have_sections TEXT NOT NULL,     -- comma or newline separated
  brand_colors TEXT,                     -- free-text (e.g. "#1a5dab primary, white")
  constraints TEXT,
  status TEXT NOT NULL DEFAULT 'draft', -- draft | building | preview_ready | shipped | archived
  orchestrator_run_id TEXT,             -- current orchestrator_runs.id
  current_iteration INTEGER NOT NULL DEFAULT 1,
  preview_url TEXT,                      -- public R2-served preview URL
  repo_url TEXT,                         -- GitHub repo (v0.2)
  pages_deployment_url TEXT,            -- Cloudflare Pages (v0.2)
  total_cost_usd REAL NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_design_briefs_user ON design_briefs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_design_briefs_status ON design_briefs(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_design_briefs_run ON design_briefs(orchestrator_run_id);

CREATE TABLE IF NOT EXISTS design_iterations (
  id TEXT PRIMARY KEY,
  brief_id TEXT NOT NULL,
  iteration_number INTEGER NOT NULL,
  orchestrator_run_id TEXT NOT NULL,
  client_feedback TEXT,                  -- null for v1, populated for v2+
  design_tokens_json TEXT,               -- DESIGNER output
  page_html TEXT,                        -- COMPOSER output
  critic_score INTEGER,
  critic_feedback TEXT,                  -- CRITIC full JSON output
  preview_r2_key TEXT,                   -- where in R2 the HTML lives
  preview_url TEXT,
  status TEXT NOT NULL DEFAULT 'building', -- building | ready | failed
  cost_usd REAL NOT NULL DEFAULT 0,
  tokens INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  completed_at INTEGER,
  UNIQUE(brief_id, iteration_number)
);
CREATE INDEX IF NOT EXISTS idx_design_iter_brief ON design_iterations(brief_id, iteration_number DESC);
CREATE INDEX IF NOT EXISTS idx_design_iter_run ON design_iterations(orchestrator_run_id);
CREATE INDEX IF NOT EXISTS idx_design_iter_status ON design_iterations(status);
