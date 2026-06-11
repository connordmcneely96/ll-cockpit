/**
 * POST /api/orchestrator/approvals/[id] — resolve a pending approval gate.
 * Body: { decision: 'approve' | 'reject', notes?: string, surface?: string }
 * approve -> subtask 'ready' + resume the wave; reject -> subtask 'cancelled'.
 * Sprint 7 · PermissionGate (Option B). Surface-agnostic (web + Telegram).
 */

import { NextRequest } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { createClient } from '@/lib/supabase-server'
import { getBindings } from '@/lib/cloudflare'
import { resolveGate } from '@/lib/permission-gate'

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

  let body: { decision?: string; notes?: string; surface?: string }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 })
  }

  const decision = body.decision
  if (decision !== 'approve' && decision !== 'reject') {
    return new Response(
      JSON.stringify({ error: "decision must be 'approve' or 'reject'" }),
      { status: 400 },
    )
  }

  const { DB } = getBindings()
  const result = await resolveGate(DB, user.id, id, decision, {
    notes: body.notes,
    resolvedBy: user.id,
    surface: body.surface ?? 'web',
  })

  if (!result.ok) {
    const status = result.error === 'not_found' ? 404 : 409
    return new Response(JSON.stringify(result), { status })
  }

  // On approve, resume the wave by re-dispatching the now-ready subtask.
  // force:true is correct here — the human approval IS the authorization to run.
  if (decision === 'approve' && result.subtaskId && result.runId) {
    const origin = new URL(req.url).origin
    const cookieHeader = req.headers.get('cookie') ?? ''
    const { ctx: cfCtx } = getCloudflareContext()
    cfCtx.waitUntil(
      fetch(`${origin}/api/orchestrator/internal/process-subtask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
        body: JSON.stringify({
          subtaskId: result.subtaskId,
          runId: result.runId,
          force: true,
        }),
      }).catch(() => {}),
    )
  }

  return new Response(JSON.stringify(result, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  })
}
