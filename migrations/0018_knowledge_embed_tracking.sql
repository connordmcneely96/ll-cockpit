-- Migration 0018: Add embed_status and vector_id tracking to knowledge tables
-- NOTE: ALTER TABLE statements were applied directly via MCP on 2026-05-17.
-- Columns embed_status and vector_id already exist on both tables in production.
-- This migration registers that fact and creates the supporting indexes.

-- Indexes are idempotent via IF NOT EXISTS
CREATE INDEX IF NOT EXISTS idx_study_nodes_embed_status ON study_nodes(embed_status);
CREATE INDEX IF NOT EXISTS idx_sprint_items_embed_status ON sprint_items(embed_status);
