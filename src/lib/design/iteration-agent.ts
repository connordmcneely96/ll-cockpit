/**
 * Design iteration agent — Sprint 16 v0.3.1.
 *
 * Programmatic Anthropic tool-use loop that lets the user refine a finished
 * design brief by chatting.
 *
 * v0.3.0 MVP tools FULLY IMPLEMENTED:
 *   - update_design_tokens   patches tokens AND auto re-renders HTML + R2 preview
 *   - apply_token_to_html    explicit re-render (kept for backward compat)
 *   - regenerate_section     re-runs COMPOSER for one section + re-stitches
 *   - save_iteration         clones current state as a new design_iterations row
 *   - critique               re-scores the current HTML using CRITIC system prompt
 *
 * v0.3.1 FIX:
 *   - Tool routing was confused — DESIGNER kept choosing update_design_tokens
 *     for requests like "blue gradient hero" which need regenerate_section.
 *     Root cause: update_design_tokens can only swap EXISTING token VALUES
 *     that the HTML already references via Tailwind classes. It cannot
 *     introduce new visual structure (gradients, layouts, new elements).
 *   - System prompt now spells out which tool fits which kind of request.
 *   - update_design_tokens detects new keys not present in current HTML and
 *     refuses, returning a directive to use regenerate_section instead.
 *
 * STUBBED (return descriptive "not implemented" results):
 *   splice_section, assemble_html, add_section, remove_section,
 *   apply_preset, analyze_reference_url
 */

import type { D1Database } from '@cloudflare/workers-types'
import type {
  DesignBriefRow,
  DesignIterationRow,
  DesignSection,
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
import {
  executeAssembler,
  extractSectionHtml,
  renderFullHtml,
  savePreviewToR2,
} from './pipeline'

const MODEL_ID = 'claude-sonnet-4-5'
const MAX_TOKENS_PER_CALL = 4096
const MAX_TOOL_HOPS = 6

/**
 * v0.3.1 — Whitelist of token keys that the HTML/Tailwind config actually
 * references. Patching any key NOT in this list won't change the rendered
 * page (because the HTML doesn't read it), so update_design_tokens refuses
 * those and tells DESIGNER to use regenerate_section.
 */
const SAFE_TOKEN_KEYS: Record<string, Set<string>> = {
  palette: new Set([
    'primary',
    'primary_dark',
    'primary_light',
    'accent',
    'background',
    'surface',
    'text_primary',
    'text_secondary',
    'border',
  ]),
  typography: new Set(['display_font', 'body_font', 'scale']),
  spacing: new Set(['scale', 'container_max_width', 'section_padding']),
  motion: new Set(['transition_speed', 'easing']),
}

function findUnsafePaths(patch: Record<string, unknown>, prefix = ''): string[] {
  const unsafe: string[] = []
  for (const [k, v] of Object.entries(patch)) {
    const path = prefix ? `${prefix}.${k}` : k
    const allowed = SAFE_TOKEN_KEYS[prefix]
    if (!prefix) {
      // top-level — k must be a known group (palette/typography/spacing/motion) or 'rationale'
      if (!SAFE_TOKEN_KEYS[k] && k !== 'rationale') unsafe.push(path)
      else if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
        unsafe.push(...findUnsafePaths(v as Record<string, unknown>, k))
      }
    } else if (allowed && !allowed.has(k)) {
      unsafe.push(path)
    }
  }
  return unsafe
}

export const TOOL_DEFINITIONS: DesignToolDefinition[] = [
  {
    name: 'update_design_tokens',
    description:
      'Swap an EXISTING token VALUE that the page already uses via Tailwind classes (e.g. primary color, accent color, display font, section padding). The HTML is then re-rendered with the new value.\n\nUse for: "change primary color to navy", "switch display font to Playfair", "tighten section padding".\n\nDO NOT use for: gradients, backgrounds with multiple colors, new visual elements, structural changes, copy changes, layout changes. For those, use regenerate_section.\n\nThe only valid keys are: palette.{primary, primary_dark, primary_light, accent, background, surface, text_primary, text_secondary, border}, typography.{display_font, body_font}, spacing.{section_padding, container_max_width}, motion.{transition_speed, easing}. Anything else will be rejected — the HTML does not read those keys.',
    input_schema: {
      type: 'object',
      properties: {
        patch: {
          type: 'object',
          description: 'Partial DesignTokens object. Example: { "palette": { "primary": "#0a4d6b" } }. Only the keys listed in the tool description are valid.',
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
      'Force a full HTML re-render using the current design tokens. Rarely needed — update_design_tokens already does this. Use only if the rendered HTML appears to be out of sync with the stored tokens.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'regenerate_section',
    description:
      'Re-run COMPOSER for a single section with new instructions, then re-stitch the full page. This is the right tool whenever the change requires NEW HTML — different layout, new visual structure, gradients, new copy, added/removed elements within a section.\n\nUse for: "make the hero a blue-to-black gradient", "make the hero darker and more dramatic", "rewrite the pricing section with three tiers", "add a third feature card", "replace the testimonials with a video", "change the hero photo to an abstract illustration".\n\nThe new section will be generated with the current design tokens already in scope, so colors stay consistent.',
    input_schema: {
      type: 'object',
      properties: {
        section_slug: {
          type: 'string',
          description: 'The slug of the section to regenerate (lowercase, underscores). Examples: "hero", "pump_categories", "case_studies".',
        },
        refinement: {
          type: 'string',
          description: 'Concrete instructions for how to change the section. Be specific about visual direction (e.g. "dark blue-to-black gradient background, white text, more dramatic spacing").',
        },
        preserve_structure: {
          type: 'boolean',
          description: 'If true, keep the existing layout and only modify copy/styling. Default false.',
        },
      },
      required: ['section_slug', 'refinement'],
    },
  },
  {
    name: 'save_iteration',
    description:
      'Commit the current edit state as a new design_iteration row (iteration_number + 1). Call this at the end of a coherent set of changes so the brief\'s history is clean.',
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
      'Re-run CRITIC against the current HTML. Returns a 0–100 score plus strengths / issues / suggestions.',
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
    name: 'splice_section',
    description: 'v0.3.0 — not yet implemented; use regenerate_section instead.',
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
    description: 'v0.3.0 — not yet implemented (update_design_tokens auto-stitches).',
    input_schema: { type: 'object', properties: {} },
    uses_code_execution: true,
  },
  {
    name: 'add_section',
    description: 'v0.3.0 — not yet implemented.',
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
    description: 'v0.3.0 — not yet implemented.',
    input_schema: {
      type: 'object',
      properties: { section_slug: { type: 'string' } },
      required: ['section_slug'],
    },
  },
  {
    name: 'apply_preset',
    description: 'v0.3.0 — not yet implemented.',
    input_schema: {
      type: 'object',
      properties: { preset_name: { type: 'string' } },
      required: ['preset_name'],
    },
  },
  {
    name: 'analyze_reference_url',
    description: 'v0.3.0 — not yet implemented.',
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

export function buildSystemPrompt(brief: DesignBriefRow, currentIter: DesignIterationRow | null): string {
  return `You are DESIGNER ITERATE, the design iteration agent for the LL Cockpit.

You are helping the user refine a finished design build. The original brief was for ${brief.client_name}: ${brief.business_description.slice(0, 240)}.

Mood and tone: ${brief.mood_tone}
Must-have sections: ${brief.must_have_sections}
Brand colors (if specified): ${brief.brand_colors ?? 'none'}
Constraints: ${brief.constraints ?? 'none'}

Current iteration: ${currentIter ? `#${currentIter.iteration_number} (${currentIter.status})` : 'none'}
Current CRITIC score: ${currentIter?.critic_score ?? 'not yet scored'}

Tool routing — match the request to the right tool:

  • SIMPLE TOKEN SWAP (existing key, new value) → update_design_tokens.
    Examples: "make the primary color navy", "use a warmer purple", "increase section padding", "switch to a serif heading font".
    What this tool does: swaps a value (e.g. palette.primary from #5645d4 to #0a4d6b) and re-renders the page. The HTML must already reference that key via Tailwind classes (bg-primary, text-primary, font-display, etc).
    What this tool CANNOT do: introduce gradients, backgrounds with multiple colors, new layouts, new elements, new visual structure. The tool will REFUSE any patch that introduces a key not in its allowlist and tell you to use regenerate_section instead.

  • STRUCTURAL OR VISUAL CHANGE → regenerate_section.
    Examples: "make the hero a blue-to-black gradient", "darker, more dramatic hero", "rewrite pricing with three tiers", "add a video to the testimonials section", "change the hero photo to an abstract illustration", "more bento-grid feel on the capabilities section".
    What this tool does: re-runs COMPOSER for that section with your refinement instruction; new HTML is generated using the CURRENT design tokens (so colors stay consistent across the page); the full page is then re-stitched.
    When in doubt, prefer regenerate_section. Gradients, multi-color backgrounds, new structural elements, and any copy or layout change all require regenerate_section.

  • CRITIQUE → critique. Returns a 0-100 score plus structured feedback.

  • COMMIT a coherent set of changes → save_iteration. Call this once at the end, not after every edit.

Important rules:
  • Use ONE tool per turn unless a user request genuinely needs two. Don't chain update_design_tokens + regenerate_section "to be safe" — that doubles cost and confuses the iteration log.
  • Don't claim the change is visible until the tool result confirms it. If a tool returns ok:false or unsafe_paths, tell the user honestly and offer the right alternative.
  • Keep replies concise. Don't repeat the brief back unless asked.
  • If a request is ambiguous, ask one clarifying question rather than guessing.

Design principles to enforce silently:
  • Accessibility: CTA contrast ≥ 4.5:1, focus rings visible, semantic HTML.
  • Hierarchy: one h1 hero, h2 per section, h3 per card; no skipped levels.
  • Type scale: don't mix more than two font families.
  • Spacing: keep a consistent rhythm; don't introduce arbitrary px values.

Tone: direct, professional, no hedging.`
}

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
      case 'regenerate_section':
        return await runRegenerateSection(toolUse, deps)
      case 'save_iteration':
        return await runSaveIteration(toolUse, deps)
      case 'critique':
        return await runCritique(toolUse, deps)
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

/**
 * Helper: re-render full HTML from current tokens + COMPOSER section outputs,
 * save to D1 + R2. Used by both update_design_tokens (auto) and
 * apply_token_to_html (explicit).
 */
async function rerenderAndPersist(
  deps: ToolDeps,
  iter: DesignIterationRow,
  tokens: DesignTokens,
): Promise<{ ok: true; sections: number; htmlLength: number; r2Key: string }
   | { ok: false; reason: string }> {
  if (!iter.orchestrator_run_id) {
    return { ok: false, reason: 'no orchestrator_run_id on iteration' }
  }

  const brief = await deps.env.DB
    .prepare(
      `SELECT client_name, business_description FROM design_briefs
         WHERE id = ? AND user_id = ?`,
    )
    .bind(deps.briefId, deps.userId)
    .first<{ client_name: string; business_description: string }>()
  if (!brief) return { ok: false, reason: 'brief not found' }

  const rows = await deps.env.DB
    .prepare(
      `SELECT short_id, title, output FROM agent_subtasks
         WHERE pipeline_run_id = ? AND user_id = ? AND agent_name = 'composer'
           AND status = 'done' AND output IS NOT NULL
         ORDER BY short_id ASC`,
    )
    .bind(iter.orchestrator_run_id, deps.userId)
    .all<{ short_id: string; title: string; output: string }>()

  if (!rows.results || rows.results.length === 0) {
    return { ok: false, reason: 'no COMPOSER section outputs found' }
  }

  const sections: DesignSection[] = rows.results.map((row) => {
    const match = row.title.match(/Compose\s+(.+?)\s+section/i)
    const name = match
      ? match[1]
      : row.title.replace(/^Compose\s+/i, '').replace(/\s+section$/i, '')
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
    return { name, slug, html: extractSectionHtml(row.output) }
  })

  const newHtml = renderFullHtml({ brief, tokens, sections })

  await deps.env.DB
    .prepare(`UPDATE design_iterations SET page_html = ? WHERE id = ?`)
    .bind(newHtml, iter.id)
    .run()

  const { r2Key } = await savePreviewToR2(
    deps.env,
    deps.briefId,
    iter.iteration_number,
    newHtml,
  )

  // Make sure the iteration knows its R2 key (older iterations may have NULL).
  if (!iter.preview_r2_key) {
    await deps.env.DB
      .prepare(`UPDATE design_iterations SET preview_r2_key = ? WHERE id = ?`)
      .bind(r2Key, iter.id)
      .run()
  }

  return { ok: true, sections: sections.length, htmlLength: newHtml.length, r2Key }
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
      content: JSON.stringify({
        ok: false,
        error: 'patch must be an object containing partial design tokens.',
      }),
      is_error: true,
    }
  }

  // v0.3.1 — Validate patch only contains keys the HTML actually uses.
  // Adding a new key (e.g. "heroBackground") to tokens has no effect because
  // the rendered HTML doesn't read it. Refuse early and direct DESIGNER to
  // regenerate_section, which CAN make structural changes.
  const unsafePaths = findUnsafePaths(input.patch as Record<string, unknown>)
  if (unsafePaths.length > 0) {
    return {
      type: 'tool_result',
      tool_use_id: toolUse.id,
      content: JSON.stringify({
        ok: false,
        error: 'unsupported_token_keys',
        unsafe_paths: unsafePaths,
        message:
          'These token paths are not consumed by the rendered HTML, so patching them would have NO visible effect. The HTML reads via Tailwind classes (bg-primary, text-primary, font-display, etc) and only sees the allowlisted token keys.',
        directive:
          'For visual changes that require new structure (gradients, new backgrounds, layout shifts, copy edits), call regenerate_section with section_slug + refinement instead. The regenerated section will use the current design tokens and stay consistent with the rest of the page.',
        allowed_keys: SAFE_TOKEN_KEYS,
      }),
      is_error: true,
    }
  }

  const iter = await loadLatestIteration(deps.env.DB, deps.briefId)
  if (!iter) return missingIteration(toolUse)

  const currentTokens: DesignTokens =
    iter.design_tokens_json ? safeParse(iter.design_tokens_json) ?? emptyTokens() : emptyTokens()

  const merged = deepMergeJson(currentTokens, input.patch) as DesignTokens
  if (input.rationale) merged.rationale = input.rationale

  await deps.env.DB
    .prepare(`UPDATE design_iterations SET design_tokens_json = ? WHERE id = ?`)
    .bind(JSON.stringify(merged), iter.id)
    .run()

  // AUTO re-render: tokens-only changes are useless without HTML propagation.
  const rerender = await rerenderAndPersist(deps, iter, merged)

  return {
    type: 'tool_result',
    tool_use_id: toolUse.id,
    content: JSON.stringify({
      ok: true,
      updated_keys: Object.keys(input.patch),
      tokens: merged,
      rerender: rerender.ok
        ? {
            ok: true,
            sections_re_rendered: rerender.sections,
            r2_key: rerender.r2Key,
          }
        : { ok: false, reason: rerender.reason },
      note: rerender.ok
        ? 'Tokens patched and page re-rendered. The preview iframe refreshes automatically.'
        : `Tokens patched but auto re-render failed (${rerender.reason}). Preview still shows old colors.`,
    }),
  }
}

async function runApplyTokenToHtml(
  toolUse: DesignAssistantToolUse,
  deps: ToolDeps,
): Promise<DesignToolResult> {
  const iter = await loadLatestIteration(deps.env.DB, deps.briefId)
  if (!iter) return missingIteration(toolUse)

  const tokens: DesignTokens = iter.design_tokens_json
    ? safeParse(iter.design_tokens_json) ?? emptyTokens()
    : emptyTokens()

  const rerender = await rerenderAndPersist(deps, iter, tokens)

  if (!rerender.ok) {
    return {
      type: 'tool_result',
      tool_use_id: toolUse.id,
      content: `Re-render failed: ${rerender.reason}`,
      is_error: true,
    }
  }

  return {
    type: 'tool_result',
    tool_use_id: toolUse.id,
    content: JSON.stringify({
      ok: true,
      sections_re_rendered: rerender.sections,
      html_length: rerender.htmlLength,
      r2_key: rerender.r2Key,
      note: 'Page re-rendered. Preview iframe refreshes automatically.',
    }),
  }
}

async function runRegenerateSection(
  toolUse: DesignAssistantToolUse,
  deps: ToolDeps,
): Promise<DesignToolResult> {
  const input = toolUse.input as {
    section_slug?: string
    refinement?: string
    preserve_structure?: boolean
  }
  if (!input.section_slug || !input.refinement) {
    return {
      type: 'tool_result',
      tool_use_id: toolUse.id,
      content: 'section_slug and refinement are required.',
      is_error: true,
    }
  }

  const iter = await loadLatestIteration(deps.env.DB, deps.briefId)
  if (!iter) return missingIteration(toolUse)
  if (!iter.orchestrator_run_id) {
    return {
      type: 'tool_result',
      tool_use_id: toolUse.id,
      content: 'No orchestrator_run_id on iteration — cannot locate section subtask.',
      is_error: true,
    }
  }

  const brief = await deps.env.DB
    .prepare(`SELECT * FROM design_briefs WHERE id = ? AND user_id = ?`)
    .bind(deps.briefId, deps.userId)
    .first<DesignBriefRow>()
  if (!brief) {
    return {
      type: 'tool_result',
      tool_use_id: toolUse.id,
      content: 'Brief not found.',
      is_error: true,
    }
  }

  const subtasks = await deps.env.DB
    .prepare(
      `SELECT id, short_id, title, output FROM agent_subtasks
         WHERE pipeline_run_id = ? AND user_id = ? AND agent_name = 'composer' AND status = 'done'`,
    )
    .bind(iter.orchestrator_run_id, deps.userId)
    .all<{ id: string; short_id: string; title: string; output: string }>()

  const target = (subtasks.results ?? []).find((s) => {
    const match = s.title.match(/Compose\s+(.+?)\s+section/i)
    const name = match ? match[1] : s.title.replace(/Compose\s+/i, '').replace(/\s+section/i, '')
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
    return slug === input.section_slug
  })

  if (!target) {
    const available = (subtasks.results ?? [])
      .map((s) => s.title.replace(/^Compose\s+/i, '').replace(/\s+section$/i, ''))
      .join(', ')
    return {
      type: 'tool_result',
      tool_use_id: toolUse.id,
      content: `Section '${input.section_slug}' not found. Available sections: ${available}`,
      is_error: true,
    }
  }

  const sectionName = target.title.replace(/^Compose\s+/i, '').replace(/\s+section$/i, '')
  const tokens: DesignTokens = iter.design_tokens_json
    ? safeParse(iter.design_tokens_json) ?? emptyTokens()
    : emptyTokens()

  const composerPrompt = `SECTION-ONLY MODE. Regenerate ONLY the <section id="${input.section_slug}"> markup for the "${sectionName}" section of ${brief.client_name}'s website. No <!DOCTYPE>, <html>, <head>, <body>, <link>, or <script> tags.

REFINEMENT INSTRUCTION:
${input.refinement}

${input.preserve_structure ? 'Preserve the existing structure but apply the refinement to copy and styling.' : 'Feel free to restructure if it serves the refinement.'}

CURRENT SECTION HTML (for reference, may be truncated):
${target.output.slice(0, 6000)}

DESIGN TOKENS (use Tailwind classes referencing these via the tailwind.config theme: primary, accent, surface, text-primary, text-secondary, border, font-display, font-sans):
  primary: ${tokens.palette.primary}
  accent: ${tokens.palette.accent}
  background: ${tokens.palette.background}
  text: ${tokens.palette.text_primary}
  display font: ${tokens.typography.display_font}
  body font: ${tokens.typography.body_font}

BRIEF CONTEXT:
  Brand: ${brief.client_name}
  Business: ${brief.business_description.slice(0, 240)}
  Audience: ${brief.target_audience}
  Tone: ${brief.mood_tone}

HEADING HIERARCHY: Use <h2> for your section's main headline. Use <h3> for cards or sub-items. Do NOT add another <h1> (the hero owns the single h1). EXCEPTION: if the section_slug is 'hero', the hero MUST contain the single <h1> for the page.

ACCESSIBILITY REQUIREMENTS:
- CTA buttons MUST meet WCAG AA contrast 4.5:1. White text on light backgrounds is forbidden. Use bg-primary text-white OR bg-white text-primary border-2 border-primary.
- Form inputs: use aria-required="true" for required fields.
- Icon-only indicators must include sr-only text or visible label.
- SVG illustrations: wrap in <figure> with <figcaption> if meaningful; aria-hidden="true" if purely decorative.
- Focus styles: rely on global focus-visible outline; do NOT add custom focus:ring on inputs (causes double-ring).

INLINE STYLES ARE FINE FOR GRADIENTS AND ONE-OFF EFFECTS. If the refinement asks for a gradient, multi-stop background, or unusual color treatment, use inline style="background: linear-gradient(...)" or a custom <style> block inside the section — do NOT try to wedge it into a Tailwind class name.

Produce production-quality, responsive, accessible markup with REAL copy (not placeholders). Use semantic HTML. First character of your response must be <, last must be >.`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': deps.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL_ID,
      max_tokens: 8192,
      messages: [{ role: 'user', content: composerPrompt }],
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    return {
      type: 'tool_result',
      tool_use_id: toolUse.id,
      content: `COMPOSER call failed: ${res.status} ${errText.slice(0, 200)}`,
      is_error: true,
    }
  }

  type AR = {
    content?: Array<{ type: string; text?: string }>
    usage?: { input_tokens?: number; output_tokens?: number }
  }
  const data = (await res.json()) as AR
  const newHtml = (data.content ?? [])
    .map((c) => (c.type === 'text' ? c.text ?? '' : ''))
    .join('')

  if (!newHtml.trim().startsWith('<')) {
    return {
      type: 'tool_result',
      tool_use_id: toolUse.id,
      content: 'COMPOSER returned non-HTML content. Section not updated.',
      is_error: true,
    }
  }

  await deps.env.DB
    .prepare(`UPDATE agent_subtasks SET output = ? WHERE id = ?`)
    .bind(newHtml, target.id)
    .run()

  let assemblyError: string | null = null
  try {
    const result = await executeAssembler(deps.env, deps.userId, iter.orchestrator_run_id)
    await deps.env.DB
      .prepare(`UPDATE design_iterations SET page_html = ? WHERE id = ?`)
      .bind(result.output, iter.id)
      .run()
    await savePreviewToR2(deps.env, deps.briefId, iter.iteration_number, result.output)
  } catch (err) {
    assemblyError = err instanceof Error ? err.message : String(err)
  }

  return {
    type: 'tool_result',
    tool_use_id: toolUse.id,
    content: JSON.stringify({
      ok: true,
      section_slug: input.section_slug,
      new_html_length: newHtml.length,
      composer_tokens: {
        input: data.usage?.input_tokens ?? 0,
        output: data.usage?.output_tokens ?? 0,
      },
      assembly_warning: assemblyError,
      note: assemblyError
        ? 'Section regenerated but full-page re-assembly failed. Run apply_token_to_html to retry.'
        : 'Section regenerated and page re-assembled. The preview iframe refreshes automatically.',
    }),
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

  if (current.page_html) {
    const { r2Key } = await savePreviewToR2(
      deps.env,
      deps.briefId,
      nextNumber,
      current.page_html,
    )
    await deps.env.DB
      .prepare(`UPDATE design_iterations SET preview_r2_key = ? WHERE id = ?`)
      .bind(r2Key, newId)
      .run()
  }

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
      note: 'New iteration committed and preview re-uploaded to R2.',
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
    content: `Tool '${toolUse.name}' is in the v0.3.0 catalog but not yet implemented. Suggest a workaround using update_design_tokens or regenerate_section.`,
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

export interface IterationAgentResult {
  finalText: string
  toolHops: number
  totalInputTokens: number
  totalOutputTokens: number
  totalCostUsd: number
  latencyMs: number
  iterationIdsTouched: string[]
}

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

  const messages: AnthropicTurn[] = [...priorTurns]
  const lastTurn = messages[messages.length - 1]
  if (lastTurn && lastTurn.role === 'user') {
    if (typeof lastTurn.content === 'string') {
      lastTurn.content = `${lastTurn.content}\n\n${userMessage}`
    } else {
      lastTurn.content.push({ type: 'text', text: userMessage })
    }
  } else {
    messages.push({ role: 'user', content: userMessage })
  }

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

    if (toolUses.length === 0 || data.stop_reason === 'end_turn') break

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

    await persistDesignChatMessage(env.DB, {
      briefId: brief.id,
      userId,
      role: 'tool_result',
      toolResultsJson: JSON.stringify(results),
    })

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
    iterationIdsTouched: [],
  }
}

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

function deepMergeJson(target: unknown, source: unknown): unknown {
  if (
    target === null ||
    typeof target !== 'object' ||
    Array.isArray(target) ||
    source === null ||
    typeof source !== 'object' ||
    Array.isArray(source)
  ) {
    return source === undefined ? target : source
  }
  const t = target as Record<string, unknown>
  const s = source as Record<string, unknown>
  const result: Record<string, unknown> = { ...t }
  for (const [k, v] of Object.entries(s)) {
    const existing = result[k]
    if (
      v !== null &&
      typeof v === 'object' &&
      !Array.isArray(v) &&
      existing !== null &&
      typeof existing === 'object' &&
      !Array.isArray(existing)
    ) {
      result[k] = deepMergeJson(existing, v)
    } else {
      result[k] = v
    }
  }
  return result
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
