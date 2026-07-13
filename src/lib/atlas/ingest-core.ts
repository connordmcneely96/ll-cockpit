// Shared ingest logic used by both /api/atlas/ingest and /api/atlas/seed-corpus.
// Factored here to prevent logic drift between the two routes.

import { chunkDocument, Chunk } from "./chunker";

export type AiRunner = { run: (model: string, opts: { text: string[] }) => Promise<{ data: number[][] }> };
export type VecIndex = {
  upsert: (v: { id: string; values: number[]; metadata?: Record<string, unknown> }[]) => Promise<{ count?: number }>;
};

export interface IngestEnv {
  AI: AiRunner;
  ATLAS_RAG: VecIndex;
  // D1Database is a global type (see permission-gate.ts) — do NOT import it.
  DB: D1Database;
}

export interface IngestInput {
  doc: string;
  text: string;
  page?: number | null;
  // Pass-through for the ledger only; does not affect chunking.
  r2_key?: string | null;
}

export interface IngestResult {
  doc: string;
  chunks_ingested: number;
  sections_detected: number;
  oversized_count: number;
  chunks: Chunk[];
}

const EMBED_MODEL = "@cf/baai/bge-large-en-v1.5";
const EMBED_DIMS = 1024;
const BATCH_SIZE = 50;

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Page-scoped, deterministic vector ID. The prior scheme `${doc}::${chunkIndex}`
// collided across pages of the same doc (chunk_index restarts at 0 per call), so a
// later page silently overwrote an earlier one in Vectorize. `page ?? 0` keeps a
// stable ID for /ingest callers that omit page; re-ingesting the same doc+page
// overwrites in place (idempotent) — never a random or time-based component.
export function vectorId(doc: string, page: number | null | undefined, chunkIndex: number): string {
  return `${doc}::p${page ?? 0}::${chunkIndex}`;
}

export async function ingestDocument(env: IngestEnv, input: IngestInput): Promise<IngestResult> {
  const chunks = chunkDocument(input.text, { doc: input.doc, page: input.page ?? null });
  if (chunks.length === 0) return { doc: input.doc, chunks_ingested: 0, sections_detected: 0, oversized_count: 0, chunks: [] };

  // Embed in batches
  const allVectors: number[][] = [];
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE).map(c => c.text);
    const embedResp = await env.AI.run(EMBED_MODEL, { text: batch });
    if (i === 0 && embedResp.data[0]?.length !== 1024) {
      throw new Error(`unexpected_dim: got ${embedResp.data[0]?.length}, expected 1024`);
    }
    allVectors.push(...embedResp.data);
  }

  // Upsert with structured metadata
  const upsertResult = await env.ATLAS_RAG.upsert(
    chunks.map((c, i) => ({
      id: vectorId(input.doc, input.page, c.chunk_index),
      values: allVectors[i],
      metadata: {
        doc: c.doc,
        section: c.section,
        page: c.page,
        chunk_index: c.chunk_index,
        text: c.text,
        ...(c.oversized ? { oversized: true } : {}),
      },
    }))
  );

  // Ledger (SSOT) — written ONLY after the Vectorize upsert succeeds, so the ledger
  // never claims a write that did not land. One rag_documents row per ingest call;
  // rag_chunks is cleared for THIS doc+page only, then re-inserted.
  const tenantId = "default";
  const ledgerPage = input.page ?? 0;
  const sha256 = await sha256Hex(input.text);
  await env.DB.batch([
    env.DB.prepare(
      `INSERT OR REPLACE INTO rag_documents
         (tenant_id, doc, page, r2_key, sha256, chunk_count, embed_model, dims)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(tenantId, input.doc, ledgerPage, input.r2_key ?? null, sha256, chunks.length, EMBED_MODEL, EMBED_DIMS),
    env.DB.prepare(
      `DELETE FROM rag_chunks WHERE tenant_id = ? AND doc = ? AND page = ?`
    ).bind(tenantId, input.doc, ledgerPage),
    ...chunks.map((c) =>
      env.DB.prepare(
        `INSERT OR REPLACE INTO rag_chunks
           (tenant_id, doc, page, chunk_index, vector_id, section, char_len, oversized)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        tenantId,
        input.doc,
        ledgerPage,
        c.chunk_index,
        vectorId(input.doc, input.page, c.chunk_index),
        c.section || null,
        c.text.length,
        c.oversized ? 1 : 0
      )
    ),
  ]);

  const sections = [...new Set(chunks.map(c => c.section).filter(Boolean))];
  return {
    doc: input.doc,
    chunks_ingested: upsertResult.count ?? chunks.length,
    sections_detected: sections.length,
    oversized_count: chunks.filter(c => c.oversized).length,
    chunks,
  };
}
