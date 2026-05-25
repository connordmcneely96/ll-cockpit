import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getBindings } from '@/lib/cloudflare'
import { cascadeGoal, type OrgDepartment } from '@/lib/goal-cascade'

const VALID_DEPARTMENTS = new Set<OrgDepartment>([
  'executive', 'growth', 'engineering', 'delivery', 'qa',
])

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { goal?: string; department?: string; conversationId?: string }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const goal = (body.goal ?? '').trim()
  if (!goal) {
    return NextResponse.json({ error: 'goal is required' }, { status: 400 })
  }
  if (goal.length > 4000) {
    return NextResponse.json({ error: 'goal too long (max 4000 chars)' }, { status: 400 })
  }

  const department = (body.department ?? '') as OrgDepartment
  if (!VALID_DEPARTMENTS.has(department)) {
    return NextResponse.json(
      { error: `department must be one of: ${[...VALID_DEPARTMENTS].join(', ')}` },
      { status: 400 },
    )
  }

  const env = getBindings()
  const apiKey = env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })
  }

  try {
    const result = await cascadeGoal(env, apiKey, {
      userId: user.id,
      goal,
      department,
      conversationId: body.conversationId,
    })
    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: 'cascade failed', detail: msg }, { status: 502 })
  }
}
