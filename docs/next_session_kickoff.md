# Next Session Kickoff — CAD Vertical (rev 13)

**Written 2026-07-13** after the drawing-engine session. Supersedes rev 12.
Paste this whole file as the first message of the new chat.

---

## MODE B — Senior Engineer

You are the Senior Engineer. Connor is CEO. Claude Code is The Hands.
**FIRST: state plainly which MCP tools are actually exposed this session** (Cloudflare/D1,
GitHub, NEXUS Knowledge, Vectorize — availability varies; never fake capability).
Then answer the 5 verification questions below from LIVE state. Wait for greenlight.

**Standing rules (earned the hard way — do not relearn them):**
- Review every PR at the **live PR head** (`get_file_contents` @ `refs/pull/N/head`). Claude
  Code's self-report is not evidence. It reported "pushed" for a commit that never landed.
- Verify D1 writes with a **SELECT read-back**. `changes:1` is not proof.
- **Never behavior-test before the specific commit's deploy is confirmed green.**
- After a squash-merge the branch is **dead** — new work branches fresh off `origin/main`.
- **Observability before diagnosis.** We burned 4 runs and 2 wrong theories debugging a
  FreeCAD subprocess whose stdout was captured and discarded. The moment we echoed it
  (`FC|` prefix), the bug named itself in one line. If you're inferring from file sizes, stop
  and go get the actual output.
- The LLM **never originates** engineering numbers. The calc engine originates; the LLM
  transcribes. Every coefficient is a **named, cited constant** with a vitest anchor — never
  a magic number.

---

## WHAT IS DONE (proven live — do not rebuild)

**The drawing engine works end to end:**
`spec (a sentence) → build123d solid → STEP → FreeCAD TechDraw HLR projection → self-rendered
ASME Y14.5 dimensions → title-block sheet → SVG + DXF in R2 → deliverable page /cad/[runId]
with pan/zoom.`

- **nexus-exec** container: build123d + OpenSCAD + FreeCAD headless, CI deploy via GH Actions
  (`ubuntu-latest` has Docker; Connor's machine needs none). Stable sandbox `'cad-exec'`.
- **Drawings** live in `ll-cockpit` `src/lib/exec/cad-exec.ts` → `CAD_DRAWING_HELPER`
  (appended to modeler scripts). Two-tier: FreeCAD TechDraw primary, build123d fallback.
- **Y14.5 rules implemented:** dims OUTSIDE view outlines; each feature dimensioned ONCE
  across the sheet; **NO dims on the iso view** (projected lengths like 21.21 are dangerously
  wrong); Ø callouts; content-measured viewBox at true 1:1; title block sized to its text.
- **Deliverable page** `/cad/[runId]` + `/cad` index: GLB viewer, sheet + 4 views, pan/zoom
  (`DrawingViewer`), labeled download manifest. Owner-scoped API `/api/cad/runs/[runId]`.
- **Loop robustness:** orphan-run reaper (a failed modeler used to hang runs in `running`
  forever); modeler iteration budget 16; **drawings are OPT-IN** (`execute_cad_code` takes
  `drawings: bool`, default false — MODELER sets it true only on its FINAL build). This cut a
  shaft run from 92 artifacts to 19 and stopped the loop exhausting.

**Verified:** run `57f2186c` — converged cycle 1, 19 artifacts, 9 drawings, real pump shaft
with keyways.

### Hard-won FreeCAD facts (all proven on the live container)
- Debian binary is lowercase **`freecadcmd`**; `-c` is `--console` (a mode switch, NOT a
  command runner).
- Page-level TechDraw export (`exportPageAsSvg` / `writeDXFPage`) is **Gui-only** headless.
  Use per-view `TechDraw.viewPartAsSvg(view)` + `TechDraw.writeDXFView(view, path)`.
- FreeCAD 0.19 **requires `page.Template`** set (a real `DrawSVGTemplate` file) before a
  `DrawViewPart` will project. Templates: `/usr/share/freecad/Mod/TechDraw/Templates/`.
- **`DrawViewDimension` is a `FeaturePython` proxy in 0.19 — `getLinearPoints()` /
  `getDimValue()` are NOT bound, and `QGIViewDimension` is Gui-only, so dimensions NEVER
  render headless.** SOLUTION (shipped): compute dimension VALUES from the projected edge
  geometry ourselves (`abs(bx-ax)`, `Curve.Radius`) and **self-render** the SVG annotation
  (extension lines, arrowheads, text). FreeCAD measures; we draw. Integrity preserved.
- SVG needs an explicit `viewBox` or it renders as a corner speck. A full circle's endpoints
  coincide at the seam → its bbox collapses to a point; add `center ± radius`.

---

## THE BLOCKING BUG (this is the next work)

**The calc engine under-designs shafts. The pipeline is fine; the engineering is wrong.**

Deployed `engineering-calcs/src/modules/shafts/shaft-geometry.ts` (`generateShaftGeometry`):

1. **Load model bypassed.** `radialLoad = 2.5·√power·applicationFactor` fires whenever `head`
   is absent → **~46 lbf** for a 150 HP pump. The user's specified **1200 lbf was ignored** —
   there is **no `radialLoad` input at all**. The repo's own changelog already calls this
   formula "non-physical, ~30× too low." It was fixed once (Stepanoff, 30L-3), but the fix was
   made *conditional on hydraulic inputs* and the LLM-facing tool schema never exposed `head`.
   The old defect walked back in through the new door.
2. **Diameter floored, not sized.** `if (shaftDiameter < 1) shaftDiameter = 1` — arbitrary.
   Every shaft hit it.
3. **Profile INVERTED.** Body = `shaftDiameter` (the MINIMUM); bearing seats = 1.2× that. The
   mid-span between bearings — where bending moment is MAXIMUM on an overhung impeller — is
   the thinnest section. Also un-assemblable (components install from the ends; a shoulder
   must be LARGER than the journal it seats). **Connor caught this by eye. He was right.**
4. **Ungrounded constants:** safety factor hardcoded to **2** (ignoring the passed
   `applicationFactor`); deflection limit **0.005"**; critical-speed margin **1.4×**.

### The grounded values (researched + cited this session)
| Parameter | Correct value | Source |
|---|---|---|
| Shaft deflection | **≤ 0.002 in (50 µm)** at the **primary seal faces** | API 610 11th ed. **§6.9.1.3** |
| Critical speed | 1st **dry** critical ≥ **1.20×** MCS (wet-running) / **1.30×** (dry-capable) | API 610 **§3.1.8** |
| Bearing life | L10 ≥ **25,000 h** rated; ≥ 16,000 h at max loads | API 610 **§6.10.1** |
| Radial load | Stepanoff `F_r = 0.433·K_r·SG·H·D₂·b₂` (shutoff); K_r single volute 0.36 | already PE-validated in `radial-thrust.ts` |

### The deeper contract bug
**Clients give you flow, head, speed, SG, service — NOT `bearingSpan`, `overhang`,
`impellerDiameter`, `impellerWidth`.** But `shafts.analyze` demands those as *inputs*, so
MODELER **fabricated** them (`impellerDiameter: 12, impellerWidth: 2, bearingSpan: 14`).
D₂ and b₂ ARE derivable from (Q, H, N). **Bearing span and overhang are NOT** — they are
layout dimensions set by frame / bearing-housing / seal-chamber selection. They must be
caller-supplied or **explicitly declared as assumptions**. Never a silent correlation.

---

## PENDING — in order

### 1. Ingest the RAG corpus (3 docs authored, NOT yet ingested)
Corpus is thin: only `shaft_design_formulas` (von Mises/Shigley) and `pump_rotordynamics`
(API 682). Retrieval scores ~0.0164. **No hydraulic design content at all** — which is exactly
why MODELER fabricated the impeller dimensions.

Route (verified live): `POST /api/atlas/ingest?secret=engineering-30b`, body `{doc, text}`
(or `{doc, r2_key}`) → chunks by `##` section → Workers AI embed → upsert to the `ATLAS_RAG`
Vectorize index. Verify via `POST /api/atlas/query`.

Docs authored (in Connor's outputs): `pump_hydraulic_design`, `pump_shaft_mechanical_design`,
`engineering_drawings_gdt`. Plus `pump_standards_bibliography` (for Connor, NOT for RAG —
it's the standards acquisition list: API 610, ASME Y14.5, Gülich/Karassik, API 682 are the
P1 buys; Texas A&M Pump Symposium + Cameron Hydraulic Data Book + vendor catalogs are free).

⚠️ **SECURITY:** the ingest secret `engineering-30b` is **hardcoded in the public repo**.
Anyone can poison the engineering corpus. Worse than a leaked API key — the failure mode is
silently-wrong engineering. Fix before this is a product.

### 2. Rewrite `shaft-geometry.ts` (5-commit prompt authored, not yet run)
Repo: `engineering-calcs` (Hono + zod; **hard CI gate: typecheck + vitest before deploy**, so
a bad value cannot ship silently). The physics modules (`shaft-stress`, `shaft-deflection`,
`critical-speed`, `radial-thrust`) are believed sound — **every defect is in the orchestrator.**
- **C1** — delete the placeholder. Load chain: explicit `radialLoad` → Stepanoff(H, D₂, b₂) →
  derive impeller from (Q, H, N) then Stepanoff → **THROW**. No silent fallback, ever.
- **C2** — NEW `src/modules/pumps/hydraulic-design.ts`: specificSpeed; D₂ = 1840·Ku·√H/N;
  b₂ via continuity. Named cited consts (Ku = 1.0, Km2 = 0.11, ε₂ = 0.92). Returns
  `assumptions[]`.
- **C3** — NEW `src/modules/shafts/api610.ts`: cited constants (0.002 in; 1.20 / 1.30;
  25000 h). Safety factor := `applicationFactor` (NOT 2). New input `dryRunCapable`
  (default **true** = the conservative 1.30).
- **C4** — **monotonic step-down profile** from a central maximum, plus a vitest asserting the
  profile is non-increasing outward in BOTH directions (the regression guard against
  re-inverting the shaft).
- **C5** — honest output: `assumptions[]`, `checks[]` with citations, `governedBy`. Widen the
  zod schema: add `radialLoad`, `flow`, `dryRunCapable`.

### 3. Re-fire the pump shaft and verify
Expect: a real Stepanoff `radialLoad` (hundreds of lbf, not 46); a diameter that is *sized*,
not floored; a profile **fattest in the middle**; and a populated `assumptions[]`.

---

## PRODUCT VISION (aligned with Connor — do not re-litigate)

**End state: a workspace, not a chatbot.** 3D viewport + feature tree + model-aware multimodal
AI chat.

1. Engineer describes the duty in plain language.
2. The system **INTERROGATES** for missing non-derivable inputs (196C) instead of inventing them.
3. The system **CALCULATES before modeling** (196D). Every number standard-traceable;
   assumptions listed on the face of the output.
4. A parametric model appears. Deliverables auto-generate: Y14.5 drawings, STEP/DXF/GLB/PDF,
   a **calc report with a PE signature block** (*this is the sellable artifact*), BOM, DFM.

**THE ARCHITECTURAL DECISION (locked):** the first-pass → GUI handoff must carry **design
intent — the parametric feature tree, the parameters, which check governs, and the calc
context — NOT a dead STEP solid.** Otherwise the AI cannot reason about the geometry and
"refinement" degrades into pushing faces like clay. build123d models ARE parametric Python;
FreeCAD `.FCStd` carries a feature tree, is Python-scriptable, already does the drawings and
FEM, and is **already in the container** — so it is the natural refinement environment.

**Refinement loop:** NEXUS first pass (optimized, right + parametric — it needn't be perfect)
→ export to the GUI → the user manipulates, OR the AI proposes a change **with consequences
shown** ("D 2.25 → 2.50: deflection 0.0019 → 0.0013, mass +18%, bearing bore 45 → 50 mm") →
**USER APPROVES** (the gate) → rebuild → re-validate → re-draw → new revision.
**The AI never mutates silently.**

**OPEN — Connor deferred to Claude's recommendation:** which GUI shell. FreeCADGui is a desktop
Qt app; the platform is Cloudflare Workers + web, so embedding it means desktop/Electron or a
streamed session. The alternative is a web-native Three.js workspace. **Connor asked to survey
competitors (Leo AI, Zoo/KittyCAD text-to-cad, and similar) as directional signals before
choosing.** Research and recommend.

**The moat:** the calc engine originates numbers; the LLM orchestrates and transcribes and
**can never invent a dimension**. Deterministic (OCC validity) + vision (SENTINEL) gates.
The corpus grounds the method. Generative/mesh engines (Meshy, Blender, Spline) are walled off
from load-bearing parts — concept/viz only. Multi-engine (build123d / CadQuery / OpenSCAD /
FreeCAD) routed by DRAFTER (31C), toggle-selectable, tagged authoritative vs concept.

---

## ANSWER THESE 5 FIRST (from live state)

1. **ll-cockpit** `main` HEAD SHA. Any merges since 2026-07-13?
2. **Corpus:** has `pump_hydraulic_design` been ingested into `ATLAS_RAG`? (`POST
   /api/atlas/query` for "impeller diameter head coefficient Stepanoff" — is it a hit?)
3. **`engineering-calcs`:** does `generateShaftGeometry` still contain `2.5 * Math.sqrt(power)`
   and `if (shaftDiameter < 1)`? If yes, the calc rewrite has NOT run.
4. **Live D1 CAD board:** current actionable CAD-vertical `todo` count (was ~34 across
   Sprints 30 / 31 / 196).
5. **`EXEC_SECRET`** — rotated? (It was exposed in a transcript. Connor has deprioritized this;
   report it once, do not nag.)

---

## BOARD / DEBT
- **NEW SPRINT NEEDED (Connor requested):** per-user RAG upload + automated ingestion pipeline
  — upload UI → R2 → PDF/DOCX text extraction → per-user Vectorize namespacing
  (`user_id` / `tenant_id` metadata filter) → session auth (NOT the shared secret) → ingestion
  status via `knowledge-embed-queue` → corpus management (list / reindex / delete; a `purge`
  route already exists). **Seed this to D1.**
- Board hygiene held for Connor: **30J relabel** (its ID collides with a shipped 30J; this row
  IS the GUI-workspace sprint); **"Sprint 31 — Voice AI Agents" reband** (not CAD).
- Debt: hardcoded ingest secret; `bearing-catalog.ts` SKF C/C0 values are **DRAFT — PE-verify**;
  the part name never reaches the drawing title block; the general tolerance ±0.25 mm is a
  **placeholder awaiting Connor's value**; `cad-drawing` artifacts are not `sentinel_pass`
  stamped (convergence stamps only `cad-model`).

## TEST SPEC (browser console, logged into the cockpit — note snake_case `max_cycles`)
```javascript
const r = await fetch('/api/cad/requests', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    spec: 'Design a centrifugal pump shaft per API 610. Service: 150 HP at 3560 RPM, overhung impeller. Impeller weight 85 lb, radial load 1200 lbf at the impeller. Bearing span 14 in, impeller overhang 6 in. Material AISI 4140 steel.',
    max_cycles: 3
  })
});
console.log(await r.json());
```
Then read `artifact_registry` / `tool_call_log` / `agent_subtasks` (column is **`error_log`**,
not `error`) by `pipeline_run_id` in D1.
