/**
 * GET /api/design/section-types — list available section types
 * POST /api/design/section-types — manual re-seed action (admin)
 *
 * Sprint 119A. Section library data layer.
 *
 * AUTO-SEED: If the table is empty on GET, seeds in background via
 * ctx.waitUntil and returns { section_types: [], count: 0, seeding: true }
 * immediately. UI polls until populated (Working Rule 50b46666).
 *
 * Query params:
 *   ?category=hero   Filter by category
 *   ?limit=100       Default 100, max 200
 */

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { getBindings } from '@/lib/cloudflare'
import { seedSectionTypes } from '@/lib/design/section-types-seeder'
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

  let seedingInProgress = false
  try {
    const existing = await env.DB
      .prepare(`SELECT COUNT(*) as cnt FROM design_section_types`)
      .first<{ cnt: number }>()

    if ((existing?.cnt ?? 0) === 0) {
      console.log('[section-types] library empty — kicking off background seed')
      seedingInProgress = true
      try {
        const ctx = getCloudflareContext().ctx
        ctx.waitUntil(
          seedSectionTypes(env)
            .then((r) =>
              console.log(
                `[section-types] background seed complete: ${r.seeded} seeded, ${r.skipped} skipped, ${r.failed} failed`,
              ),
            )
            .catch((err) => console.error('[section-types] background seed failed:', err)),
        )
      } catch (err) {
        console.error('[section-types] waitUntil not available, running inline:', err)
        await seedSectionTypes(env)
        seedingInProgress = false
      }
    }
  } catch (err) {
    console.error('[section-types] auto-seed setup exception:', err)
  }

  const url = new URL(req.url)
  const category = url.searchParams.get('category')
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 100), 200)

  let sql = `SELECT id, slug, name, category, description, thumbnail_url,
                    schema_json, default_props_json, created_at
             FROM design_section_types`
  const params: unknown[] = []

  if (category) {
    sql += ` WHERE category = ?`
    params.push(category)
  }

  sql += ` ORDER BY category ASC, name ASC LIMIT ?`
  params.push(limit)

  const rows = await env.DB.prepare(sql).bind(...params).all<{
    id: string
    slug: string
    name: string
    category: string | null
    description: string | null
    thumbnail_url: string | null
    schema_json: string
    default_props_json: string | null
    created_at: number
  }>()

  const section_types = (rows.results ?? []).map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    category: r.category,
    description: r.description,
    thumbnail_url: r.thumbnail_url,
    schema: r.schema_json ? (JSON.parse(r.schema_json) as unknown) : null,
    default_props: r.default_props_json ? (JSON.parse(r.default_props_json) as unknown) : null,
    created_at: r.created_at,
  }))

  return new Response(
    JSON.stringify({ section_types, count: section_types.length, seeding: seedingInProgress }, null, 2),
    { headers: { 'Content-Type': 'application/json' } },
  )
}

/**
 * POST /api/design/section-types — admin manual re-seed.
 * Body: { action: 'seed' }
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
  const result = await seedSectionTypes(env)

  return new Response(JSON.stringify(result, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  })
}
