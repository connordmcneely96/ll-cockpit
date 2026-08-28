import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createClient } from "@/lib/supabase-server";
import { resolveTenantId } from "@/lib/tenant";
import { listSubscribableLibraries, listSubscriptions } from "@/lib/atlas/subscriptions";

// Authed onboarding read: which libraries a tenant may subscribe to, and which they already
// have. Auth mirrors /api/atlas/query — tenant ALWAYS from the Supabase session (S2), never
// the request. getCloudflareContext from @opennextjs/cloudflare ONLY (Lesson 12).

type Env = { DB?: D1Database };

export const dynamic = "force-dynamic";

export async function GET() {
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

  return NextResponse.json({
    libraries: await listSubscribableLibraries(DB),
    subscribed: await listSubscriptions(DB, tenantId),
  });
}
