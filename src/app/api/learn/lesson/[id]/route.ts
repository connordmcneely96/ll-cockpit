import { createClient } from '@/lib/supabase-server'
import { getBindings } from '@/lib/cloudflare'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  const { id } = await params
  const { DB } = getBindings()
  const node = await DB.prepare(`SELECT id, title, category, content, tags, source, updated_at FROM study_nodes WHERE id = ?`).bind(id).first()
  if (!node) return new Response(JSON.stringify({ ok: false, error: 'Not found' }), { status: 404 })
  const prog = await DB.prepare(`SELECT node_id FROM learn_progress WHERE user_id = ? AND node_id = ?`).bind(user.id, id).first()
  return new Response(JSON.stringify({ ok: true, lesson: node, completed: !!prog }), { headers: { 'Content-Type': 'application/json' } })
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  const { id } = await params
  const { DB } = getBindings()
  const existing = await DB.prepare(`SELECT id FROM learn_progress WHERE user_id = ? AND node_id = ?`).bind(user.id, id).first<{ id: string }>()
  if (existing) {
    await DB.prepare(`DELETE FROM learn_progress WHERE id = ?`).bind(existing.id).run()
    return new Response(JSON.stringify({ ok: true, completed: false }), { headers: { 'Content-Type': 'application/json' } })
  }
  await DB.prepare(`INSERT INTO learn_progress (id, user_id, node_id) VALUES (?, ?, ?)`).bind(crypto.randomUUID(), user.id, id).run()
  return new Response(JSON.stringify({ ok: true, completed: true }), { headers: { 'Content-Type': 'application/json' } })
}
