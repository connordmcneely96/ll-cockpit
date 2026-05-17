-- Migration 0018: Add embed_status and vector_id tracking to knowledge tables
-- Allows backfill to be idempotent (skip already-vectorized records)
-- and provides visibility into which records are in Vectorize.

ALTER TABLE study_nodes ADD COLUMN embed_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE study_nodes ADD COLUMN vector_id TEXT;

ALTER TABLE sprint_items ADD COLUMN embed_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE sprint_items ADD COLUMN vector_id TEXT;

-- Mark all existing records as pending so the next reindex picks them up
UPDATE study_nodes SET embed_status = 'pending' WHERE embed_status = 'pending';
UPDATE sprint_items SET embed_status = 'pending' WHERE embed_status = 'pending';

-- Index for fast lookup of un-vectorized records
CREATE INDEX IF NOT EXISTS idx_study_nodes_embed_status ON study_nodes(embed_status);
CREATE INDEX IF NOT EXISTS idx_sprint_items_embed_status ON sprint_items(embed_status);
