-- 0022_sprint_items_deleted_at.sql
--
-- Issue #79 — adds soft-delete support to sprint_items so the NEXUS Knowledge
-- MCP can archive records without losing data. delete_sprint_item sets
-- deleted_at to a unix timestamp; all read paths (search_knowledge enrichment,
-- get_sprint_status) filter WHERE deleted_at IS NULL.
--
-- Nullable, defaults to NULL (not deleted). Backwards-compatible: every
-- existing row has deleted_at = NULL and continues to appear in reads.
--
-- APPLIED LIVE to prod D1 via Cloudflare MCP on 2026-05-20 before the worker
-- deploy, to guarantee the column exists before the new worker code references
-- it. Recorded in d1_migrations id=19. This file commits the source for repo
-- consistency (same pattern as PR #78 backfills).

ALTER TABLE sprint_items ADD COLUMN deleted_at INTEGER;

-- Partial index to keep the common "not deleted" filter fast as the table grows.
CREATE INDEX IF NOT EXISTS idx_sprint_items_not_deleted
  ON sprint_items(tenant_id, sprint_number)
  WHERE deleted_at IS NULL;
