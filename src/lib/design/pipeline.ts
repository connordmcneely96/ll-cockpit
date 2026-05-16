/**
 * Design Build pipeline helpers — Sprint 16 v0.2.1 → Sprint 18F → Sprint 18E → Sprint 18N (scroll animations).
 *
 * Per-section architecture:
 *   buildDesignBuildDAG(brief, iter, feedback, attachedSystem?) → DecompositionResult
 *     - st_1: DESIGNER (JSON tokens). When attachedSystem set, prompt instructs DESIGNER
 *             to use that DESIGN.md's tokens verbatim rather than invent new ones.
 *     - st_2..N+1: COMPOSER per section (parallel, each gets own 8192 budget)
 *     - st_N+2: ASSEMBLER (deterministic scaffold + stitch, $0 cost)
 *     - st_N+3: CRITIC (reviews assembled page)
 *
 * Sprint 18N — every rendered page now ships with the data-anim scroll animation
 * scaffold: ANIMATION_PRESETS_CSS in the head, INTERSECTION_OBSERVER_SCRIPT before
 * </body>. Sections opt in via `data-anim="..."` attributes emitted by COMPOSER.
 */

import type {
  CloudflareEnv,
  DesignBriefInput,
  DesignBriefRow,
  DesignIterationRow,
  DesignSection,
  DesignTokens,
  DecompositionResult,
  OrchestratorRunRow,
} from '@/types'
import {
  ANIMATION_PRESETS_CSS,
  INTERSECTION_OBSERVER_SCRIPT,
} from './animation-presets'

// ──────────────────────────────────────────────────────────────────────
// SECTION CLASSIFICATION — Sprint 18F cost optimization
// ──────────────────────────────────────────────────────────────────────

const COMPLEX_KEYWORDS = [
  'hero', 'headline', 'banner',
  'pricing', 'plans', 'tier',
  'feature', 'capability', 'benefit',
  'testimonial', 'review', 'case stud', 'social proof',
  'how it works', 'how we work', 'process',
  'cta', 'call to action', 'sign up', 'get started',
  'value prop', 'proposition',
  'comparison', 'versus', 'vs',
  'demo', 'video', 'product tour',
] as const

const SIMPLE_KEYWORDS = [
  'contact', 'reach out', 'get in touch',
  'footer',
  'faq', 'frequently asked',
  'team', 'about us', 'our story',
  'newsletter', 'subscribe',
  'cert', 'compliance', 'standards', 'iso', 'gdpr',
  'partner', 'logo',
  'location', 'office',
  'press', 'media',
  'careers', 'jobs',
  'legal', 'policy', 'terms', 'privacy',
  'made in', 'manufactur',
  'support', 'help',
  'request a quote', 'quote',
  'industries served', 'applications',
  'lineup', 'product line', 'catalog',
  'field result', 'reference list',
] as const

export function classifySection(name: string, description: string): 'compose_simple' | 'compose_complex' {
  const text = `${name} ${description}`.toLowerCase()
  if (COMPLEX_KEYWORDS.some((kw) => text.includes(kw))) return 'compose_complex'
  if (SIMPLE_KEYWORDS.some((kw) => text.includes(kw))) return 'compose_simple'
  return 'compose_complex'
}

// ──────────────────────────────────────────────────────────────────────
// DAG BUILDER — programmatic, no HERMES
// ──────────────────────────────────────────────────────────────────────

export interface ParsedSection {
  name: string
  slug: string
  description: string
}

export function parseSections(briefSections: string): ParsedSection[] {
  const tokens: string[] = []
  let buf = ''
  let depth = 0
  for (const ch of briefSections) {
    if (ch === '(') { depth++; buf += ch; continue }
    if (ch === ')') { depth = Math.max(0, depth - 1); buf += ch; continue }
    if ((ch === ',' || ch === '\n') && depth === 0) {
      if (buf.trim()) tokens.push(buf.trim())
      buf = ''
      continue
    }
    buf += ch
  }
  if (buf.trim()) tokens.push(buf.trim())

  return tokens.map((description) => {
    const name = description.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim()
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
    return { name, slug, description }
  })
}

export interface AttachedDesignSystem {
  slug: string
  name: string
  description: string
  design_md: string
}

export function buildDesignBuildDAG(
  brief: DesignBriefInput,
  iterationNumber: number = 1,
  clientFeedback?: string,
  attachedSystem?: AttachedDesignSystem,
): DecompositionResult {
  const sections = parseSections(brief.must_have_sections)
  const subtasks: DecompositionResult['subtasks'] = []

  const briefSummary = [
    `Client: ${brief.client_name}`,
    `Business: ${brief.business_description}`,
    `Audience: ${brief.target_audience}`,
    `Tone: ${brief.mood_tone}`,
    `Brand colors: ${brief.brand_colors || "designer's choice"}`,
    `Constraints: ${brief.constraints || 'none'}`,
    `Style references: ${brief.style_references?.join(', ') || 'none'}`,
  ].join('\n')

  const feedbackBlock = clientFeedback
    ? `\n\nITERATION ${iterationNumber} — client feedback to apply:\n${clientFeedback}\n`
    : ''

  const designSystemBlock = attachedSystem
    ? `\n\n## ATTACHED DESIGN SYSTEM — ${attachedSystem.name}\n` +
      `The user attached this design system. Use its tokens (colors, typography, spacing, components) verbatim. ` +
      `Adapt only where the brief explicitly requires it. Do NOT invent new colors or fonts when this system defines them.\n\n` +
      `<design_system_content>\n${attachedSystem.design_md.slice(0, 12000)}\n</design_system_content>\n`
    : ''

  // st_1: DESIGNER
  subtasks.push({
    id: 'st_1',
    agent: 'DESIGNER',
    title: attachedSystem
      ? `Adapt design tokens from ${attachedSystem.name}`
      : 'Generate design tokens',
    task: `${attachedSystem
        ? `Adapt the attached design system's tokens to this brief.${feedbackBlock}\n\nBRIEF:\n${briefSummary}${designSystemBlock}\n\nOutput the JSON token object per your system prompt. Preserve the attached system's color hex values, font families, and spacing scale. Map them into the standard {palette, typography, spacing, motion} JSON shape. No HTML.`
        : `Generate design tokens (JSON) for the website rebuild.${feedbackBlock}\n\nBRIEF:\n${briefSummary}\n\nOutput the JSON token object per your system prompt. No HTML.`
      }`,
    task_type: 'design_language',
    depends_on: [],
    estimated_cost_usd: attachedSystem ? 0.03 : 0.02,
    estimated_duration_seconds: 15,
    risk_level: 'low',
    human_required: false,
  })

  // st_2..N+1: COMPOSER per section
  const composerIds: string[] = []
  let estimatedComposerCost = 0
  sections.forEach((sec, i) => {
    const id = `st_${i + 2}`
    composerIds.push(id)
    const taskType = classifySection(sec.name, sec.description)
    const estCost = taskType === 'compose_simple' ? 0.015 : 0.05
    estimatedComposerCost += estCost

    const guidanceBlock =
      sec.description !== sec.name
        ? `\n\nSECTION GUIDANCE (from brief): ${sec.description}\n`
        : ''
    subtasks.push({
      id,
      agent: 'COMPOSER',
      title: `Compose ${sec.name} section`,
      task: `SECTION-ONLY MODE. Compose ONLY the <section id="${sec.slug}"> markup for the "${sec.name}" section of ${brief.client_name}'s website. No <!DOCTYPE>, <html>, <head>, <body>, <link>, or <script> tags.${guidanceBlock}\n\nUse Tailwind classes referencing the design tokens passed in upstream context (primary, accent, surface, text-primary, text-secondary, border, font-display, font-sans).\n\nBRIEF CONTEXT:\n${briefSummary}\n\nALL SECTIONS IN ORDER: ${sections.map((s) => s.name).join(', ')}\n\nTHIS SECTION: ${sec.name}\n\nHEADING HIERARCHY: Use <h2> for your section's main headline. If you have card grids or sub-items inside, use <h3> for them. The page's single <h1> lives in the hero section; do NOT add another <h1>.\n\nACCESSIBILITY REQUIREMENTS:\n- All CTA buttons MUST meet WCAG AA contrast 4.5:1. White text on light backgrounds is forbidden. Use bg-primary text-white OR bg-white text-primary border-2 border-primary.\n- Form inputs: use aria-required="true" for required fields (not visual asterisks alone).\n- Icon-only indicators must include sr-only text or visible label adjacent.\n- SVG illustrations inside articles: wrap in <figure> with <figcaption> for screen readers; mark purely decorative SVGs aria-hidden="true".\n- Focus styles: rely on the global focus-visible outline rule; do NOT add custom focus:ring on inputs (causes double-ring).\n\nProduce production-quality, responsive, accessible markup with REAL copy (not placeholders). Use semantic HTML (h2 for section headline, articles for grouped items, dl/dt/dd for spec definition lists). First character of your response must be <, last must be >.`,
      task_type: taskType,
      depends_on: ['st_1'],
      estimated_cost_usd: estCost,
      estimated_duration_seconds: 30,
      risk_level: 'low',
      human_required: false,
    })
  })

  // st_N+2: ASSEMBLER
  const assemblerId = `st_${sections.length + 2}`
  subtasks.push({
    id: assemblerId,
    agent: 'ASSEMBLER',
    title: 'Assemble final HTML page',
    task: `Deterministically stitch DESIGNER tokens + all COMPOSER section outputs into a complete HTML document.`,
    task_type: 'assemble_page',
    depends_on: ['st_1', ...composerIds],
    estimated_cost_usd: 0,
    estimated_duration_seconds: 1,
    risk_level: 'low',
    human_required: false,
  })

  // st_N+3: CRITIC
  const criticId = `st_${sections.length + 3}`
  subtasks.push({
    id: criticId,
    agent: 'CRITIC',
    title: 'Review assembled page',
    task: `Review the assembled HTML page against this brief and your rubric. Score 0–100. Return JSON per your system prompt.\n\nBRIEF:\n${briefSummary}`,
    task_type: 'critique_design',
    depends_on: [assemblerId],
    estimated_cost_usd: 0.015,
    estimated_duration_seconds: 20,
    risk_level: 'low',
    human_required: false,
  })

  const totalCost = (attachedSystem ? 0.03 : 0.02) + estimatedComposerCost + 0.015
  const totalDurationSec = 15 + sections.length * 30 + 1 + 20

  return {
    summary: attachedSystem
      ? `Design build for ${brief.client_name} (${sections.length} sections, design system: ${attachedSystem.name})`
      : `Design build for ${brief.client_name} — ${sections.length} sections (Sprint 18F tiered: simple→Haiku, complex→Sonnet).`,
    estimated_total_cost_usd: totalCost,
    estimated_duration_minutes: Math.ceil(totalDurationSec / 60),
    subtasks,
  }
}

export async function loadAttachedDesignSystem(
  env: CloudflareEnv,
  slug: string,
  userId: string,
): Promise<AttachedDesignSystem | null> {
  const row = await env.DB
    .prepare(
      `SELECT slug, name, description, r2_key FROM design_systems
       WHERE slug = ? AND (tenant_id IS NULL OR user_id = ?)
       LIMIT 1`,
    )
    .bind(slug, userId)
    .first<{ slug: string; name: string; description: string | null; r2_key: string | null }>()

  if (!row || !row.r2_key) return null

  try {
    const obj = await env.R2.get(row.r2_key)
    if (!obj) return null
    const design_md = await obj.text()
    return {
      slug: row.slug,
      name: row.name,
      description: row.description ?? '',
      design_md,
    }
  } catch (err) {
    console.error(`loadAttachedDesignSystem R2 fetch failed for ${row.r2_key}:`, err)
    return null
  }
}

// ──────────────────────────────────────────────────────────────────────
// EXTRACTION HELPERS
// ──────────────────────────────────────────────────────────────────────

export function extractHtml(text: string): string {
  if (!text) return ''
  const fenced = text.match(/```(?:html)?\s*([\s\S]*?)```/i)
  if (fenced) return fenced[1].trim()
  const startMatch = text.match(/<!DOCTYPE[^>]*>|<html\b/i)
  if (startMatch && startMatch.index !== undefined) {
    const start = text.slice(startMatch.index)
    const closingIdx = start.toLowerCase().lastIndexOf('</html>')
    if (closingIdx >= 0) return start.slice(0, closingIdx + '</html>'.length)
    return start.trim()
  }
  return text.trim()
}

export function extractSectionHtml(text: string): string {
  if (!text) return ''
  const fenced = text.match(/```(?:html)?\s*([\s\S]*?)```/i)
  let candidate = fenced ? fenced[1] : text
  candidate = candidate.trim()

  const bodyMatch = candidate.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
  if (bodyMatch) candidate = bodyMatch[1].trim()

  const sectionMatch = candidate.match(/<section[\s\S]*?<\/section>/i)
  if (sectionMatch) return sectionMatch[0]

  return candidate
}

export function extractJson(text: string): unknown | null {
  if (!text) return null
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced ? fenced[1] : text
  const first = candidate.indexOf('{')
  const last = candidate.lastIndexOf('}')
  if (first < 0 || last < 0 || last <= first) return null
  try {
    return JSON.parse(candidate.slice(first, last + 1))
  } catch {
    return null
  }
}

// ──────────────────────────────────────────────────────────────────────
// DETERMINISTIC HTML SCAFFOLD
// ──────────────────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) =>
    c === '&' ? '&amp;' :
    c === '<' ? '&lt;' :
    c === '>' ? '&gt;' :
    '&quot;'
  )
}

export function renderFullHtml({
  brief,
  tokens,
  sections,
}: {
  brief: { client_name: string; business_description: string }
  tokens: DesignTokens
  sections: DesignSection[]
}): string {
  const p = tokens.palette
  const t = tokens.typography
  const displayFont = t.display_font || 'Inter'
  const bodyFont = t.body_font || 'Inter'

  const navLinks = sections
    .map((s) => `<a href="#${s.slug}" class="text-sm font-medium text-text-primary hover:text-primary transition-colors">${escapeHtml(s.name)}</a>`)
    .join('\n        ')

  const sectionMarkup = sections.map((s) => s.html).join('\n\n  ')
  const fontParam = (name: string) => name.replace(/ /g, '+')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(brief.client_name)}</title>
  <meta name="description" content="${escapeHtml(brief.business_description)}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=${fontParam(displayFont)}:wght@400;500;600;700&family=${fontParam(bodyFont)}:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            primary: '${p.primary}',
            'primary-dark': '${p.primary_dark ?? p.primary}',
            'primary-light': '${p.primary_light ?? p.primary}',
            accent: '${p.accent}',
            surface: '${p.surface ?? '#ffffff'}',
            'text-primary': '${p.text_primary}',
            'text-secondary': '${p.text_secondary ?? '#475569'}',
            border: '${p.border ?? '#e2e8f0'}',
          },
          fontFamily: {
            display: ['${displayFont}', 'system-ui', 'sans-serif'],
            sans: ['${bodyFont}', 'system-ui', 'sans-serif'],
          },
        },
      },
    }
  </script>
  <style>
    body { font-family: '${bodyFont}', system-ui, sans-serif; background: ${p.background}; color: ${p.text_primary}; }
    .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
    .skip-link:focus { position: fixed; top: 1rem; left: 1rem; background: ${p.primary}; color: white; padding: 0.75rem 1rem; z-index: 100; clip: auto; width: auto; height: auto; border-radius: 4px; }
    a:focus-visible, button:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible { outline: 2px solid ${p.primary}; outline-offset: 2px; border-radius: 2px; }
    .mobile-menu { display: none; }
    .mobile-menu.open { display: block; }

    ${ANIMATION_PRESETS_CSS}
  </style>
</head>
<body>
  <a href="#main" class="skip-link sr-only">Skip to main content</a>
  <header class="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-border" role="banner">
    <nav class="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between" aria-label="Main navigation">
      <a href="#" class="font-display font-bold text-xl text-primary">${escapeHtml(brief.client_name)}</a>
      <div class="hidden md:flex items-center gap-8">
        ${navLinks}
      </div>
      <button class="md:hidden p-2 text-text-primary" aria-label="Toggle navigation menu" aria-expanded="false" aria-controls="mobile-menu" onclick="const m=document.getElementById('mobile-menu');m.classList.toggle('open');this.setAttribute('aria-expanded', this.getAttribute('aria-expanded')==='true'?'false':'true');">
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/>
        </svg>
      </button>
    </nav>
    <div id="mobile-menu" class="mobile-menu md:hidden border-t border-border bg-white">
      <div class="max-w-7xl mx-auto px-6 py-4 flex flex-col gap-3">
        ${navLinks}
      </div>
    </div>
  </header>
  <main id="main" role="main">
  ${sectionMarkup}
  </main>
  <footer class="bg-primary text-white py-12 mt-16" role="contentinfo">
    <div class="max-w-7xl mx-auto px-6">
      <div class="border-t border-white/10 pt-6 flex flex-col md:flex-row justify-between items-center gap-4">
        <p class="text-sm opacity-80">© ${new Date().getFullYear()} ${escapeHtml(brief.client_name)}. All rights reserved.</p>
        <p class="text-xs opacity-60 font-mono">Built with Leadership Legacy Digital</p>
      </div>
    </div>
  </footer>
  <script>
${INTERSECTION_OBSERVER_SCRIPT}
  </script>
</body>
</html>`
}

// ──────────────────────────────────────────────────────────────────────
// DETERMINISTIC ASSEMBLER
// ──────────────────────────────────────────────────────────────────────

export async function executeAssembler(
  env: CloudflareEnv,
  userId: string,
  pipelineRunId: string,
): Promise<{ output: string; cost_usd: number; tokens: number }> {
  const rows = await env.DB
    .prepare(
      `SELECT short_id, agent_name, title, output FROM agent_subtasks
         WHERE pipeline_run_id = ? AND user_id = ? AND status = 'done' AND output IS NOT NULL
         ORDER BY short_id ASC`,
    )
    .bind(pipelineRunId, userId)
    .all<{ short_id: string; agent_name: string; title: string; output: string }>()

  let designTokens: DesignTokens | null = null
  const sections: DesignSection[] = []

  for (const row of rows.results ?? []) {
    if (row.agent_name === 'designer') {
      designTokens = extractJson(row.output) as DesignTokens | null
    } else if (row.agent_name === 'composer') {
      const match = row.title.match(/Compose\s+(.+?)\s+section/i)
      const name = match ? match[1] : row.title.replace(/Compose\s+/i, '').replace(/\s+section/i, '')
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
      sections.push({ slug, name, html: extractSectionHtml(row.output) })
    }
  }

  if (!designTokens) throw new Error('ASSEMBLER: DESIGNER tokens not found in upstream context')
  if (sections.length === 0) throw new Error('ASSEMBLER: no COMPOSER section outputs found')

  const brief = await env.DB
    .prepare(`SELECT client_name, business_description FROM design_briefs WHERE orchestrator_run_id = ? AND user_id = ? LIMIT 1`)
    .bind(pipelineRunId, userId)
    .first<{ client_name: string; business_description: string }>()

  if (!brief) throw new Error('ASSEMBLER: brief metadata not found for this run')

  const html = renderFullHtml({ brief, tokens: designTokens, sections })
  return { output: html, cost_usd: 0, tokens: 0 }
}

// ──────────────────────────────────────────────────────────────────────
// R2 PREVIEW SAVE
// ──────────────────────────────────────────────────────────────────────

export async function savePreviewToR2(
  env: CloudflareEnv,
  briefId: string,
  iterationNumber: number,
  html: string,
): Promise<{ r2Key: string }> {
  const r2Key = `design/${briefId}/iteration-${iterationNumber}.html`
  await env.R2.put(r2Key, html, {
    httpMetadata: { contentType: 'text/html; charset=utf-8' },
    customMetadata: {
      brief_id: briefId,
      iteration: String(iterationNumber),
      created_at: String(Math.floor(Date.now() / 1000)),
    },
  })
  return { r2Key }
}

// ──────────────────────────────────────────────────────────────────────
// LAZY FINALIZER
// ──────────────────────────────────────────────────────────────────────

export interface FinalizationResult {
  finalized: boolean
  preview_url?: string
  critic_score?: number
  critic_pass?: boolean
  reason?: string
}

export async function finalizeIterationIfReady(
  env: CloudflareEnv,
  origin: string,
  brief: DesignBriefRow,
  iteration: DesignIterationRow,
  run: OrchestratorRunRow,
): Promise<FinalizationResult> {
  if (iteration.preview_r2_key) return { finalized: false, reason: 'already finalized' }
  if (run.status !== 'completed') return { finalized: false, reason: `run status: ${run.status}` }

  const subtasks = await env.DB
    .prepare(`SELECT agent_name, output, status, cost_usd, tokens FROM agent_subtasks WHERE pipeline_run_id = ? AND user_id = ?`)
    .bind(run.id, brief.user_id)
    .all<{ agent_name: string; output: string | null; status: string; cost_usd: number; tokens: number }>()

  const byAgent: Record<string, { latestOutput: string; cost: number; tokens: number }> = {}
  for (const row of subtasks.results ?? []) {
    if (row.status === 'done' && row.output) {
      const prev = byAgent[row.agent_name]
      byAgent[row.agent_name] = {
        latestOutput: row.output,
        cost: (prev?.cost ?? 0) + (row.cost_usd ?? 0),
        tokens: (prev?.tokens ?? 0) + (row.tokens ?? 0),
      }
    }
  }

  const finalSource = byAgent.assembler ?? byAgent.composer
  if (!finalSource) return { finalized: false, reason: 'No ASSEMBLER or COMPOSER output found' }

  const html = extractHtml(finalSource.latestOutput)
  if (!html || !/<html\b|<!DOCTYPE/i.test(html)) {
    return { finalized: false, reason: 'Output is not a valid HTML document' }
  }

  const { r2Key } = await savePreviewToR2(env, brief.id, iteration.iteration_number, html)
  const previewUrl = `${origin}/design/preview/${brief.id}`

  const designerJson = byAgent.designer ? extractJson(byAgent.designer.latestOutput) : null
  const criticJson = byAgent.critic ? extractJson(byAgent.critic.latestOutput) : null
  const criticScore = criticJson && typeof (criticJson as { score?: unknown }).score === 'number'
    ? ((criticJson as { score: number }).score as number)
    : null
  const criticPass = criticJson && typeof (criticJson as { pass?: unknown }).pass === 'boolean'
    ? ((criticJson as { pass: boolean }).pass as boolean)
    : null

  const now = Math.floor(Date.now() / 1000)
  const totalCost = Object.values(byAgent).reduce((sum, a) => sum + a.cost, 0)
  const totalTokens = Object.values(byAgent).reduce((sum, a) => sum + a.tokens, 0)

  await env.DB
    .prepare(`UPDATE design_iterations SET design_tokens_json = ?, page_html = ?, critic_score = ?, critic_feedback = ?, preview_r2_key = ?, preview_url = ?, status = 'ready', cost_usd = ?, tokens = ?, completed_at = ? WHERE id = ?`)
    .bind(
      designerJson ? JSON.stringify(designerJson) : null,
      html,
      criticScore,
      criticJson ? JSON.stringify(criticJson) : null,
      r2Key,
      previewUrl,
      totalCost,
      totalTokens,
      now,
      iteration.id,
    )
    .run()

  await env.DB
    .prepare(`UPDATE design_briefs SET status = 'preview_ready', preview_url = ?, total_cost_usd = total_cost_usd + ?, total_tokens = total_tokens + ?, updated_at = ? WHERE id = ?`)
    .bind(previewUrl, totalCost, totalTokens, now, brief.id)
    .run()

  return {
    finalized: true,
    preview_url: previewUrl,
    critic_score: criticScore ?? undefined,
    critic_pass: criticPass ?? undefined,
  }
}
