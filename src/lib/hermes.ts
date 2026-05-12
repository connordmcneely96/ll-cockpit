/**
 * HERMES decomposer — Sprint 14 v0.1
 *
 * Takes a complex task and produces a DAG of subtasks via Claude.
 * Writes decomposition + subtasks to D1; opens orchestrator_run.
 *
 * Returns the run id and the parsed decomposition for immediate UI display.
 */

import type { D1Database } from '@cloudflare/workers-types'
import type {
  DecompositionResult,
  DecomposedSubtask,
  RiskLevel,
} from '@/types'
import { AGENTS } from './agents'
import { calculateCost } from './cost'

// Allowed agents for HERMES to assign to (uppercase forms, matching prompt + JSON output)
const ALLOWED_AGENTS = new Set(
  Object.values(AGENTS)
    .filter((a) => a.name !== 'nexus' && a.name !== 'hermes')
    .map((a) => a.displayName),
)

const RISK_LEVELS = new Set<RiskLevel>(['low', 'medium', 'high'])

export class HermesError extends Error {
  constructor(
    message: string,
    public detail?: unknown,
  ) {
    super(message)
    this.name = 'HermesError'
  }
}

/**
 * Call Claude with HERMES system prompt, parse + validate decomposition JSON.
 */
export async function decomposeTask(
  apiKey: string,
  originalTask: string,
): Promise<{
  decomposition: DecompositionResult
  raw: string
  inputTokens: number
  outputTokens: number
  costUsd: number
}> {
  const hermes = AGENTS.hermes
  if (!hermes) {
    throw new HermesError('HERMES agent not found in registry')
  }

  const userMessage = `Decompose this task into a DAG of subtasks. Return ONLY valid JSON per the schema. Do not include any prose, code fences, or commentary.\n\nTASK:\n${originalTask}`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 2048,
      system: hermes.systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new HermesError(`Anthropic API ${res.status}`, errText)
  }

  const data = (await res.json()) as {
    content: Array<{ type: string; text?: string }>
    usage: { input_tokens: number; output_tokens: number }
  }

  const textBlock = data.content.find((c) => c.type === 'text')?.text ?? ''
  // Robust strip: remove ```json / ``` fences and any leading/trailing prose
  const cleaned = stripJsonFences(textBlock).trim()

  let decomposition: DecompositionResult
  try {
    decomposition = JSON.parse(cleaned) as DecompositionResult
  } catch (e) {
    throw new HermesError(
      `HERMES returned invalid JSON: ${cleaned.slice(0, 300)}`,
      e,
    )
  }

  validateDecomposition(decomposition)

  const costUsd = calculateCost(data.usage.input_tokens, data.usage.output_tokens)
  return {
    decomposition,
    raw: textBlock,
    inputTokens: data.usage.input_tokens,
    outputTokens: data.usage.output_tokens,
    costUsd,
  }
}

function stripJsonFences(s: string): string {
  // pull out the first JSON object if HERMES wrapped it in fences or prose
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced) return fenced[1]
  // look for first { ... } object span
  const first = s.indexOf('{')
  const last = s.lastIndexOf('}')
  if (first !== -1 && last !== -1 && last > first) {
    return s.slice(first, last + 1)
  }
  return s
}

function validateDecomposition(d: DecompositionResult): void {
  if (typeof d.summary !== 'string' || !d.summary.length) {
    throw new HermesError('Missing summary')
  }
  if (!Array.isArray(d.subtasks) || d.subtasks.length === 0) {
    throw new HermesError('Missing or empty subtasks array')
  }
  const ids = new Set<string>()
  for (const st of d.subtasks) {
    if (!st.id || typeof st.id !== 'string') {
      throw new HermesError('Subtask missing id')
    }
    if (ids.has(st.id)) {
      throw new HermesError(`Duplicate subtask id: ${st.id}`)
    }
    ids.add(st.id)
    if (!ALLOWED_AGENTS.has(st.agent)) {
      throw new HermesError(`Invalid agent assignment: ${st.agent}`)
    }
    if (!st.title || !st.task) {
      throw new HermesError(`Subtask ${st.id} missing title or task`)
    }
    if (!Array.isArray(st.depends_on)) {
      throw new HermesError(`Subtask ${st.id} depends_on must be an array`)
    }
    if (st.risk_level && !RISK_LEVELS.has(st.risk_level)) {
      throw new HermesError(`Subtask ${st.id} invalid risk_level: ${st.risk_level}`)
    }
  }
  // Validate edges + acyclicity
  for (const st of d.subtasks) {
    for (const dep of st.depends_on) {
      if (!ids.has(dep)) {
        throw new HermesError(`Subtask ${st.id} depends on unknown id: ${dep}`)
      }
      if (dep === st.id) {
        throw new HermesError(`Subtask ${st.id} self-dependency`)
      }
    }
  }
  if (hasCycle(d.subtasks)) {
    throw new HermesError('DAG contains a cycle')
  }
}

function hasCycle(subtasks: DecomposedSubtask[]): boolean {
  const map = new Map<string, DecomposedSubtask>()
  for (const st of subtasks) map.set(st.id, st)
  const WHITE = 0, GRAY = 1, BLACK = 2
  const color = new Map<string, number>()
  for (const id of map.keys()) color.set(id, WHITE)

  function visit(id: string): boolean {
    color.set(id, GRAY)
    const node = map.get(id)
    if (!node) return false
    for (const dep of node.depends_on) {
      const c = color.get(dep) ?? WHITE
      if (c === GRAY) return true
      if (c === WHITE && visit(dep)) return true
    }
    color.set(id, BLACK)
    return false
  }

  for (const id of map.keys()) {
    if ((color.get(id) ?? WHITE) === WHITE) {
      if (visit(id)) return true
    }
  }
  return false
}

/**
 * Persist a decomposition + its subtasks to D1.
 * Subtasks with no dependencies start as 'ready'; others as 'pending'.
 * Returns the inserted run id.
 */
export async function persistDecomposition(
  db: D1Database,
  args: {
    userId: string
    originalTask: string
    decomposition: DecompositionResult
    raw: string
    inputTokens: number
    outputTokens: number
    costUsd: number
  },
): Promise<{ runId: string; decompositionId: string }> {
  const now = Math.floor(Date.now() / 1000)
  const runId = crypto.randomUUID()
  const decompositionId = crypto.randomUUID()
  const { decomposition, originalTask, userId } = args

  // 1. orchestrator_runs
  await db
    .prepare(
      `INSERT INTO orchestrator_runs
       (id, user_id, original_task, summary, status, subtask_count,
        estimated_cost_usd, estimated_duration_minutes,
        decomposition_id, started_at, last_active_at)
       VALUES (?, ?, ?, ?, 'running', ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      runId,
      userId,
      originalTask,
      decomposition.summary,
      decomposition.subtasks.length,
      decomposition.estimated_total_cost_usd ?? null,
      decomposition.estimated_duration_minutes ?? null,
      decompositionId,
      now,
      now,
    )
    .run()

  // 2. decompositions audit row
  await db
    .prepare(
      `INSERT INTO decompositions
       (id, pipeline_run_id, user_id, original_task, summary, subtask_count,
        estimated_total_cost_usd, raw_response, model_id,
        input_tokens, output_tokens, cost_usd, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      decompositionId,
      runId,
      userId,
      originalTask,
      decomposition.summary,
      decomposition.subtasks.length,
      decomposition.estimated_total_cost_usd ?? null,
      args.raw,
      'claude-sonnet-4-5',
      args.inputTokens,
      args.outputTokens,
      args.costUsd,
      now,
    )
    .run()

  // 3. each subtask
  for (const st of decomposition.subtasks) {
    const id = crypto.randomUUID()
    const status = st.depends_on.length === 0 ? 'ready' : 'pending'
    await db
      .prepare(
        `INSERT INTO agent_subtasks
         (id, pipeline_run_id, user_id, short_id, agent_name, title, task,
          depends_on, estimated_cost_usd, estimated_duration_seconds,
          risk_level, human_required, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        runId,
        userId,
        st.id,
        st.agent.toLowerCase(),
        st.title,
        st.task,
        JSON.stringify(st.depends_on),
        st.estimated_cost_usd ?? null,
        st.estimated_duration_seconds ?? null,
        st.risk_level ?? 'low',
        st.human_required ? 1 : 0,
        status,
        now,
      )
      .run()
  }

  return { runId, decompositionId }
}

/**
 * Promote any pending subtasks whose dependencies are all now 'done' to 'ready'.
 * Returns count promoted.
 */
export async function cascadeReady(db: D1Database, runId: string): Promise<number> {
  const rows = await db
    .prepare(
      `SELECT id, short_id, depends_on FROM agent_subtasks
         WHERE pipeline_run_id = ? AND status = 'pending'`,
    )
    .bind(runId)
    .all<{ id: string; short_id: string; depends_on: string | null }>()

  const doneRows = await db
    .prepare(
      `SELECT short_id FROM agent_subtasks
         WHERE pipeline_run_id = ? AND status = 'done'`,
    )
    .bind(runId)
    .all<{ short_id: string }>()
  const doneSet = new Set<string>((doneRows.results ?? []).map((r) => r.short_id))

  let promoted = 0
  for (const row of rows.results ?? []) {
    const deps: string[] = row.depends_on ? JSON.parse(row.depends_on) : []
    if (deps.every((d) => doneSet.has(d))) {
      await db
        .prepare(`UPDATE agent_subtasks SET status = 'ready' WHERE id = ?`)
        .bind(row.id)
        .run()
      promoted++
    }
  }
  return promoted
}

/**
 * Recompute and update orchestrator_runs aggregates (counts + status + last_active_at).
 */
export async function refreshRunAggregates(
  db: D1Database,
  runId: string,
): Promise<void> {
  const counts = await db
    .prepare(
      `SELECT
         SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done,
         SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
         SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled,
         COUNT(*) AS total,
         SUM(cost_usd) AS cost_total,
         SUM(tokens) AS tokens_total
       FROM agent_subtasks WHERE pipeline_run_id = ?`,
    )
    .bind(runId)
    .first<{
      done: number
      failed: number
      cancelled: number
      total: number
      cost_total: number | null
      tokens_total: number | null
    }>()

  if (!counts) return

  const now = Math.floor(Date.now() / 1000)
  let status: string = 'running'
  let completedAt: number | null = null

  if (counts.failed > 0 && counts.done + counts.failed + counts.cancelled === counts.total) {
    status = 'failed'
    completedAt = now
  } else if (counts.done === counts.total) {
    status = 'completed'
    completedAt = now
  }

  await db
    .prepare(
      `UPDATE orchestrator_runs SET
         subtasks_completed = ?,
         subtasks_failed = ?,
         actual_cost_usd = ?,
         tokens = ?,
         status = ?,
         last_active_at = ?,
         completed_at = COALESCE(?, completed_at)
       WHERE id = ?`,
    )
    .bind(
      counts.done ?? 0,
      counts.failed ?? 0,
      counts.cost_total ?? 0,
      counts.tokens_total ?? 0,
      status,
      now,
      completedAt,
      runId,
    )
    .run()
}
