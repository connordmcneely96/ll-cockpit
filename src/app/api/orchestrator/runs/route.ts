/**
 * GET /api/orchestrator/runs — list user's recent orchestrator runs
 * Query: ?limit=20&status=running
 */

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getBindings } from '@/lib/cloudflare'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const { DB } = await getBindings()
  const url = new URL(req.url)
  const status = url.searchParams.get('status')
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 30), 100)

  let sql = `SELECT * FROM orchestrator_runs WHERE user_id = ?`
  const params: unknown[] = [user.id]
  if (status) {
    sql += ` AND status = ?`
    params.push(status)
  }
  sql += ` ORDER BY started_at DESC LIMIT ?`
  params.push(limit)

  const rows = await DB.prepare(sql)
    .bind(...params)
    .all()
  return new Response(JSON.stringify({ runs: rows.results ?? [] }, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  })
}
