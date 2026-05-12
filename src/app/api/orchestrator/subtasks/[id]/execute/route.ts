/**
 * POST /api/orchestrator/subtasks/[id]/execute — Sprint 13 v0.1 routed via LLM Router.
 */

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getBindings } from '@/lib/cloudflare'
import { executeOneSubtask } from '@/lib/orchestrator'

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const { id } = await ctx.params
  const url = new URL(req.url)
  const force = url.searchParams.get('force') === 'true'

  const env = getBindings()
  const apiKey = env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }),
      { status: 500 },
    )
  }

  const result = await executeOneSubtask(env, apiKey, user.id, id, { force })

  const statusCode =
    result.status === 'failed'
      ? 502
      : result.status === 'skipped'
      ? 409
      : 200

  return new Response(JSON.stringify(result, null, 2), {
    status: statusCode,
    headers: { 'Content-Type': 'application/json' },
  })
}
