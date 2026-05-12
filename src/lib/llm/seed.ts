/**
 * Seed default providers, models, and routing policy on first call.
 * Sprint 13 v0.1 + Sprint 16 v0.1 + v0.2 (compose_section / assemble_page).
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

  const providers = [
    { id: 'anthropic', display: 'Anthropic', api_base: 'https://api.anthropic.com', auth: 'api_key', secret: 'ANTHROPIC_API_KEY' },
    { id: 'workers-ai', display: 'Cloudflare Workers AI', api_base: null, auth: 'binding', secret: null },
  ]
  for (const p of providers) {
    await db.prepare(`INSERT OR IGNORE INTO ai_providers (id, display_name, api_base_url, auth_method, api_key_secret_name, enabled, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)`).bind(p.id, p.display, p.api_base, p.auth, p.secret, now).run()
  }

  const models = [
    { id: 'claude-opus-4-7', provider: 'anthropic', display: 'Claude Opus 4.7', model_string: 'claude-opus-4-7', ctx: 200000, max_out: 32000, in_cost: 0.015, out_cost: 0.075, tier: 'premium', license: 'proprietary', tool: 1, vision: 1, json: 1, notes: 'Most capable. Hardest reasoning tasks.' },
    { id: 'claude-sonnet-4-5', provider: 'anthropic', display: 'Claude Sonnet 4.5', model_string: 'claude-sonnet-4-5', ctx: 200000, max_out: 8192, in_cost: 0.003, out_cost: 0.015, tier: 'standard', license: 'proprietary', tool: 1, vision: 1, json: 1, notes: 'Balanced quality/cost. Default for creative + reasoning.' },
    { id: 'claude-haiku-4-5', provider: 'anthropic', display: 'Claude Haiku 4.5', model_string: 'claude-haiku-4-5', ctx: 200000, max_out: 8192, in_cost: 0.0008, out_cost: 0.004, tier: 'cheap', license: 'proprietary', tool: 1, vision: 1, json: 1, notes: '~75% cheaper than Sonnet. Structured output.' },
    { id: 'cf-qwen3-30b', provider: 'workers-ai', display: 'Qwen3 30B (Workers AI)', model_string: '@cf/qwen/qwen3-30b-a3b-fp8', ctx: 32768, max_out: 4096, in_cost: 0.000051, out_cost: 0.00034, tier: 'free', license: 'free_tier', tool: 1, vision: 0, json: 1, notes: 'MoE 30B. Cheap fallback target.' },
    { id: 'cf-qwen-coder-32b', provider: 'workers-ai', display: 'Qwen 2.5 Coder 32B (Workers AI)', model_string: '@cf/qwen/qwen2.5-coder-32b-instruct', ctx: 32768, max_out: 4096, in_cost: 0.000051, out_cost: 0.00034, tier: 'free', license: 'free_tier', tool: 0, vision: 0, json: 0, notes: 'Code-specialized. FORGE fallback.' },
    { id: 'cf-gemma-3-12b', provider: 'workers-ai', display: 'Gemma 3 12B (Workers AI)', model_string: '@cf/google/gemma-3-12b-it', ctx: 128000, max_out: 4096, in_cost: 0.000051, out_cost: 0.00034, tier: 'free', license: 'free_tier', tool: 0, vision: 1, json: 0, notes: 'Lightweight, 128K context.' },
  ]
  for (const m of models) {
    await db.prepare(`INSERT OR IGNORE INTO ai_models (id, provider_id, display_name, model_string, context_window, max_output_tokens, cost_per_1k_input_usd, cost_per_1k_output_usd, tier, license, supports_tool_use, supports_vision, supports_json_mode, enabled, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`).bind(m.id, m.provider, m.display, m.model_string, m.ctx, m.max_out, m.in_cost, m.out_cost, m.tier, m.license, m.tool, m.vision, m.json, m.notes, now).run()
  }

  const sonnetFallbacks = JSON.stringify(['claude-haiku-4-5', 'cf-qwen3-30b'])
  const haikuFallbacks = JSON.stringify(['claude-sonnet-4-5', 'cf-qwen3-30b'])
  const codeFallbacks = JSON.stringify(['claude-haiku-4-5', 'cf-qwen-coder-32b'])
  const opusFallbacks = JSON.stringify(['claude-sonnet-4-5', 'claude-haiku-4-5'])

  const policies = [
    { agent: 'hermes', task: 'decompose', primary: 'claude-sonnet-4-5', fallbacks: sonnetFallbacks, notes: 'DAG planning' },
    { agent: 'hermes', task: 'default', primary: 'claude-sonnet-4-5', fallbacks: sonnetFallbacks, notes: 'Default for HERMES' },
    { agent: 'sentinel', task: 'review', primary: 'claude-haiku-4-5', fallbacks: haikuFallbacks, notes: 'Structured review' },
    { agent: 'sentinel', task: 'default', primary: 'claude-haiku-4-5', fallbacks: haikuFallbacks, notes: 'Default for SENTINEL' },
    { agent: 'herald', task: 'draft', primary: 'claude-sonnet-4-5', fallbacks: sonnetFallbacks, notes: 'Content drafting' },
    { agent: 'herald', task: 'default', primary: 'claude-sonnet-4-5', fallbacks: sonnetFallbacks, notes: 'Default for HERALD' },
    { agent: 'dispatch', task: 'package', primary: 'claude-haiku-4-5', fallbacks: haikuFallbacks, notes: 'Packaging' },
    { agent: 'dispatch', task: 'default', primary: 'claude-haiku-4-5', fallbacks: haikuFallbacks, notes: 'Default for DISPATCH' },
    { agent: 'intake', task: 'qualify', primary: 'claude-haiku-4-5', fallbacks: haikuFallbacks, notes: 'Lead qualification' },
    { agent: 'intake', task: 'default', primary: 'claude-haiku-4-5', fallbacks: haikuFallbacks, notes: 'Default for INTAKE' },
    { agent: 'forge', task: 'default', primary: 'claude-sonnet-4-5', fallbacks: codeFallbacks, notes: 'Code generation' },
    { agent: 'builder', task: 'default', primary: 'claude-sonnet-4-5', fallbacks: codeFallbacks, notes: 'App building' },
    { agent: 'atlas', task: 'default', primary: 'claude-sonnet-4-5', fallbacks: sonnetFallbacks, notes: 'Engineering calculations' },
    { agent: 'reel', task: 'default', primary: 'claude-sonnet-4-5', fallbacks: sonnetFallbacks, notes: 'Video scripts' },
    { agent: 'anchor', task: 'default', primary: 'claude-haiku-4-5', fallbacks: haikuFallbacks, notes: 'MRR reports' },
    { agent: 'scout', task: 'default', primary: 'claude-sonnet-4-5', fallbacks: sonnetFallbacks, notes: 'Proposals' },
    { agent: 'nexus', task: 'default', primary: 'claude-sonnet-4-5', fallbacks: sonnetFallbacks, notes: 'Orchestration' },
    // Sprint 16 — Design Build agents
    { agent: 'designer', task: 'design_language', primary: 'claude-sonnet-4-5', fallbacks: sonnetFallbacks, notes: 'Design token generation — judgment matters' },
    { agent: 'designer', task: 'default', primary: 'claude-sonnet-4-5', fallbacks: sonnetFallbacks, notes: 'Default for DESIGNER' },
    { agent: 'composer', task: 'compose_page', primary: 'claude-sonnet-4-5', fallbacks: opusFallbacks, notes: 'Full HTML page (legacy single-shot mode)' },
    { agent: 'composer', task: 'compose_section', primary: 'claude-sonnet-4-5', fallbacks: opusFallbacks, notes: 'Single section HTML — v0.2 per-section mode' },
    { agent: 'composer', task: 'default', primary: 'claude-sonnet-4-5', fallbacks: opusFallbacks, notes: 'Default for COMPOSER' },
    { agent: 'critic', task: 'critique_design', primary: 'claude-haiku-4-5', fallbacks: haikuFallbacks, notes: 'Structured JSON critique' },
    { agent: 'critic', task: 'default', primary: 'claude-haiku-4-5', fallbacks: haikuFallbacks, notes: 'Default for CRITIC' },
    // ASSEMBLER — pseudo-agent, no LLM call, placeholder policy in case lookup falls through
    { agent: 'assembler', task: 'assemble_page', primary: 'claude-haiku-4-5', fallbacks: haikuFallbacks, notes: 'Pseudo-agent — deterministic, no LLM call (placeholder)' },
    { agent: 'assembler', task: 'default', primary: 'claude-haiku-4-5', fallbacks: haikuFallbacks, notes: 'Default for ASSEMBLER (pseudo-agent)' },
    { agent: '*', task: 'default', primary: 'claude-sonnet-4-5', fallbacks: sonnetFallbacks, notes: 'Wildcard fallback' },
  ]
  for (const p of policies) {
    const id = crypto.randomUUID()
    await db.prepare(`INSERT OR IGNORE INTO ai_routing_policy (id, agent_name, task_type, primary_model_id, fallback_chain_json, priority, enabled, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 5, 1, ?, ?, ?)`).bind(id, p.agent, p.task, p.primary, p.fallbacks, p.notes, now, now).run()
  }

  return {
    seeded: true,
    providers: providers.length,
    models: models.length,
    policies: policies.length,
  }
}
