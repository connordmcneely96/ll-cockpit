import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getBindings } from '@/lib/cloudflare'
import { runCadScript, meterCadExec } from '@/lib/exec/cad-exec'

export const dynamic = 'force-dynamic'

// Exports cube.glb to /work/out so the artifact pipeline has something to meter.
const CUBE_SCRIPT = `from build123d import Box, export_gltf
import os
os.makedirs('/work/out', exist_ok=True)
b = Box(10, 10, 10)
export_gltf(b, '/work/out/cube.glb', binary=True)
print('done')`

export async function POST(_req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
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
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}
