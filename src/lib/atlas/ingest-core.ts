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
}

export interface IngestInput {
  doc: string;
  text: string;
  page?: number | null;
}

export interface IngestResult {
  doc: string;
  chunks_ingested: number;
  sections_detected: number;
  oversized_count: number;
  chunks: Chunk[];
}

const EMBED_MODEL = "@cf/baai/bge-large-en-v1.5";
const BATCH_SIZE = 50;

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
      id: `${input.doc}::${c.chunk_index}`,
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

  const sections = [...new Set(chunks.map(c => c.section).filter(Boolean))];
  return {
    doc: input.doc,
    chunks_ingested: upsertResult.count ?? chunks.length,
    sections_detected: sections.length,
    oversized_count: chunks.filter(c => c.oversized).length,
    chunks,
  };
}
