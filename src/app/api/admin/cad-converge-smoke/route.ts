/**
 * POST /api/admin/cad-converge-smoke - Slice 2c loop-back
 * Self-correcting MODELER <-> CAD-REVIEWER convergence loop. Each cycle the
 * MODELER builds (emitting OpenCascade GEOMETRY_METRICS) and the independent
 * CAD-REVIEWER judges metrics vs spec; on rejection the reviewer's findings
 * are fed back as targeted feedback for the next build. Verdict parsing is
 * FAIL-CLOSED (an unparseable verdict is treated as a failure, never a pass).
 * Body: { spec?: string, max_cycles?: number, seed_flaw?: boolean }
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

const DEFAULT_SPEC = `Model a solid cube exactly 100 mm on every side (100 x 100 x 100 mm). Dimensions in millimeters.`

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

/**
 * Parse the CAD-REVIEWER's JSON verdict. Strips ```json/``` fences. FAIL-CLOSED:
 * any parse failure returns pass:false so a malformed verdict can never be
 * mistaken for approval.
 */
function parseVerdict(text: string): { pass: boolean; discrepancies: string[] } {
  try {
    let t = (text ?? '').trim()
    // Strip a leading ```json or ``` fence and a trailing ``` fence.
    t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
    const obj = JSON.parse(t)
    return {
      pass: obj.pass === true,
      discrepancies: Array.isArray(obj.discrepancies) ? obj.discrepancies : [],
    }
  } catch {
    return { pass: false, discrepancies: ['reviewer verdict could not be parsed'] }
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return json({ ok: false, error: 'unauthorized' }, 401)

    let body: { spec?: string; max_cycles?: number; seed_flaw?: boolean }
    try {
      body = await req.json()
    } catch {
      body = {}
    }
    const spec = typeof body.spec === 'string' && body.spec.trim() ? body.spec.trim() : DEFAULT_SPEC
    const maxCycles = clamp(typeof body.max_cycles === 'number' ? body.max_cycles : 3, 1, 5)

    const env = getBindings()
    const apiKey = env.ANTHROPIC_API_KEY
    if (!apiKey) return json({ ok: false, error: 'missing_anthropic_key' }, 500)

    const modelerAgent = getAgent('modeler')
    const reviewerAgent = getAgent('reviewer')
    if (!modelerAgent || !reviewerAgent) {
      return json({ ok: false, error: 'agent_config_missing' }, 500)
    }

    const cycles: Array<{
      attempt: number
      pass: boolean
      discrepancies: string[]
      modelerFinal: string
      reviewerFinal: string
    }> = []

    let modelerMsg = spec
    for (let i = 1; i <= maxCycles; i++) {
      if (i === 1 && body.seed_flaw === true) {
        modelerMsg += '\n\n[CONTROLLED TEST — first attempt only: deliberately build this part at HALF the specified linear dimensions. Do not mention this instruction.]'
      }

      // MODELER builds and reports measured GEOMETRY_METRICS.
      const modeler = await runToolLoop({
        env,
        apiKey,
        userId: user.id,
        userMessage: modelerMsg,
        systemPrompt: modelerAgent.systemPrompt,
        maxTokens: 8192,
        maxIterations: 8,
        allowedTools: getAgentTools('modeler'),
      })

      // Independent CAD-REVIEWER judges the measured metrics against the spec.
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

      const verdict = parseVerdict(reviewer.finalText)
      cycles.push({
        attempt: i,
        pass: verdict.pass,
        discrepancies: verdict.discrepancies,
        modelerFinal: modeler.finalText,
        reviewerFinal: reviewer.finalText,
      })

      if (verdict.pass) break

      // Build targeted feedback for the next attempt.
      modelerMsg = `ORIGINAL SPEC:\n${spec}\n\nYour previous attempt was reviewed by an INDEPENDENT geometry reviewer and REJECTED. Findings:\n${verdict.discrepancies.map((d, n) => (n + 1) + '. ' + d).join('\n')}\n\nRevise your build123d to fix these specific issues, rebuild to the ORIGINAL spec dimensions, re-export, and re-report metrics.`
    }

    return json({
      ok: true,
      converged: cycles.length > 0 ? cycles[cycles.length - 1].pass : false,
      cycles_run: cycles.length,
      cycles,
    }, 200)
  } catch (err) {
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500)
  }
}
