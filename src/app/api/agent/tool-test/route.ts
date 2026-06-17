/**
 * POST /api/agent/tool-test - Sprint 46
 * Drives the agent tool-execution loop in isolation to validate
 * tool_use -> dispatch -> tool_result -> continue end to end.
 * Body: { message: string, model?: string, systemPrompt?: string, allowedTools?: string[] }
 * Auth required. Read-only tools only (see tool-loop SAFE_TOOLS).
 */
import { createClient } from '@/lib/supabase-server'
import { getBindings } from '@/lib/cloudflare'
import { runToolLoop } from '@/lib/tool-loop'

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

  let body: { message?: string; model?: string; systemPrompt?: string; allowedTools?: string[] }
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400)
  }

  const message = typeof body.message === 'string' ? body.message.trim() : ''
  if (!message) return json({ ok: false, error: 'message_required' }, 400)

  const env = getBindings()
  const apiKey = env.ANTHROPIC_API_KEY
  if (!apiKey) return json({ ok: false, error: 'missing_anthropic_key' }, 500)

  const result = await runToolLoop({
    db: env.DB,
    apiKey,
    userId: user.id,
    userMessage: message,
    systemPrompt: typeof body.systemPrompt === 'string' ? body.systemPrompt : undefined,
    model: typeof body.model === 'string' ? body.model : undefined,
    allowedTools: Array.isArray(body.allowedTools)
      ? body.allowedTools.filter((t): t is string => typeof t === 'string')
      : undefined,
  })

  return json(result, result.ok ? 200 : 502)
}
