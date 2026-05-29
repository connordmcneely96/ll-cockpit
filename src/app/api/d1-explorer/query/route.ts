import { createClient } from '@/lib/supabase-server'
import { getBindings } from '@/lib/cloudflare'

// SELECT-only guard: defense in depth. Rejects anything that is not a single read query.
function isSafeSelect(raw: string): { ok: boolean; reason?: string } {
  // Strip line + block comments
  const stripped = raw
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .trim()
  if (!stripped) return { ok: false, reason: 'Empty query' }
  // Reject multiple statements (allow a single trailing semicolon only)
  const withoutTrailing = stripped.replace(/;\s*$/, '')
  if (withoutTrailing.includes(';')) return { ok: false, reason: 'Multiple statements are not allowed' }
  // Must begin with SELECT or WITH (CTE)
  if (!/^(select|with)\b/i.test(withoutTrailing)) return { ok: false, reason: 'Only SELECT queries are allowed' }
  // Block write/DDL keywords anywhere (word-boundary)
  const banned = /\b(insert|update|delete|drop|alter|create|replace|truncate|attach|detach|pragma|vacuum|reindex)\b/i
  if (banned.test(withoutTrailing)) return { ok: false, reason: 'Query contains a disallowed keyword' }
  return { ok: true }
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  let body: { sql?: string }
  try { body = await req.json() } catch { return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), { status: 400 }) }
  const sql = (body.sql ?? '').trim()
  if (!sql) return new Response(JSON.stringify({ ok: false, error: 'No SQL provided' }), { status: 400 })

  const guard = isSafeSelect(sql)
  if (!guard.ok) return new Response(JSON.stringify({ ok: false, error: guard.reason }), { status: 400 })

  const { DB } = getBindings()
  try {
    const t0 = Date.now()
    // enforce a row cap by wrapping if not already limited
    const capped = /\blimit\b/i.test(sql.replace(/;\s*$/, '')) ? sql.replace(/;\s*$/, '') : `${sql.replace(/;\s*$/, '')} LIMIT 500`
    const result = await DB.prepare(capped).all()
    return new Response(JSON.stringify({
      ok: true,
      rows: result.results,
      columns: result.results.length ? Object.keys(result.results[0] as object) : [],
      rowCount: result.results.length,
      durationMs: Date.now() - t0,
    }), { headers: { 'Content-Type': 'application/json' } })
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), { status: 500 })
  }
}
