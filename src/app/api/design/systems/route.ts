/**
 * GET /api/design/systems — list available design systems
 * POST /api/design/systems — manual seed action (admin)
 *
 * Sprint 18E. Public list endpoint shows system-wide examples
 * (tenant_id IS NULL) plus the authenticated user's own systems.
 *
 * AUTO-SEED: If the system-wide library is empty when GET is called,
 * the seeder runs automatically before returning results. This keeps
 * deployment fully automated — no DevTools commands required.
 * Seeding is idempotent so concurrent first-loads are safe.
 *
 * Query params:
 *   ?category=fintech    Filter by category
 *   ?tag=dark            Filter by single tag
 *   ?limit=100           Default 100, max 200
 */

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getBindings } from '@/lib/cloudflare'
import { seedDesignSystems } from '@/lib/design/design-systems-seeder'
import type { User } from '@supabase/supabase-js'

// Locked: only Connor's user_id can manually re-seed.
const ADMIN_USER_ID = '579acc61-b896-4a0e-bcee-6c369ee5f303'

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

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const env = getBindings()

  // Sprint 18E auto-seed: if the system-wide library is empty, seed it now.
  // This is idempotent and self-healing — first GET after deploy populates
  // the library. No admin command needed.
  try {
    const existing = await env.DB
      .prepare(`SELECT COUNT(*) as cnt FROM design_systems WHERE tenant_id IS NULL`)
      .first<{ cnt: number }>()

    if ((existing?.cnt ?? 0) === 0) {
      console.log('[design-systems] library empty — auto-seeding from VoltAgent…')
      const seedResult = await seedDesignSystems(env)
      console.log(
        `[design-systems] auto-seed complete: ${seedResult.seeded} seeded, ${seedResult.skipped} skipped, ${seedResult.failed} failed`,
      )
      if (seedResult.errors.length > 0) {
        console.error('[design-systems] seed errors:', seedResult.errors.slice(0, 5))
      }
    }
  } catch (err) {
    // Auto-seed failures are non-fatal — fall through to return whatever's in D1.
    // Errors get logged so we can debug if the library is permanently empty.
    console.error('[design-systems] auto-seed exception:', err)
  }

  const url = new URL(req.url)
  const category = url.searchParams.get('category')
  const tag = url.searchParams.get('tag')
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 100), 200)

  // System-wide (tenant_id IS NULL) plus user's own systems
  let sql = `SELECT id, slug, name, description, category, primary_color, tags, source_url
             FROM design_systems
             WHERE (tenant_id IS NULL OR user_id = ?)`
  const params: unknown[] = [user.id]

  if (category) {
    sql += ` AND category = ?`
    params.push(category)
  }

  sql += ` ORDER BY category ASC, name ASC LIMIT ?`
  params.push(limit)

  const rows = await env.DB.prepare(sql).bind(...params).all<{
    id: string
    slug: string
    name: string
    description: string | null
    category: string | null
    primary_color: string | null
    tags: string
    source_url: string | null
  }>()

  let systems = (rows.results ?? []).map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    description: r.description,
    category: r.category,
    primary_color: r.primary_color,
    tags: r.tags ? (JSON.parse(r.tags) as string[]) : [],
    source_url: r.source_url,
  }))

  if (tag) {
    systems = systems.filter((s) => s.tags.includes(tag))
  }

  return new Response(JSON.stringify({ systems, count: systems.length }, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * POST /api/design/systems — admin manual seed/re-seed.
 *
 * Body: { action: 'seed' }
 *
 * GET auto-seeds on first empty hit so this is rarely needed. Use it to
 * force a re-fetch if VoltAgent adds new brands (rerun is idempotent).
 */
export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }
  if (user.id !== ADMIN_USER_ID) {
    return new Response(JSON.stringify({ error: 'Admin only' }), { status: 403 })
  }

  let body: { action?: string }
  try {
    body = (await req.json()) as { action?: string }
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 })
  }

  if (body.action !== 'seed') {
    return new Response(
      JSON.stringify({ error: 'Unknown action', allowed: ['seed'] }),
      { status: 400 },
    )
  }

  const env = getBindings()
  const result = await seedDesignSystems(env)

  return new Response(JSON.stringify(result, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  })
}
