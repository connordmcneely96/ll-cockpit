-- Sprint 145A: org-chart columns on agents table + hierarchy seed.
-- Three new columns: reports_to (agent name, NULL = top), org_department, org_role.
-- ALTERs are intentionally plain (no IF NOT EXISTS) — this is a fresh migration.

ALTER TABLE agents ADD COLUMN reports_to TEXT;
ALTER TABLE agents ADD COLUMN org_department TEXT;
ALTER TABLE agents ADD COLUMN org_role TEXT;

-- Seed the hierarchy (Connor-confirmed 2026-05-25)
UPDATE agents SET org_role = 'ceo',       org_department = 'executive',   reports_to = NULL    WHERE name = 'nexus';
UPDATE agents SET org_role = 'dept_head', org_department = 'growth',      reports_to = 'nexus' WHERE name = 'scout';
UPDATE agents SET org_role = 'worker',    org_department = 'growth',      reports_to = 'scout' WHERE name = 'intake';
UPDATE agents SET org_role = 'worker',    org_department = 'growth',      reports_to = 'scout' WHERE name = 'herald';
UPDATE agents SET org_role = 'worker',    org_department = 'growth',      reports_to = 'scout' WHERE name = 'anchor';
UPDATE agents SET org_role = 'dept_head', org_department = 'engineering', reports_to = 'nexus' WHERE name = 'forge';
UPDATE agents SET org_role = 'worker',    org_department = 'engineering', reports_to = 'forge' WHERE name = 'atlas';
UPDATE agents SET org_role = 'worker',    org_department = 'engineering', reports_to = 'forge' WHERE name = 'builder';
UPDATE agents SET org_role = 'dept_head', org_department = 'delivery',    reports_to = 'nexus' WHERE name = 'dispatch';
UPDATE agents SET org_role = 'worker',    org_department = 'delivery',    reports_to = 'dispatch' WHERE name = 'reel';
UPDATE agents SET org_role = 'reviewer',  org_department = 'qa',          reports_to = 'nexus' WHERE name = 'sentinel';
