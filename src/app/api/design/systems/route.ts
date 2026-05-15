/**
 * GET /api/design/systems — list available design systems
 * POST /api/design/systems — manual seed action (admin)
 *
 * Sprint 18E. Public list endpoint shows system-wide examples
 * (tenant_id IS NULL) plus the authenticated user's own systems.
 *
 * AUTO-SEED: If the system-wide library is empty when GET is called,
 * the seeder kicks off in the BACKGROUND via ctx.waitUntil (Cloudflare
 * workers pattern that lets work continue after the response returns).
 * The first GET returns { systems: [], seeding: true } immediately so
 * the UI knows to poll. Subsequent GETs return populated data once seed
 * completes (~30-60s).
 *
 * In-progress seeds are guarded by an idempotency check at the start of
 * seedDesignSystems — concurrent firings are safe.
 *
 * Query params:
 *   ?category=fintech    Filter by category
 *   ?tag=dark            Filter by single tag
 *   ?limit=100           Default 100, max 200
 */

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { getBindings } from '@/lib/cloudflare'
import { seedDesignSystems } from '@/lib/design/design-systems-seeder'
import type { User } from '@supabase/supabase-js'

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

  // Sprint 18E auto-seed: if the system-wide library is empty, kick off
  // the seed in the background. Return current (likely empty) state to
  // caller immediately. UI polls every few seconds until populated.
  let seedingInProgress = false
  try {
    const existing = await env.DB
      .prepare(`SELECT COUNT(*) as cnt FROM design_systems WHERE tenant_id IS NULL`)
      .first<{ cnt: number }>()

    if ((existing?.cnt ?? 0) === 0) {
      console.log('[design-systems] library empty — kicking off background seed')
      seedingInProgress = true
      try {
        const ctx = getCloudflareContext().ctx
        ctx.waitUntil(
          seedDesignSystems(env)
            .then((r) =>
              console.log(
                `[design-systems] background seed complete: ${r.seeded} seeded, ${r.skipped} skipped, ${r.failed} failed`,
              ),
            )
            .catch((err) => console.error('[design-systems] background seed failed:', err)),
        )
      } catch (err) {
        // If ctx isn't available for some reason, fall back to inline seed (slow).
        console.error('[design-systems] waitUntil not available, running inline:', err)
        await seedDesignSystems(env)
        seedingInProgress = false
      }
    }
  } catch (err) {
    console.error('[design-systems] auto-seed setup exception:', err)
  }

  const url = new URL(req.url)
  const category = url.searchParams.get('category')
  const tag = url.searchParams.get('tag')
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 100), 200)

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

  return new Response(
    JSON.stringify({ systems, count: systems.length, seeding: seedingInProgress }, null, 2),
    { headers: { 'Content-Type': 'application/json' } },
  )
}

/**
 * POST /api/design/systems — admin manual seed/re-seed.
 *
 * Body: { action: 'seed' }
 *
 * GET auto-seeds on first empty hit (in background) so this is rarely
 * needed. Use it to force re-fetch if VoltAgent adds new brands.
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
