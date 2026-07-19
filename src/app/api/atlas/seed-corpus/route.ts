import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { ingestDocument, IngestEnv } from "@/lib/atlas/ingest-core";
import { CORPUS } from "@/lib/atlas/corpus-seed";
import { systemTenantId } from "@/lib/tenant";

// Lesson 12: getCloudflareContext from @opennextjs/cloudflare ONLY.
// Inline Env cast (Sprint 18B ADR). Uses shared ingest-core to avoid logic drift with /ingest.

type AiRunner = { run: (model: string, opts: { text: string[] }) => Promise<{ data: number[][] }> };
type VecIndex = {
  upsert: (v: { id: string; values: number[]; metadata?: Record<string, unknown> }[]) => Promise<{ count?: number }>;
};
type Env = { AI?: AiRunner; ATLAS_RAG?: VecIndex; DB?: D1Database };

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("secret") !== "engineering-30b") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { env } = await getCloudflareContext({ async: true });
  const { AI, ATLAS_RAG, DB } = env as unknown as Env;
  if (!AI || !ATLAS_RAG || !DB) {
    return NextResponse.json({ error: "bindings_missing", ai: !!AI, atlas_rag: !!ATLAS_RAG, db: !!DB }, { status: 500 });
  }

  const ingestEnv: IngestEnv = { AI, ATLAS_RAG, DB };

  // Window the corpus: each entry costs 3 subrequests (AI.run + Vectorize.upsert +
  // DB.batch), so 16 entries = 48, over the free-plan 50-subrequest cap. Seed in
  // slices via ?from=&to= (default the whole corpus). [from, to), clamped in-range.
  const total = CORPUS.length;
  const parse = (v: string | null, dflt: number) => {
    const n = parseInt(v ?? "", 10);
    return Number.isFinite(n) ? n : dflt;
  };
  const from = Math.min(Math.max(parse(url.searchParams.get("from"), 0), 0), total);
  const to = Math.min(Math.max(parse(url.searchParams.get("to"), total), from), total);
  const window = CORPUS.slice(from, to);

  try {
    const perDoc: { doc: string; chunks: number }[] = [];
    let totalChunks = 0;
    let totalOversized = 0;

    // The seed corpus is the shared, open-access engineering baseline (B31.3, AISC,
    // paraphrased ASME, ...). It has no user context, so it is written under the
    // system tenant. JUSTIFIED systemTenantId() call site: shared baseline, not a
    // user's private corpus.
    const tenantId = systemTenantId();

    for (const entry of window) {
      const result = await ingestDocument(ingestEnv, {
        tenantId,
        doc: entry.doc,
        text: entry.text,
        page: entry.page ?? null,
      });
      perDoc.push({ doc: entry.doc, chunks: result.chunks_ingested });
      totalChunks += result.chunks_ingested;
      totalOversized += result.oversized_count;
    }

    // Aggregate per unique doc
    const docMap = new Map<string, number>();
    for (const { doc, chunks } of perDoc) {
      docMap.set(doc, (docMap.get(doc) ?? 0) + chunks);
    }

    return NextResponse.json({
      docs_seeded: docMap.size,
      total_chunks: totalChunks,
      oversized_count: totalOversized,
      per_doc: [...docMap.entries()].map(([doc, chunks]) => ({ doc, chunks })),
      from,
      to,
      corpus_total: total,
    });
  } catch (e) {
    return NextResponse.json({ error: "seed_failed", message: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
