import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { retrieve } from "@/lib/atlas/retrieve";
import { route } from "@/lib/llm/router";

// TEMPORARY smoke route (Sprint 30E) — runs the ATLAS query pipeline for two fixed
// questions (one covered by the corpus, one not) and writes the full responses to the
// atlas_query_smoke D1 table. Lets Connor trigger the smoke from a browser address bar
// (work computer, no terminal; /api/atlas/query is POST-only and the bar can't POST).
// The SE reads results via the Cloudflare MCP. REMOVE after 30E verification.
// Mirrors the real /api/atlas/query pipeline exactly (retrieve -> route -> enforce).

type AiRunner = {
  run(model: string, opts: { text: string[] }): Promise<{ data: number[][] }>;
  run(model: string, opts: { messages: { role: string; content: string }[]; max_tokens: number }): Promise<{ response?: string }>;
};
type VecIndex = {
  query: (vec: number[], opts: { topK: number; returnMetadata: string | boolean }) => Promise<{
    matches: { id: string; score: number; metadata?: Record<string, unknown> }[];
  }>;
};
type D1Stmt = { bind: (...v: unknown[]) => D1Stmt; run: () => Promise<unknown> };
type D1 = { prepare: (sql: string) => D1Stmt };
type Env = { AI?: AiRunner; ATLAS_RAG?: VecIndex; DB?: D1; ANTHROPIC_API_KEY?: string };

export const dynamic = "force-dynamic";

const VALUE_WITH_UNIT_RE = /\b\d[\d,.]*\s*(psi|ksi|mpa|kpa|pa|lb|kg|n|mm|in|cm|m|rpm|hz|°f|°c|deg|%|kw|hp|ft)\b/i;
const FORMULA_KEYWORDS_RE = /\b(t\s*=|σ|τ|f_y|s_e|k_f|L_10|h_f|NPSH|P\s*=|M_p|W_t|Z_x)\b/i;
function hasEngineeringValues(text: string): boolean {
  return VALUE_WITH_UNIT_RE.test(text) || FORMULA_KEYWORDS_RE.test(text);
}

const SYSTEM_PROMPT = `You are ATLAS, a mechanical and process engineering reference assistant.
You answer engineering questions ONLY from the provided source chunks below.
Rules:
1. Every engineering claim (formula, value, limit, specification) MUST be followed by a citation in the form [doc §section], e.g. [B31.3_piping §304.1.2].
2. If the provided chunks do not contain enough information to answer the question, respond with exactly: "Insufficient sources: the provided chunks do not cover this question."
3. Never invent, interpolate, or extrapolate engineering values not explicitly stated in the chunks.
4. Keep all units explicit. Do not mix SI and imperial without labeling both.
5. Be concise and technically precise.`;

const QUESTIONS: { label: string; q: string }[] = [
  { label: "covered", q: "What is the required wall thickness formula for straight pipe under internal pressure?" },
  { label: "uncovered", q: "What is the rated burst pressure of a 2024-T3 aluminum hydraulic accumulator at cryogenic temperature?" },
];

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("secret") !== "engineering-30b") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { env } = await getCloudflareContext({ async: true });
  const typedEnv = env as unknown as Env;
  const { AI, ATLAS_RAG, DB } = typedEnv;
  if (!AI || !ATLAS_RAG || !DB) {
    return NextResponse.json({ error: "bindings_missing", ai: !!AI, atlas_rag: !!ATLAS_RAG, db: !!DB }, { status: 500 });
  }

  const apiKey = (env as unknown as { ANTHROPIC_API_KEY?: string }).ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_API_KEY;
  const out: { label: string; rejected: boolean; sources_count: number; confidence: number }[] = [];

  try {
    for (const { label, q } of QUESTIONS) {
      const chunks = await retrieve({ AI, ATLAS_RAG }, q, { topK: 5, useRewriter: true });
      const chunkList = chunks
        .map((c, i) => `[${i + 1}] doc=${c.doc ?? "unknown"} §${c.section ?? "?"} page=${c.page ?? "?"}\n${c.text ?? ""}`)
        .join("\n\n");
      const userMessage = [`Question: ${q}`, "", "Source chunks:", chunkList].join("\n");

      const llm = await route({
        agentName: "atlas",
        taskType: "query",
        systemPrompt: SYSTEM_PROMPT,
        userMessage,
        maxTokens: 1024,
        temperature: 0.2,
        userId: "smoke",
        env: env as Parameters<typeof route>[0]["env"],
        apiKey,
      });
      const answerText: string = llm.text;

      const seen = new Set<string>();
      const sources: { doc: string; section: string; page: number | null }[] = [];
      for (const c of chunks) {
        if (!c.doc) continue;
        const key = `${c.doc}::${c.section ?? ""}`;
        if (!seen.has(key)) { seen.add(key); sources.push({ doc: c.doc, section: c.section ?? "", page: c.page }); }
      }
      const isInsufficient = answerText.startsWith("Insufficient sources");
      const rejected = hasEngineeringValues(answerText) && sources.length === 0 && !isInsufficient;

      const responseBody = {
        question: q,
        answer: rejected ? null : answerText,
        sources,
        rejected,
        requires_connor_review: true,
        model_id: llm.modelId,
      };

      await DB.prepare("INSERT OR REPLACE INTO atlas_query_smoke (id, label, response_json, created_at) VALUES (?,?,?,unixepoch())")
        .bind(`smoke:${label}`, label, JSON.stringify(responseBody))
        .run();

      out.push({ label, rejected, sources_count: sources.length, confidence: isInsufficient ? 0.1 : 0.5 });
    }
    return NextResponse.json({ ok: true, ran: out, note: "Full responses in atlas_query_smoke (SE reads via MCP)." });
  } catch (e) {
    return NextResponse.json({ error: "smoke_failed", message: e instanceof Error ? e.message : String(e), partial: out }, { status: 500 });
  }
}
