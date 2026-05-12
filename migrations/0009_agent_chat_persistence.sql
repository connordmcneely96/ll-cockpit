-- Migration 0009: Agent chat persistence (Sprint 17 v0.3.0)
--
-- Fixes critical memory gap: chats with agents were stateless (each user message
-- created a new agent_tasks row with NO conversation context loaded for the LLM).
--
-- agent_chats           = conversation thread metadata
-- agent_chat_messages   = individual messages (role/content/tool_calls/tokens)
--
-- The stream route loads all prior messages for a chat_id and sends them to
-- Anthropic in the messages array, then persists both user + assistant turns.

CREATE TABLE IF NOT EXISTS agent_chats (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  title TEXT,
  message_count INTEGER DEFAULT 0,
  total_input_tokens INTEGER DEFAULT 0,
  total_output_tokens INTEGER DEFAULT 0,
  total_cost_usd REAL DEFAULT 0.0,
  last_message_preview TEXT,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_agent_chats_user_updated
  ON agent_chats(user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_chats_user_agent
  ON agent_chats(user_id, agent_name, updated_at DESC);

CREATE TABLE IF NOT EXISTS agent_chat_messages (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,            -- 'user' | 'assistant'
  content TEXT NOT NULL,
  tool_calls_json TEXT,          -- JSON array of tool_use blocks if assistant called tools
  task_id TEXT,                  -- FK to agent_tasks for provenance + cost trace
  model_id TEXT,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  cost_usd REAL DEFAULT 0.0,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_chat
  ON agent_chat_messages(chat_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_chat_messages_user
  ON agent_chat_messages(user_id, created_at DESC);
