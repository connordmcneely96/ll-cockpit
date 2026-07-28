// Opt-in standards-library subscriptions (S1b-1).
//
// Resolves the library partitions a tenant has EXPLICITLY subscribed to, so retrieval can
// union them into the tenant's query set. This is the only sanctioned cross-tenant read.
//
// FAIL-CLOSED is the whole point: an unresolved subscription (no rows, empty tenant, or a
// D1 error) yields NO libraries — never all, never a wildcard, and never a thrown error
// that a caller might paper over. Losing library access is the safe failure; gaining it
// requires an explicit row in tenant_library_subscriptions.
//
// D1Database is a global type in this project — do NOT import it (matches tool-loop.ts).

export async function resolveSubscribedLibraries(db: D1Database, tenantId: string): Promise<string[]> {
  if (!tenantId) return [];
  try {
    const { results } = await db
      .prepare("SELECT library_tenant_id FROM tenant_library_subscriptions WHERE tenant_id = ?")
      .bind(tenantId)
      .all<{ library_tenant_id: string }>();
    return (results ?? []).map(r => r.library_tenant_id).filter(Boolean);
  } catch {
    return []; // FAIL-CLOSED: no libraries on error, NEVER all, NEVER throw.
  }
}
