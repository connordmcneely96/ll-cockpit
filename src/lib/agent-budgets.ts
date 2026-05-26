import type { CloudflareEnv } from '@/types'

export interface AgentBudgetRow {
  agent_name: string
  period: 'daily' | 'monthly' | 'all_time'
  limit_usd: number
  alert_threshold_pct: number
  hard_stop: number
  enabled: number
  created_at: number
  updated_at: number
}

export interface BudgetCheck {
  enforced: boolean
  overLimit: boolean
  overThreshold: boolean
  hardStop: boolean
  spent: number
  limit_usd: number
  pct: number
}

const NOT_ENFORCED: BudgetCheck = {
  enforced: false,
  overLimit: false,
  overThreshold: false,
  hardStop: false,
  spent: 0,
  limit_usd: 0,
  pct: 0,
}

// UTC day boundary in unix seconds
export function dayStartUnix(now: number): number {
  return now - (now % 86400)
}

function monthStartUnix(now: number): number {
  const d = new Date(now * 1000)
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000)
}

export async function getSpend(
  env: CloudflareEnv,
  agentName: string,
  period: string,
  now: number,
): Promise<number> {
  let sql: string
  let bindings: (string | number)[]

  if (period === 'all_time') {
    sql = `SELECT COALESCE(SUM(cost_usd), 0) AS total FROM agent_subtasks WHERE agent_name = ?`
    bindings = [agentName]
  } else if (period === 'monthly') {
    const boundary = monthStartUnix(now)
    sql = `SELECT COALESCE(SUM(cost_usd), 0) AS total FROM agent_subtasks WHERE agent_name = ? AND created_at >= ?`
    bindings = [agentName, boundary]
  } else {
    const boundary = dayStartUnix(now)
    sql = `SELECT COALESCE(SUM(cost_usd), 0) AS total FROM agent_subtasks WHERE agent_name = ? AND created_at >= ?`
    bindings = [agentName, boundary]
  }

  const row = await env.DB.prepare(sql).bind(...bindings).first<{ total: number }>()
  return row?.total ?? 0
}

export async function checkBudget(
  env: CloudflareEnv,
  agentName: string,
  now: number,
): Promise<BudgetCheck> {
  const budget = await env.DB.prepare(
    `SELECT * FROM agent_budgets WHERE agent_name = ?`,
  )
    .bind(agentName)
    .first<AgentBudgetRow>()

  if (!budget || !budget.enabled) return NOT_ENFORCED

  const spent = await getSpend(env, agentName, budget.period, now)
  const pct = budget.limit_usd > 0 ? (spent / budget.limit_usd) * 100 : 0
  const thresholdUsd = (budget.limit_usd * budget.alert_threshold_pct) / 100

  return {
    enforced: true,
    spent,
    limit_usd: budget.limit_usd,
    pct,
    overLimit: spent >= budget.limit_usd,
    overThreshold: spent >= thresholdUsd,
    hardStop: budget.hard_stop === 1,
  }
}

export async function listBudgets(
  env: CloudflareEnv,
  now: number,
): Promise<(AgentBudgetRow & { spent: number; pct: number })[]> {
  const { results } = await env.DB.prepare(
    `SELECT * FROM agent_budgets ORDER BY agent_name ASC`,
  ).all<AgentBudgetRow>()

  const rows = results ?? []
  const enriched: (AgentBudgetRow & { spent: number; pct: number })[] = []

  for (const row of rows) {
    const spent = await getSpend(env, row.agent_name, row.period, now)
    const pct = row.limit_usd > 0 ? (spent / row.limit_usd) * 100 : 0
    enriched.push({ ...row, spent, pct })
  }

  return enriched
}

export async function setBudget(
  env: CloudflareEnv,
  agentName: string,
  updates: {
    period?: string
    limit_usd?: number
    alert_threshold_pct?: number
    hard_stop?: number
    enabled?: number
  },
): Promise<void> {
  const now = Math.floor(Date.now() / 1000)

  const existing = await env.DB.prepare(
    `SELECT agent_name FROM agent_budgets WHERE agent_name = ?`,
  )
    .bind(agentName)
    .first()

  if (existing) {
    const sets: string[] = ['updated_at = ?']
    const bindings: (string | number)[] = [now]

    if (updates.period !== undefined) { sets.push('period = ?'); bindings.push(updates.period) }
    if (updates.limit_usd !== undefined) { sets.push('limit_usd = ?'); bindings.push(updates.limit_usd) }
    if (updates.alert_threshold_pct !== undefined) { sets.push('alert_threshold_pct = ?'); bindings.push(updates.alert_threshold_pct) }
    if (updates.hard_stop !== undefined) { sets.push('hard_stop = ?'); bindings.push(updates.hard_stop) }
    if (updates.enabled !== undefined) { sets.push('enabled = ?'); bindings.push(updates.enabled) }

    bindings.push(agentName)
    await env.DB.prepare(
      `UPDATE agent_budgets SET ${sets.join(', ')} WHERE agent_name = ?`,
    )
      .bind(...bindings)
      .run()
  } else {
    await env.DB.prepare(
      `INSERT INTO agent_budgets (agent_name, period, limit_usd, alert_threshold_pct, hard_stop, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        agentName,
        updates.period ?? 'daily',
        updates.limit_usd ?? 5.0,
        updates.alert_threshold_pct ?? 80,
        updates.hard_stop ?? 1,
        updates.enabled ?? 0,
        now,
        now,
      )
      .run()
  }
}
