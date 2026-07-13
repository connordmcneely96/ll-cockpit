// vitest unit tests for page-scoped ATLAS vector IDs.
// Run with: npx vitest run src/lib/atlas/ingest-core.test.ts
// (No test runner configured in package.json as of 30C — ships for CI setup,
// mirroring chunker.test.ts.)

import { describe, it, expect } from "vitest";
import { vectorId } from "./ingest-core";
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
