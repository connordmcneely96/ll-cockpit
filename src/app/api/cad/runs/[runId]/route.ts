/**
 * GET /api/cad/runs/[runId] - one CAD run + its artifacts (read-only, owner-scoped).
 * Returns { ok, run, artifacts }. 401 if no session; 404 if the run isn't the
 * caller's (never leak another user's run). No writes, no new table.
 */
import { createClient } from '@/lib/supabase-server'
import { getBindings } from '@/lib/cloudflare'

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

interface RunRow {
  run_id: string
  spec: string
  max_cycles: number
  cycle: number
  status: string
  design_status: string | null
  design_diagnosis: string | null
  created_at: number
  updated_at: number
}

interface ArtifactRow {
  id: string
  artifact_name: string | null
  artifact_type: string | null
  format: string | null
  storage_ref: string | null
  size_bytes: number | null
  sentinel_pass: number | null
  created_at: number | null
}

export async function GET(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return json({ ok: false, error: 'unauthorized' }, 401)

    const { runId } = await params
    const env = getBindings()

    const run = await env.DB
      .prepare(`SELECT run_id, spec, max_cycles, cycle, status, design_status, design_diagnosis, created_at, updated_at FROM cad_convergence_runs WHERE run_id = ? AND user_id = ?`)
      .bind(runId, user.id)
      .first<RunRow>()
    if (!run) return json({ ok: false, error: 'run not found' }, 404)

    const rows = await env.DB
      .prepare(`SELECT id, artifact_name, artifact_type, format, storage_ref, size_bytes, sentinel_pass, created_at FROM artifact_registry WHERE pipeline_run_id = ? AND status = 'active' ORDER BY artifact_type, artifact_name`)
      .bind(runId)
      .all<ArtifactRow>()

    // A run can register the same artifact_name from multiple execution dirs
    // (multi-exec). Keep ONE row per artifact_name — the most recent by created_at.
    const byName = new Map<string, ArtifactRow>()
    for (const a of rows.results ?? []) {
      const key = a.artifact_name ?? a.id
      const prev = byName.get(key)
      if (!prev || (a.created_at ?? 0) >= (prev.created_at ?? 0)) byName.set(key, a)
    }
    const artifacts = Array.from(byName.values()).sort((x, y) => {
      const t = (x.artifact_type ?? '').localeCompare(y.artifact_type ?? '')
      return t !== 0 ? t : (x.artifact_name ?? '').localeCompare(y.artifact_name ?? '')
    })

    return json({ ok: true, run, artifacts }, 200)
  } catch (err) {
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500)
  }
}
