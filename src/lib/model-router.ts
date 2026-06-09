/**
 * model-router.ts
 * Resolves the winning model for a given agent + task_type from the NEXUS
 * routing tables. Results are KV-cached for 60 s.
 * Falls back to claude-sonnet-4-5 on any lookup failure.
 */

export type RoutingProvider = 'anthropic' | 'openrouter' | 'openai'

export interface RouteResult {
  model_id:            string
  provider:            RoutingProvider
  cost_input_per_1m:  number
  cost_output_per_1m: number
  tier:                'standard' | 'premium'
}

const DEFAULT_ROUTE: RouteResult = {
  model_id:            'claude-sonnet-4-5',
  provider:            'anthropic',
  cost_input_per_1m:  3.0,
  cost_output_per_1m: 15.0,
  tier:                'standard',
}

// Agent → primary task_type for routing lookup
export const AGENT_TASK_MAP: Record<string, string> = {
  NEXUS:     'intent_classify',
  FORGE:     'code_generate',
  BUILDER:   'code_generate',
  HERALD:    'content_write',
  ATLAS:     'engineering_calc',
  SCOUT:     'outreach_personalize',
  INTAKE:    'json_extract',
  SENTINEL:  'qa_precheck',
  ORACLE:    'research_summarize',
  ANCHOR:    'research_summarize',
  DISPATCH:  'content_write',
  REEL:      'content_write',
  HERMES:    'content_write',
  DESIGNER:  'content_write',
  COMPOSER:  'content_write',
  CRITIC:    'qa_review',
  ASSEMBLER: 'code_generate',
}

function inferProvider(model_id: string): RoutingProvider {
  if (model_id.startsWith('claude-')) return 'anthropic'
  if (
    model_id.startsWith('gpt-') ||
    model_id.startsWith('o1-') ||
    model_id.startsWith('o3-') ||
    model_id.startsWith('o4-')
  ) return 'openai'
  return 'openrouter'
}

export async function getRoute(
  db:               D1Database,
  kv:               KVNamespace,
  agent:            string,
  taskTypeOverride?: string,
  qualityTier:      'standard' | 'premium' = 'standard',
): Promise<RouteResult> {
  const agentKey = agent.toUpperCase()
  const taskType = taskTypeOverride ?? AGENT_TASK_MAP[agentKey] ?? 'content_write'
  const cacheKey = `route:v1:${qualityTier}:${agentKey}:${taskType}`

  // 1. KV cache
  try {
    const cached = await kv.get(cacheKey)
    if (cached) return JSON.parse(cached) as RouteResult
  } catch { /* cache miss — continue to D1 */ }

  // 2. D1 lookup
  try {
    type RoutingRow = {
      winning_model:       string
      cost_input_per_1m:  number | null
      cost_output_per_1m: number | null
    }
    let row: RoutingRow | null = null

    if (qualityTier === 'premium') {
      row = await db.prepare(
        `SELECT r.winning_model, r.cost_input_per_1m, m.cost_output_per_1m
           FROM premium_routing r
           LEFT JOIN model_registry m ON m.model_id = r.winning_model
          WHERE r.agent = ? AND r.task_type = ? AND r.quality_tier = 'premium'
            AND r.status IN ('converged','best_available')
          LIMIT 1`
      ).bind(agentKey, taskType).first<RoutingRow>()
    } else {
      row = await db.prepare(
        `SELECT r.winning_model, m.cost_input_per_1m, m.cost_output_per_1m
           FROM agent_model_routing r
           LEFT JOIN model_registry m ON m.model_id = r.winning_model
          WHERE r.agent = ? AND r.task_type = ?
          LIMIT 1`
      ).bind(agentKey, taskType).first<RoutingRow>()
    }

    if (!row?.winning_model) {
      if (qualityTier === 'premium') return getRoute(db, kv, agent, taskTypeOverride, 'standard')
      return DEFAULT_ROUTE
    }

    const result: RouteResult = {
      model_id:            row.winning_model,
      provider:            inferProvider(row.winning_model),
      cost_input_per_1m:  row.cost_input_per_1m  ?? 0,
      cost_output_per_1m: row.cost_output_per_1m ?? 0,
      tier:                qualityTier,
    }

    // Cache 60s
    await kv.put(cacheKey, JSON.stringify(result), { expirationTtl: 60 }).catch(() => {})
    return result
  } catch (err) {
    console.error('[model-router] D1 lookup failed:', err)
    return DEFAULT_ROUTE
  }
}
