import type { CloudflareEnv } from '@/types'
import { getCloudflareContext } from '@opennextjs/cloudflare'

/**
 * Returns Cloudflare bindings (D1, KV, R2, secrets).
 *
 * In @opennextjs/cloudflare v1.x, getCloudflareContext() became async by default.
 * The sync form throws when there's no global cache. We use `{ async: true }` and
 * await it. Callers that use this with `const { DB } = getBindings()` (no await)
 * will get a Promise destructured incorrectly — fixed by getBindingsSync helper
 * that does runtime fallback for legacy callers.
 *
 * NEW CODE: prefer `await getBindings()`.
 * LEGACY CODE: `getBindingsSync()` still works using getCloudflareContext({ async: false }).
 */
export async function getBindings(): Promise<CloudflareEnv> {
  const ctx = await getCloudflareContext({ async: true })
  return ctx.env as unknown as CloudflareEnv
}

/**
 * Synchronous accessor — only safe when the cloudflare context has already been
 * initialized (i.e. during a request, after middleware has run). This is what
 * older route handlers call. Wraps getCloudflareContext with the sync signature.
 */
export function getBindingsSync(): CloudflareEnv {
  return getCloudflareContext().env as unknown as CloudflareEnv
}
