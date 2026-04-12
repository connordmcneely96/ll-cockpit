import type { CloudflareEnv } from '@/types'
import { getRequestContext } from '@cloudflare/next-on-pages'

/**
 * Returns Cloudflare bindings (D1, KV, R2, secrets).
 * Uses @cloudflare/next-on-pages for Cloudflare Pages deployment.
 */
export function getBindings(): CloudflareEnv {
  return getRequestContext().env as CloudflareEnv
}
