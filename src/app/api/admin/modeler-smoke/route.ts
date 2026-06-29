/**
 * POST /api/admin/modeler-smoke
 * Drives the MODELER tool-execution loop end-to-end against a CAD spec.
 * Body: { spec?: string }
 * Auth required.
 */
import { createClient } from '@/lib/supabase-server'
import { getBindings } from '@/lib/cloudflare'
import { runToolLoop } from '@/lib/tool-loop'
import { getAgent } from '@/lib/agents'
import { getAgentTools } from '@/lib/tool-loop'

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return json({ ok: false, error: 'unauthorized' }, 401)

  let body: { spec?: string }
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  const spec =
    typeof body.spec === 'string' && body.spec.trim()
      ? body.spec.trim()
      : 'Design a rectangular mounting bracket: 60mm long, 40mm wide, 8mm thick, with two 6mm-diameter through-holes centered on the long axis and 40mm apart. Export as a binary GLB.'

  const env = getBindings()
  const apiKey = env.ANTHROPIC_API_KEY
  if (!apiKey) return json({ ok: false, error: 'missing_anthropic_key' }, 500)

  const modeler = getAgent('modeler')
  if (!modeler) return json({ ok: false, error: 'modeler_agent_not_found' }, 500)

  try {
    const result = await runToolLoop({
      env,
      apiKey,
      userId: user.id,
      userMessage: spec,
      systemPrompt: modeler.systemPrompt,
      maxTokens: 8192,
      maxIterations: 8,
      allowedTools: getAgentTools('modeler'),
    })

    return json(
      {
        ok: result.ok,
        finalText: result.finalText,
        iterations: result.iterations,
        toolCalls: result.toolCalls,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        error: result.error,
      },
      result.ok ? 200 : 502,
    )
  } catch (err) {
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500)
  }
}
