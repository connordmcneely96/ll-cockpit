/**
 * POST /api/orchestrator/internal/process-subtask — Sprint 14 v0.2.1 self-tick
 *
 * Each invocation is a fresh Worker request with its own ~30s budget.
 * Architecture:
 *   dispatch (or previous process-subtask)
 *     ↓ ctx.waitUntil(fetch(...))
 *   THIS endpoint:
 *     1. Auth via cookie (same Supabase session as the user — no shared secret needed)
 *     2. Execute ONE subtask synchronously (response returns after work done)
 *     3. ctx.waitUntil: find newly ready subtasks → fire fresh self-fetches for each
 *
 * Why self-fetch instead of an in-Worker wave loop:
 *   - ctx.waitUntil has a ~30s lifetime cap per Worker invocation
 *   - DAGs longer than 30s wall-clock get killed mid-flight
 *   - Each self-fetch is a NEW Worker = fresh 30s budget
 *   - Scales to DAGs of any depth
 */

import { NextRequest } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { createClient } from '@/lib/supabase-server'
import { getBindings } from '@/lib/cloudflare'
import { executeOneSubtask } from '@/lib/orchestrator'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  let body: { subtaskId?: string; runId?: string; force?: boolean }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 })
  }
  const { subtaskId, runId, force } = body
  if (!subtaskId || !runId) {
    return new Response(
      JSON.stringify({ error: 'subtaskId and runId required' }),
      { status: 400 },
    )
  }

  const { DB, ANTHROPIC_API_KEY } = getBindings()
  const apiKey = ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }),
      { status: 500 },
    )
  }

  // ── 1. Execute the assigned subtask synchronously ──
  const result = await executeOneSubtask(DB, apiKey, user.id, subtaskId, { force })

  // ── 2. Find newly ready subtasks and fan out via fresh self-fetches ──
  //     (cascadeReady was already called inside executeOneSubtask)
  const origin = new URL(req.url).origin
  const cookieHeader = req.headers.get('cookie') ?? ''
  const { ctx } = getCloudflareContext()

  ctx.waitUntil(
    (async () => {
      try {
        const readyQuery = force
          ? `SELECT id FROM agent_subtasks WHERE pipeline_run_id = ? AND user_id = ? AND status = 'ready' ORDER BY short_id ASC LIMIT 10`
          : `SELECT id FROM agent_subtasks WHERE pipeline_run_id = ? AND user_id = ? AND status = 'ready' AND human_required = 0 ORDER BY short_id ASC LIMIT 10`

        const newReady = await DB.prepare(readyQuery)
          .bind(runId, user.id)
          .all<{ id: string }>()

        const ids = (newReady.results ?? []).map((r) => r.id)
        if (ids.length === 0) return

        // Fire self-fetches in parallel. Each is a fresh Worker invocation.
        await Promise.all(
          ids.map((id) =>
            fetch(`${origin}/api/orchestrator/internal/process-subtask`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Cookie: cookieHeader,
              },
              body: JSON.stringify({ subtaskId: id, runId, force }),
            }).catch(() => {
              /* best-effort */
            }),
          ),
        )
      } catch {
        /* best-effort; failures surface in D1 status */
      }
    })(),
  )

  return new Response(
    JSON.stringify(
      {
        ok: result.status !== 'failed',
        subtask_id: subtaskId,
        status: result.status,
        cost_usd: result.cost_usd,
        tokens: result.tokens,
        error: result.error,
      },
      null,
      2,
    ),
    { headers: { 'Content-Type': 'application/json' } },
  )
}
