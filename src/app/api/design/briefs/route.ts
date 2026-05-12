/**
 * POST /api/design/briefs — Sprint 16 v0.1.2
 *   Reliable inline wave: runs the entire 3-subtask DAG synchronously in the
 *   dispatch handler using runAutoWave. Total wall-clock ~60-90s but 100%
 *   reliable. No dependence on waitUntil-fetch chains.
 *
 * GET /api/design/briefs — list user's briefs
 */

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getBindings } from '@/lib/cloudflare'
import { decomposeTask, persistDecomposition, HermesError } from '@/lib/hermes'
import { runAutoWave } from '@/lib/orchestrator'
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

  await env.DB.prepare(
    `INSERT INTO design_iterations
     (id, brief_id, iteration_number, orchestrator_run_id, status, created_at)
     VALUES (?, ?, 1, ?, 'building', ?)`,
  )
    .bind(iterationId, briefId, runId, now)
    .run()

  await env.DB.prepare(
    `UPDATE design_briefs SET orchestrator_run_id = ?, updated_at = ? WHERE id = ?`,
  )
    .bind(runId, now, briefId)
    .run()

  // === RELIABLE INLINE WAVE (v0.1.2) ===
  // Run the entire DAG synchronously. Total wall-clock ~60-90s for a 3-stage
  // design build. Cloudflare paid Worker tier allows up to 5 minutes.
  // No waitUntil-fetch chains — those proved unreliable in this codebase.
  const waveResult = await runAutoWave(env, apiKey, user.id, runId, {
    force: true,
    maxWaves: 10,
    maxParallel: 4,
  })

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
        wave: waveResult,
        preview_url_when_ready: `${new URL(req.url).origin}/design/preview/${briefId}`,
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
