// Tenant resolution for corpus isolation.
//
// A tenant is the unit of data isolation for the ATLAS RAG corpus (and any other
// tenant-derived content). It is the authenticated user's identity. There is NO
// silent fallback to a shared tenant — a silent fallback is exactly the data-privacy
// bug this module exists to prevent. Callers that genuinely have no user context
// (background jobs, system seeding) must reach for systemTenantId() explicitly.

// The library partition: the PE-transcribed standards baseline. This is the opt-in
// corpus every subscriber reads — a NAMED tenant, distinct from the legacy catch-all.
export const LIBRARY_TENANT = 'library:standards'

// The fail-closed non-value / legacy catch-all. Still names the old 'default' partition
// (0064 backfilled artifact_registry rows here). NOT the standards library — do not
// repurpose it as such.
export const DEFAULT_TENANT = 'default'

export interface TenantContext {
  /** The authenticated user's id (e.g. Supabase user.id). */
  userId?: string | null
}

/**
 * Resolve the tenant for a request from its authenticated identity.
 *
 * FAIL-CLOSED: if no identity is available, this THROWS 'tenant_unresolved' — it
 * never returns DEFAULT_TENANT. A route that cannot resolve a tenant must refuse
 * the request (401/400), never proceed against a shared partition.
 */
export function resolveTenantId(ctx: TenantContext): string {
  const id = ctx?.userId
  if (typeof id === 'string' && id.trim().length > 0) return id.trim()
  throw new Error('tenant_unresolved')
}

/**
 * The standards LIBRARY partition — the opt-in baseline corpus every subscriber reads.
 * Use ONLY where there is genuinely no user context: seeding the shared PE-transcribed
 * standards baseline, or a secret-gated diagnostic over that same index. It NO LONGER
 * names the legacy 'default' catch-all (see DEFAULT_TENANT) — the library has its own
 * name so a future subscription can never silently read the catch-all alongside it.
 * Every call site must be justified: it writes/reads the shared library, not a user's.
 */
export function systemTenantId(): string {
  return LIBRARY_TENANT
}
