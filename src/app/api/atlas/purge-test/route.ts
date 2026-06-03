import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

// TEMPORARY admin route (Sprint 30C) — purge the three legacy 30A test snippets
// (test-1/2/3) from atlas-engineering. They predate the metadata schema (doc/section
// null) and pollute retrieval + can never satisfy the eval's metadata checks.
// Remove this route once the purge is confirmed. Lesson 12: getCloudflareContext only.

type VecIndex = {
  deleteByIds: (ids: string[]) => Promise<{ mutationId?: string; count?: number }>;
  query: (vec: number[], opts: { topK: number; returnMetadata: string | boolean }) => Promise<{
    matches: { id: string; score: number }[];
  }>;
};
type Env = { ATLAS_RAG?: VecIndex };

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("secret") !== "engineering-30b") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { env } = await getCloudflareContext({ async: true });
  const { ATLAS_RAG } = env as unknown as Env;
  if (!ATLAS_RAG) {
    return NextResponse.json({ error: "bindings_missing" }, { status: 500 });
  }

  try {
    const ids = ["test-1", "test-2", "test-3"];
    const result = await ATLAS_RAG.deleteByIds(ids);
    return NextResponse.json({
      purged_ids: ids,
      result,
      note: "Vectorize deletes are async — allow a few seconds before re-querying.",
    });
  } catch (e) {
    return NextResponse.json(
      { error: "purge_failed", message: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
