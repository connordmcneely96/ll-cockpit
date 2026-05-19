/**
 * Design iteration agent — Sprint 16 v0.5.0 (live streaming) + Sprint 18N (scroll animations + typography debt fix) + Sprint 16 v0.6 (StreamEvent taxonomy expansion, 529 backoff, design_commit + verify_started/done emit threading).
 *
 * v0.4.0: chat POST returned turn_messages array (all-at-once).
 *
 * v0.5.0: runIterationAgent accepts an optional `emit` callback that fires
 * at each agent state transition — turn_start, agent_text, tool_use
 * (BEFORE executing, so UI shows pending), tool_result (AFTER each
 * execution, so cards fill in live), and done. The /chat route uses this
 * to stream Server-Sent Events when the client requests
 * `Accept: text/event-stream`, falling back to the legacy JSON path
 * otherwise.
 *
 * Sprint 18N: buildComposerPrompt teaches COMPOSER (regenerate_section,
 * add_section) about data-anim scroll animations. Same guidance block as
 * the initial-build COMPOSER in pipeline.ts, sourced from
 * buildScrollAnimationsBlock() so the two stay in sync.
 *
 * Sprint 18N typography debt fix (982e66e5): SAFE_TOKEN_KEYS.typography
 * now whitelists font_serif/font_sans/font_mono so update_design_tokens
 * can patch them. buildComposerPrompt's DESIGN TOKENS block exposes the
 * trio when present so iteration-time COMPOSER (regenerate_section,
 * add_section) emits font-serif / font-sans / font-mono Tailwind classes
 * that match the initial-build output.
 *
 * Sprint 16 v0.6:
 * - StreamEvent union expanded with file_created, file_edited,
 *   design_commit, verify_started, verify_done, retry_attempt.
 * - fetchWithRetry wraps all Anthropic calls in runIterationAgent;
 *   retries up to 4× on HTTP 529 with 1/2/4/8s delays, emitting
 *   retry_attempt before each wait.
 * - executeIterationTool accepts optional emit and threads it to
 *   runUpdateDesignTokens (emits design_commit after token DB write)
 *   and runCritique (emits verify_started before fetch,
 *   verify_done after parse).
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
  classifySection,
  buildScrollAnimationsBlock,
} from './pipeline'

const MODEL_ID = 'claude-sonnet-4-5'
const MAX_TOKENS_PER_CALL = 4096
const MAX_TOOL_HOPS = 6

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
  // Sprint 18N typography debt fix (982e66e5) — whitelist the new
  // font_serif/font_sans/font_mono keys so update_design_tokens can
  // patch them. Without these, the agent's patches to the trio would
  // get rejected as unsupported_token_keys.
  typography: new Set([
    'display_font',
    'body_font',
    'scale',
    'font_serif',
    'font_sans',
    'font_mono',
  ]),
  spacing: new Set(['scale', 'container_max_width', 'section_padding']),
  motion: new Set(['transition_speed', 'easing']),
}

function findUnsafePaths(patch: Record<string, unknown>, prefix = ''): string[] {
  const unsafe: string[] = []
  for (const [k, v] of Object.entries(patch)) {
    const path = prefix ? `${prefix}.${k}` : k
    const allowed = SAFE_TOKEN_KEYS[prefix]
    if (!prefix) {
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

function slugFromTitle(title: string): { name: string; slug: string } {
  const match = title.match(/Compose\s+(.+?)\s+section/i)
  const name = match
    ? match[1]
    : title.replace(/^Compose\s+/i, '').replace(/\s+section$/i, '')
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return { name, slug }
}

function generateInsertShortId(afterShortId: string, allShortIds: string[]): string {
  const prefix = `${afterShortId}_`
  const existingInserts = allShortIds.filter((s) => s.startsWith(prefix)).sort()

  if (existingInserts.length === 0) return `${afterShortId}_a`

  const last = existingInserts[existingInserts.length - 1]
  const suffix = last.slice(prefix.length)

  if (suffix.length === 1) {
    const ch = suffix[0]
    if (ch >= 'a' && ch < 'z') return `${prefix}${String.fromCharCode(ch.charCodeAt(0) + 1)}`
    return `${prefix}za`
  }
  return `${prefix}${suffix}a`
}

export const TOOL_DEFINITIONS: DesignToolDefinition[] = [
  {
    name: 'update_design_tokens',
    description:
      'Swap an EXISTING token VALUE that the page already uses via Tailwind classes (e.g. primary color, accent color, display font, section padding). The HTML is then re-rendered with the new value.\n\nUse for: "change primary color to navy", "switch display font to Playfair", "set serif font to Lora", "tighten section padding".\n\nDO NOT use for: gradients, backgrounds with multiple colors, new visual elements, structural changes, copy changes, layout changes. For those, use regenerate_section.\n\nThe only valid keys are: palette.{primary, primary_dark, primary_light, accent, background, surface, text_primary, text_secondary, border}, typography.{display_font, body_font, font_serif, font_sans, font_mono}, spacing.{section_padding, container_max_width}, motion.{transition_speed, easing}. Anything else will be rejected — the HTML does not read those keys. The typography.font_serif/font_sans/font_mono fields are optional richer-hierarchy slots (Sprint 18N) — set them only when the design clearly needs a serif, distinct sans, or monospace font beyond the display/body pair.',
    input_schema: { type: 'object', properties: { patch: { type: 'object', description: 'Partial DesignTokens object.' }, rationale: { type: 'string', description: 'One-sentence explanation.' } }, required: ['patch'] },
  },
  { name: 'apply_token_to_html', description: 'Force a full HTML re-render using the current design tokens. Rarely needed.', input_schema: { type: 'object', properties: {} } },
  { name: 'regenerate_section', description: 'Re-run COMPOSER for a single section with new instructions, then re-stitch the full page. Use for structural or visual changes within an existing section.', input_schema: { type: 'object', properties: { section_slug: { type: 'string' }, refinement: { type: 'string' }, preserve_structure: { type: 'boolean' } }, required: ['section_slug', 'refinement'] } },
  { name: 'save_iteration', description: 'Commit the current edit state as a new design_iteration row.', input_schema: { type: 'object', properties: { client_feedback: { type: 'string' }, notes: { type: 'string' } } } },
  { name: 'critique', description: 'Re-run CRITIC against the current HTML.', input_schema: { type: 'object', properties: { focus_areas: { type: 'array', items: { type: 'string' } } } } },
  { name: 'assemble_html', description: 'NO-OP RE-STITCH. Re-runs the deterministic ASSEMBLER on EXISTING outputs. No new content. Use ONLY for defensive re-stitch, NEVER for "rebuild from scratch".', input_schema: { type: 'object', properties: {} }, uses_code_execution: true },
  { name: 'add_section', description: 'Insert a NEW section into the page. Runs COMPOSER to generate content. Idempotent against concurrent retries.', input_schema: { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' }, after_slug: { type: 'string' } }, required: ['name', 'description'] } },
  { name: 'remove_section', description: 'Soft-delete a section. Re-assembles the page after removal.', input_schema: { type: 'object', properties: { section_slug: { type: 'string' } }, required: ['section_slug'] } },
  { name: 'splice_section', description: 'Not implemented.', input_schema: { type: 'object', properties: { section_slug: { type: 'string' }, new_html: { type: 'string' } }, required: ['section_slug', 'new_html'] }, uses_code_execution: true },
  { name: 'apply_preset', description: 'Not implemented.', input_schema: { type: 'object', properties: { preset_name: { type: 'string' } }, required: ['preset_name'] } },
  { name: 'analyze_reference_url', description: 'Not implemented.', input_schema: { type: 'object', properties: { url: { type: 'string' }, focus: { type: 'string', enum: ['layout', 'color', 'typography', 'tone', 'all'] } }, required: ['url'] }, requires_playwright: true },
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
  • STRUCTURAL OR VISUAL CHANGE within an EXISTING section → regenerate_section.
  • ADD a NEW section → add_section. If result is ok:true (including idempotent_recovery:true), report success.
  • REMOVE a section → remove_section.
  • REGENERATE-EVERYTHING requests → DO NOT call assemble_html.
  • CRITIQUE → critique.
  • COMMIT changes → save_iteration.

Important rules:
  • Use ONE tool per turn unless a request needs more.
  • Brief intent statement BEFORE calling a tool helps the user (e.g. "Adding a contact section now…") because the user sees your text live before the tool fires.
  • Don't claim success until the tool returns ok:true.
  • If a tool returns ok:true with idempotent_recovery:true, treat as clean success.
  • Keep replies concise.

Tone: direct, professional, no hedging.`
}

interface ToolDeps {
  env: CloudflareEnv
  apiKey: string
  userId: string
  briefId: string
}

// Sprint 16 v0.6 — emit is threaded to runUpdateDesignTokens and runCritique
// so those tools can fire design_commit / verify_started / verify_done events.
export async function executeIterationTool(toolUse: DesignAssistantToolUse, deps: ToolDeps, emit?: EmitFn): Promise<DesignToolResult> {
  try {
    switch (toolUse.name) {
      case 'update_design_tokens': return await runUpdateDesignTokens(toolUse, deps, emit)
      case 'apply_token_to_html': return await runApplyTokenToHtml(toolUse, deps)
      case 'regenerate_section': return await runRegenerateSection(toolUse, deps)
      case 'save_iteration': return await runSaveIteration(toolUse, deps)
      case 'critique': return await runCritique(toolUse, deps, emit)
      case 'assemble_html': return await runAssembleHtml(toolUse, deps)
      case 'add_section': return await runAddSection(toolUse, deps)
      case 'remove_section': return await runRemoveSection(toolUse, deps)
      case 'splice_section':
      case 'apply_preset':
      case 'analyze_reference_url': return notImplemented(toolUse)
      default: return { type: 'tool_result', tool_use_id: toolUse.id, content: `Unknown tool: ${toolUse.name}`, is_error: true }
    }
  } catch (err) {
    return { type: 'tool_result', tool_use_id: toolUse.id, content: `Tool execution failed: ${err instanceof Error ? err.message : String(err)}`, is_error: true }
  }
}

async function rerenderAndPersist(deps: ToolDeps, iter: DesignIterationRow, tokens: DesignTokens): Promise<{ ok: true; sections: number; htmlLength: number; r2Key: string } | { ok: false; reason: string }> {
  if (!iter.orchestrator_run_id) return { ok: false, reason: 'no orchestrator_run_id on iteration' }
  const brief = await deps.env.DB.prepare(`SELECT client_name, business_description FROM design_briefs WHERE id = ? AND user_id = ?`).bind(deps.briefId, deps.userId).first<{ client_name: string; business_description: string }>()
  if (!brief) return { ok: false, reason: 'brief not found' }
  const rows = await deps.env.DB.prepare(`SELECT short_id, title, output FROM agent_subtasks WHERE pipeline_run_id = ? AND user_id = ? AND agent_name = 'composer' AND status = 'done' AND output IS NOT NULL ORDER BY short_id ASC`).bind(iter.orchestrator_run_id, deps.userId).all<{ short_id: string; title: string; output: string }>()
  if (!rows.results || rows.results.length === 0) return { ok: false, reason: 'no COMPOSER section outputs found' }
  const sections: DesignSection[] = rows.results.map((row) => { const { name, slug } = slugFromTitle(row.title); return { name, slug, html: extractSectionHtml(row.output) } })
  const newHtml = renderFullHtml({ brief, tokens, sections })
  await deps.env.DB.prepare(`UPDATE design_iterations SET page_html = ? WHERE id = ?`).bind(newHtml, iter.id).run()
  const { r2Key } = await savePreviewToR2(deps.env, deps.briefId, iter.iteration_number, newHtml)
  if (!iter.preview_r2_key) await deps.env.DB.prepare(`UPDATE design_iterations SET preview_r2_key = ? WHERE id = ?`).bind(r2Key, iter.id).run()
  return { ok: true, sections: sections.length, htmlLength: newHtml.length, r2Key }
}

// Sprint 16 v0.6 — emits design_commit after the token DB write so the
// ChatPane can render a DesignCommitCard with the live palette/font snapshot.
async function runUpdateDesignTokens(toolUse: DesignAssistantToolUse, deps: ToolDeps, emit?: EmitFn): Promise<DesignToolResult> {
  const input = toolUse.input as { patch?: Partial<DesignTokens>; rationale?: string }
  if (!input.patch || typeof input.patch !== 'object') return { type: 'tool_result', tool_use_id: toolUse.id, content: JSON.stringify({ ok: false, error: 'patch must be an object.' }), is_error: true }
  const unsafePaths = findUnsafePaths(input.patch as Record<string, unknown>)
  if (unsafePaths.length > 0) return { type: 'tool_result', tool_use_id: toolUse.id, content: JSON.stringify({ ok: false, error: 'unsupported_token_keys', unsafe_paths: unsafePaths, directive: 'For visual changes requiring new structure, use regenerate_section.', allowed_keys: SAFE_TOKEN_KEYS }), is_error: true }
  const iter = await loadLatestIteration(deps.env.DB, deps.briefId)
  if (!iter) return missingIteration(toolUse)
  const currentTokens: DesignTokens = iter.design_tokens_json ? safeParse(iter.design_tokens_json) ?? emptyTokens() : emptyTokens()
  const merged = deepMergeJson(currentTokens, input.patch) as DesignTokens
  if (input.rationale) merged.rationale = input.rationale
  await deps.env.DB.prepare(`UPDATE design_iterations SET design_tokens_json = ? WHERE id = ?`).bind(JSON.stringify(merged), iter.id).run()
  // Sprint 16 v0.6 — emit design_commit so the ChatPane can show a token snapshot card.
  await emit?.({
    type: 'design_commit',
    font_type: merged.typography.display_font,
    palette: [
      merged.palette.primary,
      merged.palette.accent,
      merged.palette.background,
      merged.palette.text_primary,
    ],
    accent: merged.palette.accent,
    rhythm: (merged.spacing as { section_padding?: string } | undefined)?.section_padding ?? 'default',
  })
  const rerender = await rerenderAndPersist(deps, iter, merged)
  return { type: 'tool_result', tool_use_id: toolUse.id, content: JSON.stringify({ ok: true, updated_keys: Object.keys(input.patch), tokens: merged, rerender: rerender.ok ? { ok: true, sections_re_rendered: rerender.sections, r2_key: rerender.r2Key } : { ok: false, reason: rerender.reason }, note: rerender.ok ? 'Tokens patched and page re-rendered.' : `Tokens patched but auto re-render failed (${rerender.reason}).` }) }
}

async function runApplyTokenToHtml(toolUse: DesignAssistantToolUse, deps: ToolDeps): Promise<DesignToolResult> {
  const iter = await loadLatestIteration(deps.env.DB, deps.briefId)
  if (!iter) return missingIteration(toolUse)
  const tokens: DesignTokens = iter.design_tokens_json ? safeParse(iter.design_tokens_json) ?? emptyTokens() : emptyTokens()
  const rerender = await rerenderAndPersist(deps, iter, tokens)
  if (!rerender.ok) return { type: 'tool_result', tool_use_id: toolUse.id, content: `Re-render failed: ${rerender.reason}`, is_error: true }
  return { type: 'tool_result', tool_use_id: toolUse.id, content: JSON.stringify({ ok: true, sections_re_rendered: rerender.sections, html_length: rerender.htmlLength, r2_key: rerender.r2Key, note: 'Page re-rendered.' }) }
}

async function runRegenerateSection(toolUse: DesignAssistantToolUse, deps: ToolDeps): Promise<DesignToolResult> {
  const input = toolUse.input as { section_slug?: string; refinement?: string; preserve_structure?: boolean }
  if (!input.section_slug || !input.refinement) return { type: 'tool_result', tool_use_id: toolUse.id, content: 'section_slug and refinement are required.', is_error: true }
  const iter = await loadLatestIteration(deps.env.DB, deps.briefId)
  if (!iter) return missingIteration(toolUse)
  if (!iter.orchestrator_run_id) return { type: 'tool_result', tool_use_id: toolUse.id, content: 'No orchestrator_run_id on iteration.', is_error: true }
  const brief = await deps.env.DB.prepare(`SELECT * FROM design_briefs WHERE id = ? AND user_id = ?`).bind(deps.briefId, deps.userId).first<DesignBriefRow>()
  if (!brief) return { type: 'tool_result', tool_use_id: toolUse.id, content: 'Brief not found.', is_error: true }
  const subtasks = await deps.env.DB.prepare(`SELECT id, short_id, title, output FROM agent_subtasks WHERE pipeline_run_id = ? AND user_id = ? AND agent_name = 'composer' AND status = 'done'`).bind(iter.orchestrator_run_id, deps.userId).all<{ id: string; short_id: string; title: string; output: string }>()
  const target = (subtasks.results ?? []).find((s) => slugFromTitle(s.title).slug === input.section_slug)
  if (!target) { const available = (subtasks.results ?? []).map((s) => slugFromTitle(s.title).name).join(', '); return { type: 'tool_result', tool_use_id: toolUse.id, content: `Section '${input.section_slug}' not found. Available: ${available}`, is_error: true } }
  const { name: sectionName } = slugFromTitle(target.title)
  const tokens: DesignTokens = iter.design_tokens_json ? safeParse(iter.design_tokens_json) ?? emptyTokens() : emptyTokens()
  const composerPrompt = buildComposerPrompt({ sectionSlug: input.section_slug, sectionName, instruction: input.refinement, preserveStructure: input.preserve_structure ?? false, currentSectionHtml: target.output, tokens, brief, isNewSection: false })
  const composerResult = await callComposer(deps.apiKey, composerPrompt)
  if (!composerResult.ok) return { type: 'tool_result', tool_use_id: toolUse.id, content: composerResult.error, is_error: true }
  await deps.env.DB.prepare(`UPDATE agent_subtasks SET output = ? WHERE id = ?`).bind(composerResult.html, target.id).run()
  let assemblyError: string | null = null
  try { const result = await executeAssembler(deps.env, deps.userId, iter.orchestrator_run_id); await deps.env.DB.prepare(`UPDATE design_iterations SET page_html = ? WHERE id = ?`).bind(result.output, iter.id).run(); await savePreviewToR2(deps.env, deps.briefId, iter.iteration_number, result.output) } catch (err) { assemblyError = err instanceof Error ? err.message : String(err) }
  return { type: 'tool_result', tool_use_id: toolUse.id, content: JSON.stringify({ ok: true, section_slug: input.section_slug, new_html_length: composerResult.html.length, composer_tokens: composerResult.usage, assembly_warning: assemblyError, note: assemblyError ? 'Section regenerated but re-assembly failed.' : 'Section regenerated and page re-assembled.' }) }
}

async function runAssembleHtml(toolUse: DesignAssistantToolUse, deps: ToolDeps): Promise<DesignToolResult> {
  const iter = await loadLatestIteration(deps.env.DB, deps.briefId)
  if (!iter) return missingIteration(toolUse)
  if (!iter.orchestrator_run_id) return { type: 'tool_result', tool_use_id: toolUse.id, content: 'No orchestrator_run_id on iteration.', is_error: true }
  try {
    const result = await executeAssembler(deps.env, deps.userId, iter.orchestrator_run_id)
    await deps.env.DB.prepare(`UPDATE design_iterations SET page_html = ? WHERE id = ?`).bind(result.output, iter.id).run()
    const { r2Key } = await savePreviewToR2(deps.env, deps.briefId, iter.iteration_number, result.output)
    return { type: 'tool_result', tool_use_id: toolUse.id, content: JSON.stringify({ ok: true, html_length: result.output.length, r2_key: r2Key, note: 'Page re-stitched. No new content.' }) }
  } catch (err) { return { type: 'tool_result', tool_use_id: toolUse.id, content: `Assembly failed: ${err instanceof Error ? err.message : String(err)}`, is_error: true } }
}

async function runRemoveSection(toolUse: DesignAssistantToolUse, deps: ToolDeps): Promise<DesignToolResult> {
  const input = toolUse.input as { section_slug?: string }
  if (!input.section_slug) return { type: 'tool_result', tool_use_id: toolUse.id, content: 'section_slug is required.', is_error: true }
  const iter = await loadLatestIteration(deps.env.DB, deps.briefId)
  if (!iter) return missingIteration(toolUse)
  if (!iter.orchestrator_run_id) return { type: 'tool_result', tool_use_id: toolUse.id, content: 'No orchestrator_run_id on iteration.', is_error: true }
  const subtasks = await deps.env.DB.prepare(`SELECT id, short_id, title FROM agent_subtasks WHERE pipeline_run_id = ? AND user_id = ? AND agent_name = 'composer' AND status = 'done'`).bind(iter.orchestrator_run_id, deps.userId).all<{ id: string; short_id: string; title: string }>()
  const target = (subtasks.results ?? []).find((s) => slugFromTitle(s.title).slug === input.section_slug)
  if (!target) { const available = (subtasks.results ?? []).map((s) => slugFromTitle(s.title).slug).join(', '); return { type: 'tool_result', tool_use_id: toolUse.id, content: JSON.stringify({ ok: false, error: 'section_not_found', section_slug: input.section_slug, available_slugs: available }), is_error: true } }
  await deps.env.DB.prepare(`UPDATE agent_subtasks SET status = 'cancelled' WHERE id = ?`).bind(target.id).run()
  let assemblyError: string | null = null
  try { const result = await executeAssembler(deps.env, deps.userId, iter.orchestrator_run_id); await deps.env.DB.prepare(`UPDATE design_iterations SET page_html = ? WHERE id = ?`).bind(result.output, iter.id).run(); await savePreviewToR2(deps.env, deps.briefId, iter.iteration_number, result.output) } catch (err) { assemblyError = err instanceof Error ? err.message : String(err) }
  return { type: 'tool_result', tool_use_id: toolUse.id, content: JSON.stringify({ ok: true, section_slug: input.section_slug, removed_subtask_id: target.id, assembly_warning: assemblyError, note: assemblyError ? `Section removed but re-assembly failed: ${assemblyError}` : 'Section removed and page re-stitched.' }) }
}

async function runAddSection(toolUse: DesignAssistantToolUse, deps: ToolDeps): Promise<DesignToolResult> {
  const input = toolUse.input as { name?: string; description?: string; after_slug?: string }
  if (!input.name || !input.description) return { type: 'tool_result', tool_use_id: toolUse.id, content: 'name and description are required.', is_error: true }
  const iter = await loadLatestIteration(deps.env.DB, deps.briefId)
  if (!iter) return missingIteration(toolUse)
  if (!iter.orchestrator_run_id) return { type: 'tool_result', tool_use_id: toolUse.id, content: 'No orchestrator_run_id on iteration.', is_error: true }
  const brief = await deps.env.DB.prepare(`SELECT * FROM design_briefs WHERE id = ? AND user_id = ?`).bind(deps.briefId, deps.userId).first<DesignBriefRow>()
  if (!brief) return { type: 'tool_result', tool_use_id: toolUse.id, content: 'Brief not found.', is_error: true }
  const newSlug = input.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  if (!newSlug) return { type: 'tool_result', tool_use_id: toolUse.id, content: 'name must contain alphanumeric characters.', is_error: true }
  const allSubtasks = await deps.env.DB.prepare(`SELECT short_id, title, status FROM agent_subtasks WHERE pipeline_run_id = ? AND user_id = ? AND agent_name = 'composer'`).bind(iter.orchestrator_run_id, deps.userId).all<{ short_id: string; title: string; status: string }>()
  const allRows = allSubtasks.results ?? []
  const slugCollision = allRows.find((r) => slugFromTitle(r.title).slug === newSlug && r.status === 'done')
  if (slugCollision) return { type: 'tool_result', tool_use_id: toolUse.id, content: JSON.stringify({ ok: false, error: 'slug_collision', message: `A section with slug "${newSlug}" already exists.`, existing_section: slugCollision.title }), is_error: true }
  const activeRows = allRows.filter((r) => r.status === 'done')
  let anchorShortId: string
  if (input.after_slug) {
    const anchor = activeRows.find((r) => slugFromTitle(r.title).slug === input.after_slug)
    if (anchor) anchorShortId = anchor.short_id
    else { const sorted = [...activeRows].sort((a, b) => a.short_id.localeCompare(b.short_id)); anchorShortId = sorted.length > 0 ? sorted[sorted.length - 1].short_id : 'st_1' }
  } else { const sorted = [...activeRows].sort((a, b) => a.short_id.localeCompare(b.short_id)); anchorShortId = sorted.length > 0 ? sorted[sorted.length - 1].short_id : 'st_1' }
  const allShortIds = allRows.map((r) => r.short_id)
  const newShortId = generateInsertShortId(anchorShortId, allShortIds)
  const tokens: DesignTokens = iter.design_tokens_json ? safeParse(iter.design_tokens_json) ?? emptyTokens() : emptyTokens()
  const composerPrompt = buildComposerPrompt({ sectionSlug: newSlug, sectionName: input.name, instruction: input.description, preserveStructure: false, currentSectionHtml: '', tokens, brief, isNewSection: true })
  const composerResult = await callComposer(deps.apiKey, composerPrompt)
  if (!composerResult.ok) return { type: 'tool_result', tool_use_id: toolUse.id, content: composerResult.error, is_error: true }
  const newId = crypto.randomUUID()
  const now = Math.floor(Date.now() / 1000)
  const taskType = classifySection(input.name, input.description)
  const insertedTitle = `Compose ${input.name} section`
  let insertedNewRow = true
  let finalShortId = newShortId
  try {
    await deps.env.DB.prepare(`INSERT INTO agent_subtasks (id, pipeline_run_id, user_id, short_id, agent_name, title, task, depends_on, estimated_cost_usd, estimated_duration_seconds, risk_level, human_required, status, output, cost_usd, tokens, started_at, completed_at, created_at, task_type) VALUES (?, ?, ?, ?, 'composer', ?, ?, '[]', ?, 30, 'low', 0, 'done', ?, ?, ?, ?, ?, ?, ?)`).bind(newId, iter.orchestrator_run_id, deps.userId, newShortId, insertedTitle, `Added via iteration agent (add_section). Original instruction: ${input.description.slice(0, 500)}`, taskType === 'compose_simple' ? 0.015 : 0.05, composerResult.html, composerResult.costUsd, composerResult.usage.input + composerResult.usage.output, now, now, now, taskType).run()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('UNIQUE constraint failed')) {
      const existing = await deps.env.DB.prepare(`SELECT short_id FROM agent_subtasks WHERE pipeline_run_id = ? AND user_id = ? AND agent_name = 'composer' AND title = ? AND status = 'done' LIMIT 1`).bind(iter.orchestrator_run_id, deps.userId, insertedTitle).first<{ short_id: string }>()
      if (existing) { insertedNewRow = false; finalShortId = existing.short_id }
      else return { type: 'tool_result', tool_use_id: toolUse.id, content: JSON.stringify({ ok: false, error: 'short_id_collision_no_recovery', attempted_short_id: newShortId, message: 'Short_id collision but our section isn\'t in the database.' }), is_error: true }
    } else return { type: 'tool_result', tool_use_id: toolUse.id, content: JSON.stringify({ ok: false, error: 'database_error', message: msg.slice(0, 300) }), is_error: true }
  }
  let assemblyError: string | null = null
  try { const result = await executeAssembler(deps.env, deps.userId, iter.orchestrator_run_id); await deps.env.DB.prepare(`UPDATE design_iterations SET page_html = ? WHERE id = ?`).bind(result.output, iter.id).run(); await savePreviewToR2(deps.env, deps.briefId, iter.iteration_number, result.output) } catch (err) { assemblyError = err instanceof Error ? err.message : String(err) }
  return { type: 'tool_result', tool_use_id: toolUse.id, content: JSON.stringify({ ok: true, new_section: { slug: newSlug, name: input.name, short_id: finalShortId, after: input.after_slug ?? null, task_type: taskType }, composer_tokens: composerResult.usage, cost_usd: insertedNewRow ? composerResult.costUsd : 0, idempotent_recovery: !insertedNewRow, assembly_warning: assemblyError, note: insertedNewRow ? (assemblyError ? `Section added but re-assembly failed: ${assemblyError}` : `Section "${input.name}" added and page re-stitched.`) : `Section "${input.name}" was already added by a concurrent retry.` }) }
}

function buildComposerPrompt(args: { sectionSlug: string; sectionName: string; instruction: string; preserveStructure: boolean; currentSectionHtml: string; tokens: DesignTokens; brief: DesignBriefRow; isNewSection: boolean }): string {
  const { sectionSlug, sectionName, instruction, preserveStructure, currentSectionHtml, tokens, brief, isNewSection } = args
  const referenceBlock = isNewSection ? '' : `\n\nCURRENT SECTION HTML (for reference, may be truncated):\n${currentSectionHtml.slice(0, 6000)}\n`
  const structureBlock = isNewSection ? '' : preserveStructure ? '\nPreserve the existing structure but apply the refinement to copy and styling.\n' : '\nFeel free to restructure if it serves the refinement.\n'
  const headingRule = sectionSlug === 'hero' ? 'HEADING HIERARCHY: This is the hero section — it MUST contain the single <h1>.' : 'HEADING HIERARCHY: Use <h2> for the section\'s main headline. Use <h3> for cards. Do NOT add another <h1>.'

  // Sprint 18N typography debt fix (982e66e5) — build the DESIGN TOKENS block
  // dynamically so font_serif/font_sans/font_mono are surfaced to COMPOSER
  // only when the tokens actually specify them. Avoids polluting the prompt
  // with empty rows for briefs that don't use a multi-font hierarchy.
  const typographyLines: string[] = [
    `  display font (use via font-display class): ${tokens.typography.display_font}`,
    `  body font: ${tokens.typography.body_font}`,
  ]
  if (tokens.typography.font_serif) typographyLines.push(`  serif font (use via font-serif class — editorial headings, blockquotes, brand moments): ${tokens.typography.font_serif}`)
  if (tokens.typography.font_sans) typographyLines.push(`  sans font (use via font-sans class — body running text, overrides body_font): ${tokens.typography.font_sans}`)
  if (tokens.typography.font_mono) typographyLines.push(`  mono font (use via font-mono class — code snippets, technical annotations): ${tokens.typography.font_mono}`)

  const tokensBlock = `DESIGN TOKENS:\n  primary: ${tokens.palette.primary}\n  accent: ${tokens.palette.accent}\n  background: ${tokens.palette.background}\n  text: ${tokens.palette.text_primary}\n${typographyLines.join('\n')}`

  return `SECTION-ONLY MODE. ${isNewSection ? 'Compose' : 'Regenerate'} ONLY the <section id="${sectionSlug}"> markup for the "${sectionName}" section of ${brief.client_name}'s website. No <!DOCTYPE>, <html>, <head>, <body>, <link>, or <script> tags.\n\n${isNewSection ? 'SECTION SPEC' : 'REFINEMENT INSTRUCTION'}:\n${instruction}\n${structureBlock}${referenceBlock}\n${tokensBlock}\n\nBRIEF CONTEXT:\n  Brand: ${brief.client_name}\n  Business: ${brief.business_description.slice(0, 240)}\n  Audience: ${brief.target_audience}\n  Tone: ${brief.mood_tone}\n\n${headingRule}\n\nACCESSIBILITY: CTA contrast ≥ 4.5:1. Use bg-primary text-white OR bg-white text-primary border-2 border-primary. Forms: aria-required. SVG illustrations: aria-hidden="true" or with figcaption. Don't add custom focus:ring on inputs.\n\n${buildScrollAnimationsBlock()}\n\nINLINE STYLES ARE FINE FOR GRADIENTS AND ONE-OFF EFFECTS.\n\nOUTPUT FORMAT (STRICT):\n- Output ONLY the <section> markup. No preamble. No code fences.\n- First character MUST be <. Last character MUST be >.\n\nProduce production-quality, responsive, accessible markup with REAL copy.`
}

async function callComposer(apiKey: string, prompt: string): Promise<{ ok: true; html: string; usage: { input: number; output: number }; costUsd: number } | { ok: false; error: string }> {
  const res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model: MODEL_ID, max_tokens: 8192, messages: [{ role: 'user', content: prompt }] }) })
  if (!res.ok) { const errText = await res.text(); return { ok: false, error: `COMPOSER call failed: ${res.status} ${errText.slice(0, 200)}` } }
  type AR = { content?: Array<{ type: string; text?: string }>; usage?: { input_tokens?: number; output_tokens?: number } }
  const data = (await res.json()) as AR
  const rawText = (data.content ?? []).map((c) => (c.type === 'text' ? c.text ?? '' : '')).join('')
  const extracted = extractSectionHtml(rawText)
  if (!extracted || !/<section[\s>]/i.test(extracted)) return { ok: false, error: `COMPOSER response did not contain a <section> tag. Raw (first 500 chars): ${rawText.slice(0, 500).replace(/\n/g, ' ')}` }
  const inputTokens = data.usage?.input_tokens ?? 0
  const outputTokens = data.usage?.output_tokens ?? 0
  return { ok: true, html: extracted, usage: { input: inputTokens, output: outputTokens }, costUsd: calculateCost(inputTokens, outputTokens) }
}

async function runSaveIteration(toolUse: DesignAssistantToolUse, deps: ToolDeps): Promise<DesignToolResult> {
  const input = toolUse.input as { client_feedback?: string; notes?: string }
  const current = await loadLatestIteration(deps.env.DB, deps.briefId)
  if (!current) return missingIteration(toolUse)
  const newId = crypto.randomUUID()
  const now = Math.floor(Date.now() / 1000)
  const nextNumber = current.iteration_number + 1
  await deps.env.DB.prepare(`INSERT INTO design_iterations (id, brief_id, iteration_number, orchestrator_run_id, client_feedback, design_tokens_json, page_html, status, cost_usd, tokens, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'ready', 0, 0, ?)`).bind(newId, current.brief_id, nextNumber, current.orchestrator_run_id, input.client_feedback ?? null, current.design_tokens_json, current.page_html, now).run()
  if (current.page_html) { const { r2Key } = await savePreviewToR2(deps.env, deps.briefId, nextNumber, current.page_html); await deps.env.DB.prepare(`UPDATE design_iterations SET preview_r2_key = ? WHERE id = ?`).bind(r2Key, newId).run() }
  await deps.env.DB.prepare(`UPDATE design_briefs SET current_iteration = ?, updated_at = ? WHERE id = ?`).bind(nextNumber, now, deps.briefId).run()
  return { type: 'tool_result', tool_use_id: toolUse.id, content: JSON.stringify({ ok: true, new_iteration_id: newId, iteration_number: nextNumber, note: 'New iteration committed.' }) }
}

// Sprint 16 v0.6 — emits verify_started before the CRITIC fetch and
// verify_done after the score is parsed, so ChatPane can show a live
// VerifyCard that transitions from pending to scored.
async function runCritique(toolUse: DesignAssistantToolUse, deps: ToolDeps, emit?: EmitFn): Promise<DesignToolResult> {
  const input = toolUse.input as { focus_areas?: string[] }
  const iter = await loadLatestIteration(deps.env.DB, deps.briefId)
  if (!iter || !iter.page_html) return missingIteration(toolUse)
  // Sprint 16 v0.6 — emit verify_started so ChatPane can show VerifyCard in pending state.
  await emit?.({ type: 'verify_started', focus_areas: input.focus_areas })
  const focus = input.focus_areas?.length ? `Focus areas: ${input.focus_areas.join(', ')}.` : ''
  const body = JSON.stringify({ model: MODEL_ID, max_tokens: 1024, system: 'You are CRITIC, a design quality reviewer. Score 0–100. Return STRICT JSON: {"score": number, "verdict": "PASS"|"FAIL", "strengths": string[], "issues": string[], "suggestions": string[]}. PASS ≥ 80.', messages: [{ role: 'user', content: `${focus}\n\nHTML (truncated to 12000 chars):\n\n${iter.page_html.slice(0, 12000)}` }] })
  const res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': deps.apiKey, 'anthropic-version': '2023-06-01' }, body })
  if (!res.ok) return { type: 'tool_result', tool_use_id: toolUse.id, content: `CRITIC call failed: ${res.status}`, is_error: true }
  type AR = { content?: Array<{ type: string; text?: string }> }
  const data = (await res.json()) as AR
  const text = (data.content ?? []).map((c) => (c.type === 'text' ? c.text ?? '' : '')).join('')
  const parsed = safeParse<{ score?: number; verdict?: string }>(text)
  if (parsed?.score !== undefined) {
    await deps.env.DB.prepare(`UPDATE design_iterations SET critic_score = ?, critic_feedback = ? WHERE id = ?`).bind(parsed.score, text, iter.id).run()
    // Sprint 16 v0.6 — emit verify_done so ChatPane transitions VerifyCard from pending to scored.
    await emit?.({
      type: 'verify_done',
      score: parsed.score,
      verdict: (parsed.verdict === 'PASS' || parsed.verdict === 'FAIL')
        ? (parsed.verdict as 'PASS' | 'FAIL')
        : parsed.score >= 80 ? 'PASS' : 'FAIL',
    })
  }
  return { type: 'tool_result', tool_use_id: toolUse.id, content: text }
}

function notImplemented(toolUse: DesignAssistantToolUse): DesignToolResult { return { type: 'tool_result', tool_use_id: toolUse.id, content: `Tool '${toolUse.name}' is not yet implemented.`, is_error: false } }
function missingIteration(toolUse: DesignAssistantToolUse): DesignToolResult { return { type: 'tool_result', tool_use_id: toolUse.id, content: 'No design_iterations row found for this brief yet.', is_error: true } }

export interface ChatTurnMessage {
  id: string
  role: 'assistant' | 'tool_result'
  content: string | null
  tool_calls_json: string | null
  tool_results_json: string | null
  cost_usd: number
  created_at: number
}

// Sprint 16 v0.6 — expanded with file_created, file_edited, design_commit,
// verify_started, verify_done, retry_attempt. The ChatPane mirrors this
// union in its own local StreamEvent type.
export type StreamEvent =
  | { type: 'turn_start'; turn_index: number }
  | { type: 'agent_text'; turn_index: number; text: string }
  | {
      type: 'tool_use'
      turn_index: number
      tool_use_id: string
      tool_name: string
      tool_input: Record<string, unknown>
    }
  | {
      type: 'tool_result'
      tool_use_id: string
      content: string
      is_error: boolean
    }
  | { type: 'file_created'; filename: string; file_type: string }
  | { type: 'file_edited'; filename: string }
  | { type: 'design_commit'; font_type: string; palette: string[]; accent: string; rhythm: string }
  | { type: 'verify_started'; focus_areas?: string[] }
  | { type: 'verify_done'; score: number; verdict: 'PASS' | 'FAIL' }
  | { type: 'retry_attempt'; attempt: number; max_attempts: number; delay_ms: number }
  | {
      type: 'done'
      final_text: string
      tool_hops: number
      cost_usd: number
      input_tokens: number
      output_tokens: number
      latency_ms: number
    }
  | { type: 'error'; message: string }

export type EmitFn = (event: StreamEvent) => Promise<void> | void

export interface IterationAgentResult {
  finalText: string
  toolHops: number
  totalInputTokens: number
  totalOutputTokens: number
  totalCostUsd: number
  latencyMs: number
  iterationIdsTouched: string[]
  turnMessages: ChatTurnMessage[]
}

// Sprint 16 v0.6 — wraps the Anthropic fetch with 529-aware exponential
// backoff. Retries up to 4 times (1/2/4/8s delays). CF Workers compatible:
// uses new Promise<void>(r => setTimeout(r, ms)) rather than Node's timers.
async function fetchWithRetry(url: string, init: RequestInit, emit?: EmitFn): Promise<Response> {
  const delays = [1000, 2000, 4000, 8000]
  let attempt = 0
  while (true) {
    const res = await fetch(url, init)
    if (res.status !== 529 || attempt >= delays.length) return res
    attempt += 1
    const delayMs = delays[attempt - 1]
    await emit?.({ type: 'retry_attempt', attempt, max_attempts: 4, delay_ms: delayMs })
    await new Promise<void>((r) => setTimeout(r, delayMs))
  }
}

export async function runIterationAgent(args: {
  env: CloudflareEnv
  apiKey: string
  userId: string
  brief: DesignBriefRow
  userMessage: string
  priorTurns: AnthropicTurn[]
  emit?: EmitFn
}): Promise<IterationAgentResult> {
  const { env, apiKey, userId, brief, userMessage, priorTurns } = args
  const emit: EmitFn = args.emit ?? (() => undefined)
  const startMs = Date.now()

  const turnMessages: ChatTurnMessage[] = []

  await persistDesignChatMessage(env.DB, {
    briefId: brief.id,
    userId,
    role: 'user',
    content: userMessage,
  })

  const currentIter = await loadLatestIteration(env.DB, brief.id)
  const system = buildSystemPrompt(brief, currentIter)
  const tools = TOOL_DEFINITIONS.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema }))

  const messages: AnthropicTurn[] = [...priorTurns]
  const lastTurn = messages[messages.length - 1]
  if (lastTurn && lastTurn.role === 'user') {
    if (typeof lastTurn.content === 'string') lastTurn.content = `${lastTurn.content}\n\n${userMessage}`
    else lastTurn.content.push({ type: 'text', text: userMessage })
  } else {
    messages.push({ role: 'user', content: userMessage })
  }

  let toolHops = 0
  let turnIndex = 0
  let finalText = ''
  let totalInputTokens = 0
  let totalOutputTokens = 0

  while (toolHops < MAX_TOOL_HOPS) {
    await emit({ type: 'turn_start', turn_index: turnIndex })

    // Sprint 16 v0.6 — use fetchWithRetry so 529 Overloaded responses
    // are retried automatically, with retry_attempt events emitted to the UI.
    const res = await fetchWithRetry('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL_ID, max_tokens: MAX_TOKENS_PER_CALL, system, tools, messages }),
    }, emit)
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
    const turnInputTokens = data.usage?.input_tokens ?? 0
    const turnOutputTokens = data.usage?.output_tokens ?? 0
    totalInputTokens += turnInputTokens
    totalOutputTokens += turnOutputTokens

    const blocks = data.content ?? []
    const assistantText = blocks.filter((b) => b.type === 'text').map((b) => (b.type === 'text' ? b.text : '')).join('\n')
    const toolUses = blocks.filter((b): b is DesignAssistantToolUse => b.type === 'tool_use')

    const turnCostUsd = calculateCost(turnInputTokens, turnOutputTokens)
    const toolCallsJson = toolUses.length > 0 ? JSON.stringify(toolUses) : null
    const assistantRowTs = Math.floor(Date.now() / 1000)
    const assistantRowId = await persistDesignChatMessage(env.DB, {
      briefId: brief.id,
      userId,
      role: 'assistant',
      content: assistantText || null,
      toolCallsJson,
      modelId: MODEL_ID,
      inputTokens: turnInputTokens,
      outputTokens: turnOutputTokens,
      costUsd: turnCostUsd,
    })
    turnMessages.push({
      id: assistantRowId,
      role: 'assistant',
      content: assistantText || null,
      tool_calls_json: toolCallsJson,
      tool_results_json: null,
      cost_usd: turnCostUsd,
      created_at: assistantRowTs,
    })

    if (assistantText && assistantText.trim()) {
      await emit({ type: 'agent_text', turn_index: turnIndex, text: assistantText })
    }
    for (const tu of toolUses) {
      await emit({
        type: 'tool_use',
        turn_index: turnIndex,
        tool_use_id: tu.id,
        tool_name: tu.name,
        tool_input: tu.input,
      })
    }

    finalText = assistantText

    if (toolUses.length === 0 || data.stop_reason === 'end_turn') break

    const results: DesignToolResult[] = []
    for (const toolUse of toolUses) {
      // Sprint 16 v0.6 — pass emit so runUpdateDesignTokens and runCritique
      // can fire their respective semantic events.
      const result = await executeIterationTool(toolUse, { env, apiKey, userId, briefId: brief.id }, emit)
      results.push(result)
      await emit({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: typeof result.content === 'string' ? result.content : JSON.stringify(result.content),
        is_error: !!result.is_error,
      })
    }

    const toolResultsJson = JSON.stringify(results)
    const toolResultRowTs = Math.floor(Date.now() / 1000)
    const toolResultRowId = await persistDesignChatMessage(env.DB, {
      briefId: brief.id,
      userId,
      role: 'tool_result',
      toolResultsJson,
    })
    turnMessages.push({
      id: toolResultRowId,
      role: 'tool_result',
      content: null,
      tool_calls_json: null,
      tool_results_json: toolResultsJson,
      cost_usd: 0,
      created_at: toolResultRowTs,
    })

    messages.push({ role: 'assistant', content: blocks })
    messages.push({ role: 'user', content: results })

    toolHops += 1
    turnIndex += 1
  }

  const latencyMs = Date.now() - startMs
  const totalCostUsd = calculateCost(totalInputTokens, totalOutputTokens)

  await emit({
    type: 'done',
    final_text: finalText,
    tool_hops: toolHops,
    cost_usd: totalCostUsd,
    input_tokens: totalInputTokens,
    output_tokens: totalOutputTokens,
    latency_ms: latencyMs,
  })

  return {
    finalText,
    toolHops,
    totalInputTokens,
    totalOutputTokens,
    totalCostUsd,
    latencyMs,
    iterationIdsTouched: [],
    turnMessages,
  }
}

async function loadLatestIteration(db: D1Database, briefId: string): Promise<DesignIterationRow | null> {
  return db.prepare(`SELECT * FROM design_iterations WHERE brief_id = ? ORDER BY iteration_number DESC LIMIT 1`).bind(briefId).first<DesignIterationRow>()
}

function safeParse<T = unknown>(raw: string): T | null { try { return JSON.parse(raw) as T } catch { return null } }

function deepMergeJson(target: unknown, source: unknown): unknown {
  if (target === null || typeof target !== 'object' || Array.isArray(target) || source === null || typeof source !== 'object' || Array.isArray(source)) return source === undefined ? target : source
  const t = target as Record<string, unknown>
  const s = source as Record<string, unknown>
  const result: Record<string, unknown> = { ...t }
  for (const [k, v] of Object.entries(s)) {
    const existing = result[k]
    if (v !== null && typeof v === 'object' && !Array.isArray(v) && existing !== null && typeof existing === 'object' && !Array.isArray(existing)) result[k] = deepMergeJson(existing, v)
    else result[k] = v
  }
  return result
}

function emptyTokens(): DesignTokens {
  return { palette: { primary: '#000000', accent: '#000000', background: '#ffffff', text_primary: '#111111' }, typography: { display_font: 'system-ui', body_font: 'system-ui' } }
}
