import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getBindings } from '@/lib/cloudflare'

export const runtime = 'edge'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const agentName = searchParams.get('agent')

  const { DB } = await getBindings()

  const query = agentName
    ? DB.prepare(
        'SELECT * FROM agent_sessions WHERE user_id = ? AND agent_name = ? ORDER BY created_at DESC LIMIT 20'
      ).bind(user.id, agentName)
    : DB.prepare(
        'SELECT * FROM agent_sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 50'
      ).bind(user.id)

  const { results } = await query.all()
  return NextResponse.json({ sessions: results })
}
