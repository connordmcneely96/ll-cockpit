/**
 * POST /api/orchestrator/internal/process-subtask — Sprint 13 v0.1 routed via LLM Router.
 */

import { NextRequest } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { createClient } from '@/lib/supabase-server'
import { getBindings } from '@/lib/cloudflare'
import { executeOneSubtask } from '@/lib/orchestrator'
import { openGatesForRun } from '@/lib/permission-gate'

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

  const env = getBindings()
  const apiKey = env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }),
      { status: 500 },
    )
  }

  const result = await executeOneSubtask(env, apiKey, user.id, subtaskId, { force })

  const origin = new URL(req.url).origin
  const cookieHeader = req.headers.get('cookie') ?? ''
  const { ctx } = getCloudflareContext()

  ctx.waitUntil(
    (async () => {
      try {
        if (!force) {
          await openGatesForRun(env.DB, user.id, runId)
        }
        const readyQuery = force
          ? `SELECT id FROM agent_subtasks WHERE pipeline_run_id = ? AND user_id = ? AND status = 'ready' ORDER BY short_id ASC LIMIT 10`
          : `SELECT id FROM agent_subtasks WHERE pipeline_run_id = ? AND user_id = ? AND status = 'ready' AND human_required = 0 ORDER BY short_id ASC LIMIT 10`
        const newReady = await env.DB.prepare(readyQuery)
          .bind(runId, user.id)
          .all<{ id: string }>()
        const ids = (newReady.results ?? []).map((r) => r.id)
        if (ids.length === 0) return
        await Promise.all(
          ids.map((id) =>
            fetch(`${origin}/api/orchestrator/internal/process-subtask`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Cookie: cookieHeader,
              },
              body: JSON.stringify({ subtaskId: id, runId, force }),
            }).catch(() => {}),
          ),
        )
      } catch {
        /* best-effort */
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
        model_id: result.modelId,
        error: result.error,
      },
      null,
      2,
    ),
    { headers: { 'Content-Type': 'application/json' } },
  )
}
