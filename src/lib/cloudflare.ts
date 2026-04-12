import type { CloudflareEnv } from '@/types'

/**
 * Returns Cloudflare bindings (D1, KV, R2, secrets).
 * Works with both Cloudflare Pages (@cloudflare/next-on-pages)
 * and Cloudflare Workers (@opennextjs/cloudflare).
 */
export async function getBindings(): Promise<CloudflareEnv> {
  // Pages: @cloudflare/next-on-pages
  try {
    const { getRequestContext } = await import('@cloudflare/next-on-pages')
    return getRequestContext().env as CloudflareEnv
  } catch {}

  // Workers: @opennextjs/cloudflare
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare')
    const ctx = await getCloudflareContext({ async: true })
    return ctx.env as CloudflareEnv
  } catch {}

  // Local dev fallback
  return process.env as unknown as CloudflareEnv
}
