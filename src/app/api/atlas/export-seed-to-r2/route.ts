import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { CORPUS } from "@/lib/atlas/corpus-seed";
import { groupCorpusByDoc, exportDocsToR2 } from "@/lib/atlas/corpus-export";

// ⚠️ TEMPORARY one-time migration route. Exports the hardcoded CORPUS array to R2 as
// ONE markdown object per doc (atlas-corpus/<doc>.md) so R2 becomes the SINGLE source
// of truth for the ATLAS corpus. Multi-page docs are concatenated with the chunker's
// `--- page N ---` markers. Docs already in R2 are SKIPPED (never overwritten).
// DELETE this route once R2 is confirmed complete.
//
// Lesson 12: getCloudflareContext from @opennextjs/cloudflare ONLY. Inline Env cast.

type R2Bucket = {
  head: (key: string) => Promise<unknown | null>;
  put: (key: string, value: string) => Promise<unknown>;
};
type Env = { R2?: R2Bucket };

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("secret") !== "engineering-30b") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { env } = await getCloudflareContext({ async: true });
  const { R2 } = env as unknown as Env;
  if (!R2) {
    return NextResponse.json({ error: "bindings_missing", r2: !!R2 }, { status: 500 });
  }

  // Group CORPUS into one doc-per-markdown, sorted by doc name (deterministic).
  const grouped = groupCorpusByDoc(CORPUS);
  const total = grouped.length;

  // Window ?from=&to= — each doc costs head + put (2 subrequests) against the
  // 50-subrequest cap; the whole corpus (11 docs = 22) fits one call, but windowing
  // keeps it safe.
  const parse = (v: string | null, dflt: number) => {
    const n = parseInt(v ?? "", 10);
    return Number.isFinite(n) ? n : dflt;
  };
  const from = Math.min(Math.max(parse(url.searchParams.get("from"), 0), 0), total);
  const to = Math.min(Math.max(parse(url.searchParams.get("to"), total), from), total);
  const windowGrouped = grouped.slice(from, to);

  try {
    const { written, skipped } = await exportDocsToR2(windowGrouped, R2);
    return NextResponse.json({
      written,
      skipped,
      total_docs: total,
      from,
      to,
      note: "TEMPORARY export route — delete once R2 is confirmed complete. Existing R2 keys are skipped, never overwritten.",
    });
  } catch (e) {
    return NextResponse.json({ error: "export_failed", message: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
