/**
 * GET /design/preview/[id] — PUBLIC preview URL (no auth)
 *
 * Fetches the latest finalized iteration's HTML from R2 and serves it directly.
 * This is the URL Connor shares with clients.
 *
 * Cache: short (60s) so iteration changes show up quickly without hammering R2.
 */

import { NextRequest } from 'next/server'
import { getBindings } from '@/lib/cloudflare'

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params
  const env = getBindings()

  const iteration = await env.DB
    .prepare(
      `SELECT preview_r2_key FROM design_iterations
         WHERE brief_id = ? AND preview_r2_key IS NOT NULL
         ORDER BY iteration_number DESC LIMIT 1`,
    )
    .bind(id)
    .first<{ preview_r2_key: string }>()

  if (!iteration) {
    return new Response(
      `<!DOCTYPE html><html><head><title>Design Build — Building...</title><meta http-equiv="refresh" content="10"></head><body style="font-family: system-ui; padding: 4rem; max-width: 600px; margin: 0 auto; color: #334155;"><h1>Preview building</h1><p>This design is still being generated. Refresh in a few seconds.</p><p style="color: #94a3b8; font-size: 0.875rem;">Auto-refresh every 10s.</p></body></html>`,
      {
        status: 202,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      },
    )
  }

  const obj = await env.R2.get(iteration.preview_r2_key)
  if (!obj) {
    return new Response('Preview missing from storage', { status: 500 })
  }

  const html = await obj.text()
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // Short cache so iteration agent changes show up quickly. Hard refresh
      // (Cmd/Ctrl+Shift+R) bypasses any cache layer.
      'Cache-Control': 'public, max-age=60, must-revalidate',
    },
  })
}
