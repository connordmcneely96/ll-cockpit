/**
 * GET /api/design/briefs/[id]/sections
 *
 * Returns the brief's sections in sort_order (from design_brief_sections index).
 * Used by SectionTree to display and sequence sections correctly after a reorder.
 *
 * Response: { sections: [{ slug, name, sort_order, subtask_short_id }] }
 *
 * Sprint 119C-2-fix.
 */

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getBindings } from '@/lib/cloudflare'
import { listBriefSections } from '@/lib/design/brief-sections'
import { slugFromTitle } from '@/lib/design/section-slug'
import type { DesignBriefRow } from '@/types'
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

export async function GET(
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

  // Load done composer subtasks for name lookup (join-equivalent via Map).
  const nameMap = new Map<string, string>()
  if (brief.orchestrator_run_id) {
    const subtaskRows = await env.DB
      .prepare(
        `SELECT short_id, title FROM agent_subtasks
         WHERE pipeline_run_id = ? AND agent_name = 'composer' AND status = 'done'`,
      )
      .bind(brief.orchestrator_run_id)
      .all<{ short_id: string; title: string }>()
    for (const row of subtaskRows.results ?? []) {
      nameMap.set(row.short_id, slugFromTitle(row.title).name)
    }
  }

  const indexRows = await listBriefSections(env, briefId)

  if (indexRows.length > 0) {
    const sections = indexRows.map((r) => ({
      slug: r.section_slug,
      name: nameMap.get(r.subtask_short_id) ?? r.section_slug,
      sort_order: r.sort_order,
      subtask_short_id: r.subtask_short_id,
    }))
    return new Response(JSON.stringify({ sections }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Edge case fallback: index is empty — derive from done composer subtasks in short_id order.
  if (!brief.orchestrator_run_id) {
    return new Response(JSON.stringify({ sections: [] }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const fallbackRows = await env.DB
    .prepare(
      `SELECT short_id, title FROM agent_subtasks
       WHERE pipeline_run_id = ? AND agent_name = 'composer' AND status = 'done'
       ORDER BY short_id ASC`,
    )
    .bind(brief.orchestrator_run_id)
    .all<{ short_id: string; title: string }>()

  const sections = (fallbackRows.results ?? []).map((r, i) => {
    const { name, slug } = slugFromTitle(r.title)
    return { slug, name, sort_order: i * 10, subtask_short_id: r.short_id }
  })

  return new Response(JSON.stringify({ sections }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
