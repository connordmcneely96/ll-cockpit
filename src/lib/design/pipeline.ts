/**
 * Design Build pipeline helpers — Sprint 16 v0.2.1 → Sprint 18F → Sprint 18E → Sprint 18N → Sprint 18Y → Sprint 18Z.
 *
 * Per-section architecture:
 *   buildDesignBuildDAG(brief, iter, feedback, attachedSystem?) → DecompositionResult
 *     - st_1: DESIGNER (JSON tokens). When attachedSystem set, prompt instructs DESIGNER
 *             to use that DESIGN.md's tokens verbatim rather than invent new ones,
 *             INCLUDING serif/sans/mono font split when the system specifies one.
 *     - st_2..N+1: COMPOSER per section (parallel, each gets own 8192 budget)
 *     - st_N+2: ASSEMBLER (deterministic scaffold + stitch, $0 cost)
 *     - st_N+3: CRITIC (reviews assembled page)
 *
 * Sprint 18N — every rendered page ships with the data-anim scroll animation
 * scaffold: ANIMATION_PRESETS_CSS in the head, INTERSECTION_OBSERVER_SCRIPT before
 * </body>. COMPOSER prompt teaches the agent to emit data-anim attributes
 * contextually, tone-matched to the brief.
 *
 * Sprint 18N typography debt fix (982e66e5) — renderFullHtml supports an optional
 * font_serif/font_sans/font_mono triad in DesignTokens.typography.
 *
 * Sprint 18K (A2) — renderFullHtml injects data-nexus-id="${section.slug}"
 * on the opening <section> tag of every COMPOSER output.
 *
 * Sprint 18K (A3 fix) — writeProjectFilesToR2 is awaited in
 * finalizeIterationIfReady.
 *
 * Sprint 18Y — renderFullHtml now:
 *   - Emits all palette values as CSS custom properties on :root (light mode)
 *   - Emits :root.dark {} overrides derived from palette_dark tokens
 *     (or auto-derived by deriveDarkPalette() when absent)
 *   - Sets tailwind.config darkMode:'class' so all bg-*, text-*, and border-* utilities
 *     respond to the .dark class on <html>
 *   - Tailwind color values reference var(--*) custom properties so toggling
 *     the CSS vars is sufficient for full dark mode
 *   - Conditionally injects TweaksPanel IIFE before </body> when the brief's
 *     skills array includes 'tweaks-panel'
 *   - executeAssembler now SELECTs skills from design_briefs and passes the
 *     parsed array through to renderFullHtml
 *
 * Sprint 18Z — renderFullHtml now accepts an optional feedbackContext
 * { briefId, iterationNumber } that wires the Tweaks Panel's "Send notes to
 * designer" feature. When omitted, the panel renders as the Sprint 18Y v1
 * (no feedback section). The feedback API URL is constructed from
 * COCKPIT_BASE_URL (hardcoded for v1; env-driven later).
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
  animationPresetsForPrompt,
} from './animation-presets'
import {
  buildTweaksPanelScript,
  deriveDarkPalette,
  generateAccentAlternates,
} from './tweaks-panel'
import { backfillBriefSections } from './brief-sections-backfill'
import { listBriefSections } from './brief-sections'

// Sprint 18Z — Cockpit API base URL where the feedback POST is routed.
//
// VERIFIED LIVE 2026-05-19 via browser DevTools Network tab. The original
// Sprint 18Z bake-in used `cockpit.leadershiplegacydigital.com` (per the
// project memory at the time), which did NOT resolve in DNS — every feedback
// POST failed with `net::ERR_NAME_NOT_RESOLVED`. The canonical worker
// hostname is the workers.dev domain below; the custom subdomain may be
// planned but is not currently wired up.
//
// IF you later wire up a custom domain (e.g. cockpit.leadershiplegacydigital.com):
//   1. confirm DNS resolves via `dig` or browser before changing this constant
//   2. confirm the worker is bound to that hostname via wrangler routes
//   3. test a real Send-notes click before merging
// Don't trust documentation that says "is deployed at X" — test reachability.
export const COCKPIT_BASE_URL = 'https://ll-cockpit.connorpattern.workers.dev'

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

  const scrollAnimationsBlock = buildScrollAnimationsBlock()

  // st_1: DESIGNER
  subtasks.push({
    id: 'st_1',
    agent: 'DESIGNER',
    title: attachedSystem
      ? `Adapt design tokens from ${attachedSystem.name}`
      : 'Generate design tokens',
    task: `${attachedSystem
        ? `Adapt the attached design system's tokens to this brief.${feedbackBlock}\n\nBRIEF:\n${briefSummary}${designSystemBlock}\n\nOutput the JSON token object per your system prompt. Preserve the attached system's color hex values, font families, and spacing scale. Map them into the standard {palette, typography, spacing, motion} JSON shape.\n\nTYPOGRAPHY HIERARCHY (Sprint 18N typography debt fix): If the system specifies a multi-font hierarchy — separate serif/sans/mono families (e.g. Notion's Inter + Lora + JetBrains Mono triad, Stripe's serif headlines on sans body, Apple's SF Pro + SF Mono pair) — populate the optional typography fields in addition to display_font and body_font:\n  - typography.font_serif → editorial/display serif font (e.g. "Lora", "Source Serif Pro", "Playfair Display")\n  - typography.font_sans → primary sans font (often same as body_font, but use this when the system distinguishes a UI sans from a body sans)\n  - typography.font_mono → monospace font for code/technical content (e.g. "JetBrains Mono", "SF Mono", "Fira Code")\nMap display_font to the primary headline font (whichever family the system uses for H1-H2). Map body_font to the primary running text font. Only set font_serif/font_sans/font_mono when the attached system explicitly defines them — do not invent splits when the system uses one font everywhere. No HTML.`
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
      task: `SECTION-ONLY MODE. Compose ONLY the <section id="${sec.slug}"> markup for the "${sec.name}" section of ${brief.client_name}'s website. No <!DOCTYPE>, <html>, <head>, <body>, <link>, or <script> tags.${guidanceBlock}\n\nUse Tailwind classes referencing the design tokens passed in upstream context (primary, accent, surface, text-primary, text-secondary, border, font-display, font-sans, font-serif, font-mono — last two only when the DESIGNER tokens specify font_serif/font_mono).\n\nBRIEF CONTEXT:\n${briefSummary}\n\nALL SECTIONS IN ORDER: ${sections.map((s) => s.name).join(', ')}\n\nTHIS SECTION: ${sec.name}\n\nHEADING HIERARCHY: Use <h2> for your section's main headline. If you have card grids or sub-items inside, use <h3> for them. The page's single <h1> lives in the hero section; do NOT add another <h1>.\n\nACCESSIBILITY REQUIREMENTS:\n- All CTA buttons MUST meet WCAG AA contrast 4.5:1. White text on light backgrounds is forbidden. Use bg-primary text-white OR bg-white text-primary border-2 border-primary.\n- Form inputs: use aria-required="true" for required fields (not visual asterisks alone).\n- Icon-only indicators must include sr-only text or visible label adjacent.\n- SVG illustrations inside articles: wrap in <figure> with <figcaption> for screen readers; mark purely decorative SVGs aria-hidden="true".\n- Focus styles: rely on the global focus-visible outline rule; do NOT add custom focus:ring on inputs (causes double-ring).\n\n${scrollAnimationsBlock}\n\nProduce production-quality, responsive, accessible markup with REAL copy (not placeholders). Use semantic HTML (h2 for section headline, articles for grouped items, dl/dt/dd for spec definition lists). First character of your response must be <, last must be >.`,
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

/**
 * Sprint 18N — shared scroll-animations block used by both buildDesignBuildDAG
 * (initial build) and iteration-agent.buildComposerPrompt (regenerate_section,
 * add_section). Keeping this in one place ensures both paths teach COMPOSER the
 * same conventions for emitting data-anim attributes.
 */
export function buildScrollAnimationsBlock(): string {
  return `SCROLL ANIMATIONS (Sprint 18N — agent-prescribed):
The rendered page ships with a scroll-triggered animation scaffold. Opt elements into animations by adding the data-anim HTML attribute to MAJOR BLOCK ELEMENTS. Available presets:

${animationPresetsForPrompt()}

PLACEMENT RULES:
- Add data-anim to MAJOR BLOCK ELEMENTS only: the <section> itself, large cards, hero headline, key CTAs, stat blocks. Never on every <p>, span, button, or inline element.
- ONE preset per element in most cases. Combine only when pairing parent + child semantics (e.g. <ul data-anim="stagger-children"> with <li data-anim="fade-in"> children).
- Tone fit:
  - Default → fade-in or slide-up
  - CTAs / callouts → scale-in (one per section maximum)
  - Card grids / lists → parent gets stagger-children, children get fade-in or slide-up
  - Hero headline → text-reveal (one per PAGE maximum, hero only)
  - Numeric stats → count-up on the number element itself
  - Hero background image → parallax-bg on the background div (one per page maximum)
  - Long-form narrative / process steps → sticky-scroll-reveal
- Solemn / medical / bereavement / archival sections: use ONLY fade-in. No transforms.
- Tone match with the brief's mood_tone matters more than animating things. If the mood is quiet/restrained/editorial/corporate-formal, default to fewer animations or fade-in only.
- LIMIT: At most 4 data-anim attributes per section. Animating everything is worse than animating nothing.

EXAMPLE (features section):
  <section id="features" data-anim="fade-in">
    <h2>Built for engineers</h2>
    <div class="grid grid-cols-3 gap-6" data-anim="stagger-children">
      <article data-anim="slide-up">...</article>
      <article data-anim="slide-up">...</article>
      <article data-anim="slide-up">...</article>
    </div>
    <a href="#contact" class="btn" data-anim="scale-in">Get a quote</a>
  </section>`
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

/**
 * Sprint 18Z — feedbackContext threaded through so the Tweaks Panel can offer
 * a "Send notes to designer" form. Optional — when omitted, the panel renders
 * as Sprint 18Y v1 (no feedback section).
 */
export interface FeedbackContext {
  briefId: string
  iterationNumber: number | null
}

function buildFontLinks(
  displayFont: string,
  sansFont: string,
  serifFont: string | undefined,
  monoFont: string | undefined,
): string {
  const fontParam = (name: string) => name.replace(/ /g, '+')
  const fontsToLoad = new Set<string>([displayFont, sansFont])
  if (serifFont) fontsToLoad.add(serifFont)
  if (monoFont) fontsToLoad.add(monoFont)
  const fontFamilyQs = Array.from(fontsToLoad)
    .map((f) => `family=${fontParam(f)}:wght@400;500;600;700`)
    .join('&')
  return `  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?${fontFamilyQs}&display=swap" rel="stylesheet">`
}

function buildTailwindConfigScript(
  displayFont: string,
  sansFont: string,
  serifFont: string | undefined,
  monoFont: string | undefined,
): string {
  const tailwindFontFamily = [
    `display: ['${displayFont}', 'system-ui', 'sans-serif']`,
    `sans: ['${sansFont}', 'system-ui', 'sans-serif']`,
    `serif: [${serifFont ? `'${serifFont}', ` : ''}'Georgia', 'serif']`,
    `mono: [${monoFont ? `'${monoFont}', ` : ''}'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace']`,
  ].join(',\n            ')
  return `  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          colors: {
            primary:          'var(--primary)',
            'primary-dark':   'var(--primary-dark)',
            'primary-light':  'var(--primary-light)',
            accent:           'var(--accent)',
            surface:          'var(--surface)',
            'text-primary':   'var(--text-primary)',
            'text-secondary': 'var(--text-secondary)',
            border:           'var(--border)',
          },
          fontFamily: {
            ${tailwindFontFamily},
          },
        },
      },
    }
  </script>`
}

function buildRootCssVars(
  palette: DesignTokens['palette'],
  dark: NonNullable<DesignTokens['palette_dark']>,
): string {
  return `    /* Sprint 18Y — design token CSS custom properties (light mode defaults) */
    :root {
      --primary:        ${palette.primary};
      --primary-dark:   ${palette.primary_dark ?? palette.primary};
      --primary-light:  ${palette.primary_light ?? palette.primary};
      --accent:         ${palette.accent};
      --accent-color:   ${palette.accent};
      --background:     ${palette.background};
      --surface:        ${palette.surface ?? '#ffffff'};
      --text-primary:   ${palette.text_primary};
      --text-secondary: ${palette.text_secondary ?? '#475569'};
      --border:         ${palette.border ?? '#e2e8f0'};
    }
    /* Sprint 18Y — dark mode overrides (.dark class on <html>, toggled by TweaksPanel) */
    :root.dark {
      color-scheme: dark;
      --primary:        ${dark.primary};
      --accent:         ${dark.accent};
      --accent-color:   ${dark.accent};
      --background:     ${dark.background};
      --surface:        ${dark.surface ?? '#1e293b'};
      --text-primary:   ${dark.text_primary};
      --text-secondary: ${dark.text_secondary ?? '#94a3b8'};
      --border:         ${dark.border ?? '#334155'};
    }`
}

function buildBaseStyles(sansFont: string): string {
  return `    body { font-family: '${sansFont}', system-ui, sans-serif; background: var(--background); color: var(--text-primary); }
    .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
    .skip-link:focus { position: fixed; top: 1rem; left: 1rem; background: var(--primary); color: white; padding: 0.75rem 1rem; z-index: 100; clip: auto; width: auto; height: auto; border-radius: 4px; }
    a:focus-visible, button:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; border-radius: 2px; }
    .mobile-menu { display: none; }
    .mobile-menu.open { display: block; }

    ${ANIMATION_PRESETS_CSS}`
}

function buildNavHeader(clientName: string, navLinks: string): string {
  return `  <header class="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-border" role="banner">
    <nav class="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between" aria-label="Main navigation">
      <a href="#" class="font-display font-bold text-xl text-primary">${escapeHtml(clientName)}</a>
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
  </header>`
}

function buildSectionMarkup(sections: DesignSection[]): string {
  // Sprint 18K (A2) — inject data-nexus-id on the opening <section> tag.
  return sections
    .map((s) => s.html.replace(/^(<section\b)/i, `$1 data-nexus-id="${s.slug}"`))
    .join('\n\n  ')
}

function buildFooter(clientName: string): string {
  return `  <footer class="bg-primary text-white py-12 mt-16" role="contentinfo">
    <div class="max-w-7xl mx-auto px-6">
      <div class="border-t border-white/10 pt-6 flex flex-col md:flex-row justify-between items-center gap-4">
        <p class="text-sm opacity-80">© ${new Date().getFullYear()} ${escapeHtml(clientName)}. All rights reserved.</p>
        <p class="text-xs opacity-60 font-mono">Built with Leadership Legacy Digital</p>
      </div>
    </div>
  </footer>`
}

function buildScripts(tweaksPanelHtml: string): string {
  return `  <script>
${INTERSECTION_OBSERVER_SCRIPT}
  </script>
  ${tweaksPanelHtml}`
}

/**
 * Sprint 18Y — renderFullHtml accepts an optional `skills` array.
 * When skills includes 'tweaks-panel', the TweaksPanel IIFE is injected
 * before </body>. CSS custom properties on :root / :root.dark enable
 * runtime dark mode and accent swapping without regeneration.
 *
 * Sprint 18Z — optional feedbackContext enables the panel's "Send notes
 * to designer" section. When omitted, the panel renders the Sprint 18Y v1.
 */
export function renderFullHtml({
  brief,
  tokens,
  sections,
  skills = [],
  feedbackContext,
}: {
  brief: { client_name: string; business_description: string }
  tokens: DesignTokens
  sections: DesignSection[]
  skills?: string[]
  feedbackContext?: FeedbackContext
}): string {
  const p = tokens.palette
  const t = tokens.typography
  const displayFont = t.display_font || 'Inter'
  const bodyFont = t.body_font || 'Inter'
  const sansFont = t.font_sans || bodyFont
  const serifFont = t.font_serif
  const monoFont = t.font_mono

  // Sprint 18Y — resolve dark palette (from tokens if DESIGNER provided it, else derive)
  const dark = tokens.palette_dark ?? deriveDarkPalette(p)

  // Sprint 18Y — resolve accent alternates (from tokens or derive from accent colour)
  const accents = tokens.palette_accent_alternates ?? generateAccentAlternates(p.accent)

  // Sprint 18Y → 18Z — inject TweaksPanel when skill is active.
  // 18Z: thread feedbackContext into the panel so the "Send notes to designer"
  // section can POST to the feedback endpoint. When feedbackContext is absent
  // (e.g. legacy callers, internal previews without a known brief id), the
  // panel falls back to the Sprint 18Y v1 layout (no feedback section).
  const feedbackApiUrl = feedbackContext
    ? `${COCKPIT_BASE_URL}/api/design/briefs/${feedbackContext.briefId}/feedback`
    : null
  const tweaksPanelHtml = skills.includes('tweaks-panel')
    ? buildTweaksPanelScript({
        accentAlternates: accents,
        feedbackApiUrl,
        iterationNumber: feedbackContext?.iterationNumber ?? null,
      })
    : ''

  const navLinks = sections
    .map((s) => `<a href="#${s.slug}" class="text-sm font-medium text-text-primary hover:text-primary transition-colors">${escapeHtml(s.name)}</a>`)
    .join('\n        ')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(brief.client_name)}</title>
  <meta name="description" content="${escapeHtml(brief.business_description)}">
${buildFontLinks(displayFont, sansFont, serifFont, monoFont)}
  <script src="https://cdn.tailwindcss.com"></script>
${buildTailwindConfigScript(displayFont, sansFont, serifFont, monoFont)}
  <style>
${buildRootCssVars(p, dark)}
${buildBaseStyles(sansFont)}
  </style>
</head>
<body>
  <a href="#main" class="skip-link sr-only">Skip to main content</a>
${buildNavHeader(brief.client_name, navLinks)}
  <main id="main" role="main">
  ${buildSectionMarkup(sections)}
  </main>
${buildFooter(brief.client_name)}
${buildScripts(tweaksPanelHtml)}
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
  // Fetch brief first — needed for briefId (backfill), skills (TweaksPanel),
  // and feedbackContext (Sprint 18Z). If brief can't be resolved, fall back
  // to the short_id-ordered path (graceful degradation).
  const brief = await env.DB
    .prepare(
      `SELECT id, client_name, business_description, skills, current_iteration
       FROM design_briefs WHERE orchestrator_run_id = ? AND user_id = ? LIMIT 1`,
    )
    .bind(pipelineRunId, userId)
    .first<{ id: string; client_name: string; business_description: string; skills: string | null; current_iteration: number | null }>()

  if (!brief) throw new Error('ASSEMBLER: brief metadata not found for this run')

  // Sprint 119C-2 — (a) backfill first (idempotent no-op after first run),
  // then (b) read order from the index table.
  await backfillBriefSections(env, brief.id)
  const indexRows = await listBriefSections(env, brief.id)

  // Fetch DESIGNER tokens (separate query so it's independent of section ordering).
  const designerRow = await env.DB
    .prepare(
      `SELECT output FROM agent_subtasks
       WHERE pipeline_run_id = ? AND user_id = ? AND agent_name = 'designer'
         AND status = 'done' AND output IS NOT NULL
       LIMIT 1`,
    )
    .bind(pipelineRunId, userId)
    .first<{ output: string }>()
  const designTokens: DesignTokens | null = designerRow
    ? (extractJson(designerRow.output) as DesignTokens | null)
    : null

  if (!designTokens) throw new Error('ASSEMBLER: DESIGNER tokens not found in upstream context')

  const sections: DesignSection[] = []

  if (indexRows.length > 0) {
    // (b) NEW PATH: order from design_brief_sections, HTML from agent_subtasks.
    const composerRows = await env.DB
      .prepare(
        `SELECT short_id, title, output FROM agent_subtasks
         WHERE pipeline_run_id = ? AND user_id = ? AND agent_name = 'composer'
           AND status = 'done' AND output IS NOT NULL`,
      )
      .bind(pipelineRunId, userId)
      .all<{ short_id: string; title: string; output: string }>()

    const byShortId = new Map<string, { short_id: string; title: string; output: string }>()
    for (const row of composerRows.results ?? []) {
      byShortId.set(row.short_id, row)
    }

    for (const indexRow of indexRows) {
      const row = byShortId.get(indexRow.subtask_short_id)
      if (!row) continue
      const match = row.title.match(/Compose\s+(.+?)\s+section/i)
      const name = match ? match[1] : row.title.replace(/Compose\s+/i, '').replace(/\s+section/i, '')
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
      sections.push({ slug, name, html: extractSectionHtml(row.output) })
    }
  }

  // (c) GRACEFUL FALLBACK: if index was empty even after backfill (e.g. brief
  // has no done subtasks yet, or briefId couldn't be resolved), fall back to
  // the original ORDER BY short_id ASC path. Never render empty.
  if (sections.length === 0) {
    const fallbackRows = await env.DB
      .prepare(
        `SELECT title, output FROM agent_subtasks
         WHERE pipeline_run_id = ? AND user_id = ? AND agent_name = 'composer'
           AND status = 'done' AND output IS NOT NULL
         ORDER BY short_id ASC`,
      )
      .bind(pipelineRunId, userId)
      .all<{ title: string; output: string }>()

    for (const row of fallbackRows.results ?? []) {
      const match = row.title.match(/Compose\s+(.+?)\s+section/i)
      const name = match ? match[1] : row.title.replace(/Compose\s+/i, '').replace(/\s+section/i, '')
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
      sections.push({ slug, name, html: extractSectionHtml(row.output) })
    }
  }

  if (sections.length === 0) throw new Error('ASSEMBLER: no COMPOSER section outputs found')

  const skills: string[] = brief.skills
    ? (() => { try { return JSON.parse(brief.skills) as string[] } catch { return [] } })()
    : []

  const feedbackContext: FeedbackContext = {
    briefId: brief.id,
    iterationNumber: brief.current_iteration ?? null,
  }

  const html = renderFullHtml({ brief, tokens: designTokens, sections, skills, feedbackContext })
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
// SPRINT 18K — PROJECT FILE WRITES
// ──────────────────────────────────────────────────────────────────────

export async function writeProjectFilesToR2(
  env: CloudflareEnv,
  briefId: string,
  iterationId: string,
  userId: string,
  html: string,
  sections: DesignSection[],
  tokens: DesignTokens | null,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000)
  const enc = new TextEncoder()

  type FileEntry = {
    path: string
    r2Key: string
    type: 'html' | 'css' | 'jsx' | 'json'
    source: 'assembler' | 'composer' | 'designer'
    content: string
  }

  const files: FileEntry[] = []

  if (tokens) {
    const content = JSON.stringify(tokens, null, 2)
    files.push({
      path: 'design-tokens.json',
      r2Key: `design/${briefId}/files/design-tokens.json`,
      type: 'json',
      source: 'designer',
      content,
    })
  }

  files.push({
    path: 'pages/index.html',
    r2Key: `design/${briefId}/files/pages/index.html`,
    type: 'html',
    source: 'assembler',
    content: html,
  })

  const styleMatch = html.match(/<style[^>]*>([\s\S]*?)<\/style>/i)
  if (styleMatch) {
    const content = styleMatch[1].trim()
    if (content) {
      files.push({
        path: 'stylesheets/styles.css',
        r2Key: `design/${briefId}/files/stylesheets/styles.css`,
        type: 'css',
        source: 'assembler',
        content,
      })
    }
  }

  const jsxMatch = html.match(/<script[^>]*type=["']text\/jsx["'][^>]*>([\s\S]*?)<\/script>/i)
  if (jsxMatch) {
    const content = jsxMatch[1].trim()
    if (content) {
      files.push({
        path: 'components/app.jsx',
        r2Key: `design/${briefId}/files/components/app.jsx`,
        type: 'jsx',
        source: 'assembler',
        content,
      })
    }
  }

  for (const section of sections) {
    const path = `components/${section.slug}.html`
    files.push({
      path,
      r2Key: `design/${briefId}/files/${path}`,
      type: 'html',
      source: 'composer',
      content: section.html,
    })
  }

  for (const f of files) {
    const bytes = enc.encode(f.content)
    const contentType =
      f.type === 'json' ? 'application/json' :
      f.type === 'css'  ? 'text/css; charset=utf-8' :
      f.type === 'jsx'  ? 'text/javascript; charset=utf-8' :
      'text/html; charset=utf-8'

    await env.R2.put(f.r2Key, bytes, {
      httpMetadata: { contentType },
      customMetadata: { brief_id: briefId, iteration_id: iterationId, source: f.source },
    })

    const fileId = crypto.randomUUID()
    await env.DB
      .prepare(
        `INSERT OR REPLACE INTO design_brief_files
           (id, brief_id, iteration_id, user_id, file_path, r2_key, file_type, source, byte_size, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(fileId, briefId, iterationId, userId, f.path, f.r2Key, f.type, f.source, bytes.byteLength, now)
      .run()
  }
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
    .prepare(
      `SELECT agent_name, title, output, status, cost_usd, tokens
       FROM agent_subtasks
       WHERE pipeline_run_id = ? AND user_id = ?
       ORDER BY short_id ASC`,
    )
    .bind(run.id, brief.user_id)
    .all<{ agent_name: string; title: string | null; output: string | null; status: string; cost_usd: number; tokens: number }>()

  const byAgent: Record<string, { latestOutput: string; cost: number; tokens: number }> = {}
  const composerSections: DesignSection[] = []

  for (const row of subtasks.results ?? []) {
    if (row.status === 'done' && row.output) {
      const prev = byAgent[row.agent_name]
      byAgent[row.agent_name] = {
        latestOutput: row.output,
        cost: (prev?.cost ?? 0) + (row.cost_usd ?? 0),
        tokens: (prev?.tokens ?? 0) + (row.tokens ?? 0),
      }
      if (row.agent_name === 'composer') {
        const match = (row.title ?? '').match(/Compose\s+(.+?)\s+section/i)
        const name = match
          ? match[1]
          : (row.title ?? '').replace(/Compose\s+/i, '').replace(/\s+section/i, '').trim()
        const slug =
          name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'section'
        composerSections.push({ slug, name, html: extractSectionHtml(row.output) })
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
    .prepare(
      `UPDATE design_iterations
       SET design_tokens_json = ?, page_html = ?, critic_score = ?, critic_feedback = ?,
           preview_r2_key = ?, preview_url = ?, status = 'ready',
           cost_usd = ?, tokens = ?, completed_at = ?
       WHERE id = ?`,
    )
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
    .prepare(
      `UPDATE design_briefs
       SET status = 'preview_ready', preview_url = ?,
           total_cost_usd = total_cost_usd + ?, total_tokens = total_tokens + ?,
           updated_at = ?
       WHERE id = ?`,
    )
    .bind(previewUrl, totalCost, totalTokens, now, brief.id)
    .run()

  // Sprint 18K (A3) — awaited (not fire-and-forget) because CF Workers terminates
  // execution when the Response is returned, abandoning unresolved void promises.
  try {
    await writeProjectFilesToR2(
      env,
      brief.id,
      iteration.id,
      brief.user_id,
      html,
      composerSections,
      designerJson as DesignTokens | null,
    )
  } catch (err) {
    console.error('writeProjectFilesToR2 non-fatal', err)
  }

  return {
    finalized: true,
    preview_url: previewUrl,
    critic_score: criticScore ?? undefined,
    critic_pass: criticPass ?? undefined,
  }
}
