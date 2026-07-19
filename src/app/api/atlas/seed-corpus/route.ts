import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { ingestDocument, IngestEnv } from "@/lib/atlas/ingest-core";
import { systemTenantId } from "@/lib/tenant";
import { sortCorpusKeys, seedDocsFromR2 } from "@/lib/atlas/corpus-export";

// Lesson 12: getCloudflareContext from @opennextjs/cloudflare ONLY.
// Inline Env cast (Sprint 18B ADR). Uses shared ingest-core to avoid logic drift with /ingest.
//
// R2 is the SINGLE source of truth: this route enumerates atlas-corpus/*.md and ingests
// each WHOLE doc once. page: 1 is the STARTING page — chunkDocument bumps it at each
// `--- page N ---` marker, so a no-marker doc is all page 1 and content before the first
// marker is page 1 (not page 0). This reproduces the original CORPUS page semantics. The
// old CORPUS-array path was a second source AND called ingestDocument once per page, which
// the whole-document contract truncated. Both fixed.

type AiRunner = { run: (model: string, opts: { text: string[] }) => Promise<{ data: number[][] }> };
type VecIndex = {
  upsert: (v: { id: string; values: number[]; metadata?: Record<string, unknown> }[]) => Promise<{ count?: number }>;
};
type R2Object = { key: string };
type R2Bucket = {
  list: (opts?: { prefix?: string }) => Promise<{ objects: R2Object[] }>;
  get: (key: string) => Promise<{ text: () => Promise<string> } | null>;
};
type Env = { AI?: AiRunner; ATLAS_RAG?: VecIndex; DB?: D1Database; R2?: R2Bucket };

export const dynamic = "force-dynamic";

// Per doc: R2.get + AI.run + D1 read + Vectorize.upsert + D1 batch ≈ 5 subrequests,
// plus one R2.list per call. Default to at most this many docs so a call stays under
// the free-plan 50-subrequest cap.
const DEFAULT_CAP = 10;

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("secret") !== "engineering-30b") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { env } = await getCloudflareContext({ async: true });
  const { AI, ATLAS_RAG, DB, R2 } = env as unknown as Env;
  if (!AI || !ATLAS_RAG || !DB || !R2) {
    return NextResponse.json(
      { error: "bindings_missing", ai: !!AI, atlas_rag: !!ATLAS_RAG, db: !!DB, r2: !!R2 },
      { status: 500 },
    );
  }

  // Enumerate the corpus from R2 (the single source of truth), deterministically ordered
  // so ?from=&to= windowing is stable across calls.
  const listed = await R2.list({ prefix: "atlas-corpus/" });
  const keys = sortCorpusKeys((listed.objects ?? []).map((o) => o.key));
  const total = keys.length;

  const parse = (v: string | null, dflt: number) => {
    const n = parseInt(v ?? "", 10);
    return Number.isFinite(n) ? n : dflt;
  };
  const from = Math.min(Math.max(parse(url.searchParams.get("from"), 0), 0), total);
  const toRaw = url.searchParams.get("to");
  const to = toRaw !== null
    ? Math.min(Math.max(parse(toRaw, total), from), total)
    : Math.min(from + DEFAULT_CAP, total); // default window: at most DEFAULT_CAP docs
  const windowKeys = keys.slice(from, to);

  // The seed corpus is the shared, open-access engineering baseline. It has no user
  // context, so it is written under the system tenant. JUSTIFIED systemTenantId().
  const tenantId = systemTenantId();
  const ingestEnv: IngestEnv = { AI, ATLAS_RAG, DB };

  try {
    const perDoc = await seedDocsFromR2(windowKeys, R2, async (doc, text, key) => {
      // ONE ingest per WHOLE doc — never once per page (that truncated multi-page docs).
      // page: 1 is the starting page; markers in the text bump it (content before the
      // first marker is page 1, not page 0).
      const result = await ingestDocument(ingestEnv, { tenantId, doc, text, page: 1, r2_key: key });
      return result.chunks_ingested;
    });

    const total_chunks = perDoc.reduce((s, d) => s + d.chunks, 0);
    const docs_seeded = perDoc.filter((d) => !d.missing).length;

    return NextResponse.json({
      docs_seeded,
      total_chunks,
      per_doc: perDoc,
      from,
      to,
      total_keys: total,
      window_cap: DEFAULT_CAP,
      note: `R2 is the source of truth. Window defaults to at most ${DEFAULT_CAP} docs/call (~5 subrequests per doc + 1 R2.list); narrow ?from&?to if you hit the 50-subrequest cap.`,
    });
  } catch (e) {
    return NextResponse.json({ error: "seed_failed", message: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
