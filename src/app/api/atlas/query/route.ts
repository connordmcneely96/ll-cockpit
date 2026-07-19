import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { retrieve } from "@/lib/atlas/retrieve";
import { route } from "@/lib/llm/router";
import { createClient } from "@/lib/supabase-server";
import { resolveTenantId } from "@/lib/tenant";

// Lesson 12: getCloudflareContext from @opennextjs/cloudflare ONLY.
// Inline Env cast (Sprint 18B ADR). route() receives the raw env (CloudflareEnv).
// NOTE: hand-validate the body — the hub does not depend on `zod` (artifact-stack-
// vs-deployed-deps trap: zod typechecks in the editor but isn't in package.json,
// so webpack can't resolve it at build). Plain validation = zero new dependency.

// ── Inline Env types ──
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
type Env = {
  AI?: AiRunner;
  ATLAS_RAG?: VecIndex;
  DB?: D1;
  ANTHROPIC_API_KEY?: string;
};

export const dynamic = "force-dynamic";

interface QueryBody {
  question: string;
  project_context?: string;
  max_sources: number;
}

// Hand validation (replaces zod). Returns the parsed body or an error string.
function parseBody(raw: unknown): { ok: true; body: QueryBody } | { ok: false; error: string } {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, error: "body must be a JSON object" };
  }
  const r = raw as Record<string, unknown>;

  if (typeof r.question !== "string" || r.question.trim().length < 1) {
    return { ok: false, error: "question is required and must be a non-empty string" };
  }
  if (r.project_context !== undefined && typeof r.project_context !== "string") {
    return { ok: false, error: "project_context must be a string" };
  }

  let max_sources = 5;
  if (r.max_sources !== undefined) {
    if (typeof r.max_sources !== "number" || !Number.isInteger(r.max_sources)) {
      return { ok: false, error: "max_sources must be an integer" };
    }
    if (r.max_sources < 1 || r.max_sources > 10) {
      return { ok: false, error: "max_sources must be between 1 and 10" };
    }
    max_sources = r.max_sources;
  }

  return {
    ok: true,
    body: {
      question: r.question,
      project_context: r.project_context as string | undefined,
      max_sources,
    },
  };
}

// Engineering value heuristic: number followed (or not) by a known unit.
// Used for both unit-verification and citation enforcement.
// Conservative — default true; only flip on a clear detection.
const VALUE_WITH_UNIT_RE = /\b\d[\d,.]*\s*(psi|ksi|mpa|kpa|pa|lb|kg|n|mm|in|cm|m|rpm|hz|°f|°c|deg|%|kw|hp|ft)\b/i;
// Bare large number adjacent to engineering keywords — possible unit omission.
const BARE_NUMBER_RE = /\b\d{3,}(\.\d+)?\b(?!\s*(psi|ksi|mpa|kpa|pa|lb|kg|n|mm|in|cm|m|rpm|hz|°|deg|%|kw|hp|ft|\$))/i;
const STRESS_KEYWORDS_RE = /\b(stress|pressure|load|force|moment|torque|strength|yield|tensile|shear|thickness|diameter|flow|head|speed)\b/i;
const FORMULA_KEYWORDS_RE = /\b(t\s*=|σ|τ|f_y|s_e|k_f|L_10|h_f|NPSH|P\s*=|M_p|W_t|Z_x)\b/i;

function hasEngineeringValues(text: string): boolean {
  return VALUE_WITH_UNIT_RE.test(text) || FORMULA_KEYWORDS_RE.test(text);
}

function checkUnitConsistency(text: string): boolean {
  // Flip to false only if bare large number appears near engineering stress/pressure keywords
  const hasBareNumber = BARE_NUMBER_RE.test(text);
  if (!hasBareNumber) return true;
  return !STRESS_KEYWORDS_RE.test(text);
}

const SYSTEM_PROMPT = `You are ATLAS, a mechanical and process engineering reference assistant.
You answer engineering questions ONLY from the provided source chunks below.
Rules:
1. Every engineering claim (formula, value, limit, specification) MUST be followed by a citation in the form [doc §section], e.g. [B31.3_piping §304.1.2].
2. If the provided chunks do not contain enough information to answer the question, respond with exactly: "Insufficient sources: the provided chunks do not cover this question."
3. Never invent, interpolate, or extrapolate engineering values not explicitly stated in the chunks.
4. Keep all units explicit. Do not mix SI and imperial without labeling both.
5. Be concise and technically precise.`;

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("secret") !== "engineering-30b") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: QueryBody;
  try {
    const raw = await req.json();
    const parsed = parseBody(raw);
    if (!parsed.ok) {
      return NextResponse.json({ error: "invalid_body", detail: parsed.error }, { status: 400 });
    }
    body = parsed.body;
  } catch (e) {
    return NextResponse.json({ error: "invalid_body", detail: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }

  const { question, project_context, max_sources } = body;

  // Resolve the tenant from the authenticated identity — retrieval is filtered to it,
  // so an unresolved tenant must fail closed, never fall back to a shared partition.
  // (The former `x-user-id` header was an unauthenticated, spoofable identity.)
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let tenantId: string;
  try {
    tenantId = resolveTenantId({ userId: user?.id });
  } catch {
    return NextResponse.json({ error: "tenant_unresolved", detail: "authentication required to query" }, { status: 401 });
  }
  const userId = tenantId;

  const { env } = await getCloudflareContext({ async: true });
  const typedEnv = env as unknown as Env;
  const { AI, ATLAS_RAG, DB } = typedEnv;

  if (!AI || !ATLAS_RAG) {
    return NextResponse.json({ error: "bindings_missing", ai: !!AI, atlas_rag: !!ATLAS_RAG }, { status: 500 });
  }

  const t0 = Date.now();

  try {
    // ── 1. Retrieve ──
    const chunks = await retrieve({ AI, ATLAS_RAG }, question, tenantId, { topK: max_sources, useRewriter: true });

    // ── 2. Build grounded prompt ──
    const chunkList = chunks
      .map((c, i) => `[${i + 1}] doc=${c.doc ?? "unknown"} §${c.section ?? "?"} page=${c.page ?? "?"}\n${c.text ?? ""}`)
      .join("\n\n");

    const userMessage = [
      `Question: ${question}`,
      project_context ? `Project context: ${project_context}` : null,
      "",
      "Source chunks:",
      chunkList,
    ].filter(Boolean).join("\n");

    // ── 3. LLM call via router ──
    const apiKey = (env as unknown as { ANTHROPIC_API_KEY?: string }).ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_API_KEY;
    const llm = await route({
      agentName: "atlas",
      taskType: "query",
      systemPrompt: SYSTEM_PROMPT,
      userMessage,
      maxTokens: 1024,
      temperature: 0.2,
      userId,
      env: env as Parameters<typeof route>[0]["env"],
      apiKey,
    });

    const answerText: string = llm.text;
    const latencyMs = Date.now() - t0;

    // ── 4. Build sources (dedupe by doc+section, drop null-doc entries) ──
    const seen = new Set<string>();
    const sources: { doc: string; section: string; page: number | null }[] = [];
    for (const c of chunks) {
      if (!c.doc) continue;
      const key = `${c.doc}::${c.section ?? ""}`;
      if (!seen.has(key)) {
        seen.add(key);
        sources.push({ doc: c.doc, section: c.section ?? "", page: c.page });
      }
    }

    // ── 5. Confidence: honest signal from chunk count and top score ──
    // RRF scores are small (1/(60+rank)); translate to a 0-1 signal.
    // With RRF k=60 and rank 1: max single-variant score = 1/61 ≈ 0.016.
    // Count strong sources (score > 0.01) as a proxy for coverage depth.
    const strongSources = chunks.filter(c => c.score > 0.01).length;
    const isInsufficient = answerText.startsWith("Insufficient sources");
    let confidence: number;
    if (isInsufficient) {
      confidence = 0.1;
    } else {
      // Clamp: 0 strong sources → 0.3, max_sources strong → 0.85
      confidence = parseFloat(Math.min(0.85, 0.3 + (strongSources / Math.max(max_sources, 1)) * 0.55).toFixed(2));
    }

    // ── 6. Unit verification ──
    const calc_units_verified = checkUnitConsistency(answerText);

    // ── 7. Citation enforcement ──
    // If the answer asserts engineering values AND no RAG sources support it → reject.
    const rejected = hasEngineeringValues(answerText) && sources.length === 0 && !isInsufficient;
    const reject_reason = rejected
      ? "Answer references engineering values but no RAG sources support it — must cite sources."
      : null;

    const responseBody = {
      answer: rejected ? null : answerText,
      sources,
      confidence,
      calc_units_verified,
      requires_connor_review: true, // ALWAYS — Connor's ME credentials are the integrity layer
      rejected,
      reject_reason,
      meta: {
        model_id: llm.modelId,
        input_tokens: llm.inputTokens,
        output_tokens: llm.outputTokens,
        cost_usd: llm.costUsd,
        latency_ms: latencyMs,
        sources_considered: chunks.length,
      },
    };

    // ── 8. SENTINEL logging (best-effort, does not fail response) ──
    if (DB) {
      try {
        await DB.prepare(
          `INSERT INTO atlas_query_log
           (id, user_id, question, project_context, answer, sources_json,
            confidence, calc_units_verified, requires_connor_review, rejected, reject_reason,
            model_id, input_tokens, output_tokens, cost_usd, latency_ms, created_at)
           VALUES (?,?,?,?,?,?,?,?,1,?,?,?,?,?,?,?,unixepoch())`
        ).bind(
          crypto.randomUUID(),
          userId,
          question,
          project_context ?? null,
          rejected ? null : answerText,
          JSON.stringify(sources),
          confidence,
          calc_units_verified ? 1 : 0,
          rejected ? 1 : 0,
          reject_reason,
          llm.modelId,
          llm.inputTokens,
          llm.outputTokens,
          llm.costUsd,
          latencyMs,
        ).run();
      } catch {
        // Logging failure must never fail the response — mirrors router.ts logDecision
      }
    }

    return NextResponse.json(responseBody);
  } catch (e) {
    return NextResponse.json(
      { error: "query_failed", message: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
