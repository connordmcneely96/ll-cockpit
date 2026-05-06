-- Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- Mirror of Cloudflare D1 study_nodes
CREATE TABLE IF NOT EXISTS study_nodes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  content TEXT NOT NULL,
  tags TEXT,
  source TEXT,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  embedding vector(768),
  created_at BIGINT NOT NULL DEFAULT extract(epoch FROM now())::bigint,
  updated_at BIGINT NOT NULL DEFAULT extract(epoch FROM now())::bigint
);

CREATE INDEX IF NOT EXISTS idx_study_nodes_category
  ON study_nodes(category);
CREATE INDEX IF NOT EXISTS idx_study_nodes_tenant
  ON study_nodes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_study_nodes_embedding
  ON study_nodes USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Mirror of Cloudflare D1 sprint_items
CREATE TABLE IF NOT EXISTS sprint_items (
  id TEXT PRIMARY KEY,
  sprint_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'todo',
  priority INTEGER NOT NULL DEFAULT 2,
  agent TEXT,
  category TEXT,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  embedding vector(768),
  completed_at BIGINT,
  created_at BIGINT NOT NULL DEFAULT extract(epoch FROM now())::bigint,
  updated_at BIGINT NOT NULL DEFAULT extract(epoch FROM now())::bigint
);

CREATE INDEX IF NOT EXISTS idx_sprint_items_sprint
  ON sprint_items(sprint_number);
CREATE INDEX IF NOT EXISTS idx_sprint_items_status
  ON sprint_items(status);
CREATE INDEX IF NOT EXISTS idx_sprint_items_tenant
  ON sprint_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sprint_items_embedding
  ON sprint_items USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- RPC function for semantic search (required — PostgREST does not support vector operators)
-- Called by knowledge-search Edge Function and ChatGPT Custom GPT Action
CREATE OR REPLACE FUNCTION search_knowledge(
  query_embedding vector(768),
  match_count INT DEFAULT 5,
  filter_tenant_id TEXT DEFAULT 'default',
  filter_category TEXT DEFAULT NULL
)
RETURNS TABLE (
  id TEXT,
  title TEXT,
  category TEXT,
  content TEXT,
  tags TEXT,
  source TEXT,
  tenant_id TEXT,
  table_name TEXT,
  score FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    s.title,
    s.category,
    s.content,
    s.tags,
    s.source,
    s.tenant_id,
    'study_nodes'::TEXT AS table_name,
    1 - (s.embedding <=> query_embedding) AS score
  FROM study_nodes s
  WHERE s.tenant_id = filter_tenant_id
    AND s.embedding IS NOT NULL
    AND (filter_category IS NULL OR s.category = filter_category)
  UNION ALL
  SELECT
    i.id,
    i.title,
    i.category,
    i.description AS content,
    i.agent AS tags,
    i.status AS source,
    i.tenant_id,
    'sprint_items'::TEXT AS table_name,
    1 - (i.embedding <=> query_embedding) AS score
  FROM sprint_items i
  WHERE i.tenant_id = filter_tenant_id
    AND i.embedding IS NOT NULL
  ORDER BY score DESC
  LIMIT match_count;
END;
$$;
