import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

// Admin purge route — gated ?secret=engineering-30b.
// Accepts ?target=<known_target_key> to purge a predefined id list, or ?ids=id1,id2,...
// Lesson 12: getCloudflareContext from @opennextjs/cloudflare ONLY.

type VecIndex = {
  deleteByIds: (ids: string[]) => Promise<{ mutationId?: string; count?: number }>;
};
type Env = { ATLAS_RAG?: VecIndex };

// Known purge targets — add new targets here rather than hitting the route with raw ids.
// TEST_B31_excerpt produced 3 chunks from the 30B smoke run.
const KNOWN_PURGE: Record<string, string[]> = {
  TEST_B31_excerpt: ["TEST_B31_excerpt::0", "TEST_B31_excerpt::1", "TEST_B31_excerpt::2"],
};

export const dynamic = "force-dynamic";

async function runPurge(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("secret") !== "engineering-30b") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { env } = await getCloudflareContext({ async: true });
  const { ATLAS_RAG } = env as unknown as Env;
  if (!ATLAS_RAG) {
    return NextResponse.json({ error: "bindings_missing" }, { status: 500 });
  }

  // Resolve ids from ?target= or ?ids=
  let ids: string[] = [];
  const target = url.searchParams.get("target");
  const rawIds = url.searchParams.get("ids");

  if (target) {
    const known = KNOWN_PURGE[target];
    if (!known) {
      return NextResponse.json({ error: "unknown_target", available: Object.keys(KNOWN_PURGE) }, { status: 400 });
    }
    ids = known;
  } else if (rawIds) {
    ids = rawIds.split(",").map(s => s.trim()).filter(Boolean);
  } else {
    return NextResponse.json({ error: "provide_target_or_ids", available_targets: Object.keys(KNOWN_PURGE) }, { status: 400 });
  }

  if (ids.length === 0) {
    return NextResponse.json({ error: "empty_id_list" }, { status: 400 });
  }

  try {
    const result = await ATLAS_RAG.deleteByIds(ids);
    return NextResponse.json({
      purged_ids: ids,
      result,
      note: "Vectorize deletes are async — allow ~10s before re-querying.",
    });
  } catch (e) {
    return NextResponse.json({ error: "purge_failed", message: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) { return runPurge(req); }
export async function POST(req: NextRequest) { return runPurge(req); }
