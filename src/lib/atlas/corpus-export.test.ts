// vitest tests for corpus consolidation: CORPUS -> R2 grouping and R2 -> seed.

import { describe, it, expect } from "vitest";
import {
  groupCorpusByDoc,
  exportDocsToR2,
  seedDocsFromR2,
  sortCorpusKeys,
  docNameFromKey,
} from "./corpus-export";
import { chunkDocument } from "./chunker";
import { CORPUS } from "./corpus-seed";
import { ingestDocument } from "./ingest-core";

describe("groupCorpusByDoc", () => {
  it("1. GROUPING: a 2-page doc -> ONE markdown with the page marker, in page order", () => {
    const grouped = groupCorpusByDoc([
      { doc: "solo", text: "Just one page." },
      { doc: "multi", page: 2, text: "SECOND page body." }, // deliberately out of order
      { doc: "multi", page: 1, text: "FIRST page body." },
    ]);

    const multi = grouped.find((g) => g.doc === "multi")!;
    // FIRST ... --- page 2 --- ... SECOND  (page order, marker between)
    expect(multi.markdown.indexOf("FIRST")).toBeLessThan(multi.markdown.indexOf("--- page 2 ---"));
    expect(multi.markdown.indexOf("--- page 2 ---")).toBeLessThan(multi.markdown.indexOf("SECOND"));
    expect(multi.markdown).not.toContain("--- page 1 ---"); // first page has NO leading marker

    // Single-entry doc is verbatim, no marker.
    const solo = grouped.find((g) => g.doc === "solo")!;
    expect(solo.markdown).toBe("Just one page.");
    expect(solo.markdown).not.toContain("--- page");
  });

  it("2. ROUND-TRIP: the emitted marker is one chunker.ts parses; pages 1 and 2 land correctly", () => {
    const grouped = groupCorpusByDoc([
      { doc: "d", page: 1, text: "# One\nPage one body." },
      { doc: "d", page: 2, text: "# Two\nPage two body." },
    ]);
    const md = grouped[0].markdown;
    expect(md).toContain("--- page 2 ---");

    const chunks = chunkDocument(md, { doc: "d", page: 1 });
    const pages = chunks.map((c) => c.page);
    expect(pages).toContain(1);
    expect(pages).toContain(2);
    // page-2 content lands on page 2 — proves the marker is a real chunk/page boundary.
    expect(chunks.find((c) => c.page === 2)?.text).toContain("Page two body");
    expect(chunks.find((c) => c.page === 1)?.text).toContain("Page one body");
  });

  it("groups the real CORPUS (16 entries) into 11 docs; the 5 multi-page docs carry a marker", () => {
    const grouped = groupCorpusByDoc(CORPUS);
    expect(grouped.length).toBe(11);
    const multi = ["AGMA2001_gears", "AISC360_structural", "B31.3_piping", "NEMA_MG1_motors", "pump_rotordynamics"];
    for (const d of multi) {
      expect(grouped.find((g) => g.doc === d)!.markdown).toContain("--- page 2 ---");
    }
    // the 6 single-page docs carry no marker
    const single = grouped.filter((g) => !multi.includes(g.doc));
    expect(single.length).toBe(6);
    for (const g of single) expect(g.markdown).not.toContain("--- page");
  });
});

describe("exportDocsToR2", () => {
  it("3. SKIP: does not overwrite an R2 key that already exists", async () => {
    const puts: { key: string; val: string }[] = [];
    const existing = new Set(["atlas-corpus/exists.md"]);
    const r2 = {
      head: async (k: string) => (existing.has(k) ? { key: k } : null),
      put: async (k: string, v: string) => { puts.push({ key: k, val: v }); },
    };
    const res = await exportDocsToR2(
      [{ doc: "exists", markdown: "OLD content stays" }, { doc: "fresh", markdown: "new content" }],
      r2,
    );
    expect(res.skipped).toEqual(["exists"]);
    expect(res.written).toEqual(["fresh"]);
    // The existing key was NEVER put; only the fresh one.
    expect(puts.map((p) => p.key)).toEqual(["atlas-corpus/fresh.md"]);
  });
});

describe("seedDocsFromR2", () => {
  it("4. one ingest call per doc (whole-document contract guard), in key order", async () => {
    const r2 = { get: async (k: string) => ({ text: async () => `body of ${k}` }) };
    const keys = ["atlas-corpus/a.md", "atlas-corpus/b.md", "atlas-corpus/c.md"];
    const seenDocs: string[] = [];
    let calls = 0;
    const res = await seedDocsFromR2(keys, r2, async (doc) => { calls++; seenDocs.push(doc); return 5; });

    expect(calls).toBe(3); // exactly one ingest per doc — never once per page
    expect(seenDocs).toEqual(["a", "b", "c"]);
    expect(res.every((r) => r.chunks === 5)).toBe(true);
  });

  it("reports a missing R2 object without a fatal error", async () => {
    const r2 = { get: async () => null };
    const res = await seedDocsFromR2(["atlas-corpus/gone.md"], r2, async () => 9);
    expect(res).toEqual([{ doc: "gone", chunks: 0, missing: true }]);
  });
});

describe("sortCorpusKeys / docNameFromKey", () => {
  it("5. DETERMINISTIC: same keys yield the same order regardless of input order; .md only", () => {
    const keys = ["atlas-corpus/z.md", "atlas-corpus/a.md", "atlas-corpus/m.md", "atlas-corpus/notmd.txt"];
    const s1 = sortCorpusKeys(keys);
    const s2 = sortCorpusKeys([...keys].reverse());
    expect(s1).toEqual(s2);
    expect(s1).toEqual(["atlas-corpus/a.md", "atlas-corpus/m.md", "atlas-corpus/z.md"]);
  });

  it("docNameFromKey strips the prefix and .md suffix", () => {
    expect(docNameFromKey("atlas-corpus/B31.3_piping.md")).toBe("B31.3_piping");
    expect(docNameFromKey("atlas-corpus/pump_rotordynamics.md")).toBe("pump_rotordynamics");
  });
});

// ── seed page attribution: page: 1 (starting page), not null ────────────────────
// Mirrors the seed-corpus route: seedDocsFromR2 -> ingestDocument(..., page: 1). A
// minimal fake env captures the upserted vector IDs and the rag_documents rows so we
// can assert first-page content lands on page 1 (::p1::), never page 0 (::p0::).
function makeSeedEnv() {
  const upserted: { id: string; metadata: Record<string, unknown> }[] = [];
  const ragDocuments: Record<string, unknown>[] = [];
  const ragChunks: Record<string, unknown>[] = [];
  function exec(sql: string, args: unknown[]) {
    const insDoc = sql.match(/INSERT OR REPLACE INTO rag_documents\s*\(([^)]*)\)/i);
    const insChunk = sql.match(/INSERT OR REPLACE INTO rag_chunks\s*\(([^)]*)\)/i);
    if (insDoc) {
      const cols = insDoc[1].split(",").map((s) => s.trim());
      const row: Record<string, unknown> = {};
      cols.forEach((c, i) => (row[c] = args[i]));
      ragDocuments.push(row);
    } else if (insChunk) {
      const cols = insChunk[1].split(",").map((s) => s.trim());
      const row: Record<string, unknown> = {};
      cols.forEach((c, i) => (row[c] = args[i]));
      ragChunks.push(row);
    }
  }
  const db = {
    prepare: (sql: string) => ({
      bind: (...args: unknown[]) => ({
        __sql: sql,
        __args: args,
        run: async () => (exec(sql, args), { success: true }),
        all: async () => ({ results: [] as { vector_id: string }[] }), // no prior vectors
      }),
    }),
    batch: async (stmts: Array<{ __sql: string; __args: unknown[] }>) => {
      for (const s of stmts) exec(s.__sql, s.__args);
      return stmts.map(() => ({ success: true }));
    },
  };
  const env = {
    AI: { run: async (_m: string, { text }: { text: string[] }) => ({ data: text.map(() => new Array(1024).fill(0)) }) },
    ATLAS_RAG: {
      upsert: async (vs: Array<{ id: string; values: number[]; metadata?: Record<string, unknown> }>) => {
        for (const v of vs) upserted.push({ id: v.id, metadata: v.metadata ?? {} });
        return { count: vs.length };
      },
      deleteByIds: async () => ({ count: 0 }),
    },
    DB: db,
  };
  return { env, upserted, ragDocuments, ragChunks };
}

async function seedOne(f: ReturnType<typeof makeSeedEnv>, doc: string, text: string) {
  await seedDocsFromR2(
    [`atlas-corpus/${doc}.md`],
    { get: async () => ({ text: async () => text }) },
    async (d, t, key) => {
      // Exactly what seed-corpus route does: page: 1 (starting page).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = await ingestDocument(f.env as any, { tenantId: "default", doc: d, text: t, page: 1, r2_key: key });
      return r.chunks_ingested;
    },
  );
}

describe("seed page attribution (page: 1)", () => {
  it("1. NO MARKERS: every chunk is page 1 and vector IDs contain ::p1:: (never ::p0::)", async () => {
    const f = makeSeedEnv();
    await seedOne(f, "nomarker", "# One\nAlpha content here.\n# Two\nBravo content here.");
    const ids = f.upserted.map((v) => v.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.every((id) => id.includes("::p1::"))).toBe(true);
    expect(ids.some((id) => id.includes("::p0::"))).toBe(false);
    expect(f.upserted.every((v) => v.metadata.page === 1)).toBe(true);
  });

  it("2. MULTI-PAGE: content before --- page 2 --- is page 1, after is page 2 (::p1:: and ::p2::)", async () => {
    const f = makeSeedEnv();
    await seedOne(f, "twopage", "# One\nAlpha page one.\n--- page 2 ---\n# Two\nBravo page two.");
    const ids = f.upserted.map((v) => v.id);
    expect(ids.some((id) => id.includes("::p1::"))).toBe(true);
    expect(ids.some((id) => id.includes("::p2::"))).toBe(true);
    expect(ids.some((id) => id.includes("::p0::"))).toBe(false);
  });

  it("3. rag_documents rows for a 2-page doc are pages 1 and 2 (not 0 and 2)", async () => {
    const f = makeSeedEnv();
    await seedOne(f, "twopage", "# One\nAlpha page one.\n--- page 2 ---\n# Two\nBravo page two.");
    expect(f.ragDocuments.map((r) => r.page).sort()).toEqual([1, 2]);
  });
});
