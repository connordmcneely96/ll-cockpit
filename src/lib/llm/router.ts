/**
 * LLM Router — Sprint 13 v0.1
 *
 * Given (agentName, taskType, prompt), looks up routing policy, calls primary model
 * via provider abstraction, falls back through chain on failure, logs decision.
 *
 * Centralizes:
 *   - Per-(agent, task) model selection (ai_routing_policy)
 *   - Fallback handling
 *   - Cost computation from registry pricing (ai_models)
 *   - Decision logging for cost/perf analysis (ai_routing_decisions)
 */

import type { D1Database } from '@cloudflare/workers-types'
import type {
  AIModelRow,
  AIRoutingPolicyRow,
  CloudflareEnv,
  LLMCompletionResult,
} from '@/types'
import { getProvider } from './providers'
import { seedDefaults } from './seed'

export interface RouteArgs {
  agentName: string                 // lowercase: 'hermes', 'sentinel', etc.
  taskType?: string                  // 'decompose' | 'review' | 'draft' | 'package' | 'qualify' | 'default'
  systemPrompt?: string
  userMessage: string
  maxTokens?: number
  temperature?: number
  pipelineRunId?: string
  subtaskId?: string
  userId: string
  env: CloudflareEnv
  apiKey?: string
}

export class RouterError extends Error {
  constructor(
    message: string,
    public attempted: string[],
    public lastError: string | null,
  ) {
    super(message)
    this.name = 'RouterError'
  }
}

export async function route(args: RouteArgs): Promise<LLMCompletionResult> {
  const taskType = args.taskType ?? 'default'
  const db = args.env.DB

  // ── 1. Resolve routing policy ──
  const policy = await resolvePolicy(db, args.agentName, taskType)

  // ── 2. Build try-order: primary then fallbacks ──
  const tries: string[] = [policy.primary_model_id]
  if (policy.fallback_chain_json) {
    try {
      const fbs = JSON.parse(policy.fallback_chain_json) as string[]
      for (const fb of fbs) {
        if (typeof fb === 'string' && !tries.includes(fb)) tries.push(fb)
      }
    } catch {
      /* malformed fallback chain — skip */
    }
  }

  // ── 3. Try each in order, returning first success ──
  let lastError: string | null = null
  const attempted: string[] = []

  for (const modelId of tries) {
    attempted.push(modelId)
    const model = await getModel(db, modelId)
    if (!model) {
      lastError = `Model ${modelId} not found in registry`
      continue
    }
    const provider = getProvider(model.provider_id)
    if (!provider) {
      lastError = `Provider ${model.provider_id} not registered`
      continue
    }

    try {
      const result = await provider.complete(
        {
          modelId: model.model_string,
          systemPrompt: args.systemPrompt,
          userMessage: args.userMessage,
          maxTokens: args.maxTokens,
          temperature: args.temperature,
        },
        { env: args.env, apiKey: args.apiKey },
      )

      const costUsd = computeCost(
        result.inputTokens,
        result.outputTokens,
        model,
      )
      const finalResult: LLMCompletionResult = {
        ...result,
        costUsd,
        modelId, // canonical id, not provider's model_string
      }

      await logDecision(db, {
        userId: args.userId,
        pipelineRunId: args.pipelineRunId ?? null,
        subtaskId: args.subtaskId ?? null,
        agentName: args.agentName,
        taskType,
        policyId: policy.id,
        selectedModelId: modelId,
        attemptedModels: attempted,
        usedFallback: attempted.length > 1,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        costUsd,
        latencyMs: result.latencyMs,
        success: true,
        error: null,
      })

      return finalResult
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
      continue
    }
  }

  // All tries failed
  await logDecision(db, {
    userId: args.userId,
    pipelineRunId: args.pipelineRunId ?? null,
    subtaskId: args.subtaskId ?? null,
    agentName: args.agentName,
    taskType,
    policyId: policy.id,
    selectedModelId: tries[0],
    attemptedModels: attempted,
    usedFallback: attempted.length > 1,
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
    latencyMs: 0,
    success: false,
    error: lastError,
  })

  throw new RouterError(
    `Router exhausted ${attempted.length} model(s) without success`,
    attempted,
    lastError,
  )
}

// ── helpers ──────────────────────────────────────────────────────────────────

async function resolvePolicy(
  db: D1Database,
  agentName: string,
  taskType: string,
): Promise<AIRoutingPolicyRow> {
  // 1) exact (agent, task)
  let row = await db
    .prepare(
      `SELECT * FROM ai_routing_policy
        WHERE agent_name = ? AND task_type = ? AND enabled = 1
        ORDER BY priority ASC LIMIT 1`,
    )
    .bind(agentName, taskType)
    .first<AIRoutingPolicyRow>()
  if (row) return row

  // 2) (agent, 'default')
  row = await db
    .prepare(
      `SELECT * FROM ai_routing_policy
        WHERE agent_name = ? AND task_type = 'default' AND enabled = 1
        ORDER BY priority ASC LIMIT 1`,
    )
    .bind(agentName)
    .first<AIRoutingPolicyRow>()
  if (row) return row

  // 3) ('*', taskType)
  row = await db
    .prepare(
      `SELECT * FROM ai_routing_policy
        WHERE agent_name = '*' AND task_type = ? AND enabled = 1
        ORDER BY priority ASC LIMIT 1`,
    )
    .bind(taskType)
    .first<AIRoutingPolicyRow>()
  if (row) return row

  // 4) ('*', 'default')
  row = await db
    .prepare(
      `SELECT * FROM ai_routing_policy
        WHERE agent_name = '*' AND task_type = 'default' AND enabled = 1
        ORDER BY priority ASC LIMIT 1`,
    )
    .first<AIRoutingPolicyRow>()
  if (row) return row

  // 5) Empty registry — seed defaults then retry once
  await seedDefaults(db)
  row = await db
    .prepare(
      `SELECT * FROM ai_routing_policy
        WHERE agent_name = '*' AND task_type = 'default' AND enabled = 1 LIMIT 1`,
    )
    .first<AIRoutingPolicyRow>()
  if (row) return row

  // 6) Hardcoded last resort — should never hit if seed succeeded
  const now = Math.floor(Date.now() / 1000)
  return {
    id: 'fallback-hardcoded',
    agent_name: '*',
    task_type: 'default',
    primary_model_id: 'claude-sonnet-4-5',
    fallback_chain_json: JSON.stringify(['claude-haiku-4-5']),
    priority: 99,
    enabled: 1,
    notes: 'Hardcoded fallback because seed failed',
    created_at: now,
    updated_at: now,
  }
}

async function getModel(
  db: D1Database,
  modelId: string,
): Promise<AIModelRow | null> {
  return await db
    .prepare(`SELECT * FROM ai_models WHERE id = ? AND enabled = 1 LIMIT 1`)
    .bind(modelId)
    .first<AIModelRow>()
}

function computeCost(
  inputTokens: number,
  outputTokens: number,
  model: AIModelRow,
): number {
  const input = (inputTokens / 1000) * model.cost_per_1k_input_usd
  const output = (outputTokens / 1000) * model.cost_per_1k_output_usd
  return Math.round((input + output) * 1_000_000) / 1_000_000
}

async function logDecision(
  db: D1Database,
  args: {
    userId: string
    pipelineRunId: string | null
    subtaskId: string | null
    agentName: string
    taskType: string
    policyId: string | null
    selectedModelId: string
    attemptedModels: string[]
    usedFallback: boolean
    inputTokens: number
    outputTokens: number
    costUsd: number
    latencyMs: number
    success: boolean
    error: string | null
  },
): Promise<void> {
  const id = crypto.randomUUID()
  const now = Math.floor(Date.now() / 1000)
  try {
    await db
      .prepare(
        `INSERT INTO ai_routing_decisions
         (id, user_id, pipeline_run_id, subtask_id, agent_name, task_type,
          policy_id, selected_model_id, attempted_models_json, used_fallback,
          input_tokens, output_tokens, cost_usd, latency_ms, success, error, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        args.userId,
        args.pipelineRunId,
        args.subtaskId,
        args.agentName,
        args.taskType,
        args.policyId,
        args.selectedModelId,
        JSON.stringify(args.attemptedModels),
        args.usedFallback ? 1 : 0,
        args.inputTokens,
        args.outputTokens,
        args.costUsd,
        args.latencyMs,
        args.success ? 1 : 0,
        args.error,
        now,
      )
      .run()
  } catch {
    /* decision logging is best-effort; don't fail the call if it logs poorly */
  }
}
