// Tenant resolution for corpus isolation.
//
// A tenant is the unit of data isolation for the ATLAS RAG corpus (and any other
// tenant-derived content). It is the authenticated user's identity. There is NO
// silent fallback to a shared tenant — a silent fallback is exactly the data-privacy
// bug this module exists to prevent. Callers that genuinely have no user context
// (background jobs, system seeding) must reach for systemTenantId() explicitly.

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
 * The system/legacy tenant. Use ONLY where there is genuinely no user context — a
 * background job or the seeding of the shared baseline corpus. Every call site must
 * be justified: it writes/reads the shared 'default' partition, not a user's.
 */
export function systemTenantId(): string {
  return DEFAULT_TENANT
}
