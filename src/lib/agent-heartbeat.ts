import type { CloudflareEnv } from '@/types'
import { reapStuckMessages, routeMessage, processMessage, listMessages, emitMessage } from '@/lib/coordinator'
import { getDueAgents, markAgentRun } from '@/lib/agent-schedules'

const DRAIN_BATCH = 10
const DRAIN_MAX_ITERATIONS = 15

interface HeartbeatSummary {
  agentsRun: string[]
  reaped: { requeued: number; failed: number }
  drained: number
  stalls: number
}

export async function runHeartbeats(env: CloudflareEnv): Promise<HeartbeatSummary> {
  const now = Math.floor(Date.now() / 1000)
  const apiKey = (env as any).ANTHROPIC_API_KEY as string

  const reaped = await reapStuckMessages(env, {})

  const dueAgents = await getDueAgents(env, now)
  const agentsRun: string[] = []
  let totalDrained = 0
  let totalStalls = 0

  for (const schedule of dueAgents) {
    const agentName = schedule.agent_name

    // TODO(145B): if agent over budget, skip + log. For now, proceed.

    const drained = await drainAgentMessages(env, apiKey, agentName)
    totalDrained += drained

    const stalls = await checkStalls(env, agentName, now)
    totalStalls += stalls

    await markAgentRun(env, agentName, now)
    agentsRun.push(agentName)
  }

  return { agentsRun, reaped, drained: totalDrained, stalls: totalStalls }
}

async function drainAgentMessages(
  env: CloudflareEnv,
  apiKey: string,
  agentName: string,
): Promise<number> {
  let drained = 0

  for (let i = 0; i < DRAIN_MAX_ITERATIONS; i++) {
    const queued = await listMessages(env, {
      toAgent: agentName.toUpperCase(),
      status: 'queued',
      limit: DRAIN_BATCH,
    })

    const delivered = await listMessages(env, {
      toAgent: agentName.toUpperCase(),
      status: 'delivered',
      limit: DRAIN_BATCH,
    })

    if (queued.length === 0 && delivered.length === 0) break

    for (const msg of queued) {
      const result = await routeMessage(env, msg.id)
      drained++
      if (result.routed) {
        await processMessage(env, apiKey, msg.id)
      }
    }

    for (const msg of delivered) {
      await processMessage(env, apiKey, msg.id)
      drained++
    }
  }

  return drained
}

async function checkStalls(
  env: CloudflareEnv,
  agentName: string,
  now: number,
): Promise<number> {
  const oneHourAgo = now - 3600

  const stalled = await env.DB.prepare(
    `SELECT id, title, status FROM agent_subtasks
     WHERE agent_name = ?
       AND status IN ('ready', 'pending')
       AND created_at < ?
     ORDER BY created_at ASC
     LIMIT 10`,
  )
    .bind(agentName, oneHourAgo)
    .all<{ id: string; title: string; status: string }>()

  const rows = stalled.results ?? []
  if (rows.length === 0) return 0

  const taskList = rows.map((r) => `${r.id}: ${r.title} (${r.status})`).join('; ')

  await emitMessage(env, {
    userId: 'system',
    fromAgent: agentName.toUpperCase(),
    toAgent: 'NEXUS',
    messageType: 'event',
    subject: `STALL: ${agentName.toUpperCase()} has ${rows.length} stalled task(s)`,
    body: `Agent ${agentName.toUpperCase()} has ${rows.length} task(s) stalled >1h: ${taskList}`,
  })

  return rows.length
}
