/**
 * POST /api/design/briefs/[id]/deploy — publish the brief's latest iteration to R2 (nexus-sites).
 * GET  /api/design/briefs/[id]/deploy — return the current live deployment for the brief.
 *
 * Auth: Bearer token (design Worker cross-calls) OR Supabase cookie (Cockpit UI).
 * Ownership: 404 (not 403) on miss to avoid leaking brief existence.
 *
 * Sprint 121F-R2 — publishes published/{slug}/index.html to R2; the nexus-sites Worker serves it
 * at https://nexus-sites.connorpattern.workers.dev/{slug}/. No Cloudflare token required.
 */

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getBindings } from '@/lib/cloudflare'
import { publishBriefToR2 } from '@/lib/design/deploy'
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

  const { id } = await ctx.params
  const env = getBindings()

  // 404 (not 403) on ownership miss to avoid leaking brief existence
  const brief = await env.DB
    .prepare(`SELECT id, client_name FROM design_briefs WHERE id = ? AND user_id = ?`)
    .bind(id, user.id)
    .first<{ id: string; client_name: string }>()
  if (!brief) {
    return new Response(JSON.stringify({ error: 'Brief not found' }), { status: 404 })
  }

  // Load latest iteration
  const iteration = await env.DB
    .prepare(
      `SELECT iteration_number, page_html FROM design_iterations WHERE brief_id = ? ORDER BY iteration_number DESC LIMIT 1`,
    )
    .bind(id)
    .first<{ iteration_number: number | null; page_html: string | null }>()

  if (!iteration?.page_html) {
    return new Response(
      JSON.stringify({ error: 'No generated content to deploy yet' }),
      { status: 422 },
    )
  }

  const result = await publishBriefToR2(env, {
    briefId: id,
    html: iteration.page_html,
    iterationNumber: iteration.iteration_number ?? null,
    clientName: brief.client_name,
  })

  if (!result.ok) {
    return new Response(JSON.stringify({ error: result.error }), { status: 502 })
  }

  // Record deployment — supersede any prior 'live' rows first, then insert new one
  const now = Math.floor(Date.now() / 1000)
  const deploymentId = crypto.randomUUID()

  await env.DB
    .prepare(
      `UPDATE design_deployments SET status = 'superseded' WHERE brief_id = ? AND status = 'live'`,
    )
    .bind(id)
    .run()

  await env.DB
    .prepare(
      `INSERT INTO design_deployments (id, brief_id, iteration_number, live_url, slug, cf_deployment_id, status, deployed_by, created_at)
       VALUES (?, ?, ?, ?, ?, NULL, 'live', ?, ?)`,
    )
    .bind(
      deploymentId,
      id,
      iteration.iteration_number ?? null,
      result.liveUrl,
      result.slug,
      user.id,
      now,
    )
    .run()

  return new Response(
    JSON.stringify({
      ok: true,
      live_url: result.liveUrl,
      slug: result.slug,
      deployment_id: deploymentId,
      iteration_number: iteration.iteration_number ?? null,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
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

  // 404 on ownership miss
  const brief = await env.DB
    .prepare(`SELECT id FROM design_briefs WHERE id = ? AND user_id = ?`)
    .bind(id, user.id)
    .first<{ id: string }>()
  if (!brief) {
    return new Response(JSON.stringify({ error: 'Brief not found' }), { status: 404 })
  }

  const deployment = await env.DB
    .prepare(
      `SELECT live_url, slug, status, created_at, iteration_number FROM design_deployments WHERE brief_id = ? AND status = 'live' ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(id)
    .first<{ live_url: string; slug: string | null; status: string; created_at: number; iteration_number: number | null }>()

  if (!deployment) {
    return new Response(
      JSON.stringify({ deployed: false }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  }

  return new Response(
    JSON.stringify({
      deployed: true,
      live_url: deployment.live_url,
      slug: deployment.slug,
      status: deployment.status,
      created_at: deployment.created_at,
      iteration_number: deployment.iteration_number,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}
