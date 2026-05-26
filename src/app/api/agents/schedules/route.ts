import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getBindings } from '@/lib/cloudflare'
import { listSchedules, setSchedule } from '@/lib/agent-schedules'

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const env = getBindings()
  const schedules = await listSchedules(env)

  return new Response(JSON.stringify({ schedules }), {
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const body = await req.json() as {
    agent_name?: string
    cadence_minutes?: number
    enabled?: number
    heartbeat_action?: string
  }

  if (!body.agent_name) {
    return new Response(JSON.stringify({ error: 'agent_name required' }), { status: 400 })
  }

  const env = getBindings()
  await setSchedule(env, body.agent_name, {
    cadence_minutes: body.cadence_minutes,
    enabled: body.enabled,
    heartbeat_action: body.heartbeat_action,
  })

  const schedules = await listSchedules(env)
  const updated = schedules.find((s) => s.agent_name === body.agent_name)

  return new Response(JSON.stringify({ updated }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
