-- Migration 0017 — Sprint 18E: Examples gallery + design systems library
-- Applied to ll-cockpit-db via Cloudflare MCP, May 15 2026.
-- d1_migrations registry entry inserted same transaction.
-- This file exists for repo history.

CREATE TABLE IF NOT EXISTS design_systems (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  primary_color TEXT,
  tags TEXT DEFAULT '[]',
  source_url TEXT,
  r2_key TEXT,
  tenant_id TEXT,
  user_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(slug, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_design_systems_category ON design_systems(category);
CREATE INDEX IF NOT EXISTS idx_design_systems_tenant ON design_systems(tenant_id);

-- Allow briefs to opt into a design system at creation time.
-- DESIGNER agent reads the system's DESIGN.md from R2 and uses its tokens.
ALTER TABLE design_briefs ADD COLUMN attached_design_system_slug TEXT;
