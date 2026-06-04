import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { retrieve, RetrieveEnv } from "@/lib/atlas/retrieve";

// Lesson 12: getCloudflareContext from @opennextjs/cloudflare ONLY.
// Inline Env cast (Sprint 18B ADR).

type AiRunner = {
  run(model: string, opts: { text: string[] }): Promise<{ data: number[][] }>;
  run(model: string, opts: { messages: { role: string; content: string }[]; max_tokens: number }): Promise<{ response?: string }>;
};
type VecIndex = {
  query: (vec: number[], opts: { topK: number; returnMetadata: string | boolean }) => Promise<{
    matches: { id: string; score: number; metadata?: Record<string, unknown> }[];
  }>;
};
type Env = { AI?: AiRunner; ATLAS_RAG?: VecIndex };

// ── Eval question set ──
// ORIGINAL 10 from 30C (regression baseline) + 8 NEW honest questions.
// expect_doc_contains / expect_section_contains are honest sub-strings of real corpus doc IDs
// and section labels — NOT reverse-engineered from query results.
const EVAL_SET = [
  // ── Original 10 (30C regression baseline) ──
  {
    q: "What is the formula for required pipe wall thickness under internal pressure?",
    expect_doc_contains: "B31.3",
    expect_section_contains: "304",
  },
  {
    q: "Allowable stress for A106 Grade B carbon steel pipe at 100 degrees F",
    expect_doc_contains: "B31.3",
    expect_section_contains: "302",
  },
  {
    q: "How is pressure vessel shell thickness calculated under internal pressure?",
    expect_doc_contains: "vessel",
    expect_section_contains: "Shell Thickness",
  },
  {
    q: "NEMA motor frame dimension designation and shaft centerline height",
    expect_doc_contains: "NEMA",
    expect_section_contains: "12",
  },
  {
    q: "NEMA motor insulation class temperature rise limits Class B and Class F",
    expect_doc_contains: "NEMA",
    expect_section_contains: "Temperature",
  },
  {
    q: "AGMA gear rating bending strength geometry factor and application factor",
    expect_doc_contains: "AGMA",
    expect_section_contains: "AGMA",
  },
  {
    q: "AISC flexural member compact section plastic moment Mp and lateral torsional buckling",
    expect_doc_contains: "AISC",
    expect_section_contains: "F2",
  },
  {
    q: "Bearing L10 life calculation formula with dynamic load rating C and equivalent load P",
    expect_doc_contains: "bearing",
    expect_section_contains: "L10",
  },
  {
    q: "von Mises equivalent stress for combined bending and torsion on a shaft",
    expect_doc_contains: "shaft",
    expect_section_contains: "von Mises",
  },
  {
    q: "Darcy-Weisbach head loss equation for pipe flow with friction factor",
    expect_doc_contains: "fluid",
    expect_section_contains: "Darcy",
  },

  // ── NEW 8 questions (30D expansion — honest sub-strings of corpus content) ──
  {
    q: "Fillet weld design strength per unit length and electrode tensile strength",
    expect_doc_contains: "welding",
    expect_section_contains: "Fillet",
  },
  {
    q: "Steel endurance limit estimation and Goodman fatigue modification factors",
    expect_doc_contains: "fatigue",
    expect_section_contains: "Endurance",
  },
  {
    q: "Net positive suction head available NPSHA and minor losses in suction piping",
    expect_doc_contains: "fluid",
    expect_section_contains: "Minor",
  },
  {
    q: "Pump affinity laws for flow head and power when speed changes",
    expect_doc_contains: "pump",
    expect_section_contains: "Affinity",
  },
  {
    q: "Centrifugal pump specific speed and impeller type selection radial axial mixed flow",
    expect_doc_contains: "pump",
    expect_section_contains: "Specific Speed",
  },
  {
    q: "Fatigue stress concentration factor Kf and notch sensitivity for shoulder fillet on shaft",
    expect_doc_contains: "fatigue",
    expect_section_contains: "Stress Concentration",
  },
  {
    q: "AISC high-strength bolt A325 shear strength bearing-type connection",
    expect_doc_contains: "AISC",
    expect_section_contains: "J3",
  },
  {
    q: "B31.3 branch connection reinforcement area replacement nozzle opening",
    expect_doc_contains: "B31.3",
    expect_section_contains: "304.2",
  },
] as const;

const EMBED_MODEL = "@cf/baai/bge-large-en-v1.5";

// A/B mode is subrequest-heavy: each question ≈ 1 baseline query + 1 Llama + up to 5 variant
// queries ≈ 7 subrequests. The free plan caps a single invocation at 50 external subrequests,
// so the full 18-question A/B (~126) 500s with "Too many subrequests". Window the A/B loop:
// default 5 questions/call (~35 subrequests, safely under 50). Paginate with ?from=&to=.
const AB_WINDOW = 5;

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("secret") !== "engineering-30b") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const mode = url.searchParams.get("mode") ?? "ab";

  const { env } = await getCloudflareContext({ async: true });
  const { AI, ATLAS_RAG } = env as unknown as Env;
  if (!AI || !ATLAS_RAG) {
    return NextResponse.json({ error: "bindings_missing", ai: !!AI, atlas_rag: !!ATLAS_RAG }, { status: 500 });
  }

  const retrieveEnv: RetrieveEnv = { AI, ATLAS_RAG };

  function hit(
    matches: { doc: string | null; section: string | null; score: number }[],
    expect_doc: string,
    expect_section: string
  ): boolean {
    return matches.some(
      m =>
        m.doc?.toLowerCase().includes(expect_doc.toLowerCase()) &&
        m.section?.toLowerCase().includes(expect_section.toLowerCase())
    );
  }

  try {
    if (mode === "baseline") {
      // Legacy single-query mode — reproduces 30C behaviour (single query/question = light)
      const results: { q: string; hit: boolean; top3: { doc: string | null; section: string | null; score: number }[] }[] = [];
      for (const item of EVAL_SET) {
        const embedResp = await AI.run(EMBED_MODEL, { text: [item.q] });
        const qResult = await ATLAS_RAG.query(embedResp.data[0], { topK: 3, returnMetadata: "all" });
        const top3 = qResult.matches.map(m => ({
          doc: (m.metadata?.doc as string) ?? null,
          section: (m.metadata?.section as string) ?? null,
          score: m.score,
        }));
        results.push({ q: item.q, hit: hit(top3, item.expect_doc_contains, item.expect_section_contains), top3 });
      }
      const passed = results.filter(r => r.hit).length;
      return NextResponse.json({ mode: "baseline", passed, total: results.length, pass_rate: parseFloat((passed / results.length).toFixed(2)), results });
    }

    // A/B mode (default) — WINDOWED to stay under the subrequest cap.
    // ?from=&to= select a slice of EVAL_SET; default = first AB_WINDOW questions.
    const total = EVAL_SET.length;
    const from = Math.max(0, parseInt(url.searchParams.get("from") ?? "0", 10) || 0);
    const to = Math.min(total, parseInt(url.searchParams.get("to") ?? String(from + AB_WINDOW), 10) || from + AB_WINDOW);
    const windowItems = EVAL_SET.slice(from, to);

    const results: {
      idx: number;
      q: string;
      baseline_hit: boolean;
      rewriter_hit: boolean;
      rewriter_top3: { doc: string | null; section: string | null; score: number }[];
    }[] = [];

    for (let i = 0; i < windowItems.length; i++) {
      const item = windowItems[i];
      // Baseline: single query
      const baseMatches = await retrieve(retrieveEnv, item.q, { topK: 3, useRewriter: false });
      const baseline_hit = hit(baseMatches, item.expect_doc_contains, item.expect_section_contains);

      // Rewriter: expand + RRF
      const rewriterMatches = await retrieve(retrieveEnv, item.q, { topK: 3, useRewriter: true });
      const rewriter_hit = hit(rewriterMatches, item.expect_doc_contains, item.expect_section_contains);

      results.push({
        idx: from + i,
        q: item.q,
        baseline_hit,
        rewriter_hit,
        rewriter_top3: rewriterMatches.map(m => ({ doc: m.doc, section: m.section, score: m.score })),
      });
    }

    const baseline_passed = results.filter(r => r.baseline_hit).length;
    const rewriter_passed = results.filter(r => r.rewriter_hit).length;
    const window_size = results.length;
    const next_from = to < total ? to : null;

    return NextResponse.json({
      mode: "ab",
      window: { from, to, window_size, total },
      next_from, // call again with ?from=next_from to continue; null = done
      window_baseline_passed: baseline_passed,
      window_rewriter_passed: rewriter_passed,
      window_delta: rewriter_passed - baseline_passed,
      results,
    });
  } catch (e) {
    return NextResponse.json({ error: "eval_failed", message: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
