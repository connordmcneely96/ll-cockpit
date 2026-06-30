-- 0043_cad_convergence_runs.sql
-- Slice A2b: async self-correcting CAD convergence loop. Tracks a modeler<->reviewer
-- convergence run across cycles. Already applied in prod; committed here for the
-- repo record (CREATE TABLE IF NOT EXISTS is idempotent).
CREATE TABLE IF NOT EXISTS cad_convergence_runs (
  run_id TEXT PRIMARY KEY,              -- FK to orchestrator_runs.id
  user_id TEXT NOT NULL,
  spec TEXT NOT NULL,                   -- the original design spec
  max_cycles INTEGER NOT NULL,          -- cap on modeler->reviewer cycles
  cycle INTEGER NOT NULL,               -- current cycle (1-based)
  status TEXT NOT NULL,                 -- running | converged | exhausted
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cad_convergence_user ON cad_convergence_runs(user_id, created_at DESC);
