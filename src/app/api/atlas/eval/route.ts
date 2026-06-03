import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

// Lesson 12: getCloudflareContext from @opennextjs/cloudflare ONLY.
// Inline Env cast (Sprint 18B ADR).

type AiRunner = { run: (model: string, opts: { text: string[] }) => Promise<{ data: number[][] }> };
type VecIndex = {
  query: (vec: number[], opts: { topK: number; returnMetadata: string | boolean }) => Promise<{
    matches: { id: string; score: number; metadata?: Record<string, unknown> }[];
  }>;
};
type Env = { AI?: AiRunner; ATLAS_RAG?: VecIndex };

const EMBED_MODEL = "@cf/baai/bge-large-en-v1.5";

// 10-question retrieval eval set — one per domain + key formula.
// expect_doc_contains / expect_section_contains are honest sub-strings of real corpus IDs/sections.
const EVAL_SET = [
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
] as const;

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("secret") !== "engineering-30b") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { env } = await getCloudflareContext({ async: true });
  const { AI, ATLAS_RAG } = env as unknown as Env;
  if (!AI || !ATLAS_RAG) {
    return NextResponse.json({ error: "bindings_missing", ai: !!AI, atlas_rag: !!ATLAS_RAG }, { status: 500 });
  }

  try {
    const results: {
      q: string;
      hit: boolean;
      top3: { doc: string | null; section: string | null; score: number }[];
    }[] = [];

    for (const item of EVAL_SET) {
      const embedResp = await AI.run(EMBED_MODEL, { text: [item.q] });
      const matches = await ATLAS_RAG.query(embedResp.data[0], { topK: 3, returnMetadata: "all" });

      const top3 = matches.matches.map(m => ({
        doc: (m.metadata?.doc as string) ?? null,
        section: (m.metadata?.section as string) ?? null,
        score: m.score,
      }));

      // A hit = any of top-3 matches satisfies BOTH doc and section sub-string checks
      const hit = top3.some(
        m =>
          m.doc?.toLowerCase().includes(item.expect_doc_contains.toLowerCase()) &&
          m.section?.toLowerCase().includes(item.expect_section_contains.toLowerCase())
      );

      results.push({ q: item.q, hit, top3 });
    }

    const passed = results.filter(r => r.hit).length;
    const total = results.length;

    return NextResponse.json({
      passed,
      total,
      pass_rate: parseFloat((passed / total).toFixed(2)),
      results,
    });
  } catch (e) {
    return NextResponse.json({ error: "eval_failed", message: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
