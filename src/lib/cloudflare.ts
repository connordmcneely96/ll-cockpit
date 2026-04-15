import type { CloudflareEnv } from '@/types'
import { getCloudflareContext } from '@opennextjs/cloudflare'

/**
 * Returns Cloudflare bindings (D1, KV, R2, secrets).
 * Uses @opennextjs/cloudflare for Cloudflare Workers deployment.
 */
export function getBindings(): CloudflareEnv {
  return getCloudflareContext().env as CloudflareEnv
}
