/**
 * POST /api/design/briefs/[id]/sections/reorder
 *
 * Direct (no-agent, no-LLM) reorder route.
 * Accepts { ordered_slugs: string[] }, writes new sort_order to the index,
 * re-runs the assembler, and persists a new design_iterations row.
 *
 * Returns { ok: true, iteration_number, sections } so the client can update
 * the SectionTree immediately without a second fetch.
 *
 * Sprint 119C-2-fix. NO Anthropic/LLM call in this route.
 */

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getBindings } from '@/lib/cloudflare'
import { reorderBriefSections, listBriefSections } from '@/lib/design/brief-sections'
import { executeAssembler, savePreviewToR2 } from '@/lib/design/pipeline'
import { slugFromTitle } from '@/lib/design/section-slug'
import type { DesignBriefRow, DesignIterationRow } from '@/types'
import type { User } from '@supabase/supabase-js'

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

  const brief = await env.DB
    .prepare(`SELECT * FROM design_briefs WHERE id = ? AND user_id = ?`)
    .bind(briefId, user.id)
    .first<DesignBriefRow>()
  if (!brief) {
    return new Response(JSON.stringify({ error: 'Brief not found' }), { status: 404 })
  }

  let body: { ordered_slugs?: unknown }
  try {
    body = (await req.json()) as { ordered_slugs?: unknown }
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 })
  }

  if (!Array.isArray(body.ordered_slugs) || body.ordered_slugs.length === 0) {
    return new Response(JSON.stringify({ error: 'ordered_slugs must be a non-empty array' }), { status: 400 })
  }
  const orderedSlugs = body.ordered_slugs as string[]

  // Load the latest iteration — needed for orchestrator_run_id and design_tokens_json.
  const latestIter = await env.DB
    .prepare(
      `SELECT * FROM design_iterations WHERE brief_id = ? ORDER BY iteration_number DESC LIMIT 1`,
    )
    .bind(briefId)
    .first<DesignIterationRow>()

  if (!latestIter || !brief.orchestrator_run_id) {
    return new Response(
      JSON.stringify({ error: 'No iteration found for this brief — cannot reorder yet' }),
      { status: 400 },
    )
  }

  // Resolve ordered_slugs → short_ids using done composer subtasks.
  const subtaskRows = await env.DB
    .prepare(
      `SELECT short_id, title FROM agent_subtasks
       WHERE pipeline_run_id = ? AND agent_name = 'composer' AND status = 'done'`,
    )
    .bind(brief.orchestrator_run_id)
    .all<{ short_id: string; title: string }>()

  // Build slug → short_id map.
  const slugToShortId = new Map<string, string>()
  const shortIdToName = new Map<string, string>()
  for (const row of subtaskRows.results ?? []) {
    const { name, slug } = slugFromTitle(row.title)
    slugToShortId.set(slug, row.short_id)
    shortIdToName.set(row.short_id, name)
  }

  const orderedShortIds: string[] = []
  for (const slug of orderedSlugs) {
    const shortId = slugToShortId.get(slug)
    if (shortId) orderedShortIds.push(shortId)
  }

  if (orderedShortIds.length === 0) {
    return new Response(
      JSON.stringify({ error: 'Could not resolve any ordered_slugs to known subtasks' }),
      { status: 400 },
    )
  }

  // Write new sort_order to the index.
  await reorderBriefSections(env, briefId, orderedShortIds)

  // Re-run the assembler (reads the updated index order).
  const assemblerResult = await executeAssembler(env, user.id, brief.orchestrator_run_id)
  const pageHtml = assemblerResult.output

  // Persist as a new iteration (mirrors runSaveIteration in iteration-agent.ts).
  const newId = crypto.randomUUID()
  const now = Math.floor(Date.now() / 1000)
  const nextNumber = latestIter.iteration_number + 1

  await env.DB
    .prepare(
      `INSERT INTO design_iterations
         (id, brief_id, iteration_number, orchestrator_run_id, client_feedback,
          design_tokens_json, page_html, status, cost_usd, tokens, created_at)
       VALUES (?, ?, ?, ?, NULL, ?, ?, 'ready', 0, 0, ?)`,
    )
    .bind(
      newId,
      briefId,
      nextNumber,
      latestIter.orchestrator_run_id,
      latestIter.design_tokens_json,
      pageHtml,
      now,
    )
    .run()

  const { r2Key } = await savePreviewToR2(env, briefId, nextNumber, pageHtml)

  await env.DB.batch([
    env.DB
      .prepare(`UPDATE design_iterations SET preview_r2_key = ? WHERE id = ?`)
      .bind(r2Key, newId),
    env.DB
      .prepare(`UPDATE design_briefs SET current_iteration = ?, updated_at = ? WHERE id = ?`)
      .bind(nextNumber, now, briefId),
  ])

  // Return sections in the new order so the client can update the tree immediately.
  const updatedIndexRows = await listBriefSections(env, briefId)
  const sections = updatedIndexRows.map((r) => ({
    slug: r.section_slug,
    name: shortIdToName.get(r.subtask_short_id) ?? r.section_slug,
    sort_order: r.sort_order,
    subtask_short_id: r.subtask_short_id,
  }))

  return new Response(
    JSON.stringify({ ok: true, iteration_number: nextNumber, sections }),
    { headers: { 'Content-Type': 'application/json' } },
  )
}
