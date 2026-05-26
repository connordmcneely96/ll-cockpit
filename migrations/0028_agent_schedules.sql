-- Sprint 145C: agent_schedules — per-agent heartbeat cadence for autonomous wake.
-- Cron fires */15; this table decides who is DUE. All agents seed disabled (cost guard).

CREATE TABLE agent_schedules (
  agent_name       TEXT PRIMARY KEY,
  cadence_minutes  INTEGER NOT NULL DEFAULT 240,
  enabled          INTEGER NOT NULL DEFAULT 0,
  heartbeat_action TEXT,
  last_run_at      INTEGER,
  next_run_at      INTEGER,
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);

-- Seed all 11 org agents (enabled=0, cadence=4h). Opt-in via manage route.
INSERT INTO agent_schedules (agent_name, cadence_minutes, enabled, heartbeat_action, created_at, updated_at) VALUES
  ('nexus',    240, 0, 'reap stuck messages + review org-wide stalls + emit executive summary', strftime('%s','now'), strftime('%s','now')),
  ('scout',    240, 0, 'scan inbox + advance assigned lead tasks', strftime('%s','now'), strftime('%s','now')),
  ('intake',   240, 0, 'drain queued prospects + update onboarding records', strftime('%s','now'), strftime('%s','now')),
  ('herald',   240, 0, 'draft pending content pieces + check publishing queue', strftime('%s','now'), strftime('%s','now')),
  ('anchor',   240, 0, 'reconcile open invoices + flag overdue retainers', strftime('%s','now'), strftime('%s','now')),
  ('forge',    240, 0, 'review open code tasks + run pending builds', strftime('%s','now'), strftime('%s','now')),
  ('atlas',    240, 0, 'index new engineering specs + refresh RAG embeddings', strftime('%s','now'), strftime('%s','now')),
  ('builder',  240, 0, 'check deploy queue + self-heal failing deployments', strftime('%s','now'), strftime('%s','now')),
  ('dispatch', 240, 0, 'package pending deliverables + send delivery emails', strftime('%s','now'), strftime('%s','now')),
  ('reel',     240, 0, 'advance video production queue + check render status', strftime('%s','now'), strftime('%s','now')),
  ('sentinel', 240, 0, 'score pending outputs + flag quality regressions', strftime('%s','now'), strftime('%s','now'));
