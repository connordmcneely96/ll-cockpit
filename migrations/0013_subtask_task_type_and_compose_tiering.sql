-- Migration 0013 — Sprint 18F: model tiering for cost optimization
-- Applied to ll-cockpit-db via Cloudflare MCP, May 14 2026 (out-of-band).
-- This file exists for repo history.
--
-- 1. agent_subtasks.task_type — new column, defaults to 'default'.
--    Lets the orchestrator route different subtasks to different models
--    even when they share an agent_name.
--
-- 2. Two new routing policies for COMPOSER:
--    - compose_simple → Haiku (3.75x cheaper than Sonnet)
--      Used for: footer, contact, FAQ, lists, certifications, simple cards
--    - compose_complex → Sonnet
--      Used for: hero, pricing, features, testimonials, how-it-works
--      (anything requiring creative copy and visual hierarchy)
--
-- Expected savings:
--   Before: 13 sections × $0.05 avg Sonnet = $0.65
--   After:  8 simple × $0.013 (Haiku) + 5 complex × $0.05 (Sonnet) = $0.36
--   ~45% reduction in COMPOSER costs, same DESIGNER and ASSEMBLER costs.

ALTER TABLE agent_subtasks ADD COLUMN task_type TEXT DEFAULT 'default';

INSERT INTO ai_routing_policy
  (id, agent_name, task_type, primary_model_id, fallback_chain_json,
   priority, enabled, notes, created_at, updated_at)
VALUES
  ('compose-simple-haiku', 'composer', 'compose_simple', 'claude-haiku-4-5',
   '["claude-sonnet-4-5"]', 5, 1,
   'Sprint 18F — Haiku for simple sections (footer, contact, FAQ, lists)',
   strftime('%s','now'), strftime('%s','now')),
  ('compose-complex-sonnet', 'composer', 'compose_complex', 'claude-sonnet-4-5',
   '["claude-haiku-4-5"]', 5, 1,
   'Sprint 18F — Sonnet for hero, pricing, features, testimonials',
   strftime('%s','now'), strftime('%s','now'));
