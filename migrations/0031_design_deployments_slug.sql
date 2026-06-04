-- Sprint 121F-R2 — add slug to design_deployments for the nexus-sites R2 serving model.
-- The slug is the public URL identifier: https://nexus-sites.connorpattern.workers.dev/{slug}/
-- Existing rows (legacy Pages Direct Upload deploys) get NULL slug and are never read by nexus-sites.
ALTER TABLE design_deployments ADD COLUMN slug TEXT;
CREATE INDEX IF NOT EXISTS idx_design_deployments_slug ON design_deployments(slug);
