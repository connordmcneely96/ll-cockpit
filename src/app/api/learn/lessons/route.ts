import { createClient } from '@/lib/supabase-server'
import { getBindings } from '@/lib/cloudflare'

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  const category = new URL(req.url).searchParams.get('category')
  if (!category) return new Response(JSON.stringify({ ok: false, error: 'category required' }), { status: 400 })

  const { DB } = getBindings()
  const lessons = await DB.prepare(
    `SELECT s.id, s.title, s.tags, length(s.content) AS len,
       CASE WHEN p.node_id IS NOT NULL THEN 1 ELSE 0 END AS completed
     FROM study_nodes s
     LEFT JOIN learn_progress p ON p.node_id = s.id AND p.user_id = ?
     WHERE s.category = ? ORDER BY s.updated_at DESC`
  ).bind(user.id, category).all()
  return new Response(JSON.stringify({ ok: true, lessons: lessons.results }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
