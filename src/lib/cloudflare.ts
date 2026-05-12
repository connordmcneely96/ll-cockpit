import type { CloudflareEnv } from '@/types'
import { getCloudflareContext } from '@opennextjs/cloudflare'

/**
 * Returns Cloudflare bindings (D1, KV, R2, secrets) — synchronously.
 *
 * This is what the entire codebase has always called. Reverted from a brief
 * async detour that broke the build.
 */
export function getBindings(): CloudflareEnv {
  return getCloudflareContext().env as unknown as CloudflareEnv
}
