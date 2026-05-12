/**
 * Orchestrator runtime — shared logic for executing subtasks and running auto-waves.
 *
 * Used by:
 *   - POST /api/orchestrator/subtasks/[id]/execute  (single manual or force)
 *   - POST /api/orchestrator/dispatch               (auto-wave after decomposition)
 *
 * Design:
 *   - executeOneSubtask runs a single subtask end-to-end (pull deps as context, call Claude,
 *     persist, cascade dependents, refresh run aggregates).
 *   - runAutoWave loops: select all 'ready' subtasks for a run → execute in parallel
 *     → cascade → repeat until no 'ready' remain. Skips HITL by default.
 */

import type { D1Database } from '@cloudflare/workers-types'
import { getAgent } from './agents'
import { calculateCost } from './cost'
import { cascadeReady, refreshRunAggregates } from './hermes'

export interface SubtaskExecutionResult {
  subtaskId: string
  status: 'done' | 'failed' | 'skipped'
  cost_usd: number
  tokens: number
  error?: string
  dependency_context_chars: number
}

/**
 * Execute a single subtask:
 *  1. Verify it's in 'ready' status (and HITL bypass if needed)
 *  2. Pull dependency outputs from D1
 *  3. Call Claude with agent system prompt + dependency context + task
 *  4. Persist output (status='done') or error (status='failed')
 *  5. Cascade pending → ready for unblocked dependents
 *  6. Refresh orchestrator_run aggregates
 */
export async function executeOneSubtask(
  db: D1Database,
  apiKey: string,
  userId: string,
  subtaskId: string,
  opts: { force?: boolean } = {},
): Promise<SubtaskExecutionResult> {
  const subtask = await db
    .prepare(`SELECT * FROM agent_subtasks WHERE id = ? AND user_id = ?`)
    .bind(subtaskId, userId)
    .first<{
      id: string
      pipeline_run_id: string
      agent_name: string
      title: string
      task: string
      depends_on: string | null
      status: string
      human_required: number
    }>()

  if (!subtask) {
    return {
      subtaskId,
      status: 'failed',
      cost_usd: 0,
      tokens: 0,
      error: 'Subtask not found',
      dependency_context_chars: 0,
    }
  }

  if (subtask.status !== 'ready') {
    return {
      subtaskId,
      status: 'skipped',
      cost_usd: 0,
      tokens: 0,
      error: `Status was '${subtask.status}', expected 'ready'`,
      dependency_context_chars: 0,
    }
  }

  if (subtask.human_required && !opts.force) {
    return {
      subtaskId,
      status: 'skipped',
      cost_usd: 0,
      tokens: 0,
      error: 'human_required and not forced',
      dependency_context_chars: 0,
    }
  }

  const agent = getAgent(subtask.agent_name)
  if (!agent) {
    return {
      subtaskId,
      status: 'failed',
      cost_usd: 0,
      tokens: 0,
      error: `Unknown agent: ${subtask.agent_name}`,
      dependency_context_chars: 0,
    }
  }

  // Pull dependency outputs
  let dependencyContext = ''
  const depShortIds: string[] = subtask.depends_on ? JSON.parse(subtask.depends_on) : []
  if (depShortIds.length > 0) {
    const placeholders = depShortIds.map(() => '?').join(',')
    const depRows = await db
      .prepare(
        `SELECT short_id, agent_name, title, output FROM agent_subtasks
          WHERE pipeline_run_id = ? AND user_id = ?
            AND short_id IN (${placeholders})
            AND output IS NOT NULL
          ORDER BY short_id ASC`,
      )
      .bind(subtask.pipeline_run_id, userId, ...depShortIds)
      .all<{
        short_id: string
        agent_name: string
        title: string
        output: string
      }>()
    if (depRows.results && depRows.results.length > 0) {
      dependencyContext =
        '## Context from upstream subtasks\n\n' +
        depRows.results
          .map(
            (r) =>
              `### ${r.short_id} — ${r.agent_name.toUpperCase()} — ${r.title}\n\n${r.output}`,
          )
          .join('\n\n---\n\n') +
        '\n\n---\n\n'
    }
  }

  // Mark running
  const startedAt = Math.floor(Date.now() / 1000)
  await db
    .prepare(
      `UPDATE agent_subtasks SET status = 'running', started_at = ? WHERE id = ?`,
    )
    .bind(startedAt, subtaskId)
    .run()

  // Call Claude
  let output = ''
  let inputTokens = 0
  let outputTokens = 0
  let costUsd = 0
  let failedReason: string | null = null

  const userMessage = dependencyContext + subtask.task

  try {
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
        system: agent.systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    })
    if (!res.ok) {
      failedReason = `Anthropic API ${res.status}: ${(await res.text()).slice(0, 200)}`
    } else {
      const data = (await res.json()) as {
        content: Array<{ type: string; text?: string }>
        usage: { input_tokens: number; output_tokens: number }
      }
      output = data.content.find((c) => c.type === 'text')?.text ?? ''
      inputTokens = data.usage.input_tokens
      outputTokens = data.usage.output_tokens
      costUsd = calculateCost(inputTokens, outputTokens)
    }
  } catch (err) {
    failedReason = err instanceof Error ? err.message : String(err)
  }

  // Persist outcome
  const completedAt = Math.floor(Date.now() / 1000)
  if (failedReason) {
    await db
      .prepare(
        `UPDATE agent_subtasks SET status = 'failed', error_log = ?, completed_at = ? WHERE id = ?`,
      )
      .bind(failedReason, completedAt, subtaskId)
      .run()
  } else {
    await db
      .prepare(
        `UPDATE agent_subtasks SET status = 'done', output = ?, cost_usd = ?, tokens = ?, completed_at = ? WHERE id = ?`,
      )
      .bind(output, costUsd, inputTokens + outputTokens, completedAt, subtaskId)
      .run()
  }

  await cascadeReady(db, subtask.pipeline_run_id)
  await refreshRunAggregates(db, subtask.pipeline_run_id)

  return {
    subtaskId,
    status: failedReason ? 'failed' : 'done',
    cost_usd: costUsd,
    tokens: inputTokens + outputTokens,
    error: failedReason ?? undefined,
    dependency_context_chars: dependencyContext.length,
  }
}

export interface AutoWaveResult {
  runId: string
  waves: number
  executed: number
  failed: number
  skipped: number
  total_cost_usd: number
  total_tokens: number
  stopped_reason: 'completed' | 'max_waves' | 'no_progress' | 'error'
}

/**
 * Autonomous wave runner — keeps executing ready subtasks in parallel until none remain.
 *
 *   while there are 'ready' subtasks:
 *     execute them all in parallel
 *     cascade pending → ready
 *     loop
 *
 * Safety rails:
 *   - opts.force: pass-through to executeOneSubtask (default false; HITL subtasks skipped)
 *   - opts.maxWaves: hard cap on iterations (default 20)
 *   - opts.maxParallel: cap on parallel executions per wave (default 8)
 */
export async function runAutoWave(
  db: D1Database,
  apiKey: string,
  userId: string,
  runId: string,
  opts: { force?: boolean; maxWaves?: number; maxParallel?: number } = {},
): Promise<AutoWaveResult> {
  const maxWaves = opts.maxWaves ?? 20
  const maxParallel = opts.maxParallel ?? 8
  let waves = 0
  let executed = 0
  let failed = 0
  let skipped = 0
  let totalCost = 0
  let totalTokens = 0
  let stoppedReason: AutoWaveResult['stopped_reason'] = 'completed'

  while (waves < maxWaves) {
    waves++

    // Find ready subtasks. If force=false, exclude HITL so we don't wedge on them.
    const readyQuery = opts.force
      ? `SELECT id FROM agent_subtasks WHERE pipeline_run_id = ? AND user_id = ? AND status = 'ready' ORDER BY short_id ASC LIMIT ?`
      : `SELECT id FROM agent_subtasks WHERE pipeline_run_id = ? AND user_id = ? AND status = 'ready' AND human_required = 0 ORDER BY short_id ASC LIMIT ?`

    const ready = await db
      .prepare(readyQuery)
      .bind(runId, userId, maxParallel)
      .all<{ id: string }>()

    const batch = ready.results ?? []
    if (batch.length === 0) {
      stoppedReason = 'completed'
      break
    }

    const results = await Promise.all(
      batch.map((row) =>
        executeOneSubtask(db, apiKey, userId, row.id, { force: opts.force }),
      ),
    )

    let madeProgress = false
    for (const r of results) {
      if (r.status === 'done') {
        executed++
        totalCost += r.cost_usd
        totalTokens += r.tokens
        madeProgress = true
      } else if (r.status === 'failed') {
        failed++
        madeProgress = true
      } else {
        skipped++
      }
    }

    if (!madeProgress) {
      stoppedReason = 'no_progress'
      break
    }
  }

  if (waves >= maxWaves) stoppedReason = 'max_waves'

  return {
    runId,
    waves,
    executed,
    failed,
    skipped,
    total_cost_usd: totalCost,
    total_tokens: totalTokens,
    stopped_reason: stoppedReason,
  }
}
