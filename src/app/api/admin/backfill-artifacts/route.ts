import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getBindings } from '@/lib/cloudflare'
import { promoteArtifactsForRun } from '@/lib/artifacts'

export async function POST(_req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const env = getBindings()
  const runs = await env.DB.prepare(
    `SELECT id FROM orchestrator_runs WHERE status = 'completed' ORDER BY started_at ASC`,
  ).all<{ id: string }>()
  const ids = (runs.results ?? []).map((r) => r.id)

  let artifactsCreated = 0
  const perRun: { runId: string; artifacts: number }[] = []
  for (const id of ids) {
    let n = 0
    try {
      n = await promoteArtifactsForRun(env, id)
    } catch {
      n = 0
    }
    if (n > 0) perRun.push({ runId: id, artifacts: n })
    artifactsCreated += n
  }

  return new Response(
    JSON.stringify({ ok: true, runs_scanned: ids.length, artifacts_created: artifactsCreated, per_run: perRun }, null, 2),
    { headers: { 'Content-Type': 'application/json' } },
  )
}
