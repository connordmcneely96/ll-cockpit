-- ============================================================
-- SUPABASE SEMANTIC SEARCH LAYER
-- Sprint 124 | APPLIED 2026-05-23 to project lewmvmyettxryetzrxmv
-- Strategy: D1 = relational truth | Supabase = semantic search index
-- Embeddings: 1024-dim via CF Workers AI bge-large-en-v1.5
-- Cost: $0.204 per M input tokens (NOT free — Workers AI paid tier)
-- Indexes: HNSW (works on empty tables; better than IVFFlat for startup)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- ─────────────────────────────────────────────────────────────
-- TABLE 1: semantic_task_index
-- Mirrors task_executions (D1) with embeddings on task_input+output
-- Use: "find similar past executions to this prompt"
--      "what tasks has FORGE done that looked like this?"
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS semantic_task_index (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  d1_execution_id TEXT NOT NULL UNIQUE,
  agent           TEXT NOT NULL,
  task_type       TEXT NOT NULL,
  model_used      TEXT NOT NULL,
  quality_score   REAL,
  sentinel_pass   BOOLEAN,
  cost_usd        REAL,
  latency_ms      INTEGER,
  content_snippet TEXT NOT NULL,
  embedding       vector(1024) NOT NULL,
  project_id      TEXT,
  artifact_type   TEXT,
  tags            TEXT[] DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS semantic_task_embedding_idx ON semantic_task_index USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS semantic_task_agent_idx     ON semantic_task_index(agent);
CREATE INDEX IF NOT EXISTS semantic_task_type_idx      ON semantic_task_index(task_type);
CREATE INDEX IF NOT EXISTS semantic_task_quality_idx   ON semantic_task_index(quality_score);
CREATE INDEX IF NOT EXISTS semantic_task_created_idx   ON semantic_task_index(created_at DESC);

ALTER TABLE semantic_task_index ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_write" ON semantic_task_index FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "authed_read"   ON semantic_task_index FOR SELECT USING (auth.role() IN ('service_role', 'authenticated'));

-- ─────────────────────────────────────────────────────────────
-- TABLE 2: agent_knowledge_base
-- RAG knowledge for agents: past decisions, domain facts, playbooks
-- Use: ATLAS -> engineering calcs, SCOUT -> outreach playbooks,
--      META-COGNITION -> past prompt rewrites
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_knowledge_base (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent         TEXT NOT NULL,
  source        TEXT NOT NULL,
  source_ref_id TEXT,
  title         TEXT,
  content       TEXT NOT NULL,
  embedding     vector(1024) NOT NULL,
  quality_score REAL,
  domain_tags   TEXT[] DEFAULT '{}',
  task_type     TEXT,
  is_playbook   BOOLEAN DEFAULT FALSE,
  use_count     INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS akb_embedding_idx ON agent_knowledge_base USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS akb_agent_idx     ON agent_knowledge_base(agent);
CREATE INDEX IF NOT EXISTS akb_source_idx    ON agent_knowledge_base(source);
CREATE INDEX IF NOT EXISTS akb_playbook_idx  ON agent_knowledge_base(is_playbook);
CREATE INDEX IF NOT EXISTS akb_tags_idx      ON agent_knowledge_base USING GIN(domain_tags);

ALTER TABLE agent_knowledge_base ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_write" ON agent_knowledge_base FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "authed_read"   ON agent_knowledge_base FOR SELECT USING (auth.role() IN ('service_role', 'authenticated'));

-- ─────────────────────────────────────────────────────────────
-- TABLE 3: bandit_context_vectors
-- Semantic index over routing decisions + context
-- Use: "when the task looked like this, which model historically won?"
--      Feeds META-COGNITION prompt rewrites
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bandit_context_vectors (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  d1_routing_id     TEXT NOT NULL UNIQUE,
  task_type         TEXT NOT NULL,
  chosen_model      TEXT NOT NULL,
  chosen_reason     TEXT,
  quality_score     REAL,
  bandit_reward     REAL,
  context_snippet   TEXT NOT NULL,
  embedding         vector(1024) NOT NULL,
  alpha_at_decision REAL,
  beta_at_decision  REAL,
  decided_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bcv_embedding_idx ON bandit_context_vectors USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS bcv_task_type_idx ON bandit_context_vectors(task_type);
CREATE INDEX IF NOT EXISTS bcv_model_idx     ON bandit_context_vectors(chosen_model);
CREATE INDEX IF NOT EXISTS bcv_reward_idx    ON bandit_context_vectors(bandit_reward);

ALTER TABLE bandit_context_vectors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_write" ON bandit_context_vectors FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "authed_read"   ON bandit_context_vectors FOR SELECT USING (auth.role() IN ('service_role', 'authenticated'));

-- ─────────────────────────────────────────────────────────────
-- HELPER FUNCTIONS
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION search_similar_tasks(
  query_embedding  vector(1024),
  filter_agent     TEXT DEFAULT NULL,
  filter_task_type TEXT DEFAULT NULL,
  min_quality      REAL DEFAULT 0.0,
  result_limit     INTEGER DEFAULT 10
)
RETURNS TABLE (
  d1_execution_id TEXT,
  agent           TEXT,
  task_type       TEXT,
  model_used      TEXT,
  quality_score   REAL,
  content_snippet TEXT,
  similarity      REAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT s.d1_execution_id, s.agent, s.task_type, s.model_used, s.quality_score,
         s.content_snippet, 1 - (s.embedding <=> query_embedding) AS similarity
  FROM semantic_task_index s
  WHERE (filter_agent IS NULL OR s.agent = filter_agent)
    AND (filter_task_type IS NULL OR s.task_type = filter_task_type)
    AND (s.quality_score IS NULL OR s.quality_score >= min_quality)
  ORDER BY s.embedding <=> query_embedding
  LIMIT result_limit;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION retrieve_agent_knowledge(
  query_embedding vector(1024),
  target_agent    TEXT,
  domain_filter   TEXT DEFAULT NULL,
  result_limit    INTEGER DEFAULT 5
)
RETURNS TABLE (
  id            UUID,
  title         TEXT,
  content       TEXT,
  source        TEXT,
  quality_score REAL,
  is_playbook   BOOLEAN,
  similarity    REAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT k.id, k.title, k.content, k.source, k.quality_score, k.is_playbook,
         1 - (k.embedding <=> query_embedding) AS similarity
  FROM agent_knowledge_base k
  WHERE k.agent = target_agent
    AND (domain_filter IS NULL OR domain_filter = ANY(k.domain_tags))
  ORDER BY k.embedding <=> query_embedding
  LIMIT result_limit;
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────────────────────
-- VIEW: routing intelligence — ANCHOR reads for Cockpit dashboard
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW model_routing_intelligence AS
SELECT
  task_type,
  chosen_model,
  COUNT(*)                                                    AS total_routes,
  AVG(quality_score) FILTER (WHERE quality_score IS NOT NULL) AS avg_quality,
  AVG(bandit_reward) FILTER (WHERE bandit_reward IS NOT NULL) AS win_rate,
  COUNT(*) FILTER (WHERE bandit_reward = 1.0)                 AS wins,
  COUNT(*) FILTER (WHERE bandit_reward = 0.0)                 AS losses,
  MAX(decided_at)                                             AS last_routed
FROM bandit_context_vectors
GROUP BY task_type, chosen_model
ORDER BY task_type, win_rate DESC NULLS LAST;
