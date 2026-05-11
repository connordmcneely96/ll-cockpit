-- COCKPIT D1 SCHEMA · Migration 0004 — Agent Messaging
-- Inter-agent communication routed through NEXUS coordinator
-- Run: wrangler d1 execute ll-cockpit-db --file=migrations/0004_agent_messages.sql --remote
-- All statements use IF NOT EXISTS — safe to run multiple times

-- ── agent_messages: inter-agent communication ────────────────────────────────
-- Design principle: agents NEVER talk to each other directly.
-- All messages route through NEXUS. via_agent is the router (typically 'NEXUS').
CREATE TABLE IF NOT EXISTS agent_messages (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,        -- groups related messages (a "thread")
  from_agent TEXT NOT NULL,              -- sender (e.g. 'SCOUT')
  to_agent TEXT NOT NULL,                -- recipient (e.g. 'INTAKE')
  via_agent TEXT NOT NULL DEFAULT 'NEXUS', -- router/coordinator
  parent_message_id TEXT,                -- threading: reply-to chain
  task_id TEXT,                          -- ties back to agent_tasks.id
  pipeline_id TEXT,                      -- ties back to a Pipeline run (e.g. lead-to-deposit)
  pipeline_stage TEXT,                   -- e.g. 'lead_qualified', 'contract_sent'
  message_type TEXT NOT NULL DEFAULT 'request', -- request | response | broadcast | event | error
  priority INTEGER NOT NULL DEFAULT 5,   -- 1=urgent, 10=lowest
  subject TEXT,                          -- short header (e.g. "Lead qualified: Acme Corp")
  body TEXT NOT NULL,                    -- message content (json or text)
  payload_json TEXT,                     -- structured data (lead info, contract id, etc)
  status TEXT NOT NULL DEFAULT 'queued', -- queued | routing | delivered | processing | done | failed | dropped
  error_log TEXT,                        -- failure details if status='failed'
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,           -- when sent by from_agent
  routed_at INTEGER,                     -- when NEXUS picked it up
  delivered_at INTEGER,                  -- when to_agent received it
  processed_at INTEGER,                  -- when to_agent finished handling it
  ttl_seconds INTEGER                    -- optional expiration; null = no expiry
);

-- Recipient inbox query (most common): "what does INTAKE need to handle?"
CREATE INDEX IF NOT EXISTS idx_messages_inbox
  ON agent_messages(to_agent, status, priority, created_at);

-- Sender outbox query: "what has SCOUT sent recently?"
CREATE INDEX IF NOT EXISTS idx_messages_outbox
  ON agent_messages(from_agent, created_at);

-- Conversation/thread reconstruction
CREATE INDEX IF NOT EXISTS idx_messages_conversation
  ON agent_messages(conversation_id, created_at);

-- Pipeline tracing (e.g. all messages for a specific lead-to-deposit run)
CREATE INDEX IF NOT EXISTS idx_messages_pipeline
  ON agent_messages(pipeline_id, pipeline_stage, created_at);

-- User-scoped audit
CREATE INDEX IF NOT EXISTS idx_messages_user
  ON agent_messages(user_id, created_at);

-- Reply chain traversal
CREATE INDEX IF NOT EXISTS idx_messages_parent
  ON agent_messages(parent_message_id);

-- ── agent_message_subscriptions: which agents listen to what ─────────────────
-- Used by NEXUS to know where to route broadcasts and events.
CREATE TABLE IF NOT EXISTS agent_message_subscriptions (
  id TEXT PRIMARY KEY,
  agent_name TEXT NOT NULL,              -- e.g. 'SENTINEL'
  event_pattern TEXT NOT NULL,           -- e.g. 'pipeline.*.completed' or 'lead.qualified'
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_subs_agent ON agent_message_subscriptions(agent_name, active);
CREATE INDEX IF NOT EXISTS idx_subs_pattern ON agent_message_subscriptions(event_pattern, active);

-- ── agent_message_handlers: registered handlers for routing decisions ────────
-- NEXUS consults this when deciding which agent should handle a message_type.
CREATE TABLE IF NOT EXISTS agent_message_handlers (
  id TEXT PRIMARY KEY,
  agent_name TEXT NOT NULL,
  message_type TEXT NOT NULL,            -- e.g. 'lead.qualify', 'contract.draft'
  handler_priority INTEGER NOT NULL DEFAULT 5, -- if multiple agents handle same type, lowest wins
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  UNIQUE(agent_name, message_type)
);
CREATE INDEX IF NOT EXISTS idx_handlers_type ON agent_message_handlers(message_type, active, handler_priority);
