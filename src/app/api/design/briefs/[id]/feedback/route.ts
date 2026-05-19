/**
 * POST /api/design/briefs/[id]/feedback — Sprint 18Z
 *
 * PUBLIC endpoint, NO AUTH. Anyone with a brief's preview URL can submit
 * notes via the runtime Tweaks Panel. The cockpit operator reads them via
 * a future inbox UI (separate PR).
 *
 * Spam mitigation v1 (no Turnstile yet — add if abuse appears):
 *   - 2000-char body cap enforced server-side
 *   - viewer_fingerprint = SHA-256(ip + user_agent), stored for clustering
 *   - Cloudflare's native rate-limit rules can layer on top at the dashboard
 *   - Brief-existence check rejects feedback to invalid brief IDs (404)
 *
 * Returns minimal info — confirms receipt without leaking brief details.
 *
 * Note: this route does NOT use getUserFromRequest because viewers are not
 * authenticated cockpit users. That's the whole point.
 */

import { NextRequest } from 'next/server'
import { getBindings } from '@/lib/cloudflare'

const NOTES_MAX_LENGTH = 2000

interface FeedbackBody {
  notes?: string
  iteration_number?: number
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: briefId } = await ctx.params

  let body: FeedbackBody
  try {
    body = (await req.json()) as FeedbackBody
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 })
  }

  const notes = typeof body.notes === 'string' ? body.notes.trim() : ''
  if (!notes) {
    return new Response(JSON.stringify({ error: 'notes is required' }), { status: 400 })
  }
  if (notes.length > NOTES_MAX_LENGTH) {
    return new Response(
      JSON.stringify({
        error: `notes exceeds ${NOTES_MAX_LENGTH}-character limit`,
        provided_length: notes.length,
      }),
      { status: 400 },
    )
  }

  const iterationNumber =
    typeof body.iteration_number === 'number' && Number.isInteger(body.iteration_number) && body.iteration_number > 0
      ? body.iteration_number
      : null

  const env = getBindings()

  // Verify brief exists. Public response so we say 404 the same way we would
  // for any not-found resource — we're not leaking anything sensitive since
  // brief IDs are UUIDs and the feedback target is implicitly public anyway
  // (anyone with the preview URL knows the brief exists).
  const brief = await env.DB
    .prepare(`SELECT id FROM design_briefs WHERE id = ?`)
    .bind(briefId)
    .first<{ id: string }>()
  if (!brief) {
    return new Response(JSON.stringify({ error: 'Brief not found' }), { status: 404 })
  }

  // Fingerprint = SHA-256(ip + user_agent). Used for spam clustering only,
  // never personally identifies viewers. CF-Connecting-IP is the canonical
  // viewer IP behind Cloudflare's edge.
  const ip = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for') ?? 'unknown'
  const userAgent = req.headers.get('user-agent') ?? 'unknown'
  const fingerprint = await sha256Hex(`${ip}|${userAgent}`)
  const userAgentTruncated = userAgent.slice(0, 500)

  const feedbackId = crypto.randomUUID()
  const submittedAt = Math.floor(Date.now() / 1000)

  await env.DB
    .prepare(
      `INSERT INTO design_feedback
        (id, brief_id, iteration_number, notes, viewer_fingerprint, viewer_user_agent, submitted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(feedbackId, briefId, iterationNumber, notes, fingerprint, userAgentTruncated, submittedAt)
    .run()

  return new Response(
    JSON.stringify({
      ok: true,
      feedback_id: feedbackId,
      submitted_at: submittedAt,
    }, null, 2),
    {
      status: 201,
      headers: {
        'Content-Type': 'application/json',
        // CORS — the feedback request originates from design.connorpattern.workers.dev
        // (the preview domain), submitted to the cockpit's API origin.
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    },
  )
}

// OPTIONS preflight — required because cross-origin POSTs from the preview
// page to the cockpit API are technically cross-origin (different subdomain).
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  })
}
