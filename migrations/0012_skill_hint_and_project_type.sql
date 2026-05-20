-- 0012_skill_hint_and_project_type.sql
--
-- BACKFILL NOTE: This migration was originally applied live to prod D1 on
-- 2026-05-15 00:45:59 UTC via Cloudflare MCP without committing the .sql file
-- to the repo. This file was reverse-engineered from the live D1 schema on
-- 2026-05-19 during the Stack A doc-sync hygiene pass, so the next
-- `wrangler d1 migrations apply` run stays consistent.
--
-- Adds optional columns to design_briefs to support Sprint 18D Skills system:
--   - skill_hint   : free-text hint from the intake form (e.g. "tweaks-panel")
--   - project_type : enum-style hint ("marketing-site", "saas-landing", etc.)
--
-- Both columns are nullable for backwards compatibility with existing briefs.
-- The `skills` column (which is a JSON array, not free-text) was added later
-- by migration 0020_design_briefs_skills.sql.

ALTER TABLE design_briefs ADD COLUMN skill_hint TEXT;
ALTER TABLE design_briefs ADD COLUMN project_type TEXT;
