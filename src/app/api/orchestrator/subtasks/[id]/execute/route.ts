/**
 * POST /api/orchestrator/subtasks/[id]/execute — Sprint 14 v0.2
 *
 * Thin wrapper around executeOneSubtask from src/lib/orchestrator.ts.
 * Used by the UI for manual execution (and Force Execute on HITL subtasks).
 *
 * Query: ?force=true bypasses HITL check.
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

  const { DB, ANTHROPIC_API_KEY } = getBindings()
  const apiKey = ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }),
      { status: 500 },
    )
  }

  const result = await executeOneSubtask(DB, apiKey, user.id, id, { force })

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
