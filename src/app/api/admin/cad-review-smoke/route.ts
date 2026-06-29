/**
 * POST /api/admin/cad-review-smoke - Slice 2c
 * End-to-end smoke: MODELER builds a part (build123d in the CAD sandbox,
 * emitting deterministic OpenCascade GEOMETRY_METRICS) and an independent
 * CAD-REVIEWER judges those measured metrics against the spec.
 * Body: { spec?: string }  (defaults to a 4-inch ASME B31.3 pipe spec)
 * Auth required. Read-only.
 */
import { createClient } from '@/lib/supabase-server'
import { getBindings } from '@/lib/cloudflare'
import { runToolLoop, getAgentTools } from '@/lib/tool-loop'
import { getAgent } from '@/lib/agents'

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const DEFAULT_SPEC = `Model a straight section of NPS 4 (4-inch nominal) Schedule 40 carbon steel pipe per ASME B31.3, 300 mm long.
NPS 4 Sch 40: outer diameter 114.3 mm, wall thickness 6.02 mm (so inner diameter 102.26 mm).
The pipe must be hollow (a through bore along its length), not a solid cylinder. Dimensions in millimeters.`

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return json({ ok: false, error: 'unauthorized' }, 401)

    let body: { spec?: string; metrics?: unknown }
    try {
      body = await req.json()
    } catch {
      body = {}
    }
    const spec = typeof body.spec === 'string' && body.spec.trim() ? body.spec.trim() : DEFAULT_SPEC

    const env = getBindings()
    const apiKey = env.ANTHROPIC_API_KEY
    if (!apiKey) return json({ ok: false, error: 'missing_anthropic_key' }, 500)

    // Reviewer-only (teeth-test) mode: when canned metrics are supplied, skip the
    // modeler entirely and feed the CAD-REVIEWER the (spec, metrics) directly so
    // a deterministic mismatch can be asserted to return pass:false.
    if (body.metrics !== null && typeof body.metrics === 'object') {
      const reviewerAgent = getAgent('reviewer')
      if (!reviewerAgent) return json({ ok: false, error: 'agent_config_missing' }, 500)
      const reviewer = await runToolLoop({
        env,
        apiKey,
        userId: user.id,
        userMessage: `SPEC:\n${body.spec}\n\nMEASURED GEOMETRY_METRICS (JSON):\n${JSON.stringify(body.metrics)}`,
        systemPrompt: reviewerAgent.systemPrompt,
        maxTokens: 2048,
        maxIterations: 1,
        allowedTools: [],
      })
      return json({ ok: true, mode: 'reviewer-only', reviewer: { finalText: reviewer.finalText } }, 200)
    }

    const modelerAgent = getAgent('modeler')
    const reviewerAgent = getAgent('reviewer')
    if (!modelerAgent || !reviewerAgent) {
      return json({ ok: false, error: 'agent_config_missing' }, 500)
    }

    // 1) MODELER builds the part and reports measured GEOMETRY_METRICS.
    const modeler = await runToolLoop({
      env,
      apiKey,
      userId: user.id,
      userMessage: spec,
      systemPrompt: modelerAgent.systemPrompt,
      maxTokens: 8192,
      maxIterations: 8,
      allowedTools: getAgentTools('modeler'),
    })

    // 2) Independent CAD-REVIEWER judges the measured metrics against the spec.
    const reviewer = await runToolLoop({
      env,
      apiKey,
      userId: user.id,
      userMessage: `SPEC:\n${spec}\n\nMODELER OUTPUT (includes measured GEOMETRY_METRICS):\n${modeler.finalText}`,
      systemPrompt: reviewerAgent.systemPrompt,
      maxTokens: 2048,
      maxIterations: 1,
      allowedTools: [],
    })

    return json({
      ok: true,
      modeler: { finalText: modeler.finalText, iterations: modeler.iterations, toolCalls: modeler.toolCalls },
      reviewer: { finalText: reviewer.finalText },
    }, 200)
  } catch (err) {
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500)
  }
}
