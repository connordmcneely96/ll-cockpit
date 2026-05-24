-- ============================================================
-- NEXUS THOMPSON SAMPLING + AGENT ACCOUNTABILITY SCHEMA
-- Extends nexus_d1_schema.sql (additive — no existing tables dropped)
-- Database: ll-cockpit-db (D1)
-- Sprint 123A | 2026-05-23
-- Run: wrangler d1 execute ll-cockpit-db --file=migrations/0025_nexus_thompson_sampling.sql --remote
--
-- Owner assignments:
--   FORGE         → schema migrations, D1 writes
--   BUILDER       → Cockpit analytics UI
--   META-COGNITION → quality thresholds, reward signal, prompt rewrites
--   ANCHOR        → routing performance dashboards, cost reports
--
-- Anthropic tier map (verified rates May 2026):
--   Haiku  4.5  (claude-haiku-4-5-20251001)  → $1.00/$5.00 per MTok,  200K ctx
--   Sonnet 4.6  (claude-sonnet-4-6)           → $3.00/$15.00 per MTok, 1M ctx
--   Opus   4.7  (claude-opus-4-7)             → $5.00/$25.00 per MTok, 1M ctx
-- ============================================================

-- ============================================================
-- LAYER 0 · REGISTRY / CONFIG
-- ============================================================

CREATE TABLE IF NOT EXISTS model_registry (
  model_id           TEXT PRIMARY KEY,
  provider           TEXT NOT NULL,
  display_name       TEXT NOT NULL,
  tier               INTEGER NOT NULL,
  cost_input_per_1m  REAL DEFAULT 0,
  cost_output_per_1m REAL DEFAULT 0,
  context_window     INTEGER,
  supports_vision    INTEGER DEFAULT 0,
  supports_tools     INTEGER DEFAULT 0,
  is_anthropic       INTEGER DEFAULT 0,
  active             INTEGER DEFAULT 1,
  notes              TEXT,
  created_at         INTEGER NOT NULL
);

-- Anthropic priority models (verified rates May 2026)
INSERT OR IGNORE INTO model_registry VALUES
  ('claude-haiku-4-5-20251001','anthropic','Claude Haiku 4.5',  1,  1.00,  5.00, 200000, 1, 1, 1, 1, 'Lightweight: classify, pre-filter, fast QA. Max output 64K.', unixepoch()),
  ('claude-sonnet-4-6',        'anthropic','Claude Sonnet 4.6', 2,  3.00, 15.00,1000000, 1, 1, 1, 1, 'Primary: data setup, code, agents. 1M ctx. Max output 64K.', unixepoch()),
  ('claude-opus-4-7',          'anthropic','Claude Opus 4.7',   3,  5.00, 25.00,1000000, 1, 1, 1, 1, 'Gate: quality control, approval, strategic. 1M ctx. Max output 128K.', unixepoch());

-- OpenAI GPT challengers
INSERT OR IGNORE INTO model_registry VALUES
  ('gpt-5.4-mini', 'openai','GPT-5.4 Mini', 2, 0.75,  4.50, 400000, 1, 1, 0, 1, 'Strong coding subagent, tool calling, computer use. 400K ctx.', unixepoch()),
  ('gpt-5.4-nano', 'openai','GPT-5.4 Nano', 1, 0.20,  1.25, 400000, 0, 1, 0, 1, 'Ultra-cheap: classify, extract, rank. API only. No computer use.', unixepoch()),
  ('gpt-4.1-mini', 'openai','GPT-4.1 Mini', 1, 0.40,  1.60,1000000, 1, 1, 0, 1, 'Instruction following + tool calling. 1M ctx. Max output 32K.', unixepoch());

-- Cloudflare Workers AI challengers
-- CF pricing is per-neuron. Rates below are OpenRouter equivalents for budgeting.
-- Always verify: developers.cloudflare.com/workers-ai/platform/pricing/
INSERT OR IGNORE INTO model_registry VALUES
  ('cf-kimi-k2.6',     'cloudflare_workers_ai','Kimi K2.6 (CF)',         2, 0.60,  2.50, 262000, 1, 1, 0, 1, 'SWE-Bench Pro #1. Multi-turn tools. CF: @cf/moonshotai/kimi-k2.6', unixepoch()),
  ('cf-gemma-4-26b',   'cloudflare_workers_ai','Gemma 4 26B A4B (CF)',   1, 0.06,  0.33, 256000, 1, 1, 0, 1, 'MoE 4B active. Vision+video. Thinking. CF: @cf/google/gemma-4-26b-a4b-it', unixepoch()),
  ('cf-gpt-oss-120b',  'cloudflare_workers_ai','GPT-OSS 120B (CF)',      2, 0.35,  0.75, 131000, 0, 1, 0, 1, 'Reasoning + tool calling. CF: @cf/openai/gpt-oss-120b', unixepoch()),
  ('cf-gpt-oss-20b',   'cloudflare_workers_ai','GPT-OSS 20B (CF)',       1, 0.20,  0.30, 131000, 0, 1, 0, 1, 'Lightweight. CF: @cf/openai/gpt-oss-20b', unixepoch()),
  ('cf-glm-4-7-flash', 'cloudflare_workers_ai','GLM-4.7-Flash (CF)',     1, 0.06,  0.40, 131000, 0, 1, 0, 1, 'Fast multi-turn + tool_stream. 100+ langs. CF: @cf/zai-org/glm-4.7-flash', unixepoch()),
  ('cf-llama-4-scout', 'cloudflare_workers_ai','Llama 4 Scout (CF)',     1, 0.08,  0.30, 131000, 1, 1, 0, 1, 'MoE 17B active. Native multimodal. CF: @cf/meta/llama-4-scout-17b-16e-instruct', unixepoch()),
  ('cf-llama-3-3-70b', 'cloudflare_workers_ai','Llama 3.3 70B FP8 (CF)', 2, 0.293, 2.253,128000, 0, 1, 0, 1, 'CF verified: $0.293/$2.253. Fast FP8. CF: @cf/meta/llama-3.3-70b-instruct-fp8-fast', unixepoch());

CREATE TABLE IF NOT EXISTS task_type_registry (
  task_type          TEXT PRIMARY KEY,
  description        TEXT,
  complexity         TEXT NOT NULL DEFAULT 'medium',
  quality_threshold  REAL NOT NULL DEFAULT 0.75,
  pass_threshold     REAL NOT NULL DEFAULT 0.85,
  min_anthropic_tier INTEGER NOT NULL DEFAULT 1,
  max_anthropic_tier INTEGER NOT NULL DEFAULT 3,
  primary_anthropic  TEXT,
  latency_budget_ms  INTEGER DEFAULT 10000,
  requires_opus_gate INTEGER DEFAULT 0,
  agent_owner        TEXT NOT NULL,
  active             INTEGER DEFAULT 1,
  notes              TEXT
);

INSERT OR IGNORE INTO task_type_registry VALUES
  ('intent_classify',      'Route and classify incoming requests',              'low',      0.70, 0.80, 1, 2, 'claude-haiku-4-5-20251001', 3000,  0, 'NEXUS',    1, 'Pre-filter; Haiku sufficient'),
  ('caption_short',        'Social captions, tweets, short copy',               'low',      0.70, 0.80, 1, 2, 'claude-haiku-4-5-20251001', 5000,  0, 'HERALD',   1, NULL),
  ('json_extract',         'Structured form parsing, scope extraction',         'low',      0.80, 0.90, 1, 2, 'claude-haiku-4-5-20251001', 5000,  0, 'INTAKE',   1, NULL),
  ('qa_precheck',          'Fast sanity-check before SENTINEL full review',     'low',      0.70, 0.80, 1, 2, 'claude-haiku-4-5-20251001', 4000,  0, 'SENTINEL', 1, 'Haiku pre-filter before Opus gate'),
  ('code_generate',        'Standard code generation',                          'medium',   0.80, 0.88, 2, 3, 'claude-sonnet-4-6',         30000, 0, 'FORGE',    1, NULL),
  ('content_write',        'Brand-voice content, blog, case studies',           'medium',   0.80, 0.88, 2, 3, 'claude-sonnet-4-6',         20000, 0, 'HERALD',   1, NULL),
  ('research_summarize',   'YouTube transcript + RSS summarization',            'medium',   0.75, 0.85, 2, 3, 'claude-sonnet-4-6',         30000, 0, 'ORACLE',   1, NULL),
  ('long_doc_ingest',      'Engineering specs, long PDFs, transcripts',         'medium',   0.75, 0.85, 1, 2, 'claude-sonnet-4-6',         60000, 0, 'ATLAS',    1, NULL),
  ('outreach_personalize', 'Personalized prospect outreach',                    'medium',   0.82, 0.90, 2, 3, 'claude-sonnet-4-6',         15000, 0, 'SCOUT',    1, NULL),
  ('vision_check',         'Screenshot analysis for self-heal loop',            'medium',   0.80, 0.88, 2, 3, 'claude-sonnet-4-6',         10000, 0, 'BUILDER',  1, NULL),
  ('social_intel',         'Real-time X / market intelligence',                 'medium',   0.75, 0.85, 2, 3, 'claude-sonnet-4-6',         20000, 0, 'ORACLE',   1, NULL),
  ('code_complex',         'Multi-file arch decisions, complex refactors',      'high',     0.85, 0.92, 3, 3, 'claude-opus-4-7',           60000, 1, 'FORGE',    1, 'Opus gate required'),
  ('engineering_calc',     'Technical calculations requiring domain accuracy',  'high',     0.90, 0.95, 3, 3, 'claude-opus-4-7',           30000, 1, 'ATLAS',    1, 'Always Connor-reviewed'),
  ('qa_review',            'Full SENTINEL output quality review',               'high',     0.85, 0.92, 3, 3, 'claude-opus-4-7',           30000, 1, 'SENTINEL', 1, 'Opus owns final QA gate'),
  ('strategic_decide',     'GENESIS spawn, major architectural calls',          'critical', 0.90, 0.95, 3, 3, 'claude-opus-4-7',           60000, 1, 'NEXUS',    1, NULL),
  ('genesis_score_gap',    'Market gap evaluation for business spawning',       'critical', 0.88, 0.95, 3, 3, 'claude-opus-4-7',           30000, 1, 'ORACLE',   1, NULL);

CREATE TABLE IF NOT EXISTS agent_registry (
  agent_name       TEXT PRIMARY KEY,
  role             TEXT NOT NULL,
  primary_model    TEXT NOT NULL,
  gate_model       TEXT,
  domain_owner     TEXT,
  capability_badge TEXT,
  active           INTEGER DEFAULT 1,
  kv_prompt_key    TEXT,
  notes            TEXT,
  created_at       INTEGER NOT NULL
);

INSERT OR IGNORE INTO agent_registry VALUES
  ('NEXUS',          'Master orchestrator + router',                      'claude-sonnet-4-6', 'claude-opus-4-7', NULL,                 'READ',   1, 'prompt:NEXUS',    NULL, unixepoch()),
  ('SCOUT',          'Lead intelligence + prospecting',                   'claude-sonnet-4-6', NULL,              NULL,                 'WRITE',  1, 'prompt:SCOUT',    NULL, unixepoch()),
  ('INTAKE',         'Client onboarding + proposal',                      'claude-sonnet-4-6', NULL,              NULL,                 'WRITE',  1, 'prompt:INTAKE',   NULL, unixepoch()),
  ('FORGE',          'Full-stack engineer',                               'claude-sonnet-4-6', 'claude-opus-4-7', 'database',           'WRITE',  1, 'prompt:FORGE',    'DB design, migrations, D1 writes', unixepoch()),
  ('BUILDER',        'Autonomous app builder + Cockpit UI',               'claude-sonnet-4-6', 'claude-opus-4-7', 'frontend',           'DEPLOY', 1, 'prompt:BUILDER',  'Cockpit UI, analytics dashboard', unixepoch()),
  ('ATLAS',          'Engineering domain specialist',                     'claude-sonnet-4-6', 'claude-opus-4-7', NULL,                 'WRITE',  1, 'prompt:ATLAS',    NULL, unixepoch()),
  ('HERALD',         'Content and copy',                                  'claude-sonnet-4-6', NULL,              NULL,                 'WRITE',  1, 'prompt:HERALD',   NULL, unixepoch()),
  ('REEL',           'Video and animation',                               'claude-sonnet-4-6', NULL,              NULL,                 'WRITE',  1, 'prompt:REEL',     NULL, unixepoch()),
  ('SENTINEL',       'QA gate (Haiku pre-check, Opus final gate)',        'claude-haiku-4-5-20251001', 'claude-opus-4-7', NULL,         'READ',   1, 'prompt:SENTINEL', NULL, unixepoch()),
  ('DISPATCH',       'Client delivery packaging',                         'claude-sonnet-4-6', NULL,              NULL,                 'WRITE',  1, 'prompt:DISPATCH', NULL, unixepoch()),
  ('ANCHOR',         'Revenue, invoicing, platform analytics',            'claude-sonnet-4-6', NULL,              'analytics',          'WRITE',  1, 'prompt:ANCHOR',   'Routing perf dashboards, cost reports', unixepoch()),
  ('ORACLE',         'Market intelligence + research',                    'claude-sonnet-4-6', 'claude-opus-4-7', NULL,                 'WRITE',  1, 'prompt:ORACLE',   NULL, unixepoch()),
  ('META_COGNITION', 'Self-improvement cron (quality -> prompt rewrite)', 'claude-opus-4-7',   NULL,              'prompt_engineering', 'READ',   1, 'prompt:META',     'Quality thresholds, reward signals, prompt rewrites', unixepoch()),
  ('HERMES',         'Inter-agent coordination + overflow handler',       'claude-sonnet-4-6', NULL,              NULL,                 'WRITE',  1, 'prompt:HERMES',   NULL, unixepoch());

-- ============================================================
-- LAYER 1 · THOMPSON SAMPLING INTELLIGENCE
-- ============================================================

CREATE TABLE IF NOT EXISTS model_bandit_params (
  id              TEXT PRIMARY KEY,
  task_type       TEXT NOT NULL,
  model_id        TEXT NOT NULL,
  alpha           REAL NOT NULL DEFAULT 1.0,
  beta            REAL NOT NULL DEFAULT 1.0,
  n_trials        INTEGER DEFAULT 0,
  n_successes     INTEGER DEFAULT 0,
  n_failures      INTEGER DEFAULT 0,
  avg_latency_ms  REAL DEFAULT 0,
  avg_cost_usd    REAL DEFAULT 0,
  last_sample     REAL,
  last_reward     REAL,
  convergence_pct REAL,
  last_updated    INTEGER,
  UNIQUE(task_type, model_id)
);
CREATE INDEX IF NOT EXISTS idx_bandit_task  ON model_bandit_params(task_type);
CREATE INDEX IF NOT EXISTS idx_bandit_model ON model_bandit_params(model_id);
CREATE INDEX IF NOT EXISTS idx_bandit_alpha ON model_bandit_params(alpha DESC);

CREATE TABLE IF NOT EXISTS routing_decisions (
  id                    TEXT PRIMARY KEY,
  task_execution_id     TEXT,
  task_type             TEXT NOT NULL,
  chosen_model          TEXT NOT NULL,
  chosen_reason         TEXT,
  sample_scores_json    TEXT,
  alpha_at_decision     REAL,
  beta_at_decision      REAL,
  n_trials_at_decision  INTEGER,
  cost_weight           REAL DEFAULT 0.3,
  latency_weight        REAL DEFAULT 0.2,
  quality_weight        REAL DEFAULT 0.5,
  forced_by             TEXT,
  decided_at            INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_routing_task_type ON routing_decisions(task_type);
CREATE INDEX IF NOT EXISTS idx_routing_model     ON routing_decisions(chosen_model);
CREATE INDEX IF NOT EXISTS idx_routing_decided   ON routing_decisions(decided_at);

-- IMMUTABLE append-only — never update, never delete
CREATE TABLE IF NOT EXISTS bandit_reward_log (
  id            TEXT PRIMARY KEY,
  routing_id    TEXT NOT NULL,
  task_type     TEXT NOT NULL,
  model_id      TEXT NOT NULL,
  quality_score REAL NOT NULL,
  reward        REAL NOT NULL,
  alpha_before  REAL NOT NULL,
  beta_before   REAL NOT NULL,
  alpha_after   REAL NOT NULL,
  beta_after    REAL NOT NULL,
  latency_ms    INTEGER,
  cost_usd      REAL,
  applied       INTEGER DEFAULT 0,
  rewarded_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reward_log_task    ON bandit_reward_log(task_type, model_id);
CREATE INDEX IF NOT EXISTS idx_reward_log_at      ON bandit_reward_log(rewarded_at);
CREATE INDEX IF NOT EXISTS idx_reward_applied     ON bandit_reward_log(applied, task_type, model_id);

-- ============================================================
-- LAYER 2 · EXECUTION SPINE
-- Every agent action writes a row here. No exceptions.
-- ============================================================

CREATE TABLE IF NOT EXISTS task_executions (
  id                TEXT PRIMARY KEY,
  agent             TEXT NOT NULL,
  task_type         TEXT NOT NULL,
  model_used        TEXT NOT NULL,
  routing_id        TEXT,
  project_id        TEXT,
  parent_exec_id    TEXT,
  task_input        TEXT NOT NULL,
  task_output       TEXT,
  started_at        INTEGER NOT NULL,
  completed_at      INTEGER,
  latency_ms        INTEGER,
  input_tokens      INTEGER DEFAULT 0,
  output_tokens     INTEGER DEFAULT 0,
  cost_usd          REAL DEFAULT 0,
  quality_score     REAL,
  quality_dims_json TEXT,
  sentinel_pass     INTEGER,
  status            TEXT NOT NULL DEFAULT 'running',
  failure_reason    TEXT,
  retry_count       INTEGER DEFAULT 0,
  artifact_ids_json TEXT,
  connor_required   INTEGER DEFAULT 0,
  connor_approved   INTEGER,
  opus_gate_id      TEXT,
  supabase_synced   INTEGER,
  logged_at         INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_exec_agent     ON task_executions(agent);
CREATE INDEX IF NOT EXISTS idx_exec_task_type ON task_executions(task_type);
CREATE INDEX IF NOT EXISTS idx_exec_model     ON task_executions(model_used);
CREATE INDEX IF NOT EXISTS idx_exec_status    ON task_executions(status);
CREATE INDEX IF NOT EXISTS idx_exec_project   ON task_executions(project_id);
CREATE INDEX IF NOT EXISTS idx_exec_started   ON task_executions(started_at);
CREATE INDEX IF NOT EXISTS idx_exec_cost      ON task_executions(cost_usd);
CREATE INDEX IF NOT EXISTS idx_exec_quality   ON task_executions(quality_score);

CREATE TABLE IF NOT EXISTS quality_assessments (
  id                  TEXT PRIMARY KEY,
  execution_id        TEXT NOT NULL,
  assessor_model      TEXT NOT NULL,
  stage               TEXT NOT NULL,
  score_accuracy      REAL,
  score_completeness  REAL,
  score_tone          REAL,
  score_safety        REAL,
  score_domain        REAL,
  score_format        REAL,
  composite_score     REAL NOT NULL,
  passed              INTEGER NOT NULL,
  feedback_json       TEXT,
  rubric_version      TEXT,
  assessed_at         INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_qa_exec  ON quality_assessments(execution_id);
CREATE INDEX IF NOT EXISTS idx_qa_model ON quality_assessments(assessor_model);
CREATE INDEX IF NOT EXISTS idx_qa_score ON quality_assessments(composite_score);

CREATE TABLE IF NOT EXISTS approval_gates (
  id                 TEXT PRIMARY KEY,
  execution_id       TEXT NOT NULL,
  gate_type          TEXT NOT NULL,
  requestor_agent    TEXT NOT NULL,
  gating_model       TEXT NOT NULL DEFAULT 'claude-opus-4-7',
  gate_prompt        TEXT NOT NULL,
  context_json       TEXT,
  decision           TEXT,
  decision_notes     TEXT,
  confidence         REAL,
  revision_requested TEXT,
  connor_notified    INTEGER DEFAULT 0,
  connor_decision    TEXT,
  connor_notes       TEXT,
  latency_ms         INTEGER,
  cost_usd           REAL,
  gate_opened_at     INTEGER NOT NULL,
  gate_closed_at     INTEGER
);
CREATE INDEX IF NOT EXISTS idx_gate_exec     ON approval_gates(execution_id);
CREATE INDEX IF NOT EXISTS idx_gate_type     ON approval_gates(gate_type);
CREATE INDEX IF NOT EXISTS idx_gate_decision ON approval_gates(decision);

CREATE TABLE IF NOT EXISTS cost_ledger (
  id             TEXT PRIMARY KEY,
  execution_id   TEXT NOT NULL,
  call_sequence  INTEGER NOT NULL,
  model_id       TEXT NOT NULL,
  call_purpose   TEXT,
  input_tokens   INTEGER NOT NULL,
  output_tokens  INTEGER NOT NULL,
  cost_usd       REAL NOT NULL,
  latency_ms     INTEGER,
  cached         INTEGER DEFAULT 0,
  error          TEXT,
  called_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cost_exec  ON cost_ledger(execution_id);
CREATE INDEX IF NOT EXISTS idx_cost_model ON cost_ledger(model_id);
CREATE INDEX IF NOT EXISTS idx_cost_at    ON cost_ledger(called_at);

-- ============================================================
-- LAYER 3 · ARTIFACT ACCOUNTABILITY
-- If an agent produces output not in this table = system failure.
-- ============================================================

CREATE TABLE IF NOT EXISTS artifact_registry (
  id                 TEXT PRIMARY KEY,
  execution_id       TEXT NOT NULL,
  producing_agent    TEXT NOT NULL,
  artifact_type      TEXT NOT NULL,
  artifact_name      TEXT NOT NULL,
  storage_type       TEXT NOT NULL,
  storage_ref        TEXT,
  r2_bucket          TEXT,
  d1_table           TEXT,
  content_hash       TEXT,
  size_bytes         INTEGER,
  format             TEXT,
  parent_artifact_id TEXT,
  project_id         TEXT,
  client_id          TEXT,
  quality_score      REAL,
  sentinel_pass      INTEGER,
  status             TEXT DEFAULT 'active',
  delivered_at       INTEGER,
  archived_at        INTEGER,
  created_at         INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_artifact_exec    ON artifact_registry(execution_id);
CREATE INDEX IF NOT EXISTS idx_artifact_agent   ON artifact_registry(producing_agent);
CREATE INDEX IF NOT EXISTS idx_artifact_type    ON artifact_registry(artifact_type);
CREATE INDEX IF NOT EXISTS idx_artifact_project ON artifact_registry(project_id);
CREATE INDEX IF NOT EXISTS idx_artifact_hash    ON artifact_registry(content_hash);
CREATE INDEX IF NOT EXISTS idx_artifact_status  ON artifact_registry(status);

CREATE TABLE IF NOT EXISTS artifact_lineage (
  parent_id  TEXT NOT NULL,
  child_id   TEXT NOT NULL,
  transform  TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (parent_id, child_id)
);

-- ============================================================
-- LAYER 4 · SMOKE TEST SUITE
-- ============================================================

CREATE TABLE IF NOT EXISTS smoke_test_suites (
  id                    TEXT PRIMARY KEY,
  suite_name            TEXT NOT NULL UNIQUE,
  description           TEXT,
  target_task_types     TEXT NOT NULL,
  candidate_models      TEXT NOT NULL,
  n_cases               INTEGER DEFAULT 10,
  quality_rubric_version TEXT,
  owner_agent           TEXT,
  active                INTEGER DEFAULT 1,
  created_at            INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS smoke_test_cases (
  id                     TEXT PRIMARY KEY,
  suite_id               TEXT NOT NULL,
  task_type              TEXT NOT NULL,
  case_name              TEXT NOT NULL,
  difficulty             TEXT DEFAULT 'medium',
  input_prompt           TEXT NOT NULL,
  context_json           TEXT,
  expected_criteria_json TEXT NOT NULL,
  reference_output       TEXT,
  max_latency_ms         INTEGER,
  max_cost_usd           REAL,
  active                 INTEGER DEFAULT 1,
  created_at             INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_test_case_suite ON smoke_test_cases(suite_id);
CREATE INDEX IF NOT EXISTS idx_test_case_task  ON smoke_test_cases(task_type);

CREATE TABLE IF NOT EXISTS smoke_test_runs (
  id                   TEXT PRIMARY KEY,
  suite_id             TEXT NOT NULL,
  trigger              TEXT NOT NULL,
  triggered_by         TEXT,
  status               TEXT DEFAULT 'running',
  models_under_test    TEXT NOT NULL,
  n_cases_planned      INTEGER NOT NULL,
  n_cases_complete     INTEGER DEFAULT 0,
  n_cases_passed       INTEGER DEFAULT 0,
  n_cases_failed       INTEGER DEFAULT 0,
  winner_model         TEXT,
  winner_score         REAL,
  total_cost_usd       REAL DEFAULT 0,
  total_latency_ms     INTEGER DEFAULT 0,
  results_summary_json TEXT,
  started_at           INTEGER NOT NULL,
  completed_at         INTEGER
);
CREATE INDEX IF NOT EXISTS idx_run_suite   ON smoke_test_runs(suite_id);
CREATE INDEX IF NOT EXISTS idx_run_status  ON smoke_test_runs(status);
CREATE INDEX IF NOT EXISTS idx_run_started ON smoke_test_runs(started_at);

CREATE TABLE IF NOT EXISTS smoke_test_results (
  id                 TEXT PRIMARY KEY,
  run_id             TEXT NOT NULL,
  case_id            TEXT NOT NULL,
  model_id           TEXT NOT NULL,
  output_text        TEXT,
  latency_ms         INTEGER,
  input_tokens       INTEGER,
  output_tokens      INTEGER,
  cost_usd           REAL,
  score_accuracy     REAL,
  score_completeness REAL,
  score_tone         REAL,
  score_criteria_met REAL,
  composite_score    REAL,
  opus_verdict       TEXT,
  opus_notes         TEXT,
  rank_in_case       INTEGER,
  bandit_reward      REAL,
  bandit_seeded      INTEGER DEFAULT 0,
  tested_at          INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_result_run   ON smoke_test_results(run_id);
CREATE INDEX IF NOT EXISTS idx_result_case  ON smoke_test_results(case_id);
CREATE INDEX IF NOT EXISTS idx_result_model ON smoke_test_results(model_id);
CREATE INDEX IF NOT EXISTS idx_result_score ON smoke_test_results(composite_score);

-- ============================================================
-- LAYER 5 · ANALYTICS SNAPSHOTS
-- ANCHOR writes here daily. BUILDER renders in Cockpit Routing Intel panel.
-- ============================================================

CREATE TABLE IF NOT EXISTS routing_analytics_snapshots (
  id                          TEXT PRIMARY KEY,
  snapshot_date               TEXT NOT NULL,
  snapshot_type               TEXT NOT NULL,
  standings_json              TEXT NOT NULL,
  total_cost_usd              REAL DEFAULT 0,
  cost_by_model_json          TEXT,
  cost_by_agent_json          TEXT,
  cost_by_task_json           TEXT,
  avg_quality_score           REAL,
  quality_by_model_json       TEXT,
  quality_by_agent_json       TEXT,
  sentinel_pass_rate          REAL,
  opus_gate_pass_rate         REAL,
  total_executions            INTEGER DEFAULT 0,
  executions_by_agent_json    TEXT,
  avg_latency_ms              REAL,
  latency_by_model_json       TEXT,
  converged_task_types_json   TEXT,
  exploration_rate            REAL,
  artifacts_produced          INTEGER DEFAULT 0,
  artifacts_delivered         INTEGER DEFAULT 0,
  unaccounted_executions      INTEGER DEFAULT 0,
  haiku_usage_pct             REAL,
  sonnet_usage_pct            REAL,
  opus_usage_pct              REAL,
  anthropic_total_cost        REAL,
  generated_by                TEXT DEFAULT 'ANCHOR',
  generated_at                INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_snapshot_date ON routing_analytics_snapshots(snapshot_date);
CREATE INDEX IF NOT EXISTS idx_snapshot_type ON routing_analytics_snapshots(snapshot_type);

-- ============================================================
-- END SCHEMA
-- Total new tables: 17
-- Existing tables preserved: model_routing, agent_perf, training_data,
--   projects, leads, revenue, tool_registry
-- Apply: wrangler d1 execute ll-cockpit-db --file=migrations/0025_nexus_thompson_sampling.sql --remote
-- ============================================================
