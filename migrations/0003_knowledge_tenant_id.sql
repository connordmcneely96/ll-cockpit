-- Migration 0003: Add tenant_id to knowledge pipeline tables
-- Append-only — do NOT modify previous migrations
-- PaaS blueprint: tenant_id scopes all knowledge data per tenant
-- Single-tenant reference: all rows use tenant_id = 'default'

ALTER TABLE study_nodes ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE sprint_items ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default';

-- Indexes for tenant-scoped queries
CREATE INDEX IF NOT EXISTS idx_study_nodes_tenant ON study_nodes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sprint_items_tenant ON sprint_items(tenant_id);

-- Composite indexes for tenant + common filters
CREATE INDEX IF NOT EXISTS idx_study_nodes_tenant_category ON study_nodes(tenant_id, category);
CREATE INDEX IF NOT EXISTS idx_sprint_items_tenant_sprint ON sprint_items(tenant_id, sprint_number);
CREATE INDEX IF NOT EXISTS idx_sprint_items_tenant_status ON sprint_items(tenant_id, status);
