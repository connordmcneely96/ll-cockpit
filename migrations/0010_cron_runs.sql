-- Migration 0010: cron_runs table
-- Apply: wrangler d1 execute ll-cockpit-db --file=migrations/0010_cron_runs.sql --remote
-- Tracks execution history for all scheduled cron jobs

CREATE TABLE IF NOT EXISTS cron_runs (
  id TEXT PRIMARY KEY,
  job_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ok',
  run_at INTEGER NOT NULL,
  duration_ms INTEGER,
  log_ref TEXT,
  error_msg TEXT
);

CREATE INDEX IF NOT EXISTS idx_cron_runs_job ON cron_runs(job_name);
CREATE INDEX IF NOT EXISTS idx_cron_runs_at ON cron_runs(run_at);
