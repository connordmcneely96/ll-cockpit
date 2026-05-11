/**
 * POST /api/leads — Pipeline 1 entrypoint
 *
 * Captures a lead and runs it through SCOUT → INTAKE inline.
 * Writes audit trail to agent_messages for the full hop.
 *
 * Body: LeadInput (see src/lib/pipeline.ts)
 * Returns: { lead, pipeline_run, qualification, messages: [agent_message ids] }
 *
 * GET /api/leads — list user's leads, newest first, with optional ?stage= and ?status= filters
 */

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getBindings } from '@/lib/cloudflare'
import {
  routeMessage,
  completeMessage,
  appendStageHistory,
  qualifyLead,
  type LeadInput,
} from '@/lib/pipeline'

export async function POST(req: NextRequest) {
  // ── Auth ──
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  // ── Parse + validate input ──
  let input: LeadInput
  try {
    input = (await req.json()) as LeadInput
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 })
  }
  if (!input.source) {
    return new Response(JSON.stringify({ error: 'source is required' }), { status: 400 })
  }
  if (!input.name && !input.company && !input.email) {
    return new Response(
      JSON.stringify({ error: 'At least one of name/company/email is required' }),
      { status: 400 },
    )
  }

  // ── Bindings + secrets ──
  const { DB, ANTHROPIC_API_KEY } = getBindings()
  const apiKey = ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }),
      { status: 500 },
    )
  }

  const now = Math.floor(Date.now() / 1000)
  const leadId = crypto.randomUUID()
  const pipelineRunId = crypto.randomUUID()
  const conversationId = crypto.randomUUID()

  // ── 1. Insert lead (stage = captured) ──
  await DB.prepare(
    `INSERT INTO leads
     (id, user_id, name, email, phone, company, title, linkedin_url, website,
      source, source_url, source_metadata, raw_notes,
      pipeline_stage, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'captured', 'active', ?, ?)`,
  )
    .bind(
      leadId,
      user.id,
      input.name ?? null,
      input.email ?? null,
      input.phone ?? null,
      input.company ?? null,
      input.title ?? null,
      input.linkedin_url ?? null,
      input.website ?? null,
      input.source,
      input.source_url ?? null,
      input.source_metadata ? JSON.stringify(input.source_metadata) : null,
      input.raw_notes ?? null,
      now,
      now,
    )
    .run()

  // ── 2. Open pipeline_run ──
  await DB.prepare(
    `INSERT INTO pipeline_runs
     (id, user_id, lead_id, pipeline_type, current_stage, status,
      started_at, last_active_at, stage_history)
     VALUES (?, ?, ?, 'lead_to_deposit', 'scout_captured', 'running', ?, ?, ?)`,
  )
    .bind(
      pipelineRunId,
      user.id,
      leadId,
      now,
      now,
      JSON.stringify([{ stage: 'scout_captured', entered_at: now, agent: 'SCOUT' }]),
    )
    .run()

  // ── 3. SCOUT → INTAKE handoff via NEXUS ──
  const scoutToIntakeMsgId = await routeMessage(DB, {
    userId: user.id,
    conversationId,
    fromAgent: 'SCOUT',
    toAgent: 'INTAKE',
    messageType: 'lead.qualify',
    subject: `Qualify lead: ${input.name ?? input.company ?? input.email ?? 'unknown'}`,
    body: `New ${input.source} lead. Run qualification scoring.`,
    payload: { lead_id: leadId, lead: input },
    pipelineId: pipelineRunId,
    pipelineStage: 'scout_to_intake',
  })

  // ── 4. INTAKE processes: mark lead qualifying, call Claude, write result ──
  await DB.prepare(`UPDATE leads SET pipeline_stage = 'qualifying', updated_at = ? WHERE id = ?`)
    .bind(now, leadId)
    .run()

  let qualResult
  try {
    qualResult = await qualifyLead(apiKey, {
      name: input.name,
      company: input.company,
      email: input.email,
      title: input.title,
      linkedin_url: input.linkedin_url,
      website: input.website,
      source: input.source,
      raw_notes: input.raw_notes,
      source_metadata: input.source_metadata,
    })
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    await completeMessage(DB, scoutToIntakeMsgId, 'failed', errMsg)
    await DB.prepare(
      `UPDATE pipeline_runs SET status = 'failed', last_active_at = ? WHERE id = ?`,
    )
      .bind(Math.floor(Date.now() / 1000), pipelineRunId)
      .run()
    return new Response(
      JSON.stringify({ error: 'INTAKE qualification failed', detail: errMsg, lead_id: leadId }),
      { status: 502 },
    )
  }

  const qualifiedAt = Math.floor(Date.now() / 1000)
  const { qualification, tokens, costUsd } = qualResult

  // ── 5. Write qualification back to lead ──
  await DB.prepare(
    `UPDATE leads SET
       pipeline_stage = 'qualified',
       qualification_score = ?,
       qualification_summary = ?,
       qualification_red_flags = ?,
       qualification_next_step = ?,
       qualified_at = ?,
       estimated_value_usd = ?,
       probability = ?,
       updated_at = ?
     WHERE id = ?`,
  )
    .bind(
      qualification.score,
      qualification.summary,
      JSON.stringify(qualification.red_flags ?? []),
      qualification.next_step,
      qualifiedAt,
      qualification.estimated_value_usd ?? null,
      qualification.probability ?? null,
      qualifiedAt,
      leadId,
    )
    .run()

  // ── 6. Close the SCOUT→INTAKE message ──
  await completeMessage(DB, scoutToIntakeMsgId, 'done')

  // ── 7. Append stage history + bump pipeline_run totals ──
  await appendStageHistory(DB, pipelineRunId, {
    stage: 'intake_qualified',
    entered_at: qualifiedAt,
    agent: 'INTAKE',
    message_id: scoutToIntakeMsgId,
    cost_usd: costUsd,
    notes: `score=${qualification.score} prob=${qualification.probability}`,
  })
  await DB.prepare(
    `UPDATE pipeline_runs SET
       cost_total_usd = cost_total_usd + ?,
       tokens_total = tokens_total + ?
     WHERE id = ?`,
  )
    .bind(costUsd, tokens, pipelineRunId)
    .run()

  // ── 8. Read back final state for response ──
  const finalLead = await DB.prepare(`SELECT * FROM leads WHERE id = ?`)
    .bind(leadId)
    .first()
  const finalRun = await DB.prepare(`SELECT * FROM pipeline_runs WHERE id = ?`)
    .bind(pipelineRunId)
    .first()
  const messages = await DB.prepare(
    `SELECT id, from_agent, to_agent, message_type, status, subject, created_at, processed_at
     FROM agent_messages WHERE pipeline_id = ? ORDER BY created_at ASC`,
  )
    .bind(pipelineRunId)
    .all()

  return new Response(
    JSON.stringify(
      {
        ok: true,
        lead: finalLead,
        pipeline_run: finalRun,
        qualification,
        messages: messages.results ?? [],
        cost_usd: costUsd,
        tokens,
      },
      null,
      2,
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
  const stage = url.searchParams.get('stage')
  const status = url.searchParams.get('status')
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200)

  let sql = `SELECT * FROM leads WHERE user_id = ?`
  const params: unknown[] = [user.id]
  if (stage) {
    sql += ` AND pipeline_stage = ?`
    params.push(stage)
  }
  if (status) {
    sql += ` AND status = ?`
    params.push(status)
  }
  sql += ` ORDER BY created_at DESC LIMIT ?`
  params.push(limit)

  const rows = await DB.prepare(sql)
    .bind(...params)
    .all()
  return new Response(JSON.stringify({ leads: rows.results ?? [] }, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  })
}
