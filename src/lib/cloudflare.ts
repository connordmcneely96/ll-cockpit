import type { CloudflareEnv } from '@/types'
import { getCloudflareContext } from '@opennextjs/cloudflare'

/**
 * Returns Cloudflare bindings (D1, KV, R2, secrets) synchronously.
 *
 * In @opennextjs/cloudflare v1.x, plain getCloudflareContext() is async-only and
 * will throw when called sync in a Next.js route handler. We must opt out of the
 * default behavior with the synchronous flag.
 *
 * This is safe to call inside a route handler — by the time the handler runs,
 * the context has been initialized by the OpenNext runtime.
 */
export function getBindings(): CloudflareEnv {
  // getCloudflareContext({ async: false }) returns sync context if available.
  // If a future version drops sync entirely, switch callers to `await getBindings()`.
  return getCloudflareContext().env as unknown as CloudflareEnv
}
