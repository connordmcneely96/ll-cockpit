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

// Page-scoped, deterministic vector ID. The `page` component is the CHUNK's page
// (c.page) — where the chunk's content actually lives — NOT the ingest call's page,
// because a single call can span multiple pages (a doc with `--- page N ---`
// markers chunked in one call). `page ?? 0` still holds for callers that supply no
// page at all. Uniqueness is preserved because chunkIndex is monotonic across the
// WHOLE document (never reset per page), so `${doc}::p${page}::${chunkIndex}` stays
// unique even with several pages in one call — re-ingesting overwrites in place.
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
      id: vectorId(input.doc, c.page, c.chunk_index),
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
  // never claims a write that did not land. A single call can span MULTIPLE pages
  // (one doc chunked across `--- page N ---` markers), so the ledger is written
  // per-page: one rag_documents row per distinct page (chunk_count = chunks ON that
  // page), and rag_chunks scoped to exactly the pages this call writes.
  const tenantId = "default";
  // A chunk's ledger page mirrors vectorId's `page ?? 0` — keep them in lockstep.
  const pageOf = (c: Chunk): number => c.page ?? 0;
  const pages = [...new Set(chunks.map(pageOf))];              // distinct pages in this call
  const countByPage = new Map<number, number>();
  for (const c of chunks) countByPage.set(pageOf(c), (countByPage.get(pageOf(c)) ?? 0) + 1);
  const sha256 = await sha256Hex(input.text);                 // identifies the source, same on every page row
  const placeholders = pages.map(() => "?").join(", ");

  const stmts = [
    // One rag_documents row PER DISTINCT PAGE so SUM(chunk_count) reconciles against
    // the upserted vector count.
    ...pages.map((p) =>
      env.DB.prepare(
        `INSERT OR REPLACE INTO rag_documents
           (tenant_id, doc, page, r2_key, sha256, chunk_count, embed_model, dims)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(tenantId, input.doc, p, input.r2_key ?? null, sha256, countByPage.get(p) ?? 0, EMBED_MODEL, EMBED_DIMS)
    ),
    // Clear ONLY the pages this call is about to write — never the whole doc (a
    // caller may still ingest one page at a time, as the live corpus was built).
    env.DB.prepare(
      `DELETE FROM rag_chunks WHERE tenant_id = ? AND doc = ? AND page IN (${placeholders})`
    ).bind(tenantId, input.doc, ...pages),
    // One row per chunk, stamped with the CHUNK's page (not the call's page).
    ...chunks.map((c) =>
      env.DB.prepare(
        `INSERT OR REPLACE INTO rag_chunks
           (tenant_id, doc, page, chunk_index, vector_id, section, char_len, oversized)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        tenantId,
        input.doc,
        pageOf(c),
        c.chunk_index,
        vectorId(input.doc, c.page, c.chunk_index),
        c.section || null,
        c.text.length,
        c.oversized ? 1 : 0
      )
    ),
  ];
  await env.DB.batch(stmts);

  const sections = [...new Set(chunks.map(c => c.section).filter(Boolean))];
  return {
    doc: input.doc,
    chunks_ingested: upsertResult.count ?? chunks.length,
    sections_detected: sections.length,
    oversized_count: chunks.filter(c => c.oversized).length,
    chunks,
  };
}
