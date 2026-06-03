// Section-aware chunker for ATLAS RAG ingestion.
// Max 512 tokens (bge-large limit) ≈ 1800 chars target, 2000 hard cap.
// Preserves table blocks and fenced code/equation blocks — never splits mid-unit.
// Overlap: carry tail of previous chunk into next within same section only.

export interface Chunk {
  doc: string;
  section: string;
  page: number | null;
  chunk_index: number;
  text: string;
  oversized?: true;
}

export interface ChunkOptions {
  doc: string;
  page?: number | null;
  maxChars?: number;
  overlapChars?: number;
}

const DEFAULT_MAX = 1800;
const HARD_CAP = 2000;
const DEFAULT_OVERLAP = 250;

// Heading detection — length-gated (≤80 chars) to exclude prose sentences.
// Alternatives:
//   1. Markdown: # / ## / etc — always unambiguous.
//   2. Multi-part section number: must contain a '.' OR be followed by a Title-Case word.
//      Prevents bare "6 inches of clearance..." from matching.
//   3. Spec code (UG-27, MG-1): 1–4 uppercase letters, hyphen, digits. Must be followed by
//      end-of-line or a capitalized word. Prevents "A106-B has an allowable..." (lowercase
//      "has", long line) from matching while allowing "UG-27 Thickness of Shells".
//   4. Table N.N — unambiguous.
const MAX_HEADING_CHARS = 80;

// Multi-part section number: "6.2.4 Title" or "§6.1" but NOT bare "6 inches…"
const SPEC_NUM_RE = /^(?:§\s*)?\d[\d.]*\.[\d.]*(?:\s+\S.*)?$|^(?:§\s*)?\d[\d.]*\s+[A-Z]\S*/;
// Spec code: "UG-27" or "UG-27 Thickness of Shells" but NOT "A106-B has an allowable..."
const SPEC_CODE_RE = /^[A-Z]{1,4}-\d[\d.]*(?:\.\d+)*(?:\s+[A-Z]\S*.*)?$/;

function isHeading(line: string): boolean {
  const t = line.trim();
  if (t.length > MAX_HEADING_CHARS) return false;
  if (/^#{1,6}\s+/.test(t)) return true;
  if (/^Table\s+[\d.]+\b/.test(t)) return true;
  if (SPEC_NUM_RE.test(t)) return true;
  if (SPEC_CODE_RE.test(t)) return true;
  return false;
}

function headingLabel(line: string): string {
  const t = line.trim();
  // Strip leading # marks
  return t.replace(/^#+\s*/, "").trim();
}

/** Split text into logical line groups: table blocks, fenced blocks, and plain lines. */
type LineGroup =
  | { kind: "table"; lines: string[] }
  | { kind: "fence"; lines: string[] }
  | { kind: "line"; text: string };

function groupLines(lines: string[]): LineGroup[] {
  const groups: LineGroup[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    // Fenced code/equation block
    if (line.trim().startsWith("```")) {
      const fence: string[] = [line];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        fence.push(lines[i]);
        i++;
      }
      if (i < lines.length) fence.push(lines[i++]);
      groups.push({ kind: "fence", lines: fence });
      continue;
    }
    // Table block: contiguous lines containing |
    if (line.includes("|")) {
      const table: string[] = [line];
      i++;
      while (i < lines.length && lines[i].includes("|")) {
        table.push(lines[i]);
        i++;
      }
      groups.push({ kind: "table", lines: table });
      continue;
    }
    groups.push({ kind: "line", text: line });
    i++;
  }
  return groups;
}

export function chunkDocument(text: string, opts: ChunkOptions): Chunk[] {
  const maxChars = opts.maxChars ?? DEFAULT_MAX;
  const overlapChars = opts.overlapChars ?? DEFAULT_OVERLAP;
  const doc = opts.doc;
  let page: number | null = opts.page ?? null;

  const chunks: Chunk[] = [];
  let chunkIndex = 0;
  let currentSection = "";
  let currentBuf = "";
  let overlapTail = "";

  function emitChunk(buf: string, oversized?: true) {
    const finalText = buf.trim();
    if (!finalText) return;
    const c: Chunk = { doc, section: currentSection, page, chunk_index: chunkIndex++, text: finalText };
    if (oversized) c.oversized = true;
    chunks.push(c);
    // Update overlap tail (last overlapChars of this chunk, for within-section carry)
    overlapTail = finalText.length > overlapChars ? finalText.slice(-overlapChars) : finalText;
  }

  function flushSection() {
    if (currentBuf.trim()) emitChunk(currentBuf);
    currentBuf = "";
    overlapTail = "";
  }

  const lines = text.split("\n");
  const groups = groupLines(lines);

  for (const group of groups) {
    // Page marker
    if (group.kind === "line") {
      const pageMatch = group.text.match(/^---\s*page\s+(\d+)\s*---$/i) ||
                        group.text.match(/^\f\s*(\d+)?\s*$/);
      if (pageMatch) {
        if (pageMatch[1]) page = parseInt(pageMatch[1], 10);
        continue;
      }

      // Heading detection
      if (isHeading(group.text)) {
        flushSection();
        currentSection = headingLabel(group.text);
        // Start new buf with heading text
        currentBuf = group.text + "\n";
        overlapTail = "";
        continue;
      }

      // Blank line: treat as paragraph separator — if buf near limit, emit
      if (group.text.trim() === "") {
        if (currentBuf.length >= maxChars) {
          emitChunk(currentBuf);
          currentBuf = overlapTail ? overlapTail + "\n" : "";
        } else {
          currentBuf += "\n";
        }
        continue;
      }

      // Normal line: would adding it exceed hard cap?
      if (currentBuf.length + group.text.length + 1 > HARD_CAP) {
        emitChunk(currentBuf);
        currentBuf = (overlapTail ? overlapTail + "\n" : "") + group.text + "\n";
      } else {
        currentBuf += group.text + "\n";
        // Soft emit if over maxChars threshold — wait for next blank/heading
      }
      continue;
    }

    // Table or fence block
    const blockText = group.lines.join("\n");
    const isOversized = blockText.length > HARD_CAP;

    if (isOversized) {
      // Flush whatever was buffered, emit block as its own oversized chunk
      flushSection();
      emitChunk(blockText, true);
      overlapTail = "";
    } else if (currentBuf.length + blockText.length + 1 > HARD_CAP) {
      // Won't fit — flush first, then start new buf with block
      emitChunk(currentBuf);
      currentBuf = (overlapTail ? overlapTail + "\n" : "") + blockText + "\n";
    } else {
      currentBuf += blockText + "\n";
    }
  }

  // Flush remaining
  flushSection();

  return chunks;
}
