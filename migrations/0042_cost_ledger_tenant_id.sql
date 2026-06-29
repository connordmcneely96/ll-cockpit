-- 0042_cost_ledger_tenant_id.sql
-- Slice 1.5: tenant attribution on the cost ledger (compute + LLM cost rollup per tenant).
ALTER TABLE cost_ledger ADD COLUMN tenant_id TEXT;
CREATE INDEX IF NOT EXISTS idx_cost_ledger_tenant ON cost_ledger(tenant_id);
