import { createClient } from '@/lib/supabase-server'
import { getBindings } from '@/lib/cloudflare'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  const { id } = await params
  const { DB } = getBindings()
  const run = await DB.prepare(
    `SELECT id, agent_name, task_type, input, output, tokens_used, cost_usd, created_at
     FROM agent_tasks WHERE id = ? AND user_id = ?`
  ).bind(id, user.id).first()
  if (!run) return new Response(JSON.stringify({ ok: false, error: 'Not found' }), { status: 404 })
  return new Response(JSON.stringify({ ok: true, run }), { headers: { 'Content-Type': 'application/json' } })
}
