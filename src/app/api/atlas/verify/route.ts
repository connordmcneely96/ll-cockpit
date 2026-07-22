import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { systemTenantId } from "@/lib/tenant";

// Lesson 12: getCloudflareContext from @opennextjs/cloudflare ONLY.
// Inline Env cast (Sprint 18B ADR).

type AiRunner = { run: (model: string, opts: { text: string[] }) => Promise<{ data: number[][] }> };
type VecIndex = {
  query: (vec: number[], opts: { topK: number; returnMetadata: string | boolean; filter?: Record<string, unknown> }) => Promise<{
    matches: { id: string; score: number; metadata?: Record<string, unknown> }[];
  }>;
};
type Env = { AI?: AiRunner; ATLAS_RAG?: VecIndex };

const EMBED_MODEL = "@cf/baai/bge-large-en-v1.5";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("secret") !== "engineering-30b") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const q = url.searchParams.get("q");
  if (!q) return NextResponse.json({ error: "q_required" }, { status: 400 });

  const { env } = await getCloudflareContext({ async: true });
  const { AI, ATLAS_RAG } = env as unknown as Env;
  if (!AI || !ATLAS_RAG) {
    return NextResponse.json({ error: "bindings_missing", ai: !!AI, atlas_rag: !!ATLAS_RAG }, { status: 500 });
  }

  try {
    const embedResp = await AI.run(EMBED_MODEL, { text: [q] });
    if (embedResp.data[0]?.length !== 1024) {
      return NextResponse.json({ error: "unexpected_dim", got: embedResp.data[0]?.length, expected: 1024 }, { status: 500 });
    }

    // JUSTIFIED systemTenantId(): secret-gated index diagnostic over the shared corpus.
    // TEMPORARY S1a-DIAG: ?nofilter=1 drops the tenant filter to isolate a metadata-index vs missing-vector cause. REMOVE after diagnosis.
    const noFilter = url.searchParams.get("nofilter") === "1";
    const tenant = systemTenantId();
    const result = await ATLAS_RAG.query(
      embedResp.data[0],
      noFilter
        ? { topK: 5, returnMetadata: "all" }
        : { topK: 5, returnMetadata: "all", filter: { tenant_id: tenant } }
    );

    return NextResponse.json({
      query: q,
      embedding_model: EMBED_MODEL,
      filtered: !noFilter,
      tenant_filter: noFilter ? null : tenant,
      matches: result.matches.map(m => ({
        id: m.id,
        score: m.score,
        doc: m.metadata?.doc ?? null,
        section: m.metadata?.section ?? null,
        page: m.metadata?.page ?? null,
        chunk_index: m.metadata?.chunk_index ?? null,
        text: m.metadata?.text ?? m.metadata?.snippet ?? null,
      })),
    });
  } catch (e) {
    return NextResponse.json({ error: "verify_failed", message: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
