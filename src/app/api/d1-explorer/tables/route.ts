import { createClient } from '@/lib/supabase-server'
import { getBindings } from '@/lib/cloudflare'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  const { DB } = getBindings()
  const result = await DB.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name ASC`
  ).all<{ name: string }>()
  return new Response(JSON.stringify({ ok: true, tables: result.results.map(t => t.name) }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
