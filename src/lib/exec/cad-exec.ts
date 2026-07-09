import type { CloudflareEnv } from '@/types'

// ESTIMATE — calibrate against Cloudflare Containers billing;
// raw duration is stored in latency_ms so cost is recomputable at any time.
const CAD_EXEC_USD_PER_SEC = 0.000005 // ~$0.018/hr per 2vCPU-6GiB container

export interface CadExecArtifact {
  name: string
  size_bytes: number | null
  base64?: string
}

export interface CadExecResult {
  status: string
  exit_code: number
  stdout: string
  stderr: string
  artifacts: CadExecArtifact[]
  duration_ms: number | null
}

// Appended (never prepended, so user-script traceback line numbers are preserved)
// after every CAD script. Emits an orthographic drawing set from the top-level
// `part` solid using build123d 0.11.1's project_to_viewport + ExportSVG/ExportDXF
// (ezdxf bundled). Best-effort: a drawing failure only prints DRAWINGS_SKIPPED /
// DRAWING_VIEW_SKIPPED and never regresses the 3D deliverable. Its stdout lines
// (DRAWINGS_EMITTED: / DRAWING_VIEW_SKIPPED / DRAWINGS_SKIPPED) deliberately do NOT
// match the GEOMETRY_METRICS regex.
export const CAD_DRAWING_HELPER = `

# ==== APPENDED DETERMINISTIC DRAWING HELPER (authored; do not rely on the model for the projection API) ====
import json as _json
def emit_drawings(_p, out_dir="/work/out"):
    """Best-effort orthographic drawing set. NEVER raises: a drawing failure must not regress the 3D deliverable."""
    try:
        from build123d import ExportSVG, ExportDXF, LineType
    except Exception as _e:
        print("DRAWINGS_SKIPPED:", _e); return
    bb = _p.bounding_box()
    cx = (bb.min.X + bb.max.X) / 2.0; cy = (bb.min.Y + bb.max.Y) / 2.0; cz = (bb.min.Z + bb.max.Z) / 2.0
    diag = ((bb.max.X-bb.min.X)**2 + (bb.max.Y-bb.min.Y)**2 + (bb.max.Z-bb.min.Z)**2) ** 0.5
    d = max(diag, 1.0) * 5.0
    views = {
        "front": ((cx, cy - d, cz), (0, 0, 1)),
        "top":   ((cx, cy, cz + d), (0, 1, 0)),
        "right": ((cx + d, cy, cz), (0, 0, 1)),
        "iso":   ((cx + d, cy - d, cz + d), (0, 0, 1)),
    }
    emitted = []
    for name, (origin, up) in views.items():
        try:
            visible, hidden = _p.project_to_viewport(origin, viewport_up=up, look_at=(cx, cy, cz))
            svg = ExportSVG()
            svg.add_layer("visible", line_weight=0.5)
            svg.add_layer("hidden", line_weight=0.25, line_type=LineType.DASHED)
            svg.add_shape(visible, layer="visible")
            if hidden: svg.add_shape(hidden, layer="hidden")
            svg.write(f"{out_dir}/part_{name}.svg")
            dxf = ExportDXF()
            dxf.add_layer("visible")
            dxf.add_shape(visible, layer="visible")
            dxf.write(f"{out_dir}/part_{name}.dxf")
            emitted.append(name)
        except Exception as _ve:
            print(f"DRAWING_VIEW_SKIPPED {name}:", _ve)
    print("DRAWINGS_EMITTED:", _json.dumps({"views": emitted}))

try:
    emit_drawings(part)
except Exception as _e:
    print("DRAWINGS_SKIPPED:", _e)
`

export async function runCadScript(
  env: CloudflareEnv,
  args: { script: string; tenantId: string; executionId: string; timeoutMs?: number },
): Promise<CadExecResult> {
  const { script, tenantId, executionId, timeoutMs } = args
  const fullScript = script + '\n' + CAD_DRAWING_HELPER
  const res = await env.NEXUS_EXEC.fetch('https://nexus-exec/run', {
    method: 'POST',
    headers: {
      'x-exec-secret': env.EXEC_SECRET,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      script: fullScript,
      tenant_id: tenantId,
      execution_id: executionId,
      timeout_ms: timeoutMs,
    }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`nexus-exec /run failed: ${res.status} ${text}`)
  }
  return res.json() as Promise<CadExecResult>
}

export async function meterCadExec(
  env: CloudflareEnv,
  args: { tenantId: string; executionId: string; result: CadExecResult;
          pipelineRunId?: string; subtaskId?: string },
): Promise<{ costRowId: string; artifactIds: string[] }> {
  const { tenantId, executionId, result, pipelineRunId, subtaskId } = args
  const now = Math.floor(Date.now() / 1000)
  const costRowId = crypto.randomUUID()
  const costUsd = ((result.duration_ms ?? 0) / 1000) * CAD_EXEC_USD_PER_SEC

  await env.DB.prepare(
    `INSERT INTO cost_ledger
       (id, execution_id, call_sequence, model_id, call_purpose,
        input_tokens, output_tokens, cost_usd, latency_ms, tenant_id, called_at)
     VALUES (?, ?, 1, 'cf-container-2vcpu-6gib', 'execute_code', 0, 0, ?, ?, ?, ?)`,
  )
    .bind(costRowId, executionId, costUsd, result.duration_ms ?? null, tenantId, now)
    .run()

  const artifactIds: string[] = []

  for (const artifact of result.artifacts) {
    if (!artifact.base64) continue

    const bin = atob(artifact.base64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)

    const ext = artifact.name.split('.').pop() ?? 'bin'
    const key = `cad/${tenantId}/${executionId}/${artifact.name}`

    try {
      await env.R2.put(key, bytes, { httpMetadata: { contentType: cadContentType(ext) } })
    } catch {
      continue
    }

    const hash = await sha256Hex(bytes.buffer as ArrayBuffer)
    const artifactId = crypto.randomUUID()

    await env.DB.prepare(
      `INSERT OR IGNORE INTO artifact_registry
         (id, execution_id, producing_agent, artifact_type, artifact_name,
          storage_type, storage_ref, r2_bucket, format, content_hash, size_bytes,
          client_id, pipeline_run_id, subtask_id, status, created_at)
       VALUES (?, ?, 'cad-exec', 'cad-model', ?, 'r2', ?, 'll-cockpit-r2', ?, ?, ?, ?, ?, ?, 'active', ?)`,
    )
      .bind(
        artifactId,
        executionId,
        artifact.name,
        key,
        ext,
        hash,
        artifact.size_bytes ?? bytes.length,
        tenantId,
        pipelineRunId ?? null,
        subtaskId ?? null,
        now,
      )
      .run()

    artifactIds.push(artifactId)
  }

  return { costRowId, artifactIds }
}

async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function cadContentType(ext: string): string {
  switch (ext.toLowerCase()) {
    case 'glb': return 'model/gltf-binary'
    case 'gltf': return 'model/gltf+json'
    case 'step':
    case 'stp': return 'application/step'
    case 'stl': return 'model/stl'
    default: return 'application/octet-stream'
  }
}
