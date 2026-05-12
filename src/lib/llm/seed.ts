/**
 * Seed default providers, models, and routing policy on first call.
 *
 * Idempotent: checks if ai_providers is empty before inserting.
 * INSERT OR IGNORE protects against partial seeds.
 *
 * Edit this seed when adding new providers/models or revising the default policy.
 * The /ai-providers UI (Sprint 13 v0.2) will let you override entries at runtime.
 */

import type { D1Database } from '@cloudflare/workers-types'

export async function seedDefaults(db: D1Database): Promise<{
  seeded: boolean
  providers: number
  models: number
  policies: number
}> {
  const existing = await db
    .prepare(`SELECT COUNT(*) AS c FROM ai_providers`)
    .first<{ c: number }>()
  if ((existing?.c ?? 0) > 0) {
    return { seeded: false, providers: 0, models: 0, policies: 0 }
  }

  const now = Math.floor(Date.now() / 1000)

  // ── Providers ──
  const providers = [
    {
      id: 'anthropic',
      display: 'Anthropic',
      api_base: 'https://api.anthropic.com',
      auth: 'api_key',
      secret: 'ANTHROPIC_API_KEY',
    },
    {
      id: 'workers-ai',
      display: 'Cloudflare Workers AI',
      api_base: null,
      auth: 'binding',
      secret: null,
    },
  ]
  for (const p of providers) {
    await db
      .prepare(
        `INSERT OR IGNORE INTO ai_providers
         (id, display_name, api_base_url, auth_method, api_key_secret_name, enabled, created_at)
         VALUES (?, ?, ?, ?, ?, 1, ?)`,
      )
      .bind(p.id, p.display, p.api_base, p.auth, p.secret, now)
      .run()
  }

  // ── Models ──
  // Pricing in USD per 1K tokens (Anthropic published; Workers AI per Cloudflare changelog).
  const models = [
    // Anthropic
    {
      id: 'claude-opus-4-7', provider: 'anthropic',
      display: 'Claude Opus 4.7', model_string: 'claude-opus-4-7',
      ctx: 200000, max_out: 32000,
      in_cost: 0.015, out_cost: 0.075,
      tier: 'premium', license: 'proprietary',
      tool: 1, vision: 1, json: 1,
      notes: 'Most capable. Use for hardest reasoning tasks.',
    },
    {
      id: 'claude-sonnet-4-5', provider: 'anthropic',
      display: 'Claude Sonnet 4.5', model_string: 'claude-sonnet-4-5',
      ctx: 200000, max_out: 8192,
      in_cost: 0.003, out_cost: 0.015,
      tier: 'standard', license: 'proprietary',
      tool: 1, vision: 1, json: 1,
      notes: 'Balanced quality/cost. Default for creative + reasoning work.',
    },
    {
      id: 'claude-haiku-4-5', provider: 'anthropic',
      display: 'Claude Haiku 4.5', model_string: 'claude-haiku-4-5',
      ctx: 200000, max_out: 8192,
      in_cost: 0.0008, out_cost: 0.004,
      tier: 'cheap', license: 'proprietary',
      tool: 1, vision: 1, json: 1,
      notes: '~75% cheaper than Sonnet. Use for structured output (review, qualify, package).',
    },
    // Workers AI (per Cloudflare changelog 2026-04 pricing)
    {
      id: 'cf-qwen3-30b', provider: 'workers-ai',
      display: 'Qwen3 30B (Workers AI)',
      model_string: '@cf/qwen/qwen3-30b-a3b-fp8',
      ctx: 32768, max_out: 4096,
      in_cost: 0.000051, out_cost: 0.00034,
      tier: 'free', license: 'free_tier',
      tool: 1, vision: 0, json: 1,
      notes: 'MoE 30B with reasoning + function calling. Cheap fallback target.',
    },
    {
      id: 'cf-qwen-coder-32b', provider: 'workers-ai',
      display: 'Qwen 2.5 Coder 32B (Workers AI)',
      model_string: '@cf/qwen/qwen2.5-coder-32b-instruct',
      ctx: 32768, max_out: 4096,
      in_cost: 0.000051, out_cost: 0.00034,
      tier: 'free', license: 'free_tier',
      tool: 0, vision: 0, json: 0,
      notes: 'Code-specialized. Use for FORGE fallback.',
    },
    {
      id: 'cf-gemma-3-12b', provider: 'workers-ai',
      display: 'Gemma 3 12B (Workers AI)',
      model_string: '@cf/google/gemma-3-12b-it',
      ctx: 128000, max_out: 4096,
      in_cost: 0.000051, out_cost: 0.00034,
      tier: 'free', license: 'free_tier',
      tool: 0, vision: 1, json: 0,
      notes: 'Lightweight, 128K context. Long-doc summarization.',
    },
  ]
  for (const m of models) {
    await db
      .prepare(
        `INSERT OR IGNORE INTO ai_models
         (id, provider_id, display_name, model_string, context_window, max_output_tokens,
          cost_per_1k_input_usd, cost_per_1k_output_usd, tier, license,
          supports_tool_use, supports_vision, supports_json_mode, enabled, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      )
      .bind(
        m.id, m.provider, m.display, m.model_string, m.ctx, m.max_out,
        m.in_cost, m.out_cost, m.tier, m.license,
        m.tool, m.vision, m.json, m.notes, now,
      )
      .run()
  }

  // ── Routing policy ──
  // Default heuristic:
  //   - Reasoning / creative work → Sonnet 4.5
  //   - Structured output / packaging / review → Haiku 4.5 (75% cheaper)
  //   - Fallback chain ends with Workers AI free tier so we never fully block
  const sonnetFallbacks = JSON.stringify(['claude-haiku-4-5', 'cf-qwen3-30b'])
  const haikuFallbacks = JSON.stringify(['claude-sonnet-4-5', 'cf-qwen3-30b'])
  const codeFallbacks = JSON.stringify(['claude-haiku-4-5', 'cf-qwen-coder-32b'])

  const policies = [
    // HERMES decomposer — DAG planning needs reasoning
    { agent: 'hermes', task: 'decompose', primary: 'claude-sonnet-4-5', fallbacks: sonnetFallbacks,
      notes: 'DAG planning requires solid reasoning' },
    { agent: 'hermes', task: 'default', primary: 'claude-sonnet-4-5', fallbacks: sonnetFallbacks,
      notes: 'Default for HERMES' },
    // SENTINEL — structured JSON review, Haiku is plenty
    { agent: 'sentinel', task: 'review', primary: 'claude-haiku-4-5', fallbacks: haikuFallbacks,
      notes: 'Structured JSON output; ~75% cheaper than Sonnet' },
    { agent: 'sentinel', task: 'default', primary: 'claude-haiku-4-5', fallbacks: haikuFallbacks,
      notes: 'Default for SENTINEL' },
    // HERALD — creative content quality matters
    { agent: 'herald', task: 'draft', primary: 'claude-sonnet-4-5', fallbacks: sonnetFallbacks,
      notes: 'Content drafting; quality matters' },
    { agent: 'herald', task: 'default', primary: 'claude-sonnet-4-5', fallbacks: sonnetFallbacks,
      notes: 'Default for HERALD' },
    // DISPATCH — consolidation/packaging
    { agent: 'dispatch', task: 'package', primary: 'claude-haiku-4-5', fallbacks: haikuFallbacks,
      notes: 'Packaging is mechanical; Haiku is fine' },
    { agent: 'dispatch', task: 'default', primary: 'claude-haiku-4-5', fallbacks: haikuFallbacks,
      notes: 'Default for DISPATCH' },
    // INTAKE — structured qualification
    { agent: 'intake', task: 'qualify', primary: 'claude-haiku-4-5', fallbacks: haikuFallbacks,
      notes: 'Lead qualification JSON output' },
    { agent: 'intake', task: 'default', primary: 'claude-haiku-4-5', fallbacks: haikuFallbacks,
      notes: 'Default for INTAKE' },
    // FORGE — code generation
    { agent: 'forge', task: 'default', primary: 'claude-sonnet-4-5', fallbacks: codeFallbacks,
      notes: 'Code generation; Qwen Coder is the code fallback' },
    // BUILDER
    { agent: 'builder', task: 'default', primary: 'claude-sonnet-4-5', fallbacks: codeFallbacks,
      notes: 'App building; code-focused fallback' },
    // ATLAS — engineering accuracy
    { agent: 'atlas', task: 'default', primary: 'claude-sonnet-4-5', fallbacks: sonnetFallbacks,
      notes: 'API 610/682 calculations require accuracy' },
    // REEL
    { agent: 'reel', task: 'default', primary: 'claude-sonnet-4-5', fallbacks: sonnetFallbacks,
      notes: 'Video scripts; creative' },
    // ANCHOR — revenue/MRR reports
    { agent: 'anchor', task: 'default', primary: 'claude-haiku-4-5', fallbacks: haikuFallbacks,
      notes: 'Data summarization; cheap is fine' },
    // SCOUT — proposal writing
    { agent: 'scout', task: 'default', primary: 'claude-sonnet-4-5', fallbacks: sonnetFallbacks,
      notes: 'Lead scoring + proposal drafts' },
    // NEXUS
    { agent: 'nexus', task: 'default', primary: 'claude-sonnet-4-5', fallbacks: sonnetFallbacks,
      notes: 'Orchestrator routing decisions' },
    // Global wildcard fallback
    { agent: '*', task: 'default', primary: 'claude-sonnet-4-5', fallbacks: sonnetFallbacks,
      notes: 'Wildcard fallback when no specific policy matches' },
  ]
  for (const p of policies) {
    const id = crypto.randomUUID()
    await db
      .prepare(
        `INSERT OR IGNORE INTO ai_routing_policy
         (id, agent_name, task_type, primary_model_id, fallback_chain_json,
          priority, enabled, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 5, 1, ?, ?, ?)`,
      )
      .bind(id, p.agent, p.task, p.primary, p.fallbacks, p.notes, now, now)
      .run()
  }

  return {
    seeded: true,
    providers: providers.length,
    models: models.length,
    policies: policies.length,
  }
}
