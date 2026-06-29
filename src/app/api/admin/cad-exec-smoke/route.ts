import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getBindings } from '@/lib/cloudflare'
import { runCadScript, meterCadExec } from '@/lib/exec/cad-exec'

export const dynamic = 'force-dynamic'

// Minimal build123d cube — proves the container runs Python + the library.
const CUBE_SCRIPT = `
import build123d as bd
with bd.BuildPart() as p:
    bd.Box(10, 10, 10)
print("cube built: 10x10x10mm")
`

export async function POST(_req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const env = getBindings()
  const tenantId = user.id
  const executionId = crypto.randomUUID()

  const result = await runCadScript(env, {
    script: CUBE_SCRIPT,
    tenantId,
    executionId,
    timeoutMs: 30_000,
  })

  const { costRowId, artifactIds } = await meterCadExec(env, {
    tenantId,
    executionId,
    result,
  })

  return NextResponse.json({
    ok: true,
    status: result.status,
    executionId,
    tenantId,
    artifacts: result.artifacts.map((a) => ({ name: a.name, size_bytes: a.size_bytes })),
    costRowId,
    artifactIds,
  })
}
