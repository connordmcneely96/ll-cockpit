-- Sprint 121F — track Pages deployments per brief
CREATE TABLE IF NOT EXISTS design_deployments (
  id TEXT PRIMARY KEY,
  brief_id TEXT NOT NULL,
  iteration_number INTEGER,
  live_url TEXT NOT NULL,
  cf_deployment_id TEXT,
  status TEXT NOT NULL DEFAULT 'live',  -- 'live' | 'failed' | 'superseded'
  deployed_by TEXT NOT NULL,            -- user_id
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_design_deployments_brief ON design_deployments(brief_id);
