-- Migration 0030 — CAD data model (Sprint 30G)
-- Adds the five CAD vertical tables to the shared ll-cockpit-db.
-- Seed referenced this as "Migration 0018" but 0018_knowledge_embed_tracking.sql
-- already exists; highest existing number is 0029, so this is 0030.
-- NEXUS-native adjustments vs old-repo schema.sql: tenant_id everywhere,
-- parent_id assembly/feature trees, R2 keys, no FK to design_* tables.
--
-- Applied to ll-cockpit-db (831eeccf-60bc-4378-8a3b-71dfb910756e) via Cloudflare
-- MCP on 2026-05-29, statement-by-statement, each verified. Functional smoke test
-- (insert/join/CHECK-reject/cascade-delete) passed; d1_migrations row id 30.

-- 1. cad_projects — top-level project record
CREATE TABLE IF NOT EXISTS cad_projects (
  id                  TEXT PRIMARY KEY,
  tenant_id           TEXT NOT NULL DEFAULT 'default',
  user_id             TEXT NOT NULL,
  name                TEXT NOT NULL,
  project_type        TEXT NOT NULL DEFAULT 'other'
                        CHECK (project_type IN ('engine','pump','gear_reducer','pressure_vessel','fluid_system','structural','other')),
  status              TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','design_in_progress','ready_for_delivery','delivered','archived')),
  current_revision_id TEXT,
  total_cost_usd      REAL NOT NULL DEFAULT 0,
  total_tokens        INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. cad_assemblies — assembly tree (parent_assembly_id NULL = top-level)
CREATE TABLE IF NOT EXISTS cad_assemblies (
  id                  TEXT PRIMARY KEY,
  project_id          TEXT NOT NULL REFERENCES cad_projects(id) ON DELETE CASCADE,
  parent_assembly_id  TEXT REFERENCES cad_assemblies(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  description         TEXT,
  position_json       TEXT,
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. cad_revisions — design iteration snapshots (parent_revision_id = branch)
CREATE TABLE IF NOT EXISTS cad_revisions (
  id                    TEXT PRIMARY KEY,
  project_id            TEXT NOT NULL REFERENCES cad_projects(id) ON DELETE CASCADE,
  revision_number       INTEGER NOT NULL,
  parent_revision_id    TEXT REFERENCES cad_revisions(id) ON DELETE SET NULL,
  iteration_agent_run_id TEXT,
  design_intent         TEXT,
  cost_usd              REAL NOT NULL DEFAULT 0,
  tokens                INTEGER NOT NULL DEFAULT 0,
  created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. cad_features — component/feature tree (parent_feature_id = feature tree)
CREATE TABLE IF NOT EXISTS cad_features (
  id                 TEXT PRIMARY KEY,
  assembly_id        TEXT NOT NULL REFERENCES cad_assemblies(id) ON DELETE CASCADE,
  parent_feature_id  TEXT REFERENCES cad_features(id) ON DELETE CASCADE,
  feature_type       TEXT NOT NULL,
  parameters_json    TEXT,
  order_index        INTEGER NOT NULL DEFAULT 0,
  geometry_r2_key    TEXT,
  drawing_r2_key     TEXT,
  created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 5. cad_render_jobs — async render/export job queue records
CREATE TABLE IF NOT EXISTS cad_render_jobs (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES cad_projects(id) ON DELETE CASCADE,
  revision_id   TEXT REFERENCES cad_revisions(id) ON DELETE SET NULL,
  job_type      TEXT NOT NULL
                  CHECK (job_type IN ('preview','step','stl','dwg','iges','gltf','drawing','fea')),
  status        TEXT NOT NULL DEFAULT 'queued'
                  CHECK (status IN ('queued','running','done','failed')),
  input_json    TEXT,
  output_r2_key TEXT,
  error_log     TEXT,
  started_at    TIMESTAMP,
  completed_at  TIMESTAMP,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes (tenant/user/project access patterns)
CREATE INDEX IF NOT EXISTS idx_cad_projects_tenant   ON cad_projects(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cad_projects_user     ON cad_projects(user_id);
CREATE INDEX IF NOT EXISTS idx_cad_assemblies_project ON cad_assemblies(project_id);
CREATE INDEX IF NOT EXISTS idx_cad_assemblies_parent  ON cad_assemblies(parent_assembly_id);
CREATE INDEX IF NOT EXISTS idx_cad_revisions_project  ON cad_revisions(project_id);
CREATE INDEX IF NOT EXISTS idx_cad_features_assembly  ON cad_features(assembly_id);
CREATE INDEX IF NOT EXISTS idx_cad_features_parent    ON cad_features(parent_feature_id);
CREATE INDEX IF NOT EXISTS idx_cad_render_jobs_project ON cad_render_jobs(project_id);
CREATE INDEX IF NOT EXISTS idx_cad_render_jobs_status  ON cad_render_jobs(status);
