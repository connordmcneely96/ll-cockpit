-- Sprint 145B: per-agent token budgets with enforcement.
-- Spend is DERIVED live from agent_subtasks.cost_usd — no denormalized spent column.
-- All agents seed enabled=0 (cost guard — opt-in via API).

CREATE TABLE agent_budgets (
  agent_name          TEXT PRIMARY KEY,
  period              TEXT NOT NULL DEFAULT 'daily',
  limit_usd           REAL NOT NULL,
  alert_threshold_pct INTEGER NOT NULL DEFAULT 80,
  hard_stop           INTEGER NOT NULL DEFAULT 1,
  enabled             INTEGER NOT NULL DEFAULT 0,
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL
);

INSERT INTO agent_budgets (agent_name, period, limit_usd, alert_threshold_pct, hard_stop, enabled, created_at, updated_at) VALUES
  ('nexus',    'daily', 5.00, 80, 1, 0, strftime('%s','now'), strftime('%s','now')),
  ('scout',    'daily', 5.00, 80, 1, 0, strftime('%s','now'), strftime('%s','now')),
  ('intake',   'daily', 5.00, 80, 1, 0, strftime('%s','now'), strftime('%s','now')),
  ('herald',   'daily', 5.00, 80, 1, 0, strftime('%s','now'), strftime('%s','now')),
  ('anchor',   'daily', 5.00, 80, 1, 0, strftime('%s','now'), strftime('%s','now')),
  ('forge',    'daily', 5.00, 80, 1, 0, strftime('%s','now'), strftime('%s','now')),
  ('atlas',    'daily', 5.00, 80, 1, 0, strftime('%s','now'), strftime('%s','now')),
  ('builder',  'daily', 5.00, 80, 1, 0, strftime('%s','now'), strftime('%s','now')),
  ('dispatch', 'daily', 5.00, 80, 1, 0, strftime('%s','now'), strftime('%s','now')),
  ('reel',     'daily', 5.00, 80, 1, 0, strftime('%s','now'), strftime('%s','now')),
  ('sentinel', 'daily', 5.00, 80, 1, 0, strftime('%s','now'), strftime('%s','now'));
