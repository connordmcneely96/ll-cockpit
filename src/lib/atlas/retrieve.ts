// Shared retrieval core for ATLAS RAG.
// Supports single-query baseline OR expanded multi-variant + RRF merge.
// Used by eval, the future answer endpoint (30E), and any other consumer.

import { rewriteQuery } from "./rewriter";

type AiRunner = {
  run(model: string, opts: { text: string[] }): Promise<{ data: number[][] }>;
  run(model: string, opts: { messages: { role: string; content: string }[]; max_tokens: number }): Promise<{ response?: string }>;
};
type VecMatch = { id: string; score: number; metadata?: Record<string, unknown> };
type VecIndex = {
  query: (vec: number[], opts: { topK: number; returnMetadata: string | boolean }) => Promise<{ matches: VecMatch[] }>;
};

export type RetrieveEnv = { AI: AiRunner; ATLAS_RAG: VecIndex };

export interface RetrievedChunk {
  id: string;
  score: number;
  doc: string | null;
  section: string | null;
  page: number | null;
  text: string | null;
}

export interface RetrieveOptions {
  topK?: number;
  useRewriter?: boolean;
  /** Per-variant topK (fetched before merge; default = topK * 2 to give RRF more signal) */
  variantTopK?: number;
}

const EMBED_MODEL = "@cf/baai/bge-large-en-v1.5";
// RRF constant — standard value; higher k reduces the impact of top-1 dominance
const RRF_K = 60;

function toChunk(m: VecMatch): RetrievedChunk {
  return {
    id: m.id,
    score: m.score,
    doc: (m.metadata?.doc as string) ?? null,
    section: (m.metadata?.section as string) ?? null,
    page: (m.metadata?.page as number) ?? null,
    text: (m.metadata?.text as string) ?? (m.metadata?.snippet as string) ?? null,
  };
}

export async function retrieve(
  env: RetrieveEnv,
  question: string,
  opts: RetrieveOptions = {}
): Promise<RetrievedChunk[]> {
  const topK = opts.topK ?? 5;
  const useRewriter = opts.useRewriter ?? true;

  if (!useRewriter) {
    // Baseline: single embed + single query
    const embedResp = await env.AI.run(EMBED_MODEL, { text: [question] });
    const result = await env.ATLAS_RAG.query(embedResp.data[0], { topK, returnMetadata: "all" });
    return result.matches.map(toChunk);
  }

  // Rewriter path
  const variants = await rewriteQuery(env as Parameters<typeof rewriteQuery>[0], question);
  const variantTopK = opts.variantTopK ?? Math.min(topK * 2, 20);

  // Batch-embed all variants in a single AI.run call
  const embedResp = await env.AI.run(EMBED_MODEL, { text: variants });
  const vecs = embedResp.data;

  // Query in parallel — one per variant
  const variantResults = await Promise.all(
    vecs.map(vec => env.ATLAS_RAG.query(vec, { topK: variantTopK, returnMetadata: "all" }))
  );

  // Reciprocal Rank Fusion — score_id = Σ 1/(RRF_K + rank), rank 1-indexed
  const rrfScores = new Map<string, number>();
  const matchById = new Map<string, VecMatch>();

  for (const result of variantResults) {
    result.matches.forEach((m, rank) => {
      rrfScores.set(m.id, (rrfScores.get(m.id) ?? 0) + 1 / (RRF_K + rank + 1));
      if (!matchById.has(m.id)) matchById.set(m.id, m);
    });
  }

  // Sort by RRF score descending, take topK, return with original metadata
  const ranked = [...rrfScores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topK)
    .map(([id, rrfScore]) => {
      const m = matchById.get(id)!;
      return toChunk({ ...m, score: rrfScore });
    });

  return ranked;
}
