// Shared ingest logic used by both /api/atlas/ingest and /api/atlas/seed-corpus.
// Factored here to prevent logic drift between the two routes.

import { chunkDocument, Chunk } from "./chunker";

export type AiRunner = { run: (model: string, opts: { text: string[] }) => Promise<{ data: number[][] }> };
export type VecIndex = {
  upsert: (v: { id: string; values: number[]; metadata?: Record<string, unknown> }[]) => Promise<{ count?: number }>;
  // Present on the live VectorizeIndex binding (workers-types). Optional here so the
  // routes' narrowed { upsert } cast still satisfies IngestEnv without edits;
  // ingestDocument guards and THROWS if a re-ingest needs it and it is absent — it
  // never silently skips stale-vector pruning.
  deleteByIds?: (ids: string[]) => Promise<unknown>;
};

export interface IngestEnv {
  AI: AiRunner;
  ATLAS_RAG: VecIndex;
  // D1Database is a global type (see permission-gate.ts) — do NOT import it.
  DB: D1Database;
}

export interface IngestInput {
  // REQUIRED: the tenant this document belongs to. No default — a caller MUST
  // resolve it from the authenticated identity (src/lib/tenant.ts). Omitting it is
  // a compile error, by design: the old hardcoded 'default' wrote every tenant's
  // documents into one shared partition.
  tenantId: string;
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

/**
 * Ingest a document into ATLAS RAG (Vectorize) + the D1 ledger.
 *
 * WHOLE-DOCUMENT CONTRACT: one call carries the ENTIRE document — all of its pages.
 * A re-ingest REPLACES the doc's state wholesale — Vectorize AND both ledger tables
 * are made EXACTLY the new chunk set, so nothing survives from a prior ingest on
 * pages or chunks that vanished (a removed `--- page N ---` marker, a shorter page).
 * Do NOT ingest one page of a doc per call: the ledger delete is whole-doc, so a
 * page-at-a-time call would wipe the doc's other pages. (The live corpus's per-page
 * rows are a historical seeding artifact, not a supported mode.)
 */
export async function ingestDocument(env: IngestEnv, input: IngestInput): Promise<IngestResult> {
  const chunks = chunkDocument(input.text, { doc: input.doc, page: input.page ?? null });
  if (chunks.length === 0) return { doc: input.doc, chunks_ingested: 0, sections_detected: 0, oversized_count: 0, chunks: [] };

  const tenantId = input.tenantId;
  // A chunk's ledger page mirrors vectorId's `page ?? 0` — keep them in lockstep.
  const pageOf = (c: Chunk): number => c.page ?? 0;
  // Deterministic vector IDs, chunk-page scoped. chunkIndex is monotonic across the
  // whole doc, so these are unique even with several pages in one call.
  const ids = chunks.map((c) => vectorId(input.doc, c.page, c.chunk_index));

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

  // Read this doc's PRIOR vector IDs from the ledger BEFORE writing anything — the
  // ledger is the record of what Vectorize holds, so it is how we find vectors that
  // this re-ingest drops (vanished page or chunk). Order matters: read -> upsert ->
  // delete stale -> write ledger, so a vector is never deleted before its replacement
  // lands and the ledger never claims a write that did not happen.
  const priorRows = await env.DB
    .prepare(`SELECT vector_id FROM rag_chunks WHERE tenant_id = ? AND doc = ?`)
    .bind(tenantId, input.doc)
    .all<{ vector_id: string }>();
  const oldIds = (priorRows.results ?? []).map((r) => r.vector_id);

  // Upsert the new vectors FIRST.
  const upsertResult = await env.ATLAS_RAG.upsert(
    chunks.map((c, i) => ({
      id: ids[i],
      values: allVectors[i],
      metadata: {
        // THE isolation point: a filtered query (filter: { tenant_id }) can only
        // exclude another tenant's vectors if the tenant travels in the metadata.
        tenant_id: tenantId,
        doc: c.doc,
        section: c.section,
        page: c.page,
        chunk_index: c.chunk_index,
        text: c.text,
        ...(c.oversized ? { oversized: true } : {}),
      },
    }))
  );

  // Prune vectors present before but absent now, so a re-chunk leaves no orphans in
  // Vectorize. Never silently skip: if the binding cannot delete, STOP loudly.
  const newIdSet = new Set(ids);
  const staleIds = oldIds.filter((id) => !newIdSet.has(id));
  if (staleIds.length > 0) {
    if (typeof env.ATLAS_RAG.deleteByIds !== "function") {
      throw new Error("ATLAS_RAG.deleteByIds is unavailable — refusing to leave orphaned vectors from a re-ingest");
    }
    await env.ATLAS_RAG.deleteByIds(staleIds);
  }

  // Ledger (SSOT), WHOLE-DOC replace: delete ALL of the doc's rows in both tables,
  // then write the new set. The doc's ledger state becomes EXACTLY the new chunk set
  // — no survivors on pages or chunk indices that vanished. One rag_documents row per
  // distinct page (chunk_count = chunks ON that page) so SUM(chunk_count) reconciles
  // against the vector count. Written ONLY after the upsert succeeds.
  const pages = [...new Set(chunks.map(pageOf))];
  const countByPage = new Map<number, number>();
  for (const c of chunks) countByPage.set(pageOf(c), (countByPage.get(pageOf(c)) ?? 0) + 1);
  const sha256 = await sha256Hex(input.text);                 // identifies the source, same on every page row

  await env.DB.batch([
    env.DB.prepare(`DELETE FROM rag_documents WHERE tenant_id = ? AND doc = ?`).bind(tenantId, input.doc),
    ...pages.map((p) =>
      env.DB.prepare(
        `INSERT OR REPLACE INTO rag_documents
           (tenant_id, doc, page, r2_key, sha256, chunk_count, embed_model, dims)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(tenantId, input.doc, p, input.r2_key ?? null, sha256, countByPage.get(p) ?? 0, EMBED_MODEL, EMBED_DIMS)
    ),
    env.DB.prepare(`DELETE FROM rag_chunks WHERE tenant_id = ? AND doc = ?`).bind(tenantId, input.doc),
    ...chunks.map((c, i) =>
      env.DB.prepare(
        `INSERT OR REPLACE INTO rag_chunks
           (tenant_id, doc, page, chunk_index, vector_id, section, char_len, oversized)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        tenantId,
        input.doc,
        pageOf(c),
        c.chunk_index,
        ids[i],
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
