/**
 * Design Build pipeline helpers — Sprint 16 v0.1
 *
 * - buildBriefPrompt: structures a DesignBriefInput into a rich HERMES prompt that
 *   forces the canonical 3-stage DAG (DESIGNER → COMPOSER → CRITIC).
 * - extractHtml: extracts a clean HTML document from COMPOSER's subtask output.
 * - extractJson: extracts a JSON object from DESIGNER or CRITIC's subtask output.
 * - savePreviewToR2: writes COMPOSER's HTML to R2 and returns the public URL.
 * - finalizeIterationIfReady: lazy finalizer called from GET /api/design/briefs/[id].
 *   When the orchestrator_run is completed, pulls outputs, saves HTML to R2,
 *   updates the design_iteration + design_brief rows. Idempotent.
 */

import type { D1Database, R2Bucket } from '@cloudflare/workers-types'
import type {
  CloudflareEnv,
  DesignBriefInput,
  DesignBriefRow,
  DesignIterationRow,
  OrchestratorRunRow,
} from '@/types'

export function buildBriefPrompt(
  brief: DesignBriefInput,
  iterationNumber: number,
  clientFeedback?: string,
): string {
  const refs =
    brief.style_references && brief.style_references.length > 0
      ? brief.style_references.map((r) => `  - ${r}`).join('\n')
      : '  - none provided (designer should explore typology from scratch based on tone)'

  const feedback = clientFeedback
    ? `\n\nITERATION ${iterationNumber} — client feedback to apply:\n${clientFeedback}\n`
    : ''

  return `Design and build a complete single-page website for ${brief.client_name}.${feedback}

BRIEF:
- Client: ${brief.client_name}
- Business: ${brief.business_description}
- Target audience: ${brief.target_audience}
- Mood and tone: ${brief.mood_tone}
- Must-have sections: ${brief.must_have_sections}
- Brand colors: ${brief.brand_colors || "designer's choice"}
- Constraints: ${brief.constraints || 'none'}
- Style references:
${refs}

Decompose this into EXACTLY 3 subtasks forming a sequential DAG:

1. st_1: DESIGNER (task_type: design_language, depends_on: []) — Generate design tokens (palette, typography, spacing, motion) as JSON, grounded in the brief and any references. No HTML.

2. st_2: COMPOSER (task_type: compose_page, depends_on: ["st_1"]) — Generate a COMPLETE standalone HTML page using DESIGNER's tokens. All sections from the brief in coherent order. Production-quality, responsive, accessible. Output ONLY the HTML document.

3. st_3: CRITIC (task_type: critique_design, depends_on: ["st_2"]) — Review the HTML against the brief. Score 0–100 on brand fit, hierarchy, typography, color, spacing, accessibility, conversion. Return JSON.

Mark all subtasks human_required: false so the pipeline runs autonomously.`
}

export function extractHtml(text: string): string {
  if (!text) return ''
  // Strip markdown code fences if present
  const fenced = text.match(/```(?:html)?\s*([\s\S]*?)```/i)
  if (fenced) return fenced[1].trim()

  // Locate <!DOCTYPE or <html ...> span
  const startMatch = text.match(/<!DOCTYPE[^>]*>|<html\b/i)
  if (startMatch && startMatch.index !== undefined) {
    const start = text.slice(startMatch.index)
    const closingIdx = start.toLowerCase().lastIndexOf('</html>')
    if (closingIdx >= 0) return start.slice(0, closingIdx + '</html>'.length)
    return start.trim()
  }

  return text.trim()
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

export async function savePreviewToR2(
  r2: R2Bucket,
  briefId: string,
  iterationNumber: number,
  html: string,
): Promise<{ r2Key: string }> {
  const r2Key = `design/${briefId}/iteration-${iterationNumber}.html`
  await r2.put(r2Key, html, {
    httpMetadata: { contentType: 'text/html; charset=utf-8' },
    customMetadata: {
      brief_id: briefId,
      iteration: String(iterationNumber),
      created_at: String(Math.floor(Date.now() / 1000)),
    },
  })
  return { r2Key }
}

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

  // Find DESIGNER, COMPOSER, CRITIC subtask outputs
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

  const byAgent: Record<string, { output: string; cost: number; tokens: number }> = {}
  for (const row of subtasks.results ?? []) {
    if (row.status === 'done' && row.output) {
      byAgent[row.agent_name] = {
        output: row.output,
        cost: row.cost_usd ?? 0,
        tokens: row.tokens ?? 0,
      }
    }
  }

  const composer = byAgent.composer
  if (!composer) {
    return { finalized: false, reason: 'COMPOSER subtask not found or not done' }
  }

  const html = extractHtml(composer.output)
  if (!html || !/<html\b|<!DOCTYPE/i.test(html)) {
    return { finalized: false, reason: 'COMPOSER output is not valid HTML' }
  }

  // Save to R2
  const { r2Key } = await savePreviewToR2(env.R2, brief.id, iteration.iteration_number, html)
  const previewUrl = `${origin}/design/preview/${brief.id}`

  // Pull DESIGNER tokens + CRITIC feedback if present
  const designerJson = byAgent.designer ? extractJson(byAgent.designer.output) : null
  const criticJson = byAgent.critic ? extractJson(byAgent.critic.output) : null
  const criticScore =
    criticJson && typeof (criticJson as { score?: unknown }).score === 'number'
      ? ((criticJson as { score: number }).score as number)
      : null
  const criticPass = criticJson && typeof (criticJson as { pass?: unknown }).pass === 'boolean'
    ? ((criticJson as { pass: boolean }).pass as boolean)
    : null

  const now = Math.floor(Date.now() / 1000)
  const totalCost =
    (byAgent.designer?.cost ?? 0) +
    (byAgent.composer?.cost ?? 0) +
    (byAgent.critic?.cost ?? 0)
  const totalTokens =
    (byAgent.designer?.tokens ?? 0) +
    (byAgent.composer?.tokens ?? 0) +
    (byAgent.critic?.tokens ?? 0)

  // Update iteration
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

  // Update brief
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
