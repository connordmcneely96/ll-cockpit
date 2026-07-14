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

// ── 30C additions: hardened HEADING_RE regression + negatives + positives ──

const B31_ACCEPTANCE = `## 301 General
Process piping systems shall be designed to safely contain the pressures and temperatures to which they will be subjected during all phases of operation.

## 302.3 Allowable Stresses
The allowable stress values shall be used in the design equations. These values are dependent on material, temperature, and applicable code.

## 304.1.2 Straight Pipe
The minimum thickness t is determined from the formula:
t = PD / (2(SE + PY))
where P is the internal design pressure, D is the outside diameter, S is the allowable stress, E is the quality factor, and Y is a coefficient.`;

describe("chunker — 30C hardened regex", () => {
  it("REGRESSION: 30B acceptance input still produces exactly 3 sections", () => {
    const chunks = chunkDocument(B31_ACCEPTANCE, { doc: "b31_reg" });
    const sections = [...new Set(chunks.map(c => c.section))];
    expect(sections.length).toBe(3);
    expect(sections.some(s => s.includes("301"))).toBe(true);
    expect(sections.some(s => s.includes("302"))).toBe(true);
    expect(sections.some(s => s.includes("304"))).toBe(true);
  });

  it("NEGATIVE: 'A36-grade steel is commonly specified for...' does NOT start a new section", () => {
    const doc = `## Setup\nSome intro text.\nA36-grade steel is commonly specified for structural frames due to its weldability.\nMore content here.`;
    const chunks = chunkDocument(doc, { doc: "neg_test" });
    const sections = [...new Set(chunks.map(c => c.section))];
    expect(sections.length).toBe(1);
  });

  it("NEGATIVE: '6 inches of clearance is required...' does NOT start a new section", () => {
    const doc = `## Pump Installation\n6 inches of axial clearance is required between the coupling and the pump casing for maintenance access.`;
    const chunks = chunkDocument(doc, { doc: "neg_test2" });
    const sections = [...new Set(chunks.map(c => c.section))];
    expect(sections.length).toBe(1);
  });

  it("NEGATIVE: 'A106-B pipe has an allowable stress of 20 ksi' does NOT start a new section", () => {
    const doc = `## 302.3 Allowable Stresses\nA106-B pipe has an allowable stress of 20 ksi at 100°F per B31.3 Table A-1.`;
    const chunks = chunkDocument(doc, { doc: "neg_test3" });
    const sections = [...new Set(chunks.map(c => c.section))];
    // A106-B line is prose inside 302.3, not a new section
    expect(sections.length).toBe(1);
    expect(sections[0]).toContain("302");
  });

  it("POSITIVE: 'UG-27 Thickness of Shells Under Internal Pressure' IS a heading", () => {
    const doc = `## Intro\nSome text.\nUG-27 Thickness of Shells Under Internal Pressure\nThe required shell thickness is determined by...`;
    const chunks = chunkDocument(doc, { doc: "pos_test" });
    const sections = [...new Set(chunks.map(c => c.section))];
    expect(sections.some(s => s.includes("UG-27"))).toBe(true);
  });

  it("POSITIVE: '6.2.4 Rotor Dynamics' IS a heading", () => {
    const doc = `## Chapter 6\nIntroduction.\n6.2.4 Rotor Dynamics\nCritical speed analysis must be performed for all shafts.`;
    const chunks = chunkDocument(doc, { doc: "pos_test2" });
    const sections = [...new Set(chunks.map(c => c.section))];
    expect(sections.some(s => s.includes("6.2.4"))).toBe(true);
  });

  it("POSITIVE: 'MG-1 Part 12' is handled sensibly (recognized as heading)", () => {
    const doc = `## Motor Standards\nNEMA standards overview.\nMG-1 Part 12\nFrame dimensions for AC motors...`;
    const chunks = chunkDocument(doc, { doc: "pos_test3" });
    const sections = [...new Set(chunks.map(c => c.section))];
    // MG-1 Part 12 — "Part" starts with capital P, so it should be recognized
    expect(sections.some(s => s.includes("MG-1"))).toBe(true);
  });
});

// ── 196D-2: page-boundary is a hard chunk boundary ──────────────────────────
// A chunk must not span two pages: `page` is part of its identity
// (vector_id = `${doc}::p${page}::${chunk_index}`) and of every citation. The
// page-marker branch now flushes the buffered content under the OLD page before
// bumping `page`.

describe("chunker — page boundaries", () => {
  it("content authored BEFORE a `--- page 2 ---` marker keeps page 1", () => {
    const doc = `# Section 1\nContent on page 1.\n--- page 2 ---\n# Section 2\nContent on page 2.`;
    const chunks = chunkDocument(doc, { doc: "test", page: 1 });
    const s1 = chunks.find(c => c.section === "Section 1");
    const s2 = chunks.find(c => c.section === "Section 2");
    expect(s1?.page).toBe(1); // was wrongly stamped page 2 before the fix
    expect(s2?.page).toBe(2);
  });

  it("a SECTION SPANNING A PAGE BREAK splits into two chunks, same section, pages 1 then 2", () => {
    const doc = `# Bearing Fits\nJournal diameter tolerance is ISO h6 on page one.\n--- page 2 ---\nShoulder fillet radius continues the same clause on page two.`;
    const chunks = chunkDocument(doc, { doc: "span", page: 1 });
    expect(chunks.length).toBe(2);
    expect(chunks.every(c => c.section === "Bearing Fits")).toBe(true);
    expect(chunks.map(c => c.page)).toEqual([1, 2]);
  });

  it("chunk_index stays globally MONOTONIC across page boundaries (does NOT reset per page)", () => {
    const doc = `# A\nalpha\n--- page 2 ---\n# B\nbeta\n--- page 3 ---\n# C\ngamma`;
    const chunks = chunkDocument(doc, { doc: "mono", page: 1 });
    expect(chunks.map(c => c.chunk_index)).toEqual([0, 1, 2]);
    expect(chunks.map(c => c.page)).toEqual([1, 2, 3]);
  });

  it("a document with NO page markers is chunked exactly as before (no regression)", () => {
    const chunks = chunkDocument(B31_ACCEPTANCE, { doc: "no_marker" });
    const sections = [...new Set(chunks.map(c => c.section))];
    expect(sections.length).toBe(3);
    // No markers -> page never changes; all chunks keep the default (null) page,
    // and chunk_index is still 0..n-1 monotonic.
    expect(chunks.every(c => c.page === null)).toBe(true);
    expect(chunks.map(c => c.chunk_index)).toEqual(chunks.map((_, i) => i));
  });

  it("form-feed page markers behave the same as `--- page N ---`", () => {
    const doc = `# S\nAlpha on page one.\n\f2\nBeta on page two.`;
    const chunks = chunkDocument(doc, { doc: "ff", page: 1 });
    expect(chunks.length).toBe(2);
    expect(chunks.every(c => c.section === "S")).toBe(true);
    expect(chunks.map(c => c.page)).toEqual([1, 2]);
  });
});
