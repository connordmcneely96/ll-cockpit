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

# ==== APPENDED TWO-TIER DETERMINISTIC DRAWING HELPER (authored; do not rely on the model for the projection API) ====
# Tier 1: FreeCAD TechDraw (freecadcmd subprocess on the exported STEP). Tier 2: build123d-native
# projection fallback. NEVER raises out of this block; on total failure prints DRAWINGS_SKIPPED.
# Emits part_front / part_top / part_right / part_iso as .svg + .dxf into /work/out.
import json as _json
import os as _os
import subprocess as _sp
import tempfile as _tf

_OUT = "/work/out"

# FreeCAD is NOT importable from the venv python — all FreeCAD work runs in the freecadcmd subprocess.
_FREECAD_SCRIPT = r"""
import FreeCAD, Part, TechDraw
import glob as _g, os as _os, json as _json
_dirs = [
    "/usr/share/freecad/Mod/TechDraw/Templates",
    "/usr/share/freecad/data/Mod/TechDraw/Templates",
    "/usr/lib/freecad/Mod/TechDraw/Templates",
    "/usr/lib/freecad-python3/Mod/TechDraw/Templates",
    "/usr/share/freecad-daily/Mod/TechDraw/Templates",
]
_cands = []
for _d in _dirs:
    _cands += _g.glob(_os.path.join(_d, "*.svg"))
def _pick(cands):
    order = ["A4_Landscape_blank", "A4_Landscape", "A3_Landscape_blank", "A3_Landscape", "Landscape", "A4", "A3"]
    for key in order:
        for c in cands:
            if key.lower() in _os.path.basename(c).lower():
                return c
    return cands[0] if cands else None
_tmpl = _pick(_cands)
print("TECHDRAW_TEMPLATES_FOUND: " + _json.dumps(_cands[:10]))
print("TECHDRAW_TEMPLATE_USED: " + str(_tmpl))
if not _tmpl:
    raise RuntimeError("no TechDraw template found in " + str(_dirs))
doc = FreeCAD.newDocument("d")
shape = Part.read("/work/out/part.step")
obj = doc.addObject("Part::Feature", "ImportedPart")
obj.Shape = shape
doc.recompute()
# FreeCAD 0.19 needs page.Template set before DrawViewPart will project.
page = doc.addObject("TechDraw::DrawPage", "Page")
tmpl = doc.addObject("TechDraw::DrawSVGTemplate", "Template")
tmpl.Template = _tmpl
page.Template = tmpl
doc.recompute()
_views = {"front": (0.0, -1.0, 0.0), "top": (0.0, 0.0, 1.0), "right": (1.0, 0.0, 0.0), "iso": (1.0, -1.0, 1.0)}
# TechDraw view SVG is centered on the view origin (drawing spans negative coords too),
# so a symmetric viewBox about 0,0 sized to the shape's circumradius makes every view
# render legibly regardless of direction. Without it browsers assume a 300x150 canvas
# at the origin and the drawing collapses into a corner speck.
_bb = shape.BoundBox
_r = 0.5 * ((_bb.XLength**2 + _bb.YLength**2 + _bb.ZLength**2) ** 0.5)
_m = max(_r * 0.15, 2.0)
_s = 2.0 * (_r + _m)
emitted = []
_bodies = {}
_dimensions_emitted = []
for name, direction in _views.items():
    try:
        view = doc.addObject("TechDraw::DrawViewPart", "V_" + name)
        page.addView(view)
        view.Source = [obj]
        view.Direction = FreeCAD.Vector(direction[0], direction[1], direction[2])
        view.Scale = 1.0
        doc.recompute()
        svg_body = TechDraw.viewPartAsSvg(view)
        with open("/work/out/part_" + name + ".svg", "w") as _sf:
            _sf.write(('<svg xmlns="http://www.w3.org/2000/svg" version="1.1" '
                'viewBox="%f %f %f %f" width="100%%" height="100%%" '
                'preserveAspectRatio="xMidYMid meet">' % (-(_r+_m), -(_r+_m), _s, _s)) + svg_body + '</svg>')
        TechDraw.writeDXFView(view, "/work/out/part_" + name + ".dxf")
        emitted.append(name)
        _bodies[name] = svg_body
        # Best-effort DrawViewDimension for the view's principal extents. Fully
        # non-destructive: the known-good plain part_<view>.svg is NEVER rewritten.
        # A dimensioned re-render is written to a SEPARATE part_<view>_dim.svg, and
        # only when it contains real geometry — so a dimension attempt can never
        # damage the plain view.
        try:
            _vd = []
            for _dtype, _ox, _oy in (("DistanceX", 0.0, (_r + _m) * 0.9), ("DistanceY", -(_r + _m) * 0.9, 0.0)):
                try:
                    _dim = doc.addObject("TechDraw::DrawViewDimension", "Dim_" + name + "_" + _dtype)
                    _dim.Type = _dtype
                    # TechDraw edges are 1-indexed; try a few and take the first that recomputes.
                    _ref_ok = False
                    for _ref in ("Edge1", "Edge2", "Edge0"):
                        try:
                            _dim.References2D = [(view, _ref)]
                            doc.recompute()
                            _ref_ok = True
                            break
                        except Exception:
                            continue
                    if not _ref_ok:
                        print("DIM_SKIPPED " + name + " " + _dtype + " no-valid-edge")
                        continue
                    page.addView(_dim)
                    doc.recompute()
                    _dim.X = _ox
                    _dim.Y = _oy
                    doc.recompute()
                    _vd.append(name + ":" + _dtype)
                except Exception as _de:
                    print("DIM_SKIPPED " + name + " " + _dtype + ": " + str(_de))
            if _vd:
                _dimensions_emitted.extend(_vd)
                _svg2 = TechDraw.viewPartAsSvg(view)
                if _svg2 and ("<path" in _svg2 or "<circle" in _svg2 or "<ellipse" in _svg2):
                    with open("/work/out/part_" + name + "_dim.svg", "w") as _sf2:
                        _sf2.write(('<svg xmlns="http://www.w3.org/2000/svg" version="1.1" '
                            'viewBox="%f %f %f %f" width="100%%" height="100%%" '
                            'preserveAspectRatio="xMidYMid meet">' % (-(_r+_m), -(_r+_m), _s, _s)) + _svg2 + '</svg>')
                else:
                    print("DIM_RENDER_REJECTED " + name)
        except Exception as _dme:
            print("DIM_SKIPPED " + name + " block: " + str(_dme))
    except Exception as _ve:
        print("FREECAD_VIEW_SKIPPED " + name + ": " + str(_ve))
print("FREECAD_DRAWINGS_OK: " + _json.dumps({"views": emitted}))
# Combined engineering sheet: the 4 views laid out 2x2 with a border and a
# lower-right title block. Fully guarded — any failure degrades to the plain
# 4-view output (the per-view files are already written) and never loses drawings.
try:
    import datetime as _dtmod
    _date = _dtmod.datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")
    def _c(v):
        return "%.3f" % v
    _pad = _m
    _gap = _s * 0.12
    _cw = 2.0 * _s + _gap
    _titleH = max(_s * 0.35, 30.0)
    _sw = _cw + 2.0 * _pad
    _sh = _cw + 2.0 * _pad + _titleH
    _stroke = max(_s * 0.004, 0.3)
    _pos = {
        "front": (_pad + _s / 2.0, _pad + _s / 2.0),
        "top": (_pad + _s + _gap + _s / 2.0, _pad + _s / 2.0),
        "right": (_pad + _s / 2.0, _pad + _s + _gap + _s / 2.0),
        "iso": (_pad + _s + _gap + _s / 2.0, _pad + _s + _gap + _s / 2.0),
    }
    _parts = ['<svg xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="0 0 ' + _c(_sw) + ' ' + _c(_sh) + '" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">']
    _parts.append('<rect x="' + _c(_pad * 0.5) + '" y="' + _c(_pad * 0.5) + '" width="' + _c(_sw - _pad) + '" height="' + _c(_sh - _pad) + '" fill="white" stroke="black" stroke-width="' + _c(_stroke) + '"/>')
    for _vn in ["front", "top", "right", "iso"]:
        if _vn in _bodies:
            _cx, _cy = _pos[_vn]
            _parts.append('<g transform="translate(' + _c(_cx) + ',' + _c(_cy) + ')">' + _bodies[_vn] + '</g>')
            _parts.append('<text x="' + _c(_cx) + '" y="' + _c(_cy - _s * 0.44) + '" font-family="sans-serif" font-size="' + _c(max(_s * 0.05, 3.0)) + '" text-anchor="middle" fill="black">' + _vn.upper() + '</text>')
    _tbw = min(_cw * 0.55, _s * 1.7)
    _tbh = _titleH * 0.85
    _tbx = _sw - _pad * 0.5 - _tbw
    _tby = _sh - _pad * 0.5 - _tbh
    _fs = max(_titleH * 0.13, 2.5)
    _parts.append('<rect x="' + _c(_tbx) + '" y="' + _c(_tby) + '" width="' + _c(_tbw) + '" height="' + _c(_tbh) + '" fill="white" stroke="black" stroke-width="' + _c(_stroke) + '"/>')
    _lines = ["PART", "SCALE 1:1", "UNITS mm", "DATE " + _date, "VIEWS " + ", ".join(emitted), "GENERATED BY NEXUS"]
    _ty = _tby + _fs * 1.6
    for _ln in _lines:
        _parts.append('<text x="' + _c(_tbx + _tbw * 0.03) + '" y="' + _c(_ty) + '" font-family="sans-serif" font-size="' + _c(_fs) + '" fill="black">' + _ln + '</text>')
        _ty += _fs * 1.7
    _parts.append('</svg>')
    with open("/work/out/part_sheet.svg", "w") as _shf:
        _shf.write("".join(_parts))
    print("TITLEBLOCK_OK: " + _json.dumps({"sheet": "part_sheet.svg", "views": emitted}))
except Exception as _tbe:
    print("TITLEBLOCK_SKIPPED: " + str(_tbe))
print("DIMENSIONS_EMITTED: " + _json.dumps(_dimensions_emitted))
"""

def _ensure_step(_p):
    path = _OUT + "/part.step"
    if _os.path.exists(path):
        return True
    try:
        from build123d import export_step
        _os.makedirs(_OUT, exist_ok=True)
        export_step(_p, path)
    except Exception as _e:
        print("FREECAD_STEP_EXPORT_FAILED:", _e)
    return _os.path.exists(path)

def _freecad_techdraw(_p):
    if not _ensure_step(_p):
        print("FREECAD_DRAWINGS_FALLBACK: no STEP available for FreeCAD")
        return False
    try:
        _fd, _tmp = _tf.mkstemp(suffix=".py")
        with _os.fdopen(_fd, "w") as _f:
            _f.write(_FREECAD_SCRIPT)
        _res = _sp.run(["freecadcmd", _tmp], timeout=150, capture_output=True, text=True)
    except Exception as _e:
        print("FREECAD_DRAWINGS_FALLBACK:", _e)
        return False
    _svgs = [n for n in ("front", "top", "right", "iso") if _os.path.exists(_OUT + "/part_" + n + ".svg")]
    if _res.returncode == 0 and "FREECAD_DRAWINGS_OK" in (_res.stdout or "") and _svgs:
        print("DRAWINGS_EMITTED:", _json.dumps({"engine": "freecad-techdraw", "views": _svgs}))
        return True
    print("FREECAD_DRAWINGS_FALLBACK: rc=" + str(_res.returncode) + " svgs=" + str(_svgs) + " err=" + ((_res.stderr or "")[:300]))
    return False

def _build123d_native(_p, out_dir="/work/out"):
    try:
        from build123d import ExportSVG, ExportDXF, LineType
    except Exception as _e:
        print("DRAWINGS_SKIPPED:", _e); return False
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
    if emitted:
        print("DRAWINGS_EMITTED:", _json.dumps({"engine": "build123d-native", "views": emitted}))
        return True
    return False

def emit_drawings(_p, out_dir="/work/out"):
    """Two-tier best-effort orthographic drawing set. NEVER raises."""
    try:
        if _freecad_techdraw(_p):
            return
        if _build123d_native(_p, out_dir):
            return
        print("DRAWINGS_SKIPPED: both engines failed")
    except Exception as _e:
        print("DRAWINGS_SKIPPED:", _e)

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
    const artifactType = ['svg', 'dxf', 'pdf'].includes(ext.toLowerCase()) ? 'cad-drawing' : 'cad-model'
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
       VALUES (?, ?, 'cad-exec', ?, ?, 'r2', ?, 'll-cockpit-r2', ?, ?, ?, ?, ?, ?, 'active', ?)`,
    )
      .bind(
        artifactId,
        executionId,
        artifactType,
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
    case 'svg': return 'image/svg+xml'
    case 'dxf': return 'image/vnd.dxf'
    case 'pdf': return 'application/pdf'
    default: return 'application/octet-stream'
  }
}
