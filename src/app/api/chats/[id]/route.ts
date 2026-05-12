/**
 * GET    /api/chats/[id]   — fetch chat + ordered messages
 * DELETE /api/chats/[id]   — delete chat + cascade messages
 */

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getBindings } from '@/lib/cloudflare'
import { getChatWithMessages, deleteChat } from '@/lib/agent-chat'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const { id } = await params
  const { DB } = await getBindings()
  const result = await getChatWithMessages(DB, id, user.id)
  if (!result) {
    return new Response(JSON.stringify({ error: 'Chat not found' }), { status: 404 })
  }

  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const { id } = await params
  const { DB } = await getBindings()
  const result = await deleteChat(DB, id, user.id)
  if (!result.deleted) {
    return new Response(JSON.stringify({ error: 'Chat not found' }), { status: 404 })
  }
  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json' },
  })
}
