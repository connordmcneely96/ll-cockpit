// Corpus consolidation helpers (pure, testable) for making R2 the SINGLE source of
// truth for the ATLAS corpus. The hardcoded CORPUS array is a legacy second source;
// these functions export it to R2 (one markdown object per doc) and enumerate R2 for
// re-ingest.

export interface CorpusEntry {
  doc: string;
  page?: number;
  text: string;
}

export interface GroupedDoc {
  doc: string;
  markdown: string;
}

// EXACT page-marker format the chunker parses: /^---\s*page\s+(\d+)\s*---$/i
// (chunker.ts). A doc's markdown carries its own markers; the chunker turns each
// into a hard chunk/page boundary. Do NOT invent a different syntax.
export function pageMarker(page: number): string {
  return `--- page ${page} ---`;
}

/**
 * Group CORPUS entries by doc name into ONE markdown per doc. A single-entry doc is
 * its text verbatim; a multi-page doc concatenates its pages (sorted by page
 * ascending) — the FIRST page has NO leading marker, each subsequent page is
 * preceded by its `--- page N ---` marker. Output is sorted by doc name so callers
 * that window (from/to) get a stable order.
 */
export function groupCorpusByDoc(entries: CorpusEntry[]): GroupedDoc[] {
  const byDoc = new Map<string, CorpusEntry[]>();
  for (const e of entries) {
    const list = byDoc.get(e.doc) ?? [];
    list.push(e);
    byDoc.set(e.doc, list);
  }

  const out: GroupedDoc[] = [];
  for (const [doc, list] of byDoc) {
    const sorted = [...list].sort((a, b) => (a.page ?? 0) - (b.page ?? 0));
    let markdown: string;
    if (sorted.length === 1) {
      markdown = sorted[0].text;
    } else {
      const parts: string[] = [];
      sorted.forEach((e, i) => {
        // First page: no leading marker. Subsequent pages: their marker, then text.
        if (i > 0) parts.push(pageMarker(e.page ?? i + 1));
        parts.push(e.text);
      });
      markdown = parts.join("\n\n");
    }
    out.push({ doc, markdown });
  }

  out.sort((a, b) => a.doc.localeCompare(b.doc));
  return out;
}

/** basename of an R2 key without the .md suffix: `atlas-corpus/B31.3_piping.md` -> `B31.3_piping`. */
export function docNameFromKey(key: string): string {
  const base = key.slice(key.lastIndexOf("/") + 1);
  return base.endsWith(".md") ? base.slice(0, -3) : base;
}

/** Keep only .md keys, sorted alphabetically — a DETERMINISTIC order so from/to windowing is stable. */
export function sortCorpusKeys(keys: string[]): string[] {
  return keys.filter((k) => k.endsWith(".md")).sort((a, b) => a.localeCompare(b));
}

export interface R2ExportBucket {
  head: (key: string) => Promise<unknown | null>;
  put: (key: string, value: string) => Promise<unknown>;
}

/**
 * Write each grouped doc to `atlas-corpus/<doc>.md`, but SKIP any key already in R2
 * (the docs added directly to R2 are the correct, authoritative version — never
 * overwrite them). Returns which docs were written vs skipped.
 */
export async function exportDocsToR2(
  grouped: GroupedDoc[],
  r2: R2ExportBucket,
): Promise<{ written: string[]; skipped: string[] }> {
  const written: string[] = [];
  const skipped: string[] = [];
  for (const { doc, markdown } of grouped) {
    const key = `atlas-corpus/${doc}.md`;
    const existing = await r2.head(key);
    if (existing) {
      skipped.push(doc);
      continue;
    }
    await r2.put(key, markdown);
    written.push(doc);
  }
  return { written, skipped };
}

export interface R2SeedSource {
  get: (key: string) => Promise<{ text: () => Promise<string> } | null>;
}

/**
 * Seed from R2: for each key, R2.get -> .text() -> exactly ONE ingest call for the
 * WHOLE document (the ingest side enforces the whole-document contract, so calling
 * once per page would truncate multi-page docs — that is the live bug this fixes).
 * `ingest` returns the chunk count. Missing objects are reported, not fatal.
 */
export async function seedDocsFromR2(
  keys: string[],
  r2: R2SeedSource,
  ingest: (doc: string, text: string, key: string) => Promise<number>,
): Promise<{ doc: string; chunks: number; missing?: boolean }[]> {
  const results: { doc: string; chunks: number; missing?: boolean }[] = [];
  for (const key of keys) {
    const doc = docNameFromKey(key);
    const obj = await r2.get(key);
    if (!obj) {
      results.push({ doc, chunks: 0, missing: true });
      continue;
    }
    const text = await obj.text();
    const chunks = await ingest(doc, text, key);
    results.push({ doc, chunks });
  }
  return results;
}
