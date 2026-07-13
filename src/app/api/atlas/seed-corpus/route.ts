import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { ingestDocument, IngestEnv } from "@/lib/atlas/ingest-core";
import { CORPUS } from "@/lib/atlas/corpus-seed";

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

  try {
    const perDoc: { doc: string; chunks: number }[] = [];
    let totalChunks = 0;
    let totalOversized = 0;

    for (const entry of CORPUS) {
      const result = await ingestDocument(ingestEnv, {
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
    });
  } catch (e) {
    return NextResponse.json({ error: "seed_failed", message: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
