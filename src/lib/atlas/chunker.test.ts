// vitest unit tests for the section-aware ATLAS chunker.
// Run with: npx vitest run src/lib/atlas/chunker.test.ts
// (No test runner configured in package.json as of 30B — ships for 30C/CI setup.)

import { describe, it, expect } from "vitest";
import { chunkDocument } from "./chunker";

const MULTI_SECTION_DOC = `
# 301 General
Process piping systems shall be designed to safely contain the pressures and temperatures to which they will be subjected during all phases of operation.

# 302.3 Allowable Stresses
The allowable stress values shall be used in the design equations. These values are dependent on material, temperature, and applicable code.

# 304.1.2 Straight Pipe
The minimum required thickness t is determined from the formula:
t = PD / (2(SE + PY))
where P is the internal design pressure, D is the outside diameter, S is the allowable stress, E is the quality factor, and Y is a coefficient.
`;

const TABLE_DOC = `
# 302.3 Allowable Stresses

The following allowable stress values apply:

| Material | S (ksi) | Temp (°F) |
|---|---|---|
| A106-B | 20.0 | 100 |
| A312-316 | 16.7 | 100 |
| A335-P11 | 15.0 | 100 |

See the code tables for higher temperature derating.
`;

const LONG_SECTION_DOC = `
# 6.1 Shaft Design

${Array.from({ length: 30 }, (_, i) => `Paragraph ${i + 1}: The shaft must be designed to withstand the combined effects of torsion, bending, and axial loads. Safety factors per API 610 apply.`).join("\n\n")}
`;

describe("chunkDocument", () => {
  it("produces ≥1 chunk per section with correct section labels", () => {
    const chunks = chunkDocument(MULTI_SECTION_DOC, { doc: "test" });
    const sections = [...new Set(chunks.map(c => c.section))];
    expect(sections.length).toBeGreaterThanOrEqual(3);
    // All section labels should be non-empty strings
    for (const s of sections) {
      expect(s).toBeTruthy();
    }
    // Each expected heading should appear
    const labels = chunks.map(c => c.section);
    expect(labels.some(l => l.includes("301"))).toBe(true);
    expect(labels.some(l => l.includes("302"))).toBe(true);
    expect(labels.some(l => l.includes("304"))).toBe(true);
  });

  it("no chunk exceeds hard cap EXCEPT ones flagged oversized", () => {
    const chunks = chunkDocument(MULTI_SECTION_DOC, { doc: "test" });
    for (const c of chunks) {
      if (!c.oversized) {
        expect(c.text.length).toBeLessThanOrEqual(2000);
      }
    }
  });

  it("table block is never split across multiple chunks", () => {
    const chunks = chunkDocument(TABLE_DOC, { doc: "test" });
    // Find the chunk(s) that contain the table header
    const tableChunks = chunks.filter(c => c.text.includes("| Material |"));
    // The table header and all its rows should be in ONE chunk
    expect(tableChunks.length).toBe(1);
    const tableChunk = tableChunks[0];
    expect(tableChunk.text).toContain("A106-B");
    expect(tableChunk.text).toContain("A312-316");
    expect(tableChunk.text).toContain("A335-P11");
  });

  it("chunk_index is a contiguous global running integer starting from 0", () => {
    const chunks = chunkDocument(MULTI_SECTION_DOC, { doc: "test" });
    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i].chunk_index).toBe(i);
    }
  });

  it("section label is carried forward when a long section spans multiple chunks", () => {
    const chunks = chunkDocument(LONG_SECTION_DOC, { doc: "test", maxChars: 400 });
    // All chunks should have the same section label
    const sectionChunks = chunks.filter(c => c.section.includes("6.1"));
    expect(sectionChunks.length).toBeGreaterThan(1);
    // Every chunk from that section has identical section label
    const label = sectionChunks[0].section;
    for (const c of sectionChunks) {
      expect(c.section).toBe(label);
    }
  });

  it("all chunks carry the doc field", () => {
    const chunks = chunkDocument(MULTI_SECTION_DOC, { doc: "MY_DOC" });
    for (const c of chunks) {
      expect(c.doc).toBe("MY_DOC");
    }
  });

  it("increments page when page markers are encountered", () => {
    const docWithPages = `# Section 1\nContent on page 1.\n--- page 2 ---\n# Section 2\nContent on page 2.`;
    const chunks = chunkDocument(docWithPages, { doc: "test", page: 1 });
    const pages = chunks.map(c => c.page);
    expect(pages).toContain(1);
    expect(pages).toContain(2);
  });
});
