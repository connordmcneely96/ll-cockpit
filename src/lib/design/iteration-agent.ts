/**
 * Design iteration agent — Sprint 16 v0.3.0.
 *
 * Programmatic Anthropic tool-use loop that lets the user refine a finished
 * design brief by chatting. The agent loads the brief's current edit state
 * (latest iteration's tokens + HTML), takes a user message, and may call
 * one or more tools per turn (max MAX_TOOL_HOPS) to mutate state. Each tool
 * is a pure function over D1 + R2 + (rarely) the Anthropic API.
 *
 * For v0.3.0 MVP, four tools are fully implemented:
 *   - update_design_tokens   patches the latest iteration's design_tokens_json
 *   - apply_token_to_html    regenerates the :root CSS vars in the page <style>
 *   - save_iteration         clones current state as a new design_iterations row
 *   - critique               re-scores the current HTML using CRITIC system prompt
 *
 * The remaining tools are STUBBED with descriptive "not implemented" results.
 * They are exposed in the catalog so Claude knows they exist and can reference
 * them in conversation, but calls return safe NOOP results.
 */

import type { D1Database, R2Bucket } from '@cloudflare/workers-types'
import type {
  DesignBriefRow,
  DesignIterationRow,
  DesignTokens,
  CloudflareEnv,
} from '@/types'
import type {
  DesignAssistantToolUse,
  DesignToolResult,
  DesignToolName,
  DesignToolDefinition,
} from '@/types/design-iteration'
import { persistDesignChatMessage } from './iteration-chat'
import type { AnthropicTurn } from './iteration-chat'
import { calculateCost } from '@/lib/cost'

const MODEL_ID = 'claude-sonnet-4-5'
const MAX_TOKENS_PER_CALL = 4096
const MAX_TOOL_HOPS = 6   // safety bound; resets at end_turn

// ──────────────────────────────────────────────────────────
// Tool catalog
// ──────────────────────────────────────────────────────────

export const TOOL_DEFINITIONS: DesignToolDefinition[] = [
  {
    name: 'update_design_tokens',
    description:
      'Patch the current design tokens (palette, typography, spacing, motion). Use this for color, font, or spacing changes. The patch is merged into the existing tokens; only include keys you want to change. After calling this, call apply_token_to_html to push the changes into the rendered page.',
    input_schema: {
      type: 'object',
      properties: {
        patch: {
          type: 'object',
          description: 'Partial DesignTokens object. Example: { "palette": { "primary": "#0a4d6b" } }',
        },
        rationale: {
          type: 'string',
          description: 'One-sentence explanation of the change for the iteration log.',
        },
      },
      required: ['patch'],
    },
  },
  {
    name: 'apply_token_to_html',
    description:
      'Regenerate the :root CSS variables block in the page <style> tag using the current design tokens. Run after update_design_tokens to push color/typography changes into the rendered page without re-running COMPOSER.',
    input_schema: { type: 'object', properties: {} },
    uses_code_execution: false,
  },
  {
    name: 'save_iteration',
    description:
      'Commit the current edit state as a new design_iteration row (iteration_number + 1). Call this at the end of a coherent set of changes so the user has a stable preview URL and so the brief\'s history is clean.',
    input_schema: {
      type: 'object',
      properties: {
        client_feedback: {
          type: 'string',
          description: 'The user\'s original prompt that triggered this iteration, for the iteration log.',
        },
        notes: { type: 'string', description: 'Optional internal notes.' },
      },
    },
  },
  {
    name: 'critique',
    description:
      'Re-run CRITIC against the current HTML. Returns a 0–100 score plus strengths / issues / suggestions. Use this to validate before save_iteration or to give the user a quality check.',
    input_schema: {
      type: 'object',
      properties: {
        focus_areas: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional focus list, e.g. ["accessibility", "hierarchy"]',
        },
      },
    },
  },
  // ───── stubbed for v0.3.0 ─────
  {
    name: 'regenerate_section',
    description:
      'Re-run COMPOSER for a single section with refined instructions. Use when the user wants to overhaul a section\'s copy or structure (not just colors). NOTE: v0.3.0 — not yet implemented.',
    input_schema: {
      type: 'object',
      properties: {
        section_slug: { type: 'string' },
        refinement: { type: 'string' },
        preserve_structure: { type: 'boolean' },
      },
      required: ['section_slug', 'refinement'],
    },
  },
  {
    name: 'splice_section',
    description: 'Replace one section\'s HTML in the assembled page. v0.3.0 — not yet implemented.',
    input_schema: {
      type: 'object',
      properties: {
        section_slug: { type: 'string' },
        new_html: { type: 'string' },
      },
      required: ['section_slug', 'new_html'],
    },
    uses_code_execution: true,
  },
  {
    name: 'assemble_html',
    description: 'Re-stitch all section HTML into final page. v0.3.0 — not yet implemented.',
    input_schema: { type: 'object', properties: {} },
    uses_code_execution: true,
  },
  {
    name: 'add_section',
    description: 'Add a new section after a target slug. v0.3.0 — not yet implemented.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
        after_slug: { type: 'string' },
      },
      required: ['name'],
    },
  },
  {
    name: 'remove_section',
    description: 'Remove a section slot. v0.3.0 — not yet implemented.',
    input_schema: {
      type: 'object',
      properties: { section_slug: { type: 'string' } },
      required: ['section_slug'],
    },
  },
  {
    name: 'apply_preset',
    description: 'Apply a named visual preset (e.g. "more SaaS", "luxury"). v0.3.0 — not yet implemented.',
    input_schema: {
      type: 'object',
      properties: { preset_name: { type: 'string' } },
      required: ['preset_name'],
    },
  },
  {
    name: 'analyze_reference_url',
    description:
      'Use Playwright + vision to scrape a reference URL and extract design notes (tokens, layout, copy). v0.3.0 — not yet implemented.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        focus: { type: 'string', enum: ['layout', 'color', 'typography', 'tone', 'all'] },
      },
      required: ['url'],
    },
    requires_playwright: true,
  },
]

// ──────────────────────────────────────────────────────────
// System prompt
// ──────────────────────────────────────────────────────────

export function buildSystemPrompt(brief: DesignBriefRow, currentIter: DesignIterationRow | null): string {
  return `You are DESIGNER ITERATE, the design iteration agent for the LL Cockpit.

You are helping the user refine a finished design build. The original brief was for ${brief.client_name}: ${brief.business_description.slice(0, 240)}.

Mood and tone: ${brief.mood_tone}
Must-have sections: ${brief.must_have_sections}
Brand colors (if specified): ${brief.brand_colors ?? 'none'}
Constraints: ${brief.constraints ?? 'none'}

Current iteration: ${currentIter ? `#${currentIter.iteration_number} (${currentIter.status})` : 'none'}
Current CRITIC score: ${currentIter?.critic_score ?? 'not yet scored'}

Your job:
  • Listen to the user's refinement request.
  • Use the available tools to make the change. Prefer the smallest tool that can do the job.
  • For color/typography/spacing changes: update_design_tokens → apply_token_to_html.
  • For copy or structural changes: regenerate_section / add_section / remove_section.
  • After a coherent set of changes, call save_iteration to commit a new iteration row.
  • If the user asks for a quality check, call critique.
  • Keep replies concise. Don't repeat the brief back unless asked.
  • If a request is ambiguous, ask one clarifying question rather than guessing.
  • If a tool returns "not yet implemented", explain that and offer the closest implemented alternative.

Design principles to enforce silently:
  • Accessibility: CTA contrast ≥ 4.5:1, focus rings visible, semantic HTML.
  • Hierarchy: one h1 hero, h2 per section, h3 per card; no skipped levels.
  • Type scale: don't mix more than two font families.
  • Spacing: keep a consistent rhythm; don't introduce arbitrary px values.

Tone: direct, professional, no hedging.`
}

// ──────────────────────────────────────────────────────────
// Tool dispatcher + implementations
// ──────────────────────────────────────────────────────────

interface ToolDeps {
  env: CloudflareEnv
  apiKey: string
  userId: string
  briefId: string
}

export async function executeIterationTool(
  toolUse: DesignAssistantToolUse,
  deps: ToolDeps,
): Promise<DesignToolResult> {
  try {
    switch (toolUse.name) {
      case 'update_design_tokens':
        return await runUpdateDesignTokens(toolUse, deps)
      case 'apply_token_to_html':
        return await runApplyTokenToHtml(toolUse, deps)
      case 'save_iteration':
        return await runSaveIteration(toolUse, deps)
      case 'critique':
        return await runCritique(toolUse, deps)
      // stubs — acknowledge but return safe noop
      case 'regenerate_section':
      case 'splice_section':
      case 'assemble_html':
      case 'add_section':
      case 'remove_section':
      case 'apply_preset':
      case 'analyze_reference_url':
        return notImplemented(toolUse)
      default:
        return {
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: `Unknown tool: ${toolUse.name}`,
          is_error: true,
        }
    }
  } catch (err) {
    return {
      type: 'tool_result',
      tool_use_id: toolUse.id,
      content: `Tool execution failed: ${err instanceof Error ? err.message : String(err)}`,
      is_error: true,
    }
  }
}

async function runUpdateDesignTokens(
  toolUse: DesignAssistantToolUse,
  deps: ToolDeps,
): Promise<DesignToolResult> {
  const input = toolUse.input as { patch?: Partial<DesignTokens>; rationale?: string }
  if (!input.patch || typeof input.patch !== 'object') {
    return {
      type: 'tool_result',
      tool_use_id: toolUse.id,
      content: 'patch must be an object containing partial design tokens.',
      is_error: true,
    }
  }

  const iter = await loadLatestIteration(deps.env.DB, deps.briefId)
  if (!iter) return missingIteration(toolUse)

  const currentTokens: DesignTokens =
    iter.design_tokens_json ? safeParse(iter.design_tokens_json) ?? emptyTokens() : emptyTokens()

  const merged = deepMerge(currentTokens, input.patch) as DesignTokens
  if (input.rationale) merged.rationale = input.rationale

  await deps.env.DB
    .prepare(`UPDATE design_iterations SET design_tokens_json = ? WHERE id = ?`)
    .bind(JSON.stringify(merged), iter.id)
    .run()

  return {
    type: 'tool_result',
    tool_use_id: toolUse.id,
    content: JSON.stringify({ ok: true, updated_keys: Object.keys(input.patch), tokens: merged }),
  }
}

async function runApplyTokenToHtml(
  toolUse: DesignAssistantToolUse,
  deps: ToolDeps,
): Promise<DesignToolResult> {
  const iter = await loadLatestIteration(deps.env.DB, deps.briefId)
  if (!iter) return missingIteration(toolUse)
  if (!iter.page_html) {
    return {
      type: 'tool_result',
      tool_use_id: toolUse.id,
      content: 'Iteration has no page_html yet — nothing to apply tokens to.',
      is_error: true,
    }
  }
  const tokens: DesignTokens = iter.design_tokens_json ? safeParse(iter.design_tokens_json) ?? emptyTokens() : emptyTokens()

  const newRootBlock = buildRootCssBlock(tokens)
  // Replace whatever :root { ... } block is currently in the first <style> tag.
  // Conservative regex: matches :root { ... } including nested braces? No nesting in CSS vars.
  const updated = iter.page_html.replace(/:root\s*\{[^}]*\}/, newRootBlock)

  if (updated === iter.page_html) {
    return {
      type: 'tool_result',
      tool_use_id: toolUse.id,
      content: 'No :root CSS variable block found in page_html to replace. Page may need full re-assembly.',
      is_error: true,
    }
  }

  await deps.env.DB
    .prepare(`UPDATE design_iterations SET page_html = ? WHERE id = ?`)
    .bind(updated, iter.id)
    .run()

  return {
    type: 'tool_result',
    tool_use_id: toolUse.id,
    content: JSON.stringify({ ok: true, applied: newRootBlock.length, html_length: updated.length }),
  }
}

async function runSaveIteration(
  toolUse: DesignAssistantToolUse,
  deps: ToolDeps,
): Promise<DesignToolResult> {
  const input = toolUse.input as { client_feedback?: string; notes?: string }
  const current = await loadLatestIteration(deps.env.DB, deps.briefId)
  if (!current) return missingIteration(toolUse)

  const newId = crypto.randomUUID()
  const now = Math.floor(Date.now() / 1000)
  const nextNumber = current.iteration_number + 1

  await deps.env.DB
    .prepare(
      `INSERT INTO design_iterations
         (id, brief_id, iteration_number, orchestrator_run_id, client_feedback,
          design_tokens_json, page_html, status, cost_usd, tokens, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'ready', 0, 0, ?)`,
    )
    .bind(
      newId,
      current.brief_id,
      nextNumber,
      current.orchestrator_run_id,
      input.client_feedback ?? null,
      current.design_tokens_json,
      current.page_html,
      now,
    )
    .run()

  // Bump brief.current_iteration so the detail page picks up the new row
  await deps.env.DB
    .prepare(`UPDATE design_briefs SET current_iteration = ?, updated_at = ? WHERE id = ?`)
    .bind(nextNumber, now, deps.briefId)
    .run()

  return {
    type: 'tool_result',
    tool_use_id: toolUse.id,
    content: JSON.stringify({
      ok: true,
      new_iteration_id: newId,
      iteration_number: nextNumber,
      note: 'New iteration committed. Preview URL not regenerated yet — visit the brief detail page to refresh.',
    }),
  }
}

async function runCritique(
  toolUse: DesignAssistantToolUse,
  deps: ToolDeps,
): Promise<DesignToolResult> {
  const input = toolUse.input as { focus_areas?: string[] }
  const iter = await loadLatestIteration(deps.env.DB, deps.briefId)
  if (!iter || !iter.page_html) return missingIteration(toolUse)

  // Call Anthropic directly with the existing CRITIC system prompt distilled.
  const focus = input.focus_areas?.length ? `Focus areas: ${input.focus_areas.join(', ')}.` : ''
  const body = JSON.stringify({
    model: MODEL_ID,
    max_tokens: 1024,
    system:
      'You are CRITIC, a design quality reviewer. Score the provided HTML 0–100. Return STRICT JSON with this shape: {"score": number, "verdict": "PASS"|"FAIL", "strengths": string[], "issues": string[], "suggestions": string[]}. PASS ≥ 80.',
    messages: [
      {
        role: 'user',
        content: `${focus}\n\nHTML to critique (truncated to 12000 chars if longer):\n\n${iter.page_html.slice(0, 12000)}`,
      },
    ],
  })
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': deps.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body,
  })
  if (!res.ok) {
    return {
      type: 'tool_result',
      tool_use_id: toolUse.id,
      content: `CRITIC call failed: ${res.status}`,
      is_error: true,
    }
  }
  type AnthropicResponse = { content?: Array<{ type: string; text?: string }> }
  const data = (await res.json()) as AnthropicResponse
  const text = (data.content ?? []).map((c) => (c.type === 'text' ? c.text ?? '' : '')).join('')

  // Save score back to the iteration row for visibility
  const parsed = safeParse<{ score?: number; verdict?: string }>(text)
  if (parsed?.score !== undefined) {
    await deps.env.DB
      .prepare(`UPDATE design_iterations SET critic_score = ?, critic_feedback = ? WHERE id = ?`)
      .bind(parsed.score, text, iter.id)
      .run()
  }

  return { type: 'tool_result', tool_use_id: toolUse.id, content: text }
}

function notImplemented(toolUse: DesignAssistantToolUse): DesignToolResult {
  return {
    type: 'tool_result',
    tool_use_id: toolUse.id,
    content: `Tool '${toolUse.name}' is in the v0.3.0 catalog but not yet implemented. Suggest a workaround using update_design_tokens or save_iteration if possible.`,
    is_error: false,
  }
}

function missingIteration(toolUse: DesignAssistantToolUse): DesignToolResult {
  return {
    type: 'tool_result',
    tool_use_id: toolUse.id,
    content: 'No design_iterations row found for this brief yet. The brief must complete its initial build before the iteration agent can edit it.',
    is_error: true,
  }
}

// ──────────────────────────────────────────────────────────
// Main agent loop
// ──────────────────────────────────────────────────────────

export interface IterationAgentResult {
  finalText: string
  toolHops: number
  totalInputTokens: number
  totalOutputTokens: number
  totalCostUsd: number
  latencyMs: number
  iterationIdsTouched: string[]
}

/**
 * Run one user-message turn through the iteration agent. Persists all messages
 * (user, every assistant tool-use, every tool_result) as separate D1 rows so
 * the conversation can be fully replayed.
 */
export async function runIterationAgent(args: {
  env: CloudflareEnv
  apiKey: string
  userId: string
  brief: DesignBriefRow
  userMessage: string
  priorTurns: AnthropicTurn[]
}): Promise<IterationAgentResult> {
  const { env, apiKey, userId, brief, userMessage, priorTurns } = args
  const startMs = Date.now()

  // Persist the user's input first so it's preserved even if the LLM call crashes.
  await persistDesignChatMessage(env.DB, {
    briefId: brief.id,
    userId,
    role: 'user',
    content: userMessage,
  })

  const currentIter = await loadLatestIteration(env.DB, brief.id)
  const system = buildSystemPrompt(brief, currentIter)
  const tools = TOOL_DEFINITIONS.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema,
  }))

  const messages: AnthropicTurn[] = [
    ...priorTurns,
    { role: 'user', content: userMessage },
  ]

  let toolHops = 0
  let finalText = ''
  let totalInputTokens = 0
  let totalOutputTokens = 0

  while (toolHops < MAX_TOOL_HOPS) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL_ID,
        max_tokens: MAX_TOKENS_PER_CALL,
        system,
        tools,
        messages,
      }),
    })
    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Anthropic API error ${res.status}: ${err.slice(0, 400)}`)
    }

    type AnthropicResp = {
      content?: Array<
        | { type: 'text'; text: string }
        | { type: 'tool_use'; id: string; name: DesignToolName; input: Record<string, unknown> }
      >
      stop_reason?: string
      usage?: { input_tokens?: number; output_tokens?: number }
    }
    const data = (await res.json()) as AnthropicResp
    totalInputTokens += data.usage?.input_tokens ?? 0
    totalOutputTokens += data.usage?.output_tokens ?? 0

    const blocks = data.content ?? []
    const assistantText = blocks
      .filter((b) => b.type === 'text')
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('\n')
    const toolUses = blocks.filter(
      (b): b is DesignAssistantToolUse => b.type === 'tool_use',
    )

    // Persist the assistant turn (text + tool_calls)
    await persistDesignChatMessage(env.DB, {
      briefId: brief.id,
      userId,
      role: 'assistant',
      content: assistantText || null,
      toolCallsJson: toolUses.length > 0 ? JSON.stringify(toolUses) : null,
      modelId: MODEL_ID,
      inputTokens: data.usage?.input_tokens ?? 0,
      outputTokens: data.usage?.output_tokens ?? 0,
      costUsd: calculateCost(data.usage?.input_tokens ?? 0, data.usage?.output_tokens ?? 0),
    })

    finalText = assistantText

    // End of turn: no more tool_use blocks.
    if (toolUses.length === 0 || data.stop_reason === 'end_turn') break

    // Execute each tool call, gather results.
    const results: DesignToolResult[] = []
    for (const toolUse of toolUses) {
      const result = await executeIterationTool(toolUse, {
        env,
        apiKey,
        userId,
        briefId: brief.id,
      })
      results.push(result)
    }

    // Persist the tool_result turn (Anthropic sees this as a user message).
    await persistDesignChatMessage(env.DB, {
      briefId: brief.id,
      userId,
      role: 'tool_result',
      toolResultsJson: JSON.stringify(results),
    })

    // Update message buffer for the next loop iteration.
    messages.push({ role: 'assistant', content: blocks })
    messages.push({ role: 'user', content: results })

    toolHops += 1
  }

  return {
    finalText,
    toolHops,
    totalInputTokens,
    totalOutputTokens,
    totalCostUsd: calculateCost(totalInputTokens, totalOutputTokens),
    latencyMs: Date.now() - startMs,
    iterationIdsTouched: [],   // (v0.3.1: scan tool_results for new_iteration_id)
  }
}

// ──────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────

async function loadLatestIteration(
  db: D1Database,
  briefId: string,
): Promise<DesignIterationRow | null> {
  return db
    .prepare(
      `SELECT * FROM design_iterations
         WHERE brief_id = ?
         ORDER BY iteration_number DESC
         LIMIT 1`,
    )
    .bind(briefId)
    .first<DesignIterationRow>()
}

function safeParse<T = unknown>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function deepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
  const result: Record<string, unknown> = { ...target }
  for (const [k, v] of Object.entries(source)) {
    if (
      v !== null &&
      typeof v === 'object' &&
      !Array.isArray(v) &&
      typeof result[k] === 'object' &&
      result[k] !== null &&
      !Array.isArray(result[k])
    ) {
      result[k] = deepMerge(result[k] as Record<string, unknown>, v as Record<string, unknown>)
    } else {
      result[k] = v
    }
  }
  return result as T
}

function emptyTokens(): DesignTokens {
  return {
    palette: {
      primary: '#000000',
      accent: '#000000',
      background: '#ffffff',
      text_primary: '#111111',
    },
    typography: {
      display_font: 'system-ui',
      body_font: 'system-ui',
    },
  }
}

function buildRootCssBlock(tokens: DesignTokens): string {
  const p = tokens.palette
  const t = tokens.typography
  const lines: string[] = [':root {']
  lines.push(`  --color-primary: ${p.primary};`)
  if (p.primary_dark) lines.push(`  --color-primary-dark: ${p.primary_dark};`)
  if (p.primary_light) lines.push(`  --color-primary-light: ${p.primary_light};`)
  lines.push(`  --color-accent: ${p.accent};`)
  lines.push(`  --color-bg: ${p.background};`)
  if (p.surface) lines.push(`  --color-surface: ${p.surface};`)
  lines.push(`  --color-text: ${p.text_primary};`)
  if (p.text_secondary) lines.push(`  --color-text-2: ${p.text_secondary};`)
  if (p.border) lines.push(`  --color-border: ${p.border};`)
  lines.push(`  --font-display: ${t.display_font};`)
  lines.push(`  --font-body: ${t.body_font};`)
  if (tokens.spacing?.container_max_width)
    lines.push(`  --container-max: ${tokens.spacing.container_max_width};`)
  if (tokens.spacing?.section_padding)
    lines.push(`  --section-padding: ${tokens.spacing.section_padding};`)
  lines.push('}')
  return lines.join('\n')
}
