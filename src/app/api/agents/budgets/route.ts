import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getBindings } from '@/lib/cloudflare'
import { listBudgets, setBudget } from '@/lib/agent-budgets'

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const env = getBindings()
  const now = Math.floor(Date.now() / 1000)
  const budgets = await listBudgets(env, now)

  return new Response(JSON.stringify({ budgets }), {
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
    period?: string
    limit_usd?: number
    alert_threshold_pct?: number
    hard_stop?: number
    enabled?: number
  }

  if (!body.agent_name) {
    return new Response(JSON.stringify({ error: 'agent_name required' }), { status: 400 })
  }

  const env = getBindings()
  await setBudget(env, body.agent_name, {
    period: body.period,
    limit_usd: body.limit_usd,
    alert_threshold_pct: body.alert_threshold_pct,
    hard_stop: body.hard_stop,
    enabled: body.enabled,
  })

  const now = Math.floor(Date.now() / 1000)
  const budgets = await listBudgets(env, now)
  const updated = budgets.find((b) => b.agent_name === body.agent_name)

  return new Response(JSON.stringify({ updated }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
