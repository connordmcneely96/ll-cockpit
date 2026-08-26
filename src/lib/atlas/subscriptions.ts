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

/**
 * List the current subscriptions for a tenant. Same read as resolveSubscribedLibraries —
 * kept as a distinct name for the onboarding/API surface, delegating so the body never drifts.
 */
export async function listSubscriptions(db: D1Database, tenantId: string): Promise<string[]> {
  return resolveSubscribedLibraries(db, tenantId);
}

/**
 * Is `libraryTenantId` a partition a tenant is ALLOWED to subscribe to?
 *
 * The /^library:/ prefix is the cross-tenant boundary: real tenants are uuids and can never
 * match it, so this can never authorize reading another tenant's private partition. The gate
 * is checked BEFORE any query — a non-library id is rejected without touching the DB. Then it
 * must actually exist in rag_documents. Fail-closed to false on any error.
 */
export async function isSubscribableLibrary(db: D1Database, libraryTenantId: string): Promise<boolean> {
  if (!/^library:/.test(libraryTenantId)) return false;
  try {
    const row = await db
      .prepare("SELECT 1 FROM rag_documents WHERE tenant_id = ? LIMIT 1")
      .bind(libraryTenantId)
      .first();
    return row != null;
  } catch {
    return false;
  }
}

/**
 * List every subscribable library (a `library:%` partition present in rag_documents) with its
 * distinct-doc count, so the onboarding UI can show what's on offer. Fail-closed to [].
 */
export async function listSubscribableLibraries(
  db: D1Database,
): Promise<{ library_tenant_id: string; doc_count: number }[]> {
  try {
    const { results } = await db
      .prepare(
        "SELECT tenant_id AS library_tenant_id, COUNT(DISTINCT doc) AS doc_count FROM rag_documents WHERE tenant_id LIKE 'library:%' GROUP BY tenant_id",
      )
      .all<{ library_tenant_id: string; doc_count: number }>();
    return (results ?? []).map((r) => ({
      library_tenant_id: r.library_tenant_id,
      doc_count: Number(r.doc_count),
    }));
  } catch {
    return [];
  }
}

/**
 * Subscribe the AUTHENTICATED tenant to a library. tenantId MUST come from the session, never
 * the request — a caller can only ever manage their own subscriptions. Rejects a non-library
 * or non-existent target (S1). Idempotent via the PK (INSERT OR IGNORE). Fail-closed.
 */
export async function subscribe(
  db: D1Database,
  tenantId: string,
  libraryTenantId: string,
): Promise<{ ok: boolean; reason?: string }> {
  if (!tenantId) return { ok: false, reason: "tenant_unresolved" };
  if (!(await isSubscribableLibrary(db, libraryTenantId))) {
    return { ok: false, reason: "not_a_subscribable_library" };
  }
  try {
    await db
      .prepare("INSERT OR IGNORE INTO tenant_library_subscriptions (tenant_id, library_tenant_id) VALUES (?, ?)")
      .bind(tenantId, libraryTenantId)
      .run();
    return { ok: true };
  } catch {
    return { ok: false, reason: "write_failed" };
  }
}

/**
 * Unsubscribe the AUTHENTICATED tenant from a library. The DELETE is ALWAYS scoped to the
 * caller's tenant_id, so it can never remove another tenant's subscription. Fail-closed.
 */
export async function unsubscribe(
  db: D1Database,
  tenantId: string,
  libraryTenantId: string,
): Promise<{ ok: boolean }> {
  try {
    await db
      .prepare("DELETE FROM tenant_library_subscriptions WHERE tenant_id = ? AND library_tenant_id = ?")
      .bind(tenantId, libraryTenantId)
      .run();
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
