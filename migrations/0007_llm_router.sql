-- COCKPIT D1 SCHEMA · Migration 0007 — LLM Router (Sprint 13 v0.1)
-- Provider registry + model catalog + per-(agent, task_type) routing policy + decision log
-- Run: wrangler d1 execute ll-cockpit-db --file=migrations/0007_llm_router.sql --remote

CREATE TABLE IF NOT EXISTS ai_providers (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  api_base_url TEXT,
  auth_method TEXT NOT NULL,
  api_key_secret_name TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_models (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  model_string TEXT NOT NULL,
  context_window INTEGER,
  max_output_tokens INTEGER,
  cost_per_1k_input_usd REAL NOT NULL DEFAULT 0,
  cost_per_1k_output_usd REAL NOT NULL DEFAULT 0,
  tier TEXT NOT NULL DEFAULT 'standard',
  license TEXT,
  supports_tool_use INTEGER NOT NULL DEFAULT 0,
  supports_vision INTEGER NOT NULL DEFAULT 0,
  supports_json_mode INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_models_provider ON ai_models(provider_id, enabled);
CREATE INDEX IF NOT EXISTS idx_ai_models_tier ON ai_models(tier, enabled);

CREATE TABLE IF NOT EXISTS ai_routing_policy (
  id TEXT PRIMARY KEY,
  agent_name TEXT NOT NULL,
  task_type TEXT NOT NULL,
  primary_model_id TEXT NOT NULL,
  fallback_chain_json TEXT,
  priority INTEGER NOT NULL DEFAULT 5,
  enabled INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(agent_name, task_type)
);
CREATE INDEX IF NOT EXISTS idx_routing_lookup ON ai_routing_policy(agent_name, task_type, enabled);

CREATE TABLE IF NOT EXISTS ai_routing_decisions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  pipeline_run_id TEXT,
  subtask_id TEXT,
  agent_name TEXT NOT NULL,
  task_type TEXT NOT NULL,
  policy_id TEXT,
  selected_model_id TEXT NOT NULL,
  attempted_models_json TEXT,
  used_fallback INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  success INTEGER NOT NULL,
  error TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_decisions_user ON ai_routing_decisions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_decisions_run ON ai_routing_decisions(pipeline_run_id);
CREATE INDEX IF NOT EXISTS idx_decisions_agent ON ai_routing_decisions(agent_name, task_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_decisions_model ON ai_routing_decisions(selected_model_id, created_at DESC);
