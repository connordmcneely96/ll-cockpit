/**
 * GET  /api/chats          — list user's chats (optional agent filter)
 */

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getBindings } from '@/lib/cloudflare'
import { listChats } from '@/lib/agent-chat'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const { DB } = getBindings()
  const url = new URL(req.url)
  const agentName = url.searchParams.get('agent') ?? undefined
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200)

  const chats = await listChats(DB, user.id, { agentName, limit })
  return new Response(JSON.stringify({ chats }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
