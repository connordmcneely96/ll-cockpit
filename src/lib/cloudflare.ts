import type { CloudflareEnv } from '@/types'
import { getCloudflareContext } from '@opennextjs/cloudflare'

/**
 * Returns Cloudflare bindings (D1, KV, R2, secrets) — ASYNC.
 *
 * In @opennextjs/cloudflare v1.x, getCloudflareContext() is async-only.
 * Callers MUST await this: `const { DB } = await getBindings()`.
 *
 * Legacy non-awaited callers will get a Promise and crash on destructure.
 * Migration: every route that imports getBindings has been updated to await.
 */
export async function getBindings(): Promise<CloudflareEnv> {
  const ctx = await getCloudflareContext({ async: true })
  return ctx.env as unknown as CloudflareEnv
}
