-- 0062_rag_ledger.sql
-- ATLAS RAG corpus ledger (SSOT). One ingest call = one rag_documents row; the
-- (tenant_id, doc, page) PK mirrors the ingest granularity exactly, so
-- SUM(chunk_count) across rag_documents is the EXPECTED Vectorize vectorCount —
-- the reconciliation the ledger exists to provide. Written only AFTER a successful
-- Vectorize upsert.

CREATE TABLE IF NOT EXISTS rag_documents (
  tenant_id   TEXT NOT NULL DEFAULT 'default',
  doc         TEXT NOT NULL,
  page        INTEGER NOT NULL DEFAULT 0,
  r2_key      TEXT,
  sha256      TEXT NOT NULL,
  chunk_count INTEGER NOT NULL,
  embed_model TEXT NOT NULL,
  dims        INTEGER NOT NULL,
  ingested_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (tenant_id, doc, page)
);

CREATE TABLE IF NOT EXISTS rag_chunks (
  tenant_id   TEXT NOT NULL DEFAULT 'default',
  doc         TEXT NOT NULL,
  page        INTEGER NOT NULL DEFAULT 0,
  chunk_index INTEGER NOT NULL,
  vector_id   TEXT NOT NULL,
  section     TEXT,
  char_len    INTEGER NOT NULL,
  oversized   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, doc, page, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_rag_chunks_doc ON rag_chunks (tenant_id, doc);
