-- Migration 0010: Design chat for iteration agent (Sprint 16 v0.3.0)
--
-- Enables conversational refinement of a design brief AFTER initial v0.2.x build:
--   "make the hero darker", "add a pricing section", "this CTA needs more contrast",
--   "use the layout from <reference_url>".
--
-- The iteration agent uses programmatic Anthropic tool calling. Each turn may
-- call one or more of ~11 tools: regenerate_section, update_design_tokens,
-- splice_section, assemble_html, apply_token_to_html, add_section, remove_section,
-- apply_preset, analyze_reference_url, save_iteration, critique.
--
-- design_chat_messages
--   One row per turn (user prompt, assistant response, tool_use, tool_result).
--   Modeled after agent_chat_messages but scoped to a design brief and
--   with extra fields for tool_result blocks + iteration provenance.

CREATE TABLE IF NOT EXISTS design_chat_messages (
  id TEXT PRIMARY KEY,
  brief_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,                  -- 'user' | 'assistant' | 'tool_result'
  content TEXT,                        -- text content (NULL for pure tool_use turns)
  tool_calls_json TEXT,                -- assistant turn: JSON array of tool_use blocks
  tool_results_json TEXT,              -- tool_result turn: JSON array of results matched by tool_use_id
  iteration_id TEXT,                   -- FK to design_iterations if turn produced one
  model_id TEXT,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  cost_usd REAL DEFAULT 0.0,
  latency_ms INTEGER,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_design_chat_brief
  ON design_chat_messages(brief_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_design_chat_user
  ON design_chat_messages(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_design_chat_iteration
  ON design_chat_messages(iteration_id)
  WHERE iteration_id IS NOT NULL;
