-- COCKPIT D1 SCHEMA · Migration 0005 — Leads & Pipeline Runs
-- Pipeline 1 spine: Lead capture → INTAKE qualification → (proposal → contract → deposit)
-- Run: wrangler d1 execute ll-cockpit-db --file=migrations/0005_leads_pipelines.sql --remote

-- ── leads: every prospect we touch ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,

  -- Identity
  name TEXT,
  email TEXT,
  phone TEXT,
  company TEXT,
  title TEXT,
  linkedin_url TEXT,
  website TEXT,

  -- Source attribution
  source TEXT NOT NULL,            -- 'manual' | 'linkedin' | 'upwork' | 'referral' | 'inbound' | 'cold_email'
  source_url TEXT,                 -- where the lead came from
  source_metadata TEXT,            -- JSON: scraping context, referrer info, etc

  -- Pipeline state
  pipeline_stage TEXT NOT NULL DEFAULT 'captured',
  -- captured | qualifying | qualified | proposal_drafting | proposal_sent
  -- contract_drafting | contract_sent | deposit_pending | deposit_paid
  -- kickoff_scheduled | active | lost | dormant
  status TEXT NOT NULL DEFAULT 'active',   -- active | won | lost | dormant

  -- Qualification (written by INTAKE)
  qualification_score INTEGER,     -- 1-10 (10 = perfect fit)
  qualification_summary TEXT,
  qualification_red_flags TEXT,    -- JSON array of concerns
  qualification_next_step TEXT,    -- INTAKE's recommended action
  qualified_at INTEGER,

  -- Free-form notes (from whoever captured the lead)
  raw_notes TEXT,

  -- Tracking
  estimated_value_usd REAL,        -- pipeline value (filled later in flow)
  probability REAL,                -- 0.0–1.0 close probability

  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_leads_user ON leads(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_stage ON leads(pipeline_stage, status);
CREATE INDEX IF NOT EXISTS idx_leads_score ON leads(qualification_score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_source ON leads(source, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status, updated_at DESC);

-- ── pipeline_runs: one row per lead-through-pipeline traversal ───────────────
-- Tracks the multi-stage journey across agents. Stage history is appendable JSON.
CREATE TABLE IF NOT EXISTS pipeline_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  lead_id TEXT NOT NULL,
  pipeline_type TEXT NOT NULL DEFAULT 'lead_to_deposit',  -- pipeline_1 | pipeline_2 | pipeline_3
  current_stage TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',  -- running | paused | completed | failed | cancelled

  started_at INTEGER NOT NULL,
  last_active_at INTEGER NOT NULL,
  completed_at INTEGER,

  -- Append-only stage history: JSON array of
  -- { stage, entered_at, exited_at?, agent, message_id?, cost_usd?, notes? }
  stage_history TEXT,

  -- Cost rollup (sum of all LLM calls in this pipeline run)
  cost_total_usd REAL NOT NULL DEFAULT 0,
  tokens_total INTEGER NOT NULL DEFAULT 0,

  -- Outcome tracking
  outcome TEXT,                    -- 'won' | 'lost' | 'no_response' | 'disqualified'
  outcome_reason TEXT,

  UNIQUE(lead_id, pipeline_type)
);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_lead ON pipeline_runs(lead_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_user ON pipeline_runs(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_status ON pipeline_runs(status, current_stage);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_active ON pipeline_runs(status, last_active_at DESC);
