-- Sprint 18Z — add design_feedback table for viewer-submitted notes
--
-- Tweaks Panel MVP "Send notes to designer" feature. Public viewers (unauthenticated)
-- can submit text feedback from the rendered preview page. The cockpit operator later
-- reads them via a future inbox UI.
--
-- This file records the production hotfix applied on May 19, 2026 ~16:50 UTC via
-- the Cloudflare MCP d1_database_query tool. The corresponding d1_migrations row
-- (id=18, name='0021_design_feedback.sql') was inserted at the same time so this
-- file is a no-op when re-run against production (wrangler will skip it).
--
-- Schema notes:
--   - id: UUID generated server-side per submission
--   - brief_id: FK to design_briefs.id; ON DELETE CASCADE NOT used (we want to
--               preserve feedback for archived briefs)
--   - iteration_number: which iteration the viewer saw when submitting; nullable
--                       because feedback may arrive between iteration generation
--                       and the iteration row being created
--   - notes: viewer-supplied text, max 2000 chars enforced at the API boundary
--   - viewer_fingerprint: SHA-256 of (IP + user_agent) for spam clustering; never
--                         personally identifies viewers
--   - viewer_user_agent: kept for debugging/anti-spam triage only
--   - submitted_at: unix epoch seconds
--   - read_at: NULL until operator marks it read in cockpit inbox (future PR)
--
-- Index: (brief_id, submitted_at DESC) for the inbox-by-brief query pattern.

CREATE TABLE IF NOT EXISTS design_feedback (
  id TEXT PRIMARY KEY,
  brief_id TEXT NOT NULL,
  iteration_number INTEGER,
  notes TEXT NOT NULL,
  viewer_fingerprint TEXT,
  viewer_user_agent TEXT,
  submitted_at INTEGER NOT NULL,
  read_at INTEGER,
  FOREIGN KEY (brief_id) REFERENCES design_briefs(id)
);

CREATE INDEX IF NOT EXISTS idx_design_feedback_brief_id
  ON design_feedback(brief_id, submitted_at DESC);
