import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createClient } from "@/lib/supabase-server";
import { resolveTenantId } from "@/lib/tenant";
import { listSubscriptions, subscribe, unsubscribe } from "@/lib/atlas/subscriptions";

// Authed subscription management (GET/POST/DELETE). The subscriber tenant ALWAYS comes from
// the Supabase session (S2) — a `tenant_id` field in the request is never read, so a caller
// can only manage THEIR OWN subscriptions. Auth mirrors /api/atlas/query.
//
// Body is hand-validated: this repo intentionally does NOT depend on `zod` (it typechecks in
// the editor but isn't in package.json, so webpack can't resolve it at build — see
// query/route.ts). Plain validation gives the same 400-on-bad-body guarantee, zero new deps.
// getCloudflareContext from @opennextjs/cloudflare ONLY (Lesson 12).

type Env = { DB?: D1Database };

export const dynamic = "force-dynamic";

// Resolve the authenticated tenant + DB binding, or a ready-to-return error response.
async function authed(): Promise<{ tenantId: string; DB: D1Database } | NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let tenantId: string;
  try {
    tenantId = resolveTenantId({ userId: user?.id });
  } catch {
    return NextResponse.json({ error: "tenant_unresolved", detail: "authentication required" }, { status: 401 });
  }
  const { env } = await getCloudflareContext({ async: true });
  const { DB } = env as unknown as Env;
  if (!DB) return NextResponse.json({ error: "bindings_missing", db: false }, { status: 500 });
  return { tenantId, DB };
}

// Read ONLY library_tenant_id from the body. Any tenant_id field is ignored by construction.
function parseLibraryBody(raw: unknown): { ok: true; library_tenant_id: string } | { ok: false; error: string } {
  if (typeof raw !== "object" || raw === null) return { ok: false, error: "body must be a JSON object" };
  const r = raw as Record<string, unknown>;
  if (typeof r.library_tenant_id !== "string" || r.library_tenant_id.trim().length < 1) {
    return { ok: false, error: "library_tenant_id is required and must be a non-empty string" };
  }
  return { ok: true, library_tenant_id: r.library_tenant_id.trim() };
}

export async function GET() {
  const a = await authed();
  if (a instanceof NextResponse) return a;
  return NextResponse.json({ subscriptions: await listSubscriptions(a.DB, a.tenantId) });
}

export async function POST(req: NextRequest) {
  const a = await authed();
  if (a instanceof NextResponse) return a;

  let libraryTenantId: string;
  try {
    const parsed = parseLibraryBody(await req.json());
    if (!parsed.ok) return NextResponse.json({ error: "invalid_body", detail: parsed.error }, { status: 400 });
    libraryTenantId = parsed.library_tenant_id;
  } catch (e) {
    return NextResponse.json({ error: "invalid_body", detail: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }

  const result = await subscribe(a.DB, a.tenantId, libraryTenantId);
  if (!result.ok) {
    const status = result.reason === "tenant_unresolved" ? 401
      : result.reason === "not_a_subscribable_library" ? 400
      : 500;
    return NextResponse.json({ error: result.reason }, { status });
  }
  return NextResponse.json({ subscriptions: await listSubscriptions(a.DB, a.tenantId) });
}

export async function DELETE(req: NextRequest) {
  const a = await authed();
  if (a instanceof NextResponse) return a;

  // Accept library_tenant_id from the query string or the body.
  let libraryTenantId = new URL(req.url).searchParams.get("library_tenant_id")?.trim() ?? "";
  if (!libraryTenantId) {
    try {
      const parsed = parseLibraryBody(await req.json());
      if (parsed.ok) libraryTenantId = parsed.library_tenant_id;
    } catch {
      // No parseable body — fall through to the required-field check below.
    }
  }
  if (!libraryTenantId) {
    return NextResponse.json({ error: "invalid_body", detail: "library_tenant_id required" }, { status: 400 });
  }

  await unsubscribe(a.DB, a.tenantId, libraryTenantId);
  return NextResponse.json({ subscriptions: await listSubscriptions(a.DB, a.tenantId) });
}
