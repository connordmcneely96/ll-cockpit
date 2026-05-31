import { createClient } from '@/lib/supabase-server'
import { getBindings } from '@/lib/cloudflare'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  const { DB } = getBindings()
  const tracks = await DB.prepare(
    `SELECT category, COUNT(*) AS total FROM study_nodes GROUP BY category ORDER BY total DESC`
  ).all<{ category: string; total: number }>()

  const done = await DB.prepare(
    `SELECT COUNT(*) AS n FROM learn_progress WHERE user_id = ?`
  ).bind(user.id).first<{ n: number }>()

  return new Response(JSON.stringify({ ok: true, tracks: tracks.results, completed: done?.n ?? 0 }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
