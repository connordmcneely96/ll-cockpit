import { createClient } from '@/lib/supabase-server'
import { getBindings } from '@/lib/cloudflare'

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  const source = new URL(req.url).searchParams.get('source')
  if (!source) return new Response(JSON.stringify({ ok: false, error: 'source required' }), { status: 400 })

  const { DB } = getBindings()
  const result = await DB.prepare(
    `SELECT id, agent_name, substr(input, 1, 120) AS input_preview, tokens_used, cost_usd, created_at
     FROM agent_tasks
     WHERE user_id = ? AND task_type = ? AND status = 'complete' AND output IS NOT NULL
     ORDER BY created_at DESC LIMIT 50`
  ).bind(user.id, source).all()
  return new Response(JSON.stringify({ ok: true, runs: result.results }), { headers: { 'Content-Type': 'application/json' } })
}
