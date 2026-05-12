/**
 * GET /api/oracle/items — list recent items from research_queue for history view.
 *
 * Query params:
 *   limit (default 50, max 200)
 *   status (optional: pending | summarized | embedded | failed)
 */

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getBindings } from '@/lib/cloudflare'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const { DB } = getBindings()
  const url = new URL(req.url)
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200)
  const status = url.searchParams.get('status')

  let sql = `SELECT id, source_id, external_id, title, url, status, relevance_score,
             collected_at, processed_at, error_log
             FROM research_queue`
  const params: unknown[] = []
  if (status) {
    sql += ` WHERE status = ?`
    params.push(status)
  }
  sql += ` ORDER BY collected_at DESC LIMIT ?`
  params.push(limit)

  const rows = await DB.prepare(sql).bind(...params).all()
  return new Response(JSON.stringify({ items: rows.results ?? [] }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
