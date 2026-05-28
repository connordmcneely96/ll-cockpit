/**
 * POST /api/coordinator/drain
 *
 * Synchronous v1 driver — drains the agent_messages queue for the
 * authenticated user. Each iteration picks up to N queued/delivered
 * messages, advances them through routeMessage → processMessage, and
 * loops until no queued or delivered messages remain.
 *
 * Max-iteration cap (default 25) prevents infinite loops if a handler
 * emits a new message on every pass (e.g. a response message that is
 * itself a 'request' triggering another DAG run). Cron-driven autonomy
 * is deferred to Sprint 145C.
 */

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getBindings } from '@/lib/cloudflare'
import { routeMessage, processMessage, listMessages } from '@/lib/coordinator'

const BATCH_SIZE = 10
const MAX_ITERATIONS = 25

export async function POST(_req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const env = getBindings()
  const apiKey = env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }),
      { status: 500 },
    )
  }

  let totalDrained = 0
  const byStatus: Record<string, number> = {}
  const dagRuns: string[] = []

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    // Pick queued messages for this user
    const queued = await env.DB.prepare(
      `SELECT id FROM agent_messages
       WHERE user_id = ? AND status = 'queued'
       ORDER BY priority ASC, created_at ASC
       LIMIT ?`,
    )
      .bind(user.id, BATCH_SIZE)
      .all<{ id: string }>()

    // Pick delivered messages for this user
    const delivered = await env.DB.prepare(
      `SELECT id FROM agent_messages
       WHERE user_id = ? AND status = 'delivered'
       ORDER BY priority ASC, created_at ASC
       LIMIT ?`,
    )
      .bind(user.id, BATCH_SIZE)
      .all<{ id: string }>()

    const queuedIds = (queued.results ?? []).map((r) => r.id)
    const deliveredIds = (delivered.results ?? []).map((r) => r.id)

    if (queuedIds.length === 0 && deliveredIds.length === 0) break

    // Route queued → delivered (or dropped)
    for (const id of queuedIds) {
      const result = await routeMessage(env, id)
      const status = result.status ?? (result.routed ? 'delivered' : 'dropped')
      byStatus[status] = (byStatus[status] ?? 0) + 1
      totalDrained++

      // If routing delivered it, process immediately in this iteration
      if (result.routed) {
        const pr = await processMessage(env, apiKey, id)
        const finalStatus = pr.status ?? (pr.processed ? 'done' : 'failed')
        byStatus[finalStatus] = (byStatus[finalStatus] ?? 0) + 1
        if (pr.dagRunId) dagRuns.push(pr.dagRunId)
      }
    }

    // Process any already-delivered messages (from previous iterations or
    // messages that arrived in delivered state)
    for (const id of deliveredIds) {
      const pr = await processMessage(env, apiKey, id)
      const finalStatus = pr.status ?? (pr.processed ? 'done' : 'failed')
      byStatus[finalStatus] = (byStatus[finalStatus] ?? 0) + 1
      totalDrained++
      if (pr.dagRunId) dagRuns.push(pr.dagRunId)
    }
  }

  return new Response(
    JSON.stringify({ drained: totalDrained, by_status: byStatus, dag_runs: dagRuns }),
    { headers: { 'Content-Type': 'application/json' } },
  )
}
