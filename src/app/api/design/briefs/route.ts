/**
 * POST /api/design/briefs — Sprint 16 v0.1
 * GET /api/design/briefs — list user's briefs
 *
 * POST flow:
 *   1. auth
 *   2. validate brief input
 *   3. insert design_briefs row (status='building')
 *   4. HERMES decompose with rich brief prompt → persistDecomposition opens orchestrator_run
 *   5. insert design_iterations row (iteration_number=1)
 *   6. update design_briefs with orchestrator_run_id
 *   7. fan out via fetch to /api/orchestrator/internal/process-subtask (same auto-wave pattern as orchestrator)
 *   8. return brief
 */

import { NextRequest } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { createClient } from '@/lib/supabase-server'
import { getBindings } from '@/lib/cloudflare'
import { decomposeTask, persistDecomposition, HermesError } from '@/lib/hermes'
import { buildBriefPrompt } from '@/lib/design/pipeline'
import type { DesignBriefInput } from '@/types'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  let body: DesignBriefInput
  try {
    body = (await req.json()) as DesignBriefInput
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 })
  }

  // Validate required fields
  const required: Array<keyof DesignBriefInput> = [
    'client_name', 'business_description', 'target_audience',
    'mood_tone', 'must_have_sections',
  ]
  for (const f of required) {
    if (!body[f] || (typeof body[f] === 'string' && !(body[f] as string).trim())) {
      return new Response(
        JSON.stringify({ error: `${f} is required` }),
        { status: 400 },
      )
    }
  }

  const env = getBindings()
  const apiKey = env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }),
      { status: 500 },
    )
  }

  const now = Math.floor(Date.now() / 1000)
  const briefId = crypto.randomUUID()
  const iterationId = crypto.randomUUID()

  // 1. Insert design_briefs (status='building', no run yet)
  await env.DB.prepare(
    `INSERT INTO design_briefs
     (id, user_id, client_name, business_description, target_audience, mood_tone,
      style_references, must_have_sections, brand_colors, constraints,
      status, current_iteration, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'building', 1, ?, ?)`,
  )
    .bind(
      briefId, user.id, body.client_name, body.business_description,
      body.target_audience, body.mood_tone,
      body.style_references ? JSON.stringify(body.style_references) : null,
      body.must_have_sections,
      body.brand_colors ?? null,
      body.constraints ?? null,
      now, now,
    )
    .run()

  // 2. HERMES decompose
  const briefPrompt = buildBriefPrompt(body, 1)
  let decompResult
  try {
    decompResult = await decomposeTask(env, apiKey, user.id, briefPrompt)
  } catch (err) {
    const msg = err instanceof HermesError ? err.message : err instanceof Error ? err.message : String(err)
    await env.DB.prepare(`UPDATE design_briefs SET status = 'archived', updated_at = ? WHERE id = ?`)
      .bind(Math.floor(Date.now() / 1000), briefId)
      .run()
    return new Response(
      JSON.stringify({ error: 'HERMES decomposition failed', detail: msg }),
      { status: 502 },
    )
  }

  // 3. Persist decomposition (creates orchestrator_runs + agent_subtasks rows)
  const { runId, decompositionId } = await persistDecomposition(env.DB, {
    userId: user.id,
    originalTask: briefPrompt,
    decomposition: decompResult.decomposition,
    raw: decompResult.raw,
    inputTokens: decompResult.inputTokens,
    outputTokens: decompResult.outputTokens,
    costUsd: decompResult.costUsd,
    modelId: decompResult.modelId,
  })

  // 4. Insert design_iterations row
  await env.DB.prepare(
    `INSERT INTO design_iterations
     (id, brief_id, iteration_number, orchestrator_run_id, status, created_at)
     VALUES (?, ?, 1, ?, 'building', ?)`,
  )
    .bind(iterationId, briefId, runId, now)
    .run()

  // 5. Update brief with run id
  await env.DB.prepare(
    `UPDATE design_briefs SET orchestrator_run_id = ?, updated_at = ? WHERE id = ?`,
  )
    .bind(runId, now, briefId)
    .run()

  // 6. Fan out the autonomous wave (same pattern as orchestrator dispatch)
  const origin = new URL(req.url).origin
  const cookieHeader = req.headers.get('cookie') ?? ''
  const { ctx } = getCloudflareContext()
  ctx.waitUntil(
    (async () => {
      try {
        const ready = await env.DB.prepare(
          `SELECT id FROM agent_subtasks WHERE pipeline_run_id = ? AND user_id = ? AND status = 'ready' ORDER BY short_id ASC LIMIT 10`,
        )
          .bind(runId, user.id)
          .all<{ id: string }>()
        const ids = (ready.results ?? []).map((r) => r.id)
        if (ids.length === 0) return
        await Promise.all(
          ids.map((id) =>
            fetch(`${origin}/api/orchestrator/internal/process-subtask`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Cookie: cookieHeader,
              },
              body: JSON.stringify({ subtaskId: id, runId, force: true }),
            }).catch(() => {}),
          ),
        )
      } catch {
        /* best-effort */
      }
    })(),
  )

  return new Response(
    JSON.stringify(
      {
        ok: true,
        brief_id: briefId,
        iteration_id: iterationId,
        orchestrator_run_id: runId,
        decomposition_id: decompositionId,
        summary: decompResult.decomposition.summary,
        subtask_count: decompResult.decomposition.subtasks.length,
        decomposition_cost_usd: decompResult.costUsd,
        decomposition_model: decompResult.modelId,
        preview_url_when_ready: `${origin}/design/preview/${briefId}`,
      },
      null, 2,
    ),
    { headers: { 'Content-Type': 'application/json' } },
  )
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const { DB } = getBindings()
  const url = new URL(req.url)
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 30), 100)
  const status = url.searchParams.get('status')

  let sql = `SELECT * FROM design_briefs WHERE user_id = ?`
  const params: unknown[] = [user.id]
  if (status) {
    sql += ` AND status = ?`
    params.push(status)
  }
  sql += ` ORDER BY created_at DESC LIMIT ?`
  params.push(limit)

  const rows = await DB.prepare(sql).bind(...params).all()
  return new Response(JSON.stringify({ briefs: rows.results ?? [] }, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  })
}
