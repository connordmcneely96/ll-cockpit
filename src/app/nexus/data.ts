import { getCloudflareContext } from '@opennextjs/cloudflare'
import { createClient } from '@/lib/supabase-server'

// Auth helper — mirrors src/app/api/agents/route.ts
async function requireUser() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Unauthorized')
  return user
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getEnv() {
  const { env } = await (getCloudflareContext as any)({ async: true })
  return env as import('@/types').CloudflareEnv
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface UsageToday {
  tokens: number
  cost: number
  providers: number
}

export interface AttentionItem {
  id: string
  label: string
  status: string
  cost: number
  source: 'orchestrator' | 'pipeline'
}

export interface ActiveRun {
  id: string
  summary: string
  status: string
  subtask_count: number
  subtasks_completed: number
  actual_cost_usd: number
}

export interface AgentRow {
  id: string
  display_name: string
  role: string
  status: string
  model_default: string
  badge: string
  runtime: string // [stub] 'Ready' until agent_tasks join is wired
}

export interface ArtifactRow {
  id: string
  artifact_name: string
  artifact_type: string
  producing_agent: string
  verification: string
  created_at: number
}

export interface ScheduleRow {
  agent_name: string
  cadence_minutes: number
  enabled: boolean
  last_run_at: number | null
  next_run_at: number | null
}

export interface BrainLive {
  activeRunCount: number
  latestRunSummary: string | null
  totalCostAllTime: number
  agentCount: number
}

// ── Data functions ────────────────────────────────────────────────────────────

export async function getUsageToday(): Promise<UsageToday> {
  await requireUser()
  const env = await getEnv()
  const todayStart = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000)
  const row = await env.DB.prepare(
    `SELECT COALESCE(SUM(input_tokens + output_tokens), 0) AS tokens,
            COALESCE(SUM(cost_usd), 0) AS cost,
            COUNT(DISTINCT model_id) AS providers
     FROM cost_ledger WHERE called_at >= ?`
  ).bind(todayStart).first<{ tokens: number; cost: number; providers: number }>()
  return { tokens: row?.tokens ?? 0, cost: row?.cost ?? 0, providers: row?.providers ?? 0 }
}

export async function getNeedsAttention(): Promise<AttentionItem[]> {
  await requireUser()
  const env = await getEnv()
  const [orchRows, pipeRows] = await Promise.all([
    env.DB.prepare(
      `SELECT id, summary, status, actual_cost_usd FROM orchestrator_runs
       WHERE status IN ('planning','paused','failed') ORDER BY last_active_at DESC LIMIT 10`
    ).all<{ id: string; summary: string; status: string; actual_cost_usd: number }>(),
    env.DB.prepare(
      `SELECT id, pipeline_type AS summary, status, cost_total_usd AS actual_cost_usd
       FROM pipeline_runs WHERE status IN ('paused','failed') ORDER BY last_active_at DESC LIMIT 5`
    ).all<{ id: string; summary: string; status: string; actual_cost_usd: number }>(),
  ])
  const orch = (orchRows.results ?? []).map(r => ({
    id: r.id, label: r.summary, status: r.status, cost: r.actual_cost_usd, source: 'orchestrator' as const,
  }))
  const pipe = (pipeRows.results ?? []).map(r => ({
    id: r.id, label: r.summary, status: r.status, cost: r.actual_cost_usd, source: 'pipeline' as const,
  }))
  return [...orch, ...pipe]
}

export async function getActiveSystems(): Promise<ActiveRun[]> {
  await requireUser()
  const env = await getEnv()
  const rows = await env.DB.prepare(
    `SELECT id, summary, status, subtask_count, subtasks_completed, actual_cost_usd
     FROM orchestrator_runs WHERE status IN ('running','planning')
     ORDER BY last_active_at DESC LIMIT 6`
  ).all<ActiveRun>()
  return rows.results ?? []
}

export async function getAgentFleet(): Promise<AgentRow[]> {
  await requireUser()
  const env = await getEnv()
  const rows = await env.DB.prepare(
    `SELECT id, display_name, role, status, model_default, badge
     FROM agents WHERE status = 'active' ORDER BY id`
  ).all<Omit<AgentRow, 'runtime'>>()
  // runtime busy/idle requires agent_tasks join — stub as 'Ready' [stub]
  return (rows.results ?? []).map(r => ({ ...r, runtime: 'Ready' }))
}

export async function getRecentArtifacts(): Promise<ArtifactRow[]> {
  await requireUser()
  const env = await getEnv()
  const rows = await env.DB.prepare(
    `SELECT id, artifact_name, artifact_type, producing_agent, sentinel_pass, created_at
     FROM artifact_registry ORDER BY created_at DESC LIMIT 7`
  ).all<{ id: string; artifact_name: string; artifact_type: string; producing_agent: string; sentinel_pass: number | null; created_at: number }>()
  return (rows.results ?? []).map(r => ({
    id: r.id,
    artifact_name: r.artifact_name,
    artifact_type: r.artifact_type,
    producing_agent: r.producing_agent,
    created_at: r.created_at,
    verification: r.sentinel_pass === 1 ? 'Verified' : r.sentinel_pass === 0 ? 'Failed checks' : 'Needs review',
  }))
}

export async function getAutomations(): Promise<ScheduleRow[]> {
  await requireUser()
  const env = await getEnv()
  const rows = await env.DB.prepare(
    `SELECT agent_name, cadence_minutes, enabled, last_run_at, next_run_at
     FROM agent_schedules ORDER BY next_run_at`
  ).all<{ agent_name: string; cadence_minutes: number; enabled: number; last_run_at: number | null; next_run_at: number | null }>()
  return (rows.results ?? []).map(r => ({ ...r, enabled: r.enabled === 1 }))
}

export interface RunsByStatus {
  status: string
  n: number
}

export async function getRunsByStatus(): Promise<RunsByStatus[]> {
  await requireUser()
  const env = await getEnv()
  const rows = await env.DB.prepare(
    `SELECT status, COUNT(*) AS n FROM orchestrator_runs GROUP BY status ORDER BY n DESC`
  ).all<RunsByStatus>()
  return rows.results ?? []
}

export interface HeadlineStats {
  totalSpend: number
  activeRuns: number
  completed: number
  total: number
  agents: number
  costSeries: number[]
}

export async function getHeadlineStats(): Promise<HeadlineStats> {
  await requireUser()
  const env = await getEnv()
  const [spendRow, activeRow, completedRow, totalRow, agentRow, seriesRows] = await Promise.all([
    env.DB.prepare(`SELECT COALESCE(SUM(actual_cost_usd),0) v FROM orchestrator_runs`).first<{ v: number }>(),
    env.DB.prepare(`SELECT COUNT(*) v FROM orchestrator_runs WHERE status IN ('running','planning')`).first<{ v: number }>(),
    env.DB.prepare(`SELECT COUNT(*) v FROM orchestrator_runs WHERE status='completed'`).first<{ v: number }>(),
    env.DB.prepare(`SELECT COUNT(*) v FROM orchestrator_runs`).first<{ v: number }>(),
    env.DB.prepare(`SELECT COUNT(*) v FROM agents WHERE status='active'`).first<{ v: number }>(),
    env.DB.prepare(`SELECT COALESCE(actual_cost_usd,0) c FROM orchestrator_runs ORDER BY started_at DESC LIMIT 12`).all<{ c: number }>(),
  ])
  return {
    totalSpend: spendRow?.v ?? 0,
    activeRuns: activeRow?.v ?? 0,
    completed: completedRow?.v ?? 0,
    total: totalRow?.v ?? 0,
    agents: agentRow?.v ?? 0,
    costSeries: (seriesRows.results ?? []).map(r => r.c).reverse(),
  }
}

export async function getBrainLive(): Promise<BrainLive> {
  await requireUser()
  const env = await getEnv()
  const [countRow, latestRow, costRow, agentRow] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) n FROM orchestrator_runs WHERE status IN ('running','planning')`).first<{ n: number }>(),
    env.DB.prepare(`SELECT summary FROM orchestrator_runs WHERE status IN ('running','planning') ORDER BY last_active_at DESC LIMIT 1`).first<{ summary: string }>(),
    env.DB.prepare(`SELECT COALESCE(SUM(actual_cost_usd),0) total FROM orchestrator_runs`).first<{ total: number }>(),
    env.DB.prepare(`SELECT COUNT(*) n FROM agents WHERE status='active'`).first<{ n: number }>(),
  ])
  return {
    activeRunCount: countRow?.n ?? 0,
    latestRunSummary: latestRow?.summary ?? null,
    totalCostAllTime: costRow?.total ?? 0,
    agentCount: agentRow?.n ?? 0,
  }
}
