import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { ingestDocument, IngestEnv, vectorId } from "@/lib/atlas/ingest-core";
import { createClient } from "@/lib/supabase-server";
import { resolveTenantId } from "@/lib/tenant";

// Lesson 12: getCloudflareContext from @opennextjs/cloudflare ONLY.
// Inline Env cast (Sprint 18B ADR). Uses shared ingest-core — no logic drift with seed-corpus.

type AiRunner = { run: (model: string, opts: { text: string[] }) => Promise<{ data: number[][] }> };
type VecIndex = {
  upsert: (v: { id: string; values: number[]; metadata?: Record<string, unknown> }[]) => Promise<{ count?: number }>;
};
type R2Bucket = { get: (key: string) => Promise<{ text: () => Promise<string> } | null> };
type Env = { AI?: AiRunner; ATLAS_RAG?: VecIndex; R2?: R2Bucket; DB?: D1Database };

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("secret") !== "engineering-30b") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Resolve the tenant from the authenticated identity — never a default. A request
  // that cannot be attributed to a user is refused, not silently shared.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let tenantId: string;
  try {
    tenantId = resolveTenantId({ userId: user?.id });
  } catch {
    return NextResponse.json({ error: "tenant_unresolved", detail: "authentication required to ingest" }, { status: 401 });
  }

  const { env } = await getCloudflareContext({ async: true });
  const { AI, ATLAS_RAG, R2, DB } = env as unknown as Env;
  if (!AI || !ATLAS_RAG || !DB) {
    return NextResponse.json({ error: "bindings_missing", ai: !!AI, atlas_rag: !!ATLAS_RAG, db: !!DB }, { status: 500 });
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
    const ingestEnv: IngestEnv = { AI, ATLAS_RAG, DB };
    const result = await ingestDocument(ingestEnv, { tenantId, doc, text: sourceText, page: page ?? null, r2_key: r2_key ?? null });

    if (result.chunks_ingested === 0) {
      return NextResponse.json({ error: "no_chunks_produced" }, { status: 400 });
    }

    return NextResponse.json({
      doc: result.doc,
      chunks_ingested: result.chunks_ingested,
      sections_detected: result.sections_detected,
      oversized_count: result.oversized_count,
      sample: result.chunks[0]
        ? { id: vectorId(doc, page ?? null, result.chunks[0].chunk_index), section: result.chunks[0].section, text: result.chunks[0].text.slice(0, 200) }
        : null,
    });
  } catch (e) {
    return NextResponse.json({ error: "ingest_failed", message: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
