/**
 * POST /api/design/briefs/[id]/approve — Sprint 121A-1 Plan Mode.
 *
 * Converts a pending section plan into a live build. Auth mirrors
 * the sibling GET/PATCH route (Bearer OR cookie). Returns the same
 * response shape as the standard POST build path.
 */

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getBindings } from '@/lib/cloudflare'
import { persistDecomposition } from '@/lib/hermes'
import { runAutoWave } from '@/lib/orchestrator'
import {
  buildDesignBuildDAG,
  loadAttachedDesignSystem,
} from '@/lib/design/pipeline'
import {
  getLatestPendingPlan,
  markPlanApproved,
  plannedToParsedSections,
  type PlannedSection,
} from '@/lib/design/section-plans'
import type { DesignBriefRow, DesignBriefInput } from '@/types'
import type { User } from '@supabase/supabase-js'

// DesignBriefRow doesn't include attached_design_system_slug (not in src/types),
// but the column exists in D1 — extend locally to avoid touching the hot types file.
interface DesignBriefRowExt extends DesignBriefRow {
  attached_design_system_slug?: string | null
}

async function getUserFromRequest(req: NextRequest): Promise<User | null> {
  const authHeader = req.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser(token)
    return user ?? null
  }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user ?? null
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getUserFromRequest(req)
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const { id: briefId } = await ctx.params
  const env = getBindings()
  const apiKey = env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), { status: 500 })
  }

  // Load brief — 404 (not 403) on miss/ownership mismatch (mirrors sibling route convention)
  const brief = await env.DB
    .prepare(`SELECT * FROM design_briefs WHERE id = ? AND user_id = ?`)
    .bind(briefId, user.id)
    .first<DesignBriefRowExt>()
  if (!brief) {
    return new Response(JSON.stringify({ error: 'Brief not found' }), { status: 404 })
  }

  const plan = await getLatestPendingPlan(env, briefId, user.id)
  if (!plan) {
    return new Response(JSON.stringify({ error: 'no_pending_plan' }), { status: 422 })
  }

  // Reconstruct DesignBriefInput from the brief row
  const briefInput: DesignBriefInput = {
    client_name: brief.client_name,
    business_description: brief.business_description,
    target_audience: brief.target_audience,
    mood_tone: brief.mood_tone,
    must_have_sections: brief.must_have_sections,
    brand_colors: brief.brand_colors ?? undefined,
    constraints: brief.constraints ?? undefined,
    style_references: brief.style_references ? (JSON.parse(brief.style_references) as string[]) : undefined,
    skills: brief.skills ? (JSON.parse(brief.skills) as string[]) : undefined,
  }

  // Load attached design system if set on the brief
  const attachedSystem = brief.attached_design_system_slug
    ? await loadAttachedDesignSystem(env, brief.attached_design_system_slug, user.id)
    : null

  const approvedSections = plannedToParsedSections(JSON.parse(plan.plan_json) as PlannedSection[])

  const decomposition = buildDesignBuildDAG(
    briefInput,
    1,
    undefined,
    attachedSystem ?? undefined,
    approvedSections,
  )

  const { runId, decompositionId } = await persistDecomposition(env.DB, {
    userId: user.id,
    originalTask: `Design build: ${brief.client_name}${attachedSystem ? ` (system: ${attachedSystem.name})` : ''}`,
    decomposition,
    raw: JSON.stringify(decomposition, null, 2),
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
    modelId: 'design-build-dag-v0.3.0',
  })

  const iterationId = crypto.randomUUID()
  const now = Math.floor(Date.now() / 1000)

  await env.DB
    .prepare(
      `INSERT INTO design_iterations (id, brief_id, iteration_number, orchestrator_run_id, status, created_at)
       VALUES (?, ?, 1, ?, 'building', ?)`,
    )
    .bind(iterationId, briefId, runId, now)
    .run()

  await env.DB
    .prepare(`UPDATE design_briefs SET orchestrator_run_id = ?, status = 'building', updated_at = ? WHERE id = ?`)
    .bind(runId, now, briefId)
    .run()

  await markPlanApproved(env, plan.id)

  const waveResult = await runAutoWave(env, apiKey, user.id, runId, {
    force: true, maxWaves: 10, maxParallel: 4,
  })

  return new Response(
    JSON.stringify({
      ok: true,
      brief_id: briefId,
      iteration_id: iterationId,
      orchestrator_run_id: runId,
      decomposition_id: decompositionId,
      summary: decomposition.summary,
      subtask_count: decomposition.subtasks.length,
      sections_detected: decomposition.subtasks.filter((s) => s.agent === 'COMPOSER').length,
      wave: waveResult,
      preview_url_when_ready: `${new URL(req.url).origin}/design/preview/${briefId}`,
    }, null, 2),
    { headers: { 'Content-Type': 'application/json' } },
  )
}
