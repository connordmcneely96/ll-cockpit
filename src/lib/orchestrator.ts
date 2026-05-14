/**
 * Orchestrator runtime — Sprint 13 v0.1 routed via LLM Router.
 * Sprint 16 v0.1.1 — per-agent max_tokens.
 * Sprint 16 v0.2.0 — ASSEMBLER pseudo-agent special-case handler (deterministic, $0).
 * Sprint 18F      — reads agent_subtasks.task_type and passes to router so
 *                   different subtasks of the same agent can use different models.
 */

import type {
  CloudflareEnv,
  LLMCompletionResult,
} from '@/types'
import { getAgent } from './agents'
import { cascadeReady, refreshRunAggregates } from './hermes'
import { route } from './llm/router'
import { executeAssembler } from './design/pipeline'

export interface SubtaskExecutionResult {
  subtaskId: string
  status: 'done' | 'failed' | 'skipped'
  cost_usd: number
  tokens: number
  error?: string
  dependency_context_chars: number
  modelId?: string
}

const AGENT_MAX_TOKENS: Record<string, number> = {
  composer: 8192,
  forge: 8192,
  herald: 4096,
  critic: 4096,
  hermes: 4096,
  sentinel: 4096,
  dispatch: 4096,
  builder: 8192,
  designer: 2048,
  intake: 2048,
  scout: 4096,
  atlas: 4096,
  anchor: 2048,
  reel: 4096,
}
const DEFAULT_MAX_TOKENS = 2048

export async function executeOneSubtask(
  env: CloudflareEnv,
  apiKey: string,
  userId: string,
  subtaskId: string,
  opts: { force?: boolean } = {},
): Promise<SubtaskExecutionResult> {
  const db = env.DB

  const subtask = await db
    .prepare(`SELECT * FROM agent_subtasks WHERE id = ? AND user_id = ?`)
    .bind(subtaskId, userId)
    .first<{
      id: string
      pipeline_run_id: string
      agent_name: string
      title: string
      task: string
      task_type: string | null   // Sprint 18F — new column
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

  // Pull dependency outputs as context
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

  let output = ''
  let inputTokens = 0
  let outputTokens = 0
  let costUsd = 0
  let failedReason: string | null = null
  let modelId: string | undefined

  // ─── ASSEMBLER pseudo-agent: deterministic, no LLM call ───
  if (subtask.agent_name === 'assembler') {
    try {
      const result = await executeAssembler(env, userId, subtask.pipeline_run_id)
      output = result.output
      inputTokens = 0
      outputTokens = 0
      costUsd = 0
      modelId = 'design-build-assembler-v0.2.0'
    } catch (err) {
      failedReason = err instanceof Error ? err.message : String(err)
    }
  } else {
    // ─── Standard LLM path ───
    const userMessage = dependencyContext + subtask.task
    const maxTokens = AGENT_MAX_TOKENS[subtask.agent_name] ?? DEFAULT_MAX_TOKENS

    // Sprint 18F: use the per-subtask task_type if set, otherwise 'default'
    const taskType = subtask.task_type && subtask.task_type !== 'default'
      ? subtask.task_type
      : 'default'

    try {
      const result: LLMCompletionResult = await route({
        agentName: subtask.agent_name,
        taskType,
        systemPrompt: agent.systemPrompt,
        userMessage,
        maxTokens,
        pipelineRunId: subtask.pipeline_run_id,
        subtaskId,
        userId,
        env,
        apiKey,
      })
      output = result.text
      inputTokens = result.inputTokens
      outputTokens = result.outputTokens
      costUsd = result.costUsd
      modelId = result.modelId
    } catch (err) {
      failedReason = err instanceof Error ? err.message : String(err)
    }
  }

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
    modelId,
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

export async function runAutoWave(
  env: CloudflareEnv,
  apiKey: string,
  userId: string,
  runId: string,
  opts: { force?: boolean; maxWaves?: number; maxParallel?: number } = {},
): Promise<AutoWaveResult> {
  const db = env.DB
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
        executeOneSubtask(env, apiKey, userId, row.id, { force: opts.force }),
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
