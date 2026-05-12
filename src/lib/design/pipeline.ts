/**
 * Design Build pipeline helpers — Sprint 16 v0.2.0
 *
 * Per-section architecture:
 *   buildDesignBuildDAG(brief) → programmatic DecompositionResult
 *     - st_1: DESIGNER (JSON tokens)
 *     - st_2..N+1: COMPOSER per section (parallel, each gets own 8192 budget)
 *     - st_N+2: ASSEMBLER (deterministic scaffold + stitch, $0 cost)
 *     - st_N+3: CRITIC (reviews assembled page)
 *
 *   No HERMES decompose call — saves $0.018 + 16s and guarantees structure.
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

// ──────────────────────────────────────────────────────────────────────
// DAG BUILDER — programmatic, no HERMES
// ──────────────────────────────────────────────────────────────────────

export function parseSections(briefSections: string): { name: string; slug: string }[] {
  return briefSections
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((name) => ({
      name,
      slug: name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, ''),
    }))
}

export function buildDesignBuildDAG(
  brief: DesignBriefInput,
  iterationNumber: number = 1,
  clientFeedback?: string,
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

  // st_1: DESIGNER
  subtasks.push({
    id: 'st_1',
    agent: 'DESIGNER',
    title: 'Generate design tokens',
    task: `Generate design tokens (JSON) for the website rebuild.${feedbackBlock}\n\nBRIEF:\n${briefSummary}\n\nOutput the JSON token object per your system prompt. No HTML.`,
    depends_on: [],
    estimated_cost_usd: 0.02,
    estimated_duration_seconds: 15,
    risk_level: 'low',
    human_required: false,
  })

  // st_2..N+1: COMPOSER per section
  const composerIds: string[] = []
  sections.forEach((sec, i) => {
    const id = `st_${i + 2}`
    composerIds.push(id)
    subtasks.push({
      id,
      agent: 'COMPOSER',
      title: `Compose ${sec.name} section`,
      task: `SECTION-ONLY MODE. Compose ONLY the <section id="${sec.slug}"> markup for the "${sec.name}" section of ${brief.client_name}'s website. No <!DOCTYPE>, <html>, <head>, <body>, <link>, or <script> tags.\n\nUse Tailwind classes referencing the design tokens passed in upstream context (primary, accent, surface, text-primary, text-secondary, border, font-display, font-sans).\n\nBRIEF CONTEXT:\n${briefSummary}\n\nALL SECTIONS IN ORDER: ${sections.map((s) => s.name).join(', ')}\n\nTHIS SECTION: ${sec.name}\n\nProduce production-quality, responsive, accessible markup with REAL copy (not placeholders). Use semantic HTML (h2 for section headline, articles for grouped items, dl for spec lists where appropriate). Include meaningful inline SVG for any imagery. First character must be <, last must be >.`,
      depends_on: ['st_1'],
      estimated_cost_usd: 0.04,
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
    task: `Deterministically stitch DESIGNER tokens + all COMPOSER section outputs into a complete HTML document. Adds: <!DOCTYPE>, <head> with Tailwind CDN + tailwind.config + Google Fonts, skip-to-main link, sticky header with desktop nav + mobile menu toggle (aria-expanded), <main> wrapping all sections, footer, focus-visible styles, semantic landmarks. No LLM call — runs as deterministic Worker code.`,
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
    task: `Review the assembled HTML page (from ASSEMBLER's output in upstream context) against this brief and your rubric. Score 0–100. Return JSON per your system prompt.\n\nBRIEF:\n${briefSummary}`,
    depends_on: [assemblerId],
    estimated_cost_usd: 0.015,
    estimated_duration_seconds: 20,
    risk_level: 'low',
    human_required: false,
  })

  const totalCost = 0.02 + sections.length * 0.04 + 0.015
  const totalDurationSec = 15 + sections.length * 30 + 1 + 20

  return {
    summary: `Design build for ${brief.client_name} — ${sections.length} sections (programmatic DAG, no HERMES).`,
    estimated_total_cost_usd: totalCost,
    estimated_duration_minutes: Math.ceil(totalDurationSec / 60),
    subtasks,
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
  // Strip fences
  const fenced = text.match(/```(?:html)?\s*([\s\S]*?)```/i)
  let candidate = fenced ? fenced[1] : text
  candidate = candidate.trim()

  // If COMPOSER returned a full doc despite section-mode instruction, dig out body content
  const bodyMatch = candidate.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
  if (bodyMatch) {
    candidate = bodyMatch[1].trim()
  }

  // Find first <section> through its matching </section>
  const sectionMatch = candidate.match(/<section[\s\S]*?<\/section>/i)
  if (sectionMatch) return sectionMatch[0]

  // Fall back to whatever we have
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
    .map(
      (s) =>
        `<a href="#${s.slug}" class="text-sm font-medium text-text-primary hover:text-primary transition-colors">${escapeHtml(s.name)}</a>`,
    )
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
    a:focus-visible, button:focus-visible { outline: 2px solid ${p.primary}; outline-offset: 2px; border-radius: 2px; }
    .mobile-menu { display: none; }
    .mobile-menu.open { display: block; }
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
    <div class="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-4">
      <p class="text-sm opacity-80">© ${new Date().getFullYear()} ${escapeHtml(brief.client_name)}. All rights reserved.</p>
      <p class="text-xs opacity-60 font-mono">Built with Leadership Legacy Digital</p>
    </div>
  </footer>
</body>
</html>`
}

// ──────────────────────────────────────────────────────────────────────
// DETERMINISTIC ASSEMBLER — called from orchestrator's special-case handler
// ──────────────────────────────────────────────────────────────────────

export async function executeAssembler(
  env: CloudflareEnv,
  userId: string,
  pipelineRunId: string,
): Promise<{ output: string; cost_usd: number; tokens: number }> {
  // Pull all done subtasks in this run
  const rows = await env.DB
    .prepare(
      `SELECT short_id, agent_name, title, output FROM agent_subtasks
         WHERE pipeline_run_id = ? AND user_id = ? AND status = 'done' AND output IS NOT NULL
         ORDER BY short_id ASC`,
    )
    .bind(pipelineRunId, userId)
    .all<{
      short_id: string
      agent_name: string
      title: string
      output: string
    }>()

  let designTokens: DesignTokens | null = null
  const sections: DesignSection[] = []

  for (const row of rows.results ?? []) {
    if (row.agent_name === 'designer') {
      designTokens = extractJson(row.output) as DesignTokens | null
    } else if (row.agent_name === 'composer') {
      const match = row.title.match(/Compose\s+(.+?)\s+section/i)
      const name = match ? match[1] : row.title.replace(/Compose\s+/i, '').replace(/\s+section/i, '')
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
      sections.push({
        slug,
        name,
        html: extractSectionHtml(row.output),
      })
    }
  }

  if (!designTokens) {
    throw new Error('ASSEMBLER: DESIGNER tokens not found in upstream context')
  }
  if (sections.length === 0) {
    throw new Error('ASSEMBLER: no COMPOSER section outputs found')
  }

  // Pull brief metadata
  const brief = await env.DB
    .prepare(
      `SELECT client_name, business_description FROM design_briefs
         WHERE orchestrator_run_id = ? AND user_id = ? LIMIT 1`,
    )
    .bind(pipelineRunId, userId)
    .first<{ client_name: string; business_description: string }>()

  if (!brief) {
    throw new Error('ASSEMBLER: brief metadata not found for this run')
  }

  const html = renderFullHtml({ brief, tokens: designTokens, sections })

  return {
    output: html,
    cost_usd: 0,
    tokens: 0,
  }
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
// LAZY FINALIZER — prefers ASSEMBLER output, falls back to COMPOSER (v0.1 compat)
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
  if (iteration.preview_r2_key) {
    return { finalized: false, reason: 'already finalized' }
  }
  if (run.status !== 'completed') {
    return { finalized: false, reason: `run status: ${run.status}` }
  }

  const subtasks = await env.DB
    .prepare(
      `SELECT agent_name, output, status, cost_usd, tokens FROM agent_subtasks
         WHERE pipeline_run_id = ? AND user_id = ?`,
    )
    .bind(run.id, brief.user_id)
    .all<{
      agent_name: string
      output: string | null
      status: string
      cost_usd: number
      tokens: number
    }>()

  // Group by agent (sum cost/tokens across multiple subtasks per agent, e.g. multiple COMPOSERs)
  const byAgent: Record<
    string,
    { latestOutput: string; cost: number; tokens: number }
  > = {}
  for (const row of subtasks.results ?? []) {
    if (row.status === 'done' && row.output) {
      const prev = byAgent[row.agent_name]
      byAgent[row.agent_name] = {
        latestOutput: row.output, // latest by ordering (short_id asc means last one wins)
        cost: (prev?.cost ?? 0) + (row.cost_usd ?? 0),
        tokens: (prev?.tokens ?? 0) + (row.tokens ?? 0),
      }
    }
  }

  // Prefer ASSEMBLER output (v0.2 path), fall back to COMPOSER (v0.1 single-shot)
  const finalSource = byAgent.assembler ?? byAgent.composer
  if (!finalSource) {
    return { finalized: false, reason: 'No ASSEMBLER or COMPOSER output found' }
  }

  const html = extractHtml(finalSource.latestOutput)
  if (!html || !/<html\b|<!DOCTYPE/i.test(html)) {
    return { finalized: false, reason: 'Output is not a valid HTML document' }
  }

  const { r2Key } = await savePreviewToR2(env, brief.id, iteration.iteration_number, html)
  const previewUrl = `${origin}/design/preview/${brief.id}`

  const designerJson = byAgent.designer ? extractJson(byAgent.designer.latestOutput) : null
  const criticJson = byAgent.critic ? extractJson(byAgent.critic.latestOutput) : null
  const criticScore =
    criticJson && typeof (criticJson as { score?: unknown }).score === 'number'
      ? ((criticJson as { score: number }).score as number)
      : null
  const criticPass =
    criticJson && typeof (criticJson as { pass?: unknown }).pass === 'boolean'
      ? ((criticJson as { pass: boolean }).pass as boolean)
      : null

  const now = Math.floor(Date.now() / 1000)

  // Total cost = sum of all done subtasks (including all COMPOSERs)
  const totalCost = Object.values(byAgent).reduce((sum, a) => sum + a.cost, 0)
  const totalTokens = Object.values(byAgent).reduce((sum, a) => sum + a.tokens, 0)

  await env.DB
    .prepare(
      `UPDATE design_iterations SET
         design_tokens_json = ?,
         page_html = ?,
         critic_score = ?,
         critic_feedback = ?,
         preview_r2_key = ?,
         preview_url = ?,
         status = 'ready',
         cost_usd = ?,
         tokens = ?,
         completed_at = ?
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
      `UPDATE design_briefs SET
         status = 'preview_ready',
         preview_url = ?,
         total_cost_usd = total_cost_usd + ?,
         total_tokens = total_tokens + ?,
         updated_at = ?
       WHERE id = ?`,
    )
    .bind(previewUrl, totalCost, totalTokens, now, brief.id)
    .run()

  return {
    finalized: true,
    preview_url: previewUrl,
    critic_score: criticScore ?? undefined,
    critic_pass: criticPass ?? undefined,
  }
}
