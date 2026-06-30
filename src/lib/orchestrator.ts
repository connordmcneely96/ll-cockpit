/**
 * Orchestrator runtime — Sprint 13 v0.1 routed via LLM Router.
 * Sprint 16 v0.1.1 — per-agent max_tokens.
 * Sprint 16 v0.2.0 — ASSEMBLER pseudo-agent special-case handler (deterministic, $0).
 * Sprint 18F      — reads agent_subtasks.task_type and passes to router so
 *                   different subtasks of the same agent can use different models.
 * Sprint 18G      — maxParallel reduced to 4 by default for Anthropic rate-limit safety;
 *                   added inter-wave delay (1s) so retries from prior wave can clear.
 * Sprint 18H      — auto-finalize design iterations when wave completes.
 *                   Closes the gap where ASSEMBLER's HTML was sitting in
 *                   agent_subtasks.output but never propagated to
 *                   design_iterations.page_html because finalize() was only
 *                   triggered by the hub's GET /api/design/briefs/[id] route,
 *                   which the design Worker's /detail polling never calls.
 * Sprint 46       — tool-enabled agents run through the tool-execution loop
 *                   (runToolLoop) instead of the single-shot router. Gated by
 *                   getAgentTools(); agents not in the allowlist are UNCHANGED.
 */

import type {
  CloudflareEnv,
  LLMCompletionResult,
  DesignBriefRow,
  DesignIterationRow,
  OrchestratorRunRow,
} from '@/types'
import { getAgent } from './agents'
import { cascadeReady, refreshRunAggregates } from './hermes'
import { promoteArtifactsForRun } from './artifacts'
import { advanceConvergence } from './cad-convergence'
import { route } from './llm/router'
import { executeAssembler, finalizeIterationIfReady } from './design/pipeline'
import { runToolLoop, getAgentTools } from './tool-loop'

export interface SubtaskExecutionResult {
  subtaskId: string
  status: 'done' | 'failed' | 'skipped'
  cost_usd: number
  tokens: number
  error?: string
  dependency_context_chars: number
  modelId?: string
}

// Output-token ceilings per agent. max_tokens is a CEILING, not a target — agents
// emit only what they need (ATLAS produced a complete FMEA section in 5,566 tokens),
// so a high ceiling costs nothing for shorter outputs and only lets large deliverables
// finish. claude-sonnet-4-5 and claude-haiku-4-5 both support up to 64,000 output
// tokens, so 8192 was far too low — dense FMEA tables / multi-section QA truncated
// mid-document (runs 1ca83300, 7a532c83). Long-form / deliverable agents are at 32000.
const AGENT_MAX_TOKENS: Record<string, number> = {
  composer: 8192,
  forge: 8192,
  herald: 32000,
  critic: 4096,
  hermes: 4096,
  sentinel: 32000,
  dispatch: 32000,
  builder: 8192,
  designer: 2048,
  intake: 2048,
  scout: 32000,
  atlas: 32000,
  anchor: 32000,
  reel: 4096,
  modeler: 8192,
  reviewer: 2048,
}
const DEFAULT_MAX_TOKENS = 2048

const DEFAULT_MAX_PARALLEL = 4
const INTER_WAVE_DELAY_MS = 1000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

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
      task_type: string | null
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
    const userMessage = dependencyContext + subtask.task
    const maxTokens = AGENT_MAX_TOKENS[subtask.agent_name] ?? DEFAULT_MAX_TOKENS
    const taskType = subtask.task_type && subtask.task_type !== 'default'
      ? subtask.task_type
      : 'default'

    // Sprint 46 — tool-enabled agents run through the tool-execution loop
    // (tool_use -> dispatch -> tool_result -> continue). Agents NOT in the tool
    // allowlist (getAgentTools returns []) take the UNCHANGED single-shot router
    // path in the else below. NOTE: the loop path currently bypasses the model
    // router's policy + cost-logging (costUsd = 0); router integration is a
    // tracked delta (knowledge node a94e3731).
    const agentTools = getAgentTools(subtask.agent_name)
    if (agentTools.length > 0) {
      try {
        const loop = await runToolLoop({
          env,
          apiKey,
          userId,
          userMessage,
          systemPrompt: agent.systemPrompt,
          maxTokens,
          allowedTools: agentTools,
        })
        if (loop.ok) {
          output = loop.finalText
          inputTokens = loop.inputTokens
          outputTokens = loop.outputTokens
          costUsd = 0
          modelId = `tool-loop:${loop.iterations}i:${loop.toolCalls.length}tc`
        } else {
          failedReason = loop.error ?? 'tool loop failed'
        }
      } catch (err) {
        failedReason = err instanceof Error ? err.message : String(err)
      }
    } else {
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
  }

  const completedAt = Math.floor(Date.now() / 1000)
  if (failedReason) {
    console.error(`subtask ${subtaskId} (${subtask.agent_name}/${subtask.task_type}) failed:`, failedReason)
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

  if (!failedReason && subtask.agent_name === 'reviewer') {
    try { await advanceConvergence(env, userId, subtask.pipeline_run_id, output) }
    catch (err) { console.error(`convergence advance failed for run ${subtask.pipeline_run_id}:`, err) }
  }

  await cascadeReady(db, subtask.pipeline_run_id)
  await refreshRunAggregates(db, subtask.pipeline_run_id)

  // Promote deliverables to artifact_registry once the run completes (best-effort,
  // idempotent). Never throw into the execution hot path.
  try {
    const runRow = await db
      .prepare(`SELECT status FROM orchestrator_runs WHERE id = ?`)
      .bind(subtask.pipeline_run_id)
      .first<{ status: string }>()
    if (runRow?.status === 'completed') {
      await promoteArtifactsForRun(env, subtask.pipeline_run_id)
    }
  } catch (err) {
    console.error(`artifact promotion failed for run ${subtask.pipeline_run_id}:`, err)
  }

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
  // Sprint 18H — surface finalization info so callers know if preview is ready
  finalized?: boolean
  preview_url?: string
}

/**
 * Sprint 18H — Auto-finalize design iterations after wave completion.
 *
 * Looks up the brief associated with this orchestrator run and, if it's a
 * design build with a ready ASSEMBLER output, copies ASSEMBLER's HTML into
 * design_iterations.page_html, saves to R2, and flips the brief to
 * preview_ready. Returns the result so the caller can surface preview_url.
 *
 * Idempotent: finalizeIterationIfReady returns {finalized: false} if the
 * iteration is already finalized.
 *
 * Tenant-scoped: looks up brief by orchestrator_run_id which is bound to
 * the user_id at create time, so no cross-tenant data exposure.
 */
async function maybeFinalizeDesignBrief(
  env: CloudflareEnv,
  origin: string,
  runId: string,
): Promise<{ finalized: boolean; preview_url?: string }> {
  const db = env.DB

  // Find the brief tied to this run (if any — non-design runs return null)
  const brief = await db
    .prepare(`SELECT * FROM design_briefs WHERE orchestrator_run_id = ? LIMIT 1`)
    .bind(runId)
    .first<DesignBriefRow>()
  if (!brief) {
    return { finalized: false }
  }

  // Find the latest iteration for this brief
  const iteration = await db
    .prepare(
      `SELECT * FROM design_iterations
       WHERE brief_id = ?
       ORDER BY iteration_number DESC
       LIMIT 1`,
    )
    .bind(brief.id)
    .first<DesignIterationRow>()
  if (!iteration) {
    return { finalized: false }
  }

  // Find the orchestrator run row
  const run = await db
    .prepare(`SELECT * FROM orchestrator_runs WHERE id = ?`)
    .bind(runId)
    .first<OrchestratorRunRow>()
  if (!run) {
    return { finalized: false }
  }

  try {
    const result = await finalizeIterationIfReady(env, origin, brief, iteration, run)
    return {
      finalized: result.finalized,
      preview_url: result.preview_url,
    }
  } catch (err) {
    console.error(`Sprint 18H auto-finalize failed for run ${runId}:`, err)
    return { finalized: false }
  }
}

export async function runAutoWave(
  env: CloudflareEnv,
  apiKey: string,
  userId: string,
  runId: string,
  opts: {
    force?: boolean
    maxWaves?: number
    maxParallel?: number
    // Sprint 18H — caller passes its origin so finalize can set preview_url.
    // Defaults to ll-cockpit.connorpattern.workers.dev hub URL (where preview routes live).
    origin?: string
  } = {},
): Promise<AutoWaveResult> {
  const db = env.DB
  const maxWaves = opts.maxWaves ?? 20
  const maxParallel = opts.maxParallel ?? DEFAULT_MAX_PARALLEL
  const finalizeOrigin = opts.origin ?? 'https://ll-cockpit.connorpattern.workers.dev'
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

    if (executed > 0) {
      await sleep(INTER_WAVE_DELAY_MS)
    }
  }

  if (waves >= maxWaves) stoppedReason = 'max_waves'

  // Sprint 18H — auto-finalize design briefs when the wave loop exits.
  // Runs whether the loop exited via 'completed', 'no_progress', or 'max_waves'.
  // finalizeIterationIfReady is idempotent + only finalizes if run.status === 'completed',
  // so spurious calls (e.g. after no_progress with failed subtasks) are no-ops.
  const finalizationResult = await maybeFinalizeDesignBrief(env, finalizeOrigin, runId)

  return {
    runId,
    waves,
    executed,
    failed,
    skipped,
    total_cost_usd: totalCost,
    total_tokens: totalTokens,
    stopped_reason: stoppedReason,
    finalized: finalizationResult.finalized,
    preview_url: finalizationResult.preview_url,
  }
}
