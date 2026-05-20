-- 0011_design_share_tokens.sql
--
-- BACKFILL NOTE: This migration was originally applied live to prod D1 on
-- 2026-05-15 00:45:59 UTC via Cloudflare MCP without committing the .sql file
-- to the repo. This file was reverse-engineered from the live D1 schema on
-- 2026-05-19 during the Stack A doc-sync hygiene pass, so the next
-- `wrangler d1 migrations apply` run stays consistent.
--
-- Adds the `design_share_tokens` table that backs Sprint 18C — tenant-scoped
-- share tokens for brief preview URLs. 32-char URL-safe tokens, owner-only CRUD,
-- default 7-day expiry, view-count tracked.

CREATE TABLE IF NOT EXISTS design_share_tokens (
  token TEXT PRIMARY KEY,
  brief_id TEXT NOT NULL,
  iteration_number INTEGER,
  created_by_user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER,
  revoked_at INTEGER,
  view_count INTEGER NOT NULL DEFAULT 0,
  last_viewed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_share_tokens_brief
  ON design_share_tokens(brief_id);

CREATE INDEX IF NOT EXISTS idx_share_tokens_active
  ON design_share_tokens(brief_id, revoked_at);
