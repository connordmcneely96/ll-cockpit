import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { CloudflareEnv } from '@/types'

/**
 * Returns Cloudflare bindings (D1, KV, R2, secrets).
 * Works in both production (Workers) and local dev (wrangler dev).
 */
export async function getBindings(): Promise<CloudflareEnv> {
  const ctx = await getCloudflareContext({ async: true })
  return ctx.env as CloudflareEnv
}
