-- Migration 0012: learn_progress
-- Apply: paste into Cloudflare D1 console (Connor on work machine, no terminal)
-- Tracks which study_nodes a user has marked as read. study_nodes itself is untouched.

CREATE TABLE IF NOT EXISTS learn_progress (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  completed_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(user_id, node_id)
);
CREATE INDEX IF NOT EXISTS idx_learn_progress_user ON learn_progress(user_id);
