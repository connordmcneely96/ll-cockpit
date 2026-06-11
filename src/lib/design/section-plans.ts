/**
 * Sprint 121A-1 — Design Plan Mode helpers.
 *
 * All types local to this file — do NOT put in src/types (hot file).
 * LLM calls go DIRECTLY to api.anthropic.com per the locked contract.
 */

import type { CloudflareEnv, DesignBriefInput } from '@/types'
import {
  classifySection,
  parseSections,
  DESIGNER_COST_USD,
  CRITIC_COST_USD,
  COMPOSER_COST_USD,
  type ParsedSection,
} from './pipeline'

const HAIKU_MODEL_ID = 'claude-haiku-4-5-20251001'

export interface DesignSectionPlanRow {
  id: string
  brief_id: string
  user_id: string
  status: string
  plan_json: string
  section_count: number
  estimated_total_cost_usd: number
  model_id: string | null
  created_at: number
  approved_at: number | null
}

export interface PlannedSection {
  name: string
  slug: string
  description: string
  task_type: 'compose_simple' | 'compose_complex'
  estimated_cost_usd: number
}

export async function generateSectionPlan(
  _env: CloudflareEnv,
  apiKey: string,
  brief: DesignBriefInput,
): Promise<{ sections: PlannedSection[]; estimated_total_cost_usd: number; model_id: string }> {
  const systemPrompt =
    'You are a web design planner. Given a brief, output ONLY a JSON array of proposed page sections. Each item: {name, description}. 4–8 sections. No prose, no markdown, no code fences.'

  const userMessage = [
    `Client: ${brief.client_name}`,
    `Business: ${brief.business_description}`,
    `Target Audience: ${brief.target_audience}`,
    `Mood/Tone: ${brief.mood_tone}`,
    `Must-have sections: ${brief.must_have_sections}`,
    brief.brand_colors ? `Brand colors: ${brief.brand_colors}` : '',
    brief.constraints ? `Constraints: ${brief.constraints}` : '',
  ].filter(Boolean).join('\n')

  let rawSections: Array<{ name: string; description: string }> = []

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: HAIKU_MODEL_ID,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    })

    const data = await res.json() as { content?: Array<{ text?: string }> }
    const text = data.content?.[0]?.text ?? ''

    // Strip markdown code fences if present
    const stripped = text.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim()

    const parsed = JSON.parse(stripped)
    if (Array.isArray(parsed) && parsed.length > 0) {
      rawSections = parsed
    }
  } catch {
    // Fall through to fallback below
  }

  // Fallback: use parseSections from brief if LLM failed or returned empty array
  if (rawSections.length === 0) {
    const fallback = parseSections(brief.must_have_sections)
    rawSections = fallback.map((s) => ({ name: s.name, description: s.description }))
  }

  const sections: PlannedSection[] = rawSections.map((raw) => {
    const name = raw.name ?? ''
    const description = raw.description ?? name
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
    const task_type = classifySection(name, description)
    const estimated_cost_usd = COMPOSER_COST_USD[task_type]
    return { name, slug, description, task_type, estimated_cost_usd }
  })

  // R1: always use DESIGNER_COST_USD (no attachedSystem threading in plan mode yet)
  const estimated_total_cost_usd =
    DESIGNER_COST_USD +
    sections.reduce((sum, s) => sum + s.estimated_cost_usd, 0) +
    CRITIC_COST_USD

  return { sections, estimated_total_cost_usd, model_id: HAIKU_MODEL_ID }
}

export async function persistSectionPlan(
  env: CloudflareEnv,
  opts: {
    briefId: string
    userId: string
    sections: PlannedSection[]
    totalCost: number
    modelId: string
  },
): Promise<string> {
  const { briefId, userId, sections, totalCost, modelId } = opts

  // Supersede any existing pending_approval rows for this brief
  await env.DB
    .prepare(
      `UPDATE design_section_plans SET status='superseded'
       WHERE brief_id = ? AND status = 'pending_approval'`,
    )
    .bind(briefId)
    .run()

  const id = crypto.randomUUID()
  const now = Math.floor(Date.now() / 1000)

  await env.DB
    .prepare(
      `INSERT INTO design_section_plans
       (id, brief_id, user_id, status, plan_json, section_count, estimated_total_cost_usd, model_id, created_at, approved_at)
       VALUES (?, ?, ?, 'pending_approval', ?, ?, ?, ?, ?, NULL)`,
    )
    .bind(id, briefId, userId, JSON.stringify(sections), sections.length, totalCost, modelId, now)
    .run()

  return id
}

export async function getLatestPendingPlan(
  env: CloudflareEnv,
  briefId: string,
  userId: string,
): Promise<DesignSectionPlanRow | null> {
  return env.DB
    .prepare(
      `SELECT * FROM design_section_plans
       WHERE brief_id = ? AND user_id = ? AND status = 'pending_approval'
       ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(briefId, userId)
    .first<DesignSectionPlanRow>()
}

export async function markPlanApproved(env: CloudflareEnv, planId: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000)
  await env.DB
    .prepare(`UPDATE design_section_plans SET status='approved', approved_at=? WHERE id=?`)
    .bind(now, planId)
    .run()
}

export function plannedToParsedSections(sections: PlannedSection[]): ParsedSection[] {
  return sections.map(({ name, slug, description }) => ({ name, slug, description }))
}
