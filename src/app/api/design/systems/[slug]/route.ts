/**
 * GET /api/design/systems/[slug] — full design system data including DESIGN.md text
 *
 * Sprint 18E. Returns metadata + the full markdown content from R2.
 * Used by the canvas to surface the system's details and by DESIGNER
 * during pipeline execution.
 *
 * Tenant scoping: visible if tenant_id IS NULL (system-wide) or owned
 * by the authenticated user.
 */

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getBindings } from '@/lib/cloudflare'
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
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const user = await getUserFromRequest(req)
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const env = getBindings()

  const system = await env.DB
    .prepare(
      `SELECT id, slug, name, description, category, primary_color, tags,
              source_url, r2_key, tenant_id, user_id, created_at, updated_at
       FROM design_systems
       WHERE slug = ? AND (tenant_id IS NULL OR user_id = ?)
       LIMIT 1`,
    )
    .bind(slug, user.id)
    .first<{
      id: string
      slug: string
      name: string
      description: string | null
      category: string | null
      primary_color: string | null
      tags: string
      source_url: string | null
      r2_key: string | null
      tenant_id: string | null
      user_id: string | null
      created_at: number
      updated_at: number
    }>()

  if (!system) {
    return new Response(JSON.stringify({ error: 'not_found' }), { status: 404 })
  }

  // Fetch the full DESIGN.md from R2
  let designMd: string | null = null
  if (system.r2_key) {
    try {
      const obj = await env.R2.get(system.r2_key)
      if (obj) {
        designMd = await obj.text()
      }
    } catch (err) {
      console.error(`R2 fetch failed for ${system.r2_key}:`, err)
    }
  }

  return new Response(
    JSON.stringify(
      {
        ...system,
        tags: system.tags ? (JSON.parse(system.tags) as string[]) : [],
        design_md: designMd,
      },
      null,
      2,
    ),
    { headers: { 'Content-Type': 'application/json' } },
  )
}
