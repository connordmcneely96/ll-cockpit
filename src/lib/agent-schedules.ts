import type { CloudflareEnv } from '@/types'

export interface AgentScheduleRow {
  agent_name: string
  cadence_minutes: number
  enabled: number
  heartbeat_action: string | null
  last_run_at: number | null
  next_run_at: number | null
  created_at: number
  updated_at: number
}

export async function getDueAgents(
  env: CloudflareEnv,
  now: number,
): Promise<AgentScheduleRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT * FROM agent_schedules
     WHERE enabled = 1
       AND (next_run_at IS NULL OR next_run_at <= ?)
     ORDER BY next_run_at ASC`,
  )
    .bind(now)
    .all<AgentScheduleRow>()
  return results ?? []
}

export async function markAgentRun(
  env: CloudflareEnv,
  agentName: string,
  now: number,
): Promise<void> {
  await env.DB.prepare(
    `UPDATE agent_schedules
     SET last_run_at = ?, next_run_at = ? + (cadence_minutes * 60), updated_at = ?
     WHERE agent_name = ?`,
  )
    .bind(now, now, now, agentName)
    .run()
}

export async function listSchedules(
  env: CloudflareEnv,
): Promise<AgentScheduleRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT * FROM agent_schedules ORDER BY agent_name ASC`,
  ).all<AgentScheduleRow>()
  return results ?? []
}

export async function setSchedule(
  env: CloudflareEnv,
  agentName: string,
  updates: { cadence_minutes?: number; enabled?: number; heartbeat_action?: string },
): Promise<void> {
  const now = Math.floor(Date.now() / 1000)
  const sets: string[] = ['updated_at = ?']
  const bindings: (string | number)[] = [now]

  if (updates.cadence_minutes !== undefined) {
    sets.push('cadence_minutes = ?')
    bindings.push(updates.cadence_minutes)
  }
  if (updates.enabled !== undefined) {
    sets.push('enabled = ?')
    bindings.push(updates.enabled)
  }
  if (updates.heartbeat_action !== undefined) {
    sets.push('heartbeat_action = ?')
    bindings.push(updates.heartbeat_action)
  }

  bindings.push(agentName)
  await env.DB.prepare(
    `UPDATE agent_schedules SET ${sets.join(', ')} WHERE agent_name = ?`,
  )
    .bind(...bindings)
    .run()
}
