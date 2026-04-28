-- COCKPIT D1 SCHEMA · Migration 0001
-- Run: wrangler d1 execute ll-cockpit-db --file=migrations/0001_cockpit_schema.sql --remote
-- All statements use IF NOT EXISTS — safe to run multiple times

CREATE TABLE IF NOT EXISTS cockpit_projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  description TEXT,
  created_at INTEGER NOT NULL,
  last_opened INTEGER
);

CREATE TABLE IF NOT EXISTS cockpit_files (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  path TEXT NOT NULL,
  content TEXT,
  size INTEGER,
  language TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(project_id, path)
);
CREATE INDEX IF NOT EXISTS idx_files_project ON cockpit_files(project_id);

CREATE TABLE IF NOT EXISTS cockpit_chats (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  title TEXT,
  agent TEXT DEFAULT 'NEXUS',
  created_at INTEGER NOT NULL,
  last_active INTEGER
);
CREATE INDEX IF NOT EXISTS idx_chats_project ON cockpit_chats(project_id);

CREATE TABLE IF NOT EXISTS cockpit_messages (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  agent TEXT,
  model_used TEXT,
  cost_usd REAL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_chat ON cockpit_messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON cockpit_messages(created_at);

CREATE TABLE IF NOT EXISTS cockpit_research (
  id TEXT PRIMARY KEY,
  source_id TEXT,
  title TEXT,
  url TEXT,
  source_type TEXT,
  summary_json TEXT,
  raw_r2_key TEXT,
  vector_id TEXT,
  collected_at INTEGER NOT NULL,
  processed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_research_collected ON cockpit_research(collected_at);
CREATE INDEX IF NOT EXISTS idx_research_source ON cockpit_research(source_id);

CREATE TABLE IF NOT EXISTS cockpit_research_sources (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_name TEXT,
  active INTEGER DEFAULT 1,
  last_checked INTEGER,
  added_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS cockpit_research_digests (
  id TEXT PRIMARY KEY,
  digest_date TEXT,
  item_ids TEXT,
  digest_html TEXT,
  delivered_at INTEGER
);

CREATE TABLE IF NOT EXISTS cockpit_research_project_links (
  research_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  relevance_score REAL,
  PRIMARY KEY (research_id, project_id)
);

CREATE TABLE IF NOT EXISTS cockpit_terminal_sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  vps_session_id TEXT,
  cwd TEXT,
  created_at INTEGER NOT NULL,
  last_active INTEGER
);

-- ── Agent runtime tables ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS agent_tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  task_type TEXT NOT NULL DEFAULT 'chat',
  input TEXT,
  output TEXT,
  status TEXT NOT NULL DEFAULT 'running',
  error_log TEXT,
  tokens_used INTEGER,
  cost_usd REAL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_user ON agent_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_agent ON agent_tasks(agent_name);
CREATE INDEX IF NOT EXISTS idx_tasks_created ON agent_tasks(created_at);

CREATE TABLE IF NOT EXISTS agent_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  title TEXT,
  last_active INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON agent_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_agent ON agent_sessions(user_id, agent_name);

CREATE TABLE IF NOT EXISTS tool_calls (
  id TEXT PRIMARY KEY,
  task_id TEXT,
  user_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  tool_input TEXT,
  user_approved INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tool_calls_task ON tool_calls(task_id);
CREATE INDEX IF NOT EXISTS idx_tool_calls_user ON tool_calls(user_id);

CREATE TABLE IF NOT EXISTS training_data (
  id TEXT PRIMARY KEY,
  agent_name TEXT NOT NULL,
  instruction TEXT NOT NULL,
  response TEXT NOT NULL,
  quality_score REAL NOT NULL DEFAULT 0.5,
  collected_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_training_agent ON training_data(agent_name);
CREATE INDEX IF NOT EXISTS idx_training_score ON training_data(quality_score);

CREATE TABLE IF NOT EXISTS agent_perf (
  id TEXT PRIMARY KEY,
  agent TEXT NOT NULL,
  task_id TEXT,
  quality_score REAL,
  model_used TEXT,
  tokens_in INTEGER,
  tokens_out INTEGER,
  cost_usd REAL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_perf_agent ON agent_perf(agent);
CREATE INDEX IF NOT EXISTS idx_perf_created ON agent_perf(created_at);
