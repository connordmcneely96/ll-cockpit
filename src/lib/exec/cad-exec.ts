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

def _fmt(v):
    return "%.3f" % v

# Annotation scale — set PER VIEW from that view's own content span (_vspan) just
# before its annotations are generated, so a 33mm end view and a 593mm side view
# both get proportionate dim lines/text/arrows instead of absolute-mm offsets that
# are nonsensical at one scale or the other. Safe defaults here in case a helper is
# ever called before the per-view block runs.
_cur_off = 10.0        # dimension-line offset from the outline
_cur_gap = 1.5         # extension gap / overshoot
_cur_fs = 3.5          # annotation font size
_cur_arrowlen = 2.0    # arrowhead length
_cur_aw = 0.8          # arrowhead half-width

# ASME Y14.5-style annotation, drawn OUTSIDE the view outline. NOTE: TechDraw view
# SVG has +y DOWN, so "below the part" = LARGER y. _arrow: filled head sized from
# _cur_arrowlen/_cur_aw, tip at (tipx,tipy) pointing along the unit (dirx,diry).
def _arrow(tipx, tipy, dirx, diry):
    alen = _cur_arrowlen
    aw = _cur_aw
    bx = tipx - dirx * alen
    by = tipy - diry * alen
    px = -diry
    py = dirx
    return '<polygon points="' + _fmt(tipx) + ',' + _fmt(tipy) + ' ' + _fmt(bx + px * aw) + ',' + _fmt(by + py * aw) + ' ' + _fmt(bx - px * aw) + ',' + _fmt(by - py * aw) + '" fill="black"/>'

# Horizontal dimension of the extent [x0,x1] taken at the object bottom yobj, with
# the dimension line placed BELOW at yline (yline > yobj). Extension gap/overshoot =
# _cur_gap; value centered _cur_gap above the line; font = _cur_fs.
def _hdim(x0, x1, yobj, yline, val):
    out = ['<g>']
    out.append('<line x1="' + _fmt(x0) + '" y1="' + _fmt(yobj + _cur_gap) + '" x2="' + _fmt(x0) + '" y2="' + _fmt(yline + _cur_gap) + '" stroke="black" stroke-width="0.25"/>')
    out.append('<line x1="' + _fmt(x1) + '" y1="' + _fmt(yobj + _cur_gap) + '" x2="' + _fmt(x1) + '" y2="' + _fmt(yline + _cur_gap) + '" stroke="black" stroke-width="0.25"/>')
    out.append('<line x1="' + _fmt(x0) + '" y1="' + _fmt(yline) + '" x2="' + _fmt(x1) + '" y2="' + _fmt(yline) + '" stroke="black" stroke-width="0.25"/>')
    out.append(_arrow(x0, yline, -1.0, 0.0))
    out.append(_arrow(x1, yline, 1.0, 0.0))
    out.append('<text x="' + _fmt((x0 + x1) / 2.0) + '" y="' + _fmt(yline - _cur_gap) + '" font-family="sans-serif" font-size="' + _fmt(_cur_fs) + '" text-anchor="middle" fill="black">' + ("%.2f" % val) + '</text>')
    out.append('</g>')
    return "".join(out)

# Vertical dimension of the extent [y0,y1] taken at the object left xobj, with the
# dimension line placed LEFT at xline (xline < xobj). Value rotated -90 left of it.
def _vdim(y0, y1, xobj, xline, val):
    _tx = xline - _cur_gap
    _ty = (y0 + y1) / 2.0
    out = ['<g>']
    out.append('<line x1="' + _fmt(xobj - _cur_gap) + '" y1="' + _fmt(y0) + '" x2="' + _fmt(xline - _cur_gap) + '" y2="' + _fmt(y0) + '" stroke="black" stroke-width="0.25"/>')
    out.append('<line x1="' + _fmt(xobj - _cur_gap) + '" y1="' + _fmt(y1) + '" x2="' + _fmt(xline - _cur_gap) + '" y2="' + _fmt(y1) + '" stroke="black" stroke-width="0.25"/>')
    out.append('<line x1="' + _fmt(xline) + '" y1="' + _fmt(y0) + '" x2="' + _fmt(xline) + '" y2="' + _fmt(y1) + '" stroke="black" stroke-width="0.25"/>')
    out.append(_arrow(xline, y0, 0.0, -1.0))
    out.append(_arrow(xline, y1, 0.0, 1.0))
    out.append('<text x="' + _fmt(_tx) + '" y="' + _fmt(_ty) + '" font-family="sans-serif" font-size="' + _fmt(_cur_fs) + '" text-anchor="middle" fill="black" transform="rotate(-90 ' + _fmt(_tx) + ' ' + _fmt(_ty) + ')">' + ("%.2f" % val) + '</text>')
    out.append('</g>')
    return "".join(out)

# Diameter callout: leader (with an arrowhead) from the circle EDGE at 30deg up out
# past the bbox top, a _cur_off horizontal shoulder, then the Ø value — kept above
# the bbox so it can never cross the below-placed width dimension.
def _dia_callout(ccx, ccy, rad, val, miny):
    _ax = 0.8660254037844387
    _ay = 0.5
    sx = ccx + rad * _ax
    sy = ccy - rad * _ay
    lead = rad * 0.6 + _cur_off
    elbx = sx + _ax * lead
    elby = sy - _ay * lead
    if elby > miny - _cur_gap:
        elby = miny - _cur_gap
    shx = elbx + _cur_off
    shy = elby
    out = ['<g>']
    out.append(_arrow(sx, sy, -_ax, _ay))
    out.append('<line x1="' + _fmt(sx) + '" y1="' + _fmt(sy) + '" x2="' + _fmt(elbx) + '" y2="' + _fmt(elby) + '" stroke="black" stroke-width="0.25"/>')
    out.append('<line x1="' + _fmt(elbx) + '" y1="' + _fmt(elby) + '" x2="' + _fmt(shx) + '" y2="' + _fmt(shy) + '" stroke="black" stroke-width="0.25"/>')
    out.append('<text x="' + _fmt(shx + _cur_gap) + '" y="' + _fmt(shy - _cur_gap) + '" font-family="sans-serif" font-size="' + _fmt(_cur_fs) + '" fill="black">' + "Ø" + ("%.2f" % val) + '</text>')
    out.append('</g>')
    return "".join(out)

def _edge_points(_e):
    try:
        _vx = _e.Vertexes
        if len(_vx) >= 2:
            return ((_vx[0].X, _vx[0].Y), (_vx[-1].X, _vx[-1].Y))
    except Exception:
        pass
    try:
        _a = _e.valueAt(_e.FirstParameter)
        _b = _e.valueAt(_e.LastParameter)
        return ((_a.x, _a.y), (_b.x, _b.y))
    except Exception:
        pass
    try:
        _a = _e.firstVertex().Point
        _b = _e.lastVertex().Point
        return ((_a.x, _a.y), (_b.x, _b.y))
    except Exception:
        return None

def _edge_is_circle(_e):
    try:
        if hasattr(_e.Curve, "Radius"):
            return True
    except Exception:
        pass
    try:
        if hasattr(_e, "Circle") or hasattr(_e, "Radius"):
            return True
    except Exception:
        pass
    return False

_view_bbox = {}
_view_ann = {}
_view_scale = {}
for name, direction in _views.items():
    try:
        view = doc.addObject("TechDraw::DrawViewPart", "V_" + name)
        page.addView(view)
        view.Source = [obj]
        view.Direction = FreeCAD.Vector(direction[0], direction[1], direction[2])
        view.Scale = 1.0
        doc.recompute()
        try:
            _view_scale[name] = float(view.Scale)
        except Exception:
            _view_scale[name] = 1.0
        svg_body = TechDraw.viewPartAsSvg(view)
        # ASME Y14.5 dimensioning from the VIEW'S PROJECTED BBOX (not edge-pick):
        # each feature dimensioned exactly once across the sheet, placed OUTSIDE the
        # outline. NO dimensions on the iso pictorial.
        try:
            _ve = view.getVisibleEdges()
        except Exception:
            _ve = []
        _edges = []
        _xs = []
        _ys = []
        for _ei in range(len(_ve)):
            _e = _ve[_ei]
            _p = _edge_points(_e)
            _isc = _edge_is_circle(_e)
            _edges.append({"e": _e, "pts": _p, "circle": _isc})
            if _p:
                (_ax0, _ay0), (_bx0, _by0) = _p
                _xs.append(_ax0); _xs.append(_bx0)
                _ys.append(_ay0); _ys.append(_by0)
            # A full circle's two endpoints coincide at the seam, so they don't span
            # its extent — an end-on circular view would otherwise measure as a POINT
            # (degenerate bbox -> tiny viewBox -> the circle bursts out of frame). Add
            # the circle's center +/- radius so its true extent is captured.
            if _isc:
                try:
                    _crx = float(_e.Curve.Radius)
                    _ccg = _e.Curve.Center
                    _xs.append(float(_ccg.x) - _crx); _xs.append(float(_ccg.x) + _crx)
                    _ys.append(float(_ccg.y) - _crx); _ys.append(float(_ccg.y) + _crx)
                except Exception:
                    pass
        _anns = []
        _vd = []
        _have_bbox = False
        _minx = 0.0; _maxx = 0.0; _miny = 0.0; _maxy = 0.0
        _axmin = 0.0; _axmax = 0.0; _aymin = 0.0; _aymax = 0.0
        if _xs and _ys:
            _have_bbox = True
            _minx = min(_xs); _maxx = max(_xs)
            _miny = min(_ys); _maxy = max(_ys)
            # Annotated extent — measured, not estimated. Starts at the part bbox and
            # grows to cover every annotation actually drawn.
            _axmin = _minx; _axmax = _maxx; _aymin = _miny; _aymax = _maxy
            # RELATIVE annotation scale from this view's own content span, so the dim
            # geometry is proportionate at any part size (was hard 10/1.5/3.5/2.0mm).
            _vspan = max(_maxx - _minx, _maxy - _miny)
            _cur_off = max(0.12 * _vspan, 6.0)
            _cur_gap = max(0.02 * _vspan, 1.0)
            _cur_fs = max(0.045 * _vspan, 2.5)
            _cur_arrowlen = max(0.025 * _vspan, 1.5)
            _cur_aw = _cur_arrowlen * 0.4
            print("VIEW_SPAN " + name + ": " + str(_vspan))
            if name == "iso":
                print("DIM_SKIPPED iso pictorial-no-dims")
            else:
                _w = _maxx - _minx
                _h = _maxy - _miny
                _view_bbox[name] = (_minx, _maxx, _miny, _maxy, _w, _h)
                _hcount = 0
                _vcount = 0
                _fw = _view_bbox.get("front", (0, 0, 0, 0, None, 0))[4]
                _tw = _view_bbox.get("top", (0, 0, 0, 0, None, 0))[4]
                # HORIZONTAL (width) ownership: front always; top/right only if non-redundant.
                _emit_h = False
                if name == "front":
                    _emit_h = (_w > 1e-6)
                elif name == "top":
                    if _fw is not None and abs(_w - _fw) <= 1e-6:
                        print("DIM_REDUNDANT_SKIPPED top horizontal")
                    else:
                        _emit_h = (_w > 1e-6)
                elif name == "right":
                    _red = (_fw is not None and abs(_w - _fw) <= 1e-6) or (_tw is not None and abs(_w - _tw) <= 1e-6)
                    if _red:
                        print("DIM_REDUNDANT_SKIPPED right horizontal")
                    else:
                        _emit_h = (_w > 1e-6)
                if _emit_h:
                    _yline = _maxy + _cur_off + _cur_off * _hcount
                    _anns.append(_hdim(_minx, _maxx, _maxy, _yline, _w))
                    _vd.append(name + ":DistanceX")
                    _hcount += 1
                    _aymax = max(_aymax, _yline + _cur_gap)
                    _aymin = min(_aymin, _yline - _cur_gap - _cur_fs)
                    _midh = (_minx + _maxx) / 2.0
                    _thw = len("%.2f" % _w) * _cur_fs * 0.35
                    _axmin = min(_axmin, _midh - _thw)
                    _axmax = max(_axmax, _midh + _thw)
                # VERTICAL (height) ownership: FRONT ONLY (top/right never re-dimension it).
                if name == "front":
                    if _h > 1e-6:
                        _xline = _minx - _cur_off - _cur_off * _vcount
                        _anns.append(_vdim(_miny, _maxy, _minx, _xline, _h))
                        _vd.append(name + ":DistanceY")
                        _vcount += 1
                        _axmin = min(_axmin, _xline - _cur_gap - _cur_fs)
                else:
                    if _h > 1e-6:
                        print("DIM_REDUNDANT_SKIPPED " + name + " vertical")
                # DIAMETER callouts: TOP view only, capped at 2.
                if name == "top":
                    _ndia = 0
                    for _ed in _edges:
                        if _ed["circle"] and _ndia < 2:
                            try:
                                _rad = float(_ed["e"].Curve.Radius)
                                _cc = _ed["e"].Curve.Center
                                _anns.append(_dia_callout(float(_cc.x), float(_cc.y), _rad, 2.0 * _rad, _miny))
                                _vd.append("top:Diameter")
                                _ndia += 1
                                # Cover the callout extent (same scaled geometry as _dia_callout).
                                _ax30 = 0.8660254037844387
                                _ay30 = 0.5
                                _sx = float(_cc.x) + _rad * _ax30
                                _sy = float(_cc.y) - _rad * _ay30
                                _lead = _rad * 0.6 + _cur_off
                                _elbx = _sx + _ax30 * _lead
                                _elby = _sy - _ay30 * _lead
                                if _elby > _miny - _cur_gap:
                                    _elby = _miny - _cur_gap
                                _shx = _elbx + _cur_off
                                _dtxt = "Ø" + ("%.2f" % (2.0 * _rad))
                                _axmax = max(_axmax, _shx + _cur_gap + len(_dtxt) * _cur_fs * 0.6, _elbx, _sx)
                                _axmin = min(_axmin, _elbx, _sx)
                                _aymin = min(_aymin, _elby - _cur_fs)
                            except Exception as _de:
                                print("DIM_SKIPPED top Diameter " + str(_de))
        print("DIM_COMPUTED " + name + ": " + _json.dumps(_vd))
        # WRITE dimensions INTO part_<view>.svg. REGRESSION GUARD: only keep the
        # annotated body if it is strictly larger AND contains <text and <polygon;
        # otherwise write the plain (correct, undimensioned) body and print the
        # rejection line — a view is NEVER lost or silently un-dimensioned.
        _annotated = svg_body + "".join(_anns)
        _accepted = (len(_annotated) > len(svg_body) and ("<text" in _annotated) and ("<polygon" in _annotated))
        if _accepted:
            _inner = _annotated
            _dimensions_emitted.extend(_vd)
        else:
            _inner = svg_body
            print("DIM_RENDER_REJECTED " + name)
        # Per-view viewBox from the MEASURED content extent — the annotated bbox when
        # the annotations were accepted, else the plain part bbox (so the box matches
        # what was actually written). TRUE 1:1: no scaling, the box just frames content
        # plus a small margin. The symmetric circumradius box is a LAST RESORT, used
        # ONLY when the measured extent is degenerate (no geometry, or a single point/
        # line whose width or height collapses to ~0) — never for a view that has a
        # real, small end-on feature like a 33mm circle.
        _pad_v = 3.0
        if _have_bbox and _accepted:
            _exmin = _axmin; _exmax = _axmax; _eymin = _aymin; _eymax = _aymax
        elif _have_bbox:
            _exmin = _minx; _exmax = _maxx; _eymin = _miny; _eymax = _maxy
        else:
            _exmin = 0.0; _exmax = 0.0; _eymin = 0.0; _eymax = 0.0
        if (_exmax - _exmin) > 1e-6 and (_eymax - _eymin) > 1e-6:
            _view_ann[name] = (_exmin, _exmax, _eymin, _eymax)
            print("VIEW_EXTENT " + name + ": " + _json.dumps([_exmin, _exmax, _eymin, _eymax]))
            _vbx = _exmin - _pad_v
            _vby = _eymin - _pad_v
            _vbw = (_exmax - _exmin) + 2.0 * _pad_v
            _vbh = (_eymax - _eymin) + 2.0 * _pad_v
        else:
            _Rf = (_r + _m) + 12.0
            _vbx = -_Rf; _vby = -_Rf; _vbw = 2.0 * _Rf; _vbh = 2.0 * _Rf
            _view_ann[name] = (-_Rf, _Rf, -_Rf, _Rf)
            print("VIEW_EXTENT " + name + ": DEGENERATE " + _json.dumps([-_Rf, _Rf, -_Rf, _Rf]))
        with open("/work/out/part_" + name + ".svg", "w") as _sf:
            _sf.write(('<svg xmlns="http://www.w3.org/2000/svg" version="1.1" '
                'viewBox="%f %f %f %f" width="100%%" height="100%%" '
                'preserveAspectRatio="xMidYMid meet">' % (_vbx, _vby, _vbw, _vbh)) + _inner + '</svg>')
        TechDraw.writeDXFView(view, "/work/out/part_" + name + ".dxf")
        emitted.append(name)
        _bodies[name] = _inner
    except Exception as _ve2:
        print("FREECAD_VIEW_SKIPPED " + name + ": " + str(_ve2))
print("FREECAD_DRAWINGS_OK: " + _json.dumps({"views": emitted}))
# Combined engineering sheet: the 4 views laid out 2x2 with a border and a
# lower-right title block. Fully guarded — any failure degrades to the plain
# 4-view output (the per-view files are already written) and never loses drawings.
try:
    import datetime as _dtmod
    _date = _dtmod.datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")
    def _c(v):
        return "%.3f" % v
    # Content-measured 2x2 layout — TRUE 1:1, NO scaling. Each cell is sized to its
    # OWN view's MEASURED extent (_view_ann, the annotated bbox), not to a shared
    # circumradius, so the sheet is dense instead of ~15% filled. Grid:
    # col0={front,right}, col1={top,iso}; row0={front,top}, row1={right,iso}. A
    # per-view label band (_labelh) is reserved at the top of every cell. The sheet
    # size FOLLOWS from the summed cells — the views are never resized.
    _cellpad = 6.0
    _labelh = 6.0
    _margin = 8.0
    _gap = 6.0
    _grid = {"front": (0, 0), "top": (1, 0), "right": (0, 1), "iso": (1, 1)}
    def _ext(_nm):
        _a = _view_ann.get(_nm)
        if _a is None:
            return (0.0, 0.0, 0.0, 0.0, 0.0, 0.0)
        _x0, _x1, _y0, _y1 = _a
        return (_x0, _x1, _y0, _y1, _x1 - _x0, _y1 - _y0)
    _colw = [0.0, 0.0]
    _rowh = [0.0, 0.0]
    for _vn in ["front", "top", "right", "iso"]:
        if _vn in _bodies and _vn in _view_ann:
            _gc, _gr = _grid[_vn]
            _ee = _ext(_vn)
            if _ee[4] > _colw[_gc]:
                _colw[_gc] = _ee[4]
            if _ee[5] > _rowh[_gr]:
                _rowh[_gr] = _ee[5]
    _cellw = [_colw[0] + _cellpad, _colw[1] + _cellpad]
    _cellh = [_rowh[0] + _cellpad + _labelh, _rowh[1] + _cellpad + _labelh]
    _colx = [_margin, _margin + _cellw[0] + _gap]
    _rowy = [_margin, _margin + _cellh[0] + _gap]
    _viewsw = _margin + _cellw[0] + _gap + _cellw[1] + _margin
    _viewsh = _margin + _cellh[0] + _gap + _cellh[1] + _margin
    # Title block content — unchanged. PART NAME line only when a real name is known;
    # SCALE asserted from the recomputed view.Scale ("SCALE 1:1" only if every view
    # is truly 1.0, else the actual value(s)).
    _pname = None
    try:
        _cand = str(getattr(obj, "Label", "") or "").strip()
        if _cand and _cand.lower() not in ("importedpart", "part", "unnamed", "d", ""):
            _pname = _cand
    except Exception:
        _pname = None
    _scales = list(_view_scale.values())
    if not _scales or all(abs(_sc - 1.0) < 1e-6 for _sc in _scales):
        _scale_line = "SCALE 1:1"
    else:
        _scale_line = "SCALE " + ", ".join(sorted(set(("%.3g" % _sc) for _sc in _scales)))
    _lines = []
    if _pname:
        _lines.append("PART NAME: " + _pname)
    _lines.append(_scale_line)
    _lines.append("UNITS mm")
    _lines.append("TOLERANCES UNLESS NOTED: X.XX +/- 0.25mm")
    _lines.append("DATE " + _date)
    _lines.append("VIEWS " + ", ".join(emitted))
    _lines.append("GENERATED BY NEXUS")
    # Title block sized FROM the text so nothing clips: box height >=
    # (len(lines)+0.5)*line_height, font shrunk to fit the box width.
    _lh = 4.0
    _fs = _lh * 0.62
    _maxchars = 1
    for _ln in _lines:
        if len(_ln) > _maxchars:
            _maxchars = len(_ln)
    _availw = max(_viewsw * 0.6, 40.0)
    _needw = _maxchars * _fs * 0.6 + 2.0 * _lh
    if _needw > _availw:
        _fs = max((_availw - 2.0 * _lh) / (_maxchars * 0.6), 1.5)
        _tbw = _availw
    else:
        _tbw = _needw
    _tbh = (len(_lines) + 0.5) * _lh
    # Sheet size FOLLOWS from the cells + a title-block band at the bottom.
    _titleH = _tbh + 2.0 * _margin
    _sw = _viewsw
    _sh = _viewsh + _titleH
    _stroke = max(min(_sw, _sh) * 0.002, 0.3)
    _parts = ['<svg xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="0 0 ' + _c(_sw) + ' ' + _c(_sh) + '" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">']
    _parts.append('<rect x="' + _c(_margin * 0.5) + '" y="' + _c(_margin * 0.5) + '" width="' + _c(_sw - _margin) + '" height="' + _c(_sh - _margin) + '" fill="white" stroke="black" stroke-width="' + _c(_stroke) + '"/>')
    for _vn in ["front", "top", "right", "iso"]:
        if _vn in _bodies:
            _gc, _gr = _grid[_vn]
            _ee = _ext(_vn)
            # Centre the view inside its column/row content area, below the label band.
            _cx0 = _colx[_gc] + _cellpad / 2.0 + (_colw[_gc] - _ee[4]) / 2.0
            _cy0 = _rowy[_gr] + _labelh + _cellpad / 2.0 + (_rowh[_gr] - _ee[5]) / 2.0
            # translate(colX - axmin, rowY - aymin): the view sits at TRUE 1:1, its
            # measured content top-left mapped to the cell content origin.
            _tX = _cx0 - _ee[0]
            _tY = _cy0 - _ee[2]
            _parts.append('<g transform="translate(' + _c(_tX) + ',' + _c(_tY) + ')">' + _bodies[_vn] + '</g>')
            _lx = _colx[_gc] + _cellw[_gc] / 2.0
            _ly = _rowy[_gr] + _labelh * 0.75
            _parts.append('<text x="' + _c(_lx) + '" y="' + _c(_ly) + '" font-family="sans-serif" font-size="' + _c(max(_labelh * 0.5, 3.0)) + '" text-anchor="middle" fill="black">' + _vn.upper() + '</text>')
    _tbx = _sw - _margin * 0.5 - _tbw
    _tby = _sh - _margin * 0.5 - _tbh
    _parts.append('<rect x="' + _c(_tbx) + '" y="' + _c(_tby) + '" width="' + _c(_tbw) + '" height="' + _c(_tbh) + '" fill="white" stroke="black" stroke-width="' + _c(_stroke) + '"/>')
    _ty = _tby + _lh
    for _ln in _lines:
        _parts.append('<text x="' + _c(_tbx + _lh * 0.3) + '" y="' + _c(_ty) + '" font-family="sans-serif" font-size="' + _c(_fs) + '" fill="black">' + _ln + '</text>')
        _ty += _lh
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
    # Surface the captured subprocess output onto the /run stdout channel so the
    # FreeCAD diagnostics (TECHDRAW_*, DIM_*, DIMENSIONS_EMITTED, ...) are no longer
    # silently discarded. "FC|" does not match the GEOMETRY_METRICS regex.
    for _line in (_res.stdout or "").splitlines():
        print("FC| " + _line)
    for _line in (_res.stderr or "").splitlines()[:40]:
        print("FCERR| " + _line)
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
