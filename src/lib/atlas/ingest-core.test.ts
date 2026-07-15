// vitest unit tests for page-scoped ATLAS vector IDs.
// Run with: npx vitest run src/lib/atlas/ingest-core.test.ts
// (No test runner configured in package.json as of 30C — ships for CI setup,
// mirroring chunker.test.ts.)

import { describe, it, expect } from "vitest";
import { vectorId, ingestDocument } from "./ingest-core";
import { chunkDocument } from "./chunker";
import { CORPUS } from "./corpus-seed";

describe("vectorId", () => {
  it("is page-scoped: same doc+chunkIndex on different pages does NOT collide", () => {
    expect(vectorId("d", 1, 0)).toBe("d::p1::0");
    expect(vectorId("d", 2, 0)).toBe("d::p2::0");
    expect(vectorId("d", 1, 0)).not.toBe(vectorId("d", 2, 0));
  });

  it("defaults an omitted page to 0 deterministically", () => {
    expect(vectorId("d", null, 0)).toBe("d::p0::0");
    expect(vectorId("d", undefined, 0)).toBe("d::p0::0");
  });

  it("is idempotent: same doc+page+chunkIndex always yields the same ID", () => {
    expect(vectorId("d", 3, 5)).toBe(vectorId("d", 3, 5));
  });

  // Regression guard against the 30C collision: the two AISC360_structural entries
  // (page 1 and page 2) previously overwrote each other at ::0/::1. Chunk both, map
  // through vectorId, and assert the union of IDs has NO duplicates.
  it("produces NO duplicate IDs across the AISC360_structural pages", () => {
    const entries = CORPUS.filter((e) => e.doc === "AISC360_structural");
    expect(entries.length).toBeGreaterThan(1);

    const ids: string[] = [];
    for (const entry of entries) {
      const chunks = chunkDocument(entry.text, { doc: entry.doc, page: entry.page ?? null });
      for (const c of chunks) ids.push(vectorId(entry.doc, entry.page ?? null, c.chunk_index));
    }

    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // Stronger guard: no duplicate IDs across the ENTIRE corpus.
  it("produces NO duplicate IDs across the whole CORPUS", () => {
    const ids: string[] = [];
    for (const entry of CORPUS) {
      const chunks = chunkDocument(entry.text, { doc: entry.doc, page: entry.page ?? null });
      for (const c of chunks) ids.push(vectorId(entry.doc, entry.page ?? null, c.chunk_index));
    }
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ── page fidelity: the ledger + vector IDs use the CHUNK's page, not the call's ──
// A single ingest call can span multiple pages (a doc with `--- page N ---` markers
// chunked in one call). The vector ID, Vectorize metadata, and BOTH ledger tables
// must all reflect where each chunk's content actually lives.

// Fake CloudflareEnv: a real in-memory rag_documents / rag_chunks store (so DELETE +
// INSERT OR REPLACE semantics are exercised), a Vectorize index that overwrites by
// id, and an embedder returning 1024-dim vectors.
function makeFakeEnv() {
  const ragDocuments = new Map<string, Record<string, unknown>>();
  const ragChunks = new Map<string, Record<string, unknown>>();
  const vectorIndex = new Map<string, unknown>(); // simulates Vectorize (overwrite by id)
  const upserted: Array<{ id: string; metadata: Record<string, unknown> }> = [];

  function exec(sql: string, args: unknown[]) {
    const insDoc = sql.match(/INSERT OR REPLACE INTO rag_documents\s*\(([^)]*)\)/i);
    const insChunk = sql.match(/INSERT OR REPLACE INTO rag_chunks\s*\(([^)]*)\)/i);
    if (insDoc) {
      const cols = insDoc[1].split(",").map((s) => s.trim());
      const row: Record<string, unknown> = {};
      cols.forEach((c, i) => (row[c] = args[i]));
      ragDocuments.set(`${row.tenant_id}|${row.doc}|${row.page}`, row);
    } else if (insChunk) {
      const cols = insChunk[1].split(",").map((s) => s.trim());
      const row: Record<string, unknown> = {};
      cols.forEach((c, i) => (row[c] = args[i]));
      ragChunks.set(`${row.tenant_id}|${row.doc}|${row.page}|${row.chunk_index}`, row);
    } else if (/DELETE FROM rag_chunks/i.test(sql)) {
      const [tenant, doc, ...pages] = args;
      const pageSet = new Set(pages);
      for (const [k, row] of [...ragChunks]) {
        if (row.tenant_id === tenant && row.doc === doc && pageSet.has(row.page)) ragChunks.delete(k);
      }
    }
  }

  const db = {
    prepare(sql: string) {
      return { bind: (...args: unknown[]) => ({ __sql: sql, __args: args, run: async () => (exec(sql, args), { success: true }) }) };
    },
    batch: async (stmts: Array<{ __sql: string; __args: unknown[] }>) => {
      for (const s of stmts) exec(s.__sql, s.__args);
      return stmts.map(() => ({ success: true }));
    },
  };

  const env = {
    AI: { run: async (_m: string, { text }: { text: string[] }) => ({ data: text.map(() => new Array(1024).fill(0)) }) },
    ATLAS_RAG: {
      upsert: async (vs: Array<{ id: string; values: number[]; metadata?: Record<string, unknown> }>) => {
        for (const v of vs) { vectorIndex.set(v.id, v); upserted.push({ id: v.id, metadata: v.metadata ?? {} }); }
        return { count: vs.length };
      },
    },
    DB: db,
  };
  return { env, ragDocuments, ragChunks, vectorIndex, upserted };
}

// Two headings on page 1, one on page 2 -> chunks [p1#0, p1#1, p2#2].
const TWO_PAGE_DOC = `# Section A\nAlpha.\n# Section B\nBravo.\n--- page 2 ---\n# Section C\nCharlie.`;
const ingest = (f: ReturnType<typeof makeFakeEnv>, input: { doc: string; text: string; page?: number | null }) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ingestDocument(f.env as any, input);
const docRows = (f: ReturnType<typeof makeFakeEnv>, doc: string) =>
  [...f.ragDocuments.values()].filter((r) => r.doc === doc);
const chunkRows = (f: ReturnType<typeof makeFakeEnv>, doc: string) =>
  [...f.ragChunks.values()].filter((r) => r.doc === doc);

describe("ingestDocument — page fidelity", () => {
  it("1. SINGLE-CALL MULTI-PAGE: IDs, metadata, ledger all follow the chunk's page", async () => {
    const f = makeFakeEnv();
    const res = await ingest(f, { doc: "API610", text: TWO_PAGE_DOC, page: 1 });

    const ids = f.upserted.map((v) => v.id);
    // IDs reflect the CHUNK's page — some p1, some p2 (NOT all p1 from input.page).
    expect(ids.some((id) => id.startsWith("API610::p1::"))).toBe(true);
    expect(ids.some((id) => id.startsWith("API610::p2::"))).toBe(true);

    // Vectorize metadata.page and the rag_chunks.page row AGREE for every chunk.
    for (const v of f.upserted) {
      const row = chunkRows(f, "API610").find((r) => r.vector_id === v.id);
      expect(row).toBeTruthy();
      expect(row!.page).toBe(v.metadata.page);
    }

    // chunk_index globally monotonic 0..n-1 (NOT reset per page).
    const idx = res.chunks.map((c) => c.chunk_index);
    expect(idx).toEqual(idx.map((_, i) => i));
    expect(res.chunks.map((c) => c.page)).toEqual([1, 1, 2]);

    // TWO rag_documents rows; chunk_counts sum to the total.
    const rows = docRows(f, "API610");
    expect(rows.map((r) => r.page).sort()).toEqual([1, 2]);
    expect(rows.reduce((s, r) => s + Number(r.chunk_count), 0)).toBe(res.chunks.length);
  });

  it("2. RECONCILIATION: SUM(chunk_count) === number of vectors upserted", async () => {
    const f = makeFakeEnv();
    await ingest(f, { doc: "API610", text: TWO_PAGE_DOC, page: 1 });
    const sum = docRows(f, "API610").reduce((s, r) => s + Number(r.chunk_count), 0);
    expect(sum).toBe(f.vectorIndex.size);
  });

  it("3. PER-PAGE INGEST (regression): a later page does NOT delete the earlier one", async () => {
    const f = makeFakeEnv();
    await ingest(f, { doc: "D", text: "# A\nAlpha content here.", page: 1 });
    const page1Count = chunkRows(f, "D").filter((r) => r.page === 1).length;
    expect(page1Count).toBeGreaterThan(0);

    await ingest(f, { doc: "D", text: "# B\nBravo content here.", page: 2 });
    // Page-1 rows survive the second (page-2) call.
    expect(chunkRows(f, "D").filter((r) => r.page === 1).length).toBe(page1Count);
    expect(docRows(f, "D").map((r) => r.page).sort()).toEqual([1, 2]);
    const ids = chunkRows(f, "D").map((r) => r.vector_id as string);
    expect(ids.some((i) => i.startsWith("D::p1::"))).toBe(true);
    expect(ids.some((i) => i.startsWith("D::p2::"))).toBe(true);
  });

  it("4. RE-INGEST IDEMPOTENCE: ingesting the same multi-page doc twice does not double or leave stale rows", async () => {
    const f = makeFakeEnv();
    const r1 = await ingest(f, { doc: "API610", text: TWO_PAGE_DOC, page: 1 });
    const after1 = chunkRows(f, "API610").length;
    expect(after1).toBe(r1.chunks.length);

    const r2 = await ingest(f, { doc: "API610", text: TWO_PAGE_DOC, page: 1 });
    expect(chunkRows(f, "API610").length).toBe(after1); // not doubled
    expect(chunkRows(f, "API610").length).toBe(r2.chunks.length);
    // Reconciliation still holds (Vectorize overwrote by id, D1 delete+reinsert).
    const sum = docRows(f, "API610").reduce((s, r) => s + Number(r.chunk_count), 0);
    expect(sum).toBe(f.vectorIndex.size);
  });

  it("5. NO PAGE AT ALL: omitted page + no markers -> p0 IDs and ledger page 0", async () => {
    const f = makeFakeEnv();
    await ingest(f, { doc: "D", text: "# A\nContent with no page." });
    expect(f.upserted.every((v) => v.id.startsWith("D::p0::"))).toBe(true);
    expect(docRows(f, "D").every((r) => r.page === 0)).toBe(true);
    expect(chunkRows(f, "D").every((r) => r.page === 0)).toBe(true);
  });
});
