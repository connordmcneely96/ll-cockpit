import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { systemTenantId } from "@/lib/tenant";

// Lesson 12: getCloudflareContext from @opennextjs/cloudflare ONLY.

const TEST_SNIPPETS = [
  { id: "test-1", text: "API 610 §6.2.4 specifies minimum shaft diameter based on transmitted torque, allowable shear stress, and material yield strength." },
  { id: "test-2", text: "ASME BPVC Section VIII Division 1, paragraph UG-27, gives the formula for required shell thickness under internal pressure: t = PR / (SE - 0.6P)." },
  { id: "test-3", text: "Roark's Formulas for Stress and Strain Table 11.2 covers stress and deflection in flat circular plates under uniform load." },
];

// Inline Env cast (Sprint 18B ADR — do NOT rely on generated CloudflareEnv having these)
type AiRunner = { run: (model: string, opts: { text: string[] }) => Promise<{ data: number[][] }> };
type VecIndex = {
  upsert: (v: { id: string; values: number[]; metadata?: Record<string, unknown> }[]) => Promise<{ count?: number }>;
  query: (vec: number[], opts: { topK: number; returnMetadata: string | boolean; filter?: Record<string, unknown> }) => Promise<{ matches: { id: string; score: number; metadata?: Record<string, unknown> }[] }>;
};
type Env = { AI?: AiRunner; ATLAS_RAG?: VecIndex };

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("secret") !== "engineering-30a") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { env } = await getCloudflareContext({ async: true });
  const { AI, ATLAS_RAG } = env as unknown as Env;
  if (!AI || !ATLAS_RAG) {
    return NextResponse.json({ error: "bindings_missing", ai: !!AI, atlas_rag: !!ATLAS_RAG }, { status: 500 });
  }

  try {
    // 1. Embed snippets
    const embedResp = await AI.run("@cf/baai/bge-large-en-v1.5", { text: TEST_SNIPPETS.map(s => s.text) });
    const vectors = embedResp.data;
    if (vectors[0]?.length !== 1024) {
      return NextResponse.json({ error: "unexpected_dim", got: vectors[0]?.length, expected: 1024 }, { status: 500 });
    }

    // JUSTIFIED systemTenantId(): secret-gated end-to-end index test on its own test
    // snippets — no user context. Tenant travels in metadata and the query filter so
    // the round-trip is tenant-scoped like production.
    const tenantId = systemTenantId();

    // 2. Upsert
    const upsert = await ATLAS_RAG.upsert(
      TEST_SNIPPETS.map((s, i) => ({ id: s.id, values: vectors[i], metadata: { tenant_id: tenantId, snippet: s.text } }))
    );

    // 3. Query
    const query = "What's the formula for shell thickness in ASME BPVC?";
    const qResp = await AI.run("@cf/baai/bge-large-en-v1.5", { text: [query] });
    const matches = await ATLAS_RAG.query(qResp.data[0], { topK: 3, returnMetadata: "all", filter: { tenant_id: tenantId } });

    return NextResponse.json({
      query,
      embedding_model: "@cf/baai/bge-large-en-v1.5",
      embedding_dim: 1024,
      ingested: upsert.count ?? TEST_SNIPPETS.length,
      top_match: matches.matches[0]
        ? { id: matches.matches[0].id, score: matches.matches[0].score, snippet: matches.matches[0].metadata?.snippet }
        : null,
      all_matches: matches.matches.map(m => ({ id: m.id, score: m.score })),
    });
  } catch (e) {
    return NextResponse.json({ error: "rag_test_failed", message: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
