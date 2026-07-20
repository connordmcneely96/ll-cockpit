import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { DEFAULT_TENANT } from "@/lib/tenant";
import { planLibraryMigration } from "@/lib/atlas/library-migration";

// ⚠️ TEMPORARY one-time migration route — gated ?secret=engineering-30b, POST.
// Purges the OLD standards baseline (vectors + rows) still under the legacy 'default'
// partition, so nothing is orphaned after the re-seed re-writes the SAME docs under
// systemTenantId() = 'library:standards'. It does NOT re-seed (seed-corpus does that
// operationally). DELETE this route once the migration is confirmed — same convention
// as export-seed-to-r2.
//
// NOTE: this route targets the OLD partition by its literal old name (DEFAULT_TENANT),
// NOT systemTenantId() — systemTenantId() now points at the NEW library partition, which
// is exactly what we must NOT delete.
//
// Lesson 12: getCloudflareContext from @opennextjs/cloudflare ONLY. Inline Env cast.

type VecIndex = {
  deleteByIds: (ids: string[]) => Promise<{ mutationId?: string; count?: number }>;
};
type Env = { ATLAS_RAG?: VecIndex; DB?: D1Database };

// The known shape of the shared baseline: 14 docs / 81 chunks under 'default'.
const EXPECTED = { docs: 14, chunks: 81 };

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("secret") !== "engineering-30b") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { env } = await getCloudflareContext({ async: true });
  const { ATLAS_RAG, DB } = env as unknown as Env;
  if (!ATLAS_RAG || !DB) {
    return NextResponse.json(
      { error: "bindings_missing", atlas_rag: !!ATLAS_RAG, db: !!DB },
      { status: 500 },
    );
  }

  const dryRun =
    url.searchParams.get("dryRun") === "1" || url.searchParams.get("dry_run") === "1";

  try {
    // 1. Read the OLD baseline partition by its literal old name ('default').
    const { results } = await DB.prepare(
      "SELECT vector_id, doc FROM rag_chunks WHERE tenant_id = ?",
    )
      .bind(DEFAULT_TENANT)
      .all<{ vector_id: string; doc: string }>();
    const rows = results ?? [];

    // 2. Plan the purge (pure helper — count/guard logic is unit-tested).
    const plan = planLibraryMigration(rows, EXPECTED);

    // 3. Dry run: report the plan, delete nothing.
    if (dryRun) {
      return NextResponse.json({
        status: "dryRun",
        tenant_id: DEFAULT_TENANT,
        docs: plan.docs,
        chunkCount: plan.chunkCount,
        matchesExpected: plan.matchesExpected,
        expected: EXPECTED,
        firstVectorIds: plan.vectorIds.slice(0, 3),
        lastVectorIds: plan.vectorIds.slice(-3),
        note: "No deletes performed. Re-run without ?dryRun=1 to purge the old 'default' baseline.",
      });
    }

    // 4a. Idempotent second-run safety: nothing under 'default' → already migrated.
    if (plan.vectorIds.length === 0) {
      return NextResponse.json({
        status: "noop",
        note: "already migrated — no rows under 'default'.",
      });
    }

    // 4b. Delete vectors FIRST, then rows (so no chunk row is orphaned from its vector).
    const vectorResult = await ATLAS_RAG.deleteByIds(plan.vectorIds);
    const batch = await DB.batch([
      DB.prepare("DELETE FROM rag_documents WHERE tenant_id = ?").bind(DEFAULT_TENANT),
      DB.prepare("DELETE FROM rag_chunks WHERE tenant_id = ?").bind(DEFAULT_TENANT),
    ]);

    return NextResponse.json({
      status: "migrated",
      tenant_id: DEFAULT_TENANT,
      vectorsDeleted: plan.vectorIds.length,
      documentsDeleted: batch[0]?.meta?.changes ?? null,
      chunksDeleted: batch[1]?.meta?.changes ?? null,
      matchesExpected: plan.matchesExpected,
      expected: EXPECTED,
      vectorResult,
      note: "Vectorize deletes are async — allow ~10s to settle before re-querying. Re-seed under 'library:standards' via seed-corpus (operational step).",
    });
  } catch (e) {
    return NextResponse.json(
      { error: "migrate_failed", message: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
