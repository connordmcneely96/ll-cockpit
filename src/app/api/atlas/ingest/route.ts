import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { chunkDocument } from "@/lib/atlas/chunker";

// Lesson 12: getCloudflareContext from @opennextjs/cloudflare ONLY.
// Inline Env cast (Sprint 18B ADR — do NOT rely on generated CloudflareEnv).

type AiRunner = { run: (model: string, opts: { text: string[] }) => Promise<{ data: number[][] }> };
type VecIndex = {
  upsert: (v: { id: string; values: number[]; metadata?: Record<string, unknown> }[]) => Promise<{ count?: number }>;
};
type R2Bucket = { get: (key: string) => Promise<{ text: () => Promise<string> } | null> };
type Env = { AI?: AiRunner; ATLAS_RAG?: VecIndex; R2?: R2Bucket };

const EMBED_MODEL = "@cf/baai/bge-large-en-v1.5";
const BATCH_SIZE = 50;

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("secret") !== "engineering-30b") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { env } = await getCloudflareContext({ async: true });
  const { AI, ATLAS_RAG, R2 } = env as unknown as Env;
  if (!AI || !ATLAS_RAG) {
    return NextResponse.json({ error: "bindings_missing", ai: !!AI, atlas_rag: !!ATLAS_RAG }, { status: 500 });
  }

  let body: { doc?: string; text?: string; r2_key?: string; page?: number | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { doc, text: inlineText, r2_key, page } = body;
  if (!doc) return NextResponse.json({ error: "doc_required" }, { status: 400 });
  if (!inlineText && !r2_key) return NextResponse.json({ error: "text_or_r2_key_required" }, { status: 400 });
  if (inlineText && r2_key) return NextResponse.json({ error: "provide_text_or_r2_key_not_both" }, { status: 400 });

  let sourceText: string;
  if (r2_key) {
    if (!R2) return NextResponse.json({ error: "r2_binding_missing" }, { status: 500 });
    const obj = await R2.get(r2_key);
    if (!obj) return NextResponse.json({ error: "r2_key_not_found", key: r2_key }, { status: 404 });
    sourceText = await obj.text();
  } else {
    sourceText = inlineText!;
  }

  try {
    const chunks = chunkDocument(sourceText, { doc, page: page ?? null });
    if (chunks.length === 0) {
      return NextResponse.json({ error: "no_chunks_produced" }, { status: 400 });
    }

    // Embed in batches of BATCH_SIZE
    const allVectors: number[][] = [];
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE).map(c => c.text);
      const embedResp = await AI.run(EMBED_MODEL, { text: batch });
      if (i === 0 && embedResp.data[0]?.length !== 1024) {
        return NextResponse.json({ error: "unexpected_dim", got: embedResp.data[0]?.length, expected: 1024 }, { status: 500 });
      }
      allVectors.push(...embedResp.data);
    }

    // Upsert to ATLAS_RAG with structured metadata
    const upsertResult = await ATLAS_RAG.upsert(
      chunks.map((c, i) => ({
        id: `${doc}::${c.chunk_index}`,
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
    const oversizedCount = chunks.filter(c => c.oversized).length;

    return NextResponse.json({
      doc,
      chunks_ingested: upsertResult.count ?? chunks.length,
      sections_detected: sections.length,
      oversized_count: oversizedCount,
      sample: chunks[0]
        ? { id: `${doc}::${chunks[0].chunk_index}`, section: chunks[0].section, text: chunks[0].text.slice(0, 200) }
        : null,
    });
  } catch (e) {
    return NextResponse.json({ error: "ingest_failed", message: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
