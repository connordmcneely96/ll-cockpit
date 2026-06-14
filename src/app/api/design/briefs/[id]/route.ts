/**
 * GET /api/design/briefs/[id] — brief detail + iterations + lazy finalization
 * PATCH /api/design/briefs/[id] — partial update; Sprint 18Y-Followup currently
 *   only accepts {skills} but is structured so future patchable fields slot in.
 *
 * Accepts auth via:
 * - Authorization: Bearer {token} (from design Worker cross-calls)
 * - @supabase/ssr session cookie (from direct Cockpit browser access)
 */

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getBindings } from '@/lib/cloudflare'
import { finalizeIterationIfReady, type FinalizationResult } from '@/lib/design/pipeline'
import type { DesignBriefRow, DesignIterationRow, OrchestratorRunRow } from '@/types'
import type { User } from '@supabase/supabase-js'
// Sprint 18Y-Followup — reuse the canonical validator and allowlist so
// PATCH and POST share the same skills contract.
import { validateSkills } from '@/lib/design/skills'

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

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getUserFromRequest(req)
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const { id } = await ctx.params
  const env = getBindings()

  const brief = await env.DB
    .prepare(`SELECT * FROM design_briefs WHERE id = ? AND user_id = ?`)
    .bind(id, user.id)
    .first<DesignBriefRow>()
  if (!brief) {
    return new Response(JSON.stringify({ error: 'Brief not found' }), { status: 404 })
  }

  const iterations = await env.DB
    .prepare(`SELECT * FROM design_iterations WHERE brief_id = ? ORDER BY iteration_number DESC`)
    .bind(id)
    .all<DesignIterationRow>()

  const latest = iterations.results?.[0]
  let finalization: FinalizationResult | null = null
  if (latest && brief.orchestrator_run_id) {
    const run = await env.DB
      .prepare(`SELECT * FROM orchestrator_runs WHERE id = ?`)
      .bind(brief.orchestrator_run_id)
      .first<OrchestratorRunRow>()
    if (run) {
      finalization = await finalizeIterationIfReady(env, new URL(req.url).origin, brief, latest, run)
      if (finalization.finalized) {
        const refreshedIter = await env.DB
          .prepare(`SELECT * FROM design_iterations WHERE id = ?`)
          .bind(latest.id)
          .first<DesignIterationRow>()
        const refreshedBrief = await env.DB
          .prepare(`SELECT * FROM design_briefs WHERE id = ?`)
          .bind(id)
          .first<DesignBriefRow>()
        if (refreshedIter && iterations.results) iterations.results[0] = refreshedIter
        if (refreshedBrief) Object.assign(brief, refreshedBrief)
      }
    }
  }

  let run: OrchestratorRunRow | null = null
  let subtasks: unknown[] = []
  if (brief.orchestrator_run_id) {
    run = await env.DB
      .prepare(`SELECT * FROM orchestrator_runs WHERE id = ?`)
      .bind(brief.orchestrator_run_id)
      .first<OrchestratorRunRow>()
    const subtaskRows = await env.DB
      .prepare(`SELECT * FROM agent_subtasks WHERE pipeline_run_id = ? ORDER BY short_id ASC`)
      .bind(brief.orchestrator_run_id)
      .all()
    subtasks = subtaskRows.results ?? []
  }

  return new Response(
    JSON.stringify({ brief, iterations: iterations.results ?? [], run, subtasks, finalization }, null, 2),
    { headers: { 'Content-Type': 'application/json' } },
  )
}

/**
 * PATCH /api/design/briefs/[id] — Sprint 18Y-Followup
 *
 * Currently patchable fields: `skills` (string[] or null/omitted to clear).
 *
 * Future fields should be added inside the validation block below and threaded
 * into the dynamic UPDATE statement. Each field gets its own validator and
 * adds a column-name + bind-param pair. Keep the contract tight — only fields
 * explicitly listed below are patchable. Anything else in the body is ignored.
 *
 * Auth: requires the brief's user_id matches the authenticated user. Returns
 * 404 (not 403) on mismatch to avoid leaking brief existence to other users.
 *
 * Idempotent: PATCH with the same payload twice produces the same result; the
 * second call still bumps updated_at, which is intentional.
 */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getUserFromRequest(req)
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const { id } = await ctx.params
  const env = getBindings()

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 })
  }

  // Verify the brief exists and is owned by this user. 404 (not 403) on miss
  // to avoid leaking which brief IDs exist across users.
  const existing = await env.DB
    .prepare(`SELECT id FROM design_briefs WHERE id = ? AND user_id = ?`)
    .bind(id, user.id)
    .first<{ id: string }>()
  if (!existing) {
    return new Response(JSON.stringify({ error: 'Brief not found' }), { status: 404 })
  }

  // Build the dynamic UPDATE — each patchable field validates here and
  // contributes a column-name + bind-param pair. Currently: skills only.
  const setFragments: string[] = []
  const bindParams: unknown[] = []

  if ('skills' in body) {
    const check = validateSkills(body.skills)
    if (!check.ok) {
      return new Response(JSON.stringify({ error: check.error }), { status: 400 })
    }
    setFragments.push('skills = ?')
    bindParams.push(check.value)
  }

  if (setFragments.length === 0) {
    return new Response(
      JSON.stringify({
        error: 'no patchable fields in body',
        patchable_fields: ['skills'],
      }),
      { status: 400 },
    )
  }

  // Always bump updated_at on any successful patch
  const now = Math.floor(Date.now() / 1000)
  setFragments.push('updated_at = ?')
  bindParams.push(now)

  // WHERE clause params
  bindParams.push(id, user.id)

  const sql = `UPDATE design_briefs SET ${setFragments.join(', ')} WHERE id = ? AND user_id = ?`
  await env.DB.prepare(sql).bind(...bindParams).run()

  // Read back what's now on disk so the client gets a confirmation of the
  // canonical state (e.g. JSON-stringified skills array).
  const updated = await env.DB
    .prepare(`SELECT id, skills, updated_at FROM design_briefs WHERE id = ?`)
    .bind(id)
    .first<{ id: string; skills: string | null; updated_at: number }>()

  return new Response(
    JSON.stringify({
      ok: true,
      brief_id: id,
      skills: updated?.skills ? (JSON.parse(updated.skills) as string[]) : [],
      updated_at: updated?.updated_at ?? now,
    }, null, 2),
    { headers: { 'Content-Type': 'application/json' } },
  )
}
