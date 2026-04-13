import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getBindings } from '@/lib/cloudflare'

export const runtime = 'edge'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { toolCallId: string; taskId: string; approved: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { toolCallId, taskId, approved } = body
  if (!toolCallId) {
    return NextResponse.json({ error: 'toolCallId required' }, { status: 400 })
  }

  const { DB } = getBindings()

  try {
    // Log the approval/rejection
    await DB.prepare(
      `INSERT INTO tool_calls (id, task_id, user_id, tool_name, user_approved, created_at)
       VALUES (?, ?, ?, ?, ?, unixepoch())
       ON CONFLICT(id) DO UPDATE SET user_approved = excluded.user_approved`
    )
      .bind(toolCallId, taskId ?? null, user.id, 'permission_gate', approved ? 1 : 0)
      .run()

    return NextResponse.json({ ok: true, approved })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'DB error' },
      { status: 500 }
    )
  }
}
