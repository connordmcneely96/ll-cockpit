import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

// Lesson 12: getCloudflareContext from @opennextjs/cloudflare ONLY.
// Inline Env cast (Sprint 18B ADR). Reads the D1 ledger (SSOT) ONLY — reports the
// EXPECTED Vectorize count (SUM(chunk_count)); the ACTUAL count comes from
// `wrangler vectorize info atlas-engineering`, and the two are compared by hand.
// Deliberately does NOT touch the ATLAS_RAG binding — honest and deterministic.

type D1Result<T> = { results: T[] };
type EnvDB = {
  prepare: (sql: string) => { all: <T = unknown>() => Promise<D1Result<T>> };
};
type Env = { DB?: EnvDB };

interface DocRow {
  doc: string;
  page: number;
  chunk_count: number;
  sha256: string;
  r2_key: string | null;
  embed_model: string;
  ingested_at: number;
}

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("secret") !== "engineering-30b") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { env } = await getCloudflareContext({ async: true });
  const { DB } = env as unknown as Env;
  if (!DB) {
    return NextResponse.json({ error: "bindings_missing", db: !!DB }, { status: 500 });
  }

  try {
    const rows = await DB.prepare(
      `SELECT doc, page, chunk_count, sha256, r2_key, embed_model, ingested_at
         FROM rag_documents
        ORDER BY doc, page`
    ).all<DocRow>();
    const documents = rows.results ?? [];

    const doc_count = new Set(documents.map((d) => d.doc)).size;
    const row_count = documents.length;
    const expected_vector_count = documents.reduce((sum, d) => sum + (d.chunk_count ?? 0), 0);

    return NextResponse.json({ documents, doc_count, row_count, expected_vector_count });
  } catch (e) {
    return NextResponse.json({ error: "corpus_read_failed", message: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
