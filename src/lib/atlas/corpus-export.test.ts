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
