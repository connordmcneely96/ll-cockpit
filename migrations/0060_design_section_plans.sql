CREATE TABLE design_section_plans (
  id TEXT PRIMARY KEY,
  brief_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_approval', -- pending_approval | approved | superseded
  plan_json TEXT NOT NULL,            -- JSON array of {name, slug, description, task_type, estimated_cost_usd}
  section_count INTEGER NOT NULL,
  estimated_total_cost_usd REAL NOT NULL,
  model_id TEXT,
  created_at INTEGER NOT NULL,
  approved_at INTEGER
);
CREATE INDEX idx_design_section_plans_brief ON design_section_plans(brief_id);
