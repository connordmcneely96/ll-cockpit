-- 0064_tenant_isolation.sql
-- Sprint: per-tenant corpus isolation.
-- One statement per line (SQLite/D1 allows one ALTER ... ADD COLUMN per statement).
-- Backfill: pre-existing rows are Connor's own, pre-multi-tenant -> tenant 'default'.
--
-- Tenant scoping audit of tenant-derived tables:
--   rag_documents / rag_chunks : already have tenant_id (0062). Add the (tenant_id, doc)
--                                index for rag_documents; rag_chunks already has one.
--   artifact_registry          : stores tenant-derived deliverables but had NO tenant
--                                (nor user_id) column — only execution_id / pipeline_run_id.
--                                Add tenant_id + backfill + index.
--   cad_convergence_runs       : already tenant-scoped via user_id (= the tenant identity).
--                                NO change — adding tenant_id would duplicate user_id and
--                                risk the two diverging.
--   atlas_query_log            : already scoped by user_id. No change.
--   cost_ledger                : already has tenant_id (0042). No change.

-- rag_documents: match the tenant-scoped index rag_chunks already carries.
CREATE INDEX IF NOT EXISTS idx_rag_documents_tenant_doc ON rag_documents (tenant_id, doc);

-- rag_chunks: idempotent guard (idx_rag_chunks_doc on (tenant_id, doc) exists from 0062).
CREATE INDEX IF NOT EXISTS idx_rag_chunks_tenant_doc ON rag_chunks (tenant_id, doc);

-- artifact_registry: add the missing tenant column.
ALTER TABLE artifact_registry ADD COLUMN tenant_id TEXT;

UPDATE artifact_registry SET tenant_id = 'default' WHERE tenant_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_artifact_tenant ON artifact_registry (tenant_id);
