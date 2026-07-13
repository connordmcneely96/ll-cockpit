# NEXUS — Next Session Kickoff (rev 14)

**Written:** 2026-07-13, end of the ATLAS-corpus / shaft-foundations session.
**Mode:** B (Senior Engineer). Single front: **PR-2, the shaft-geometry rewrite.**

> **Authority order: live code (GitHub MCP, branch ref) and live D1 FIRST. This doc second.**
> Rev 13 contained a false claim (see "Corrections to rev 13"). Trust nothing here you can verify.

---

## THE FIVE VERIFICATION QUESTIONS

Answer from **live state**, not from this doc, before proposing anything:

1. **`ll-cockpit` main HEAD SHA.** Any merges after #207 (`c171387`, merged 2026-07-13 06:57 UTC)?
2. **`engineering-calcs` main HEAD SHA.** Any merges after #10 (`665a0c4`, merged 2026-07-13 17:50 UTC)?
3. **`curl.exe -s "$BASE/api/atlas/corpus?secret=$SEC"` — does `expected_vector_count` still read 81?**
   And does `wrangler vectorize info atlas-engineering` agree? *(They agreed at session close.)*
4. **Does `engineering-calcs` `shaft-geometry.ts` still contain `2.5 * Math.sqrt(power)` and `if (shaftDiameter < 1)`?**
   *(It did at session close — PR #10 deliberately did not touch it.)*
5. **Actionable CAD-vertical `todo` count in D1** (sprints 30, 31, 196; exclude the mis-banded
   `Sprint 31 — Voice AI Agents` row). *(41 at session open; 30AB closed, 30AK added.)*

Also report once, don't nag: **`EXEC_SECRET` rotated?** And `engineering-30b` is still hardcoded
in `src/app/api/atlas/ingest/route.ts` in a public repo.

---

## WHERE THINGS STAND

### ✅ Done this session
- **ATLAS vector-ID collision fixed + index rebuilt.** 41 = 41, then 81 = 81 after new docs. Eval **15/18 → 18/18**.
- **D1 corpus ledger live** (`rag_documents`, `rag_chunks`, migration 0062). The corpus is enumerable for the first time. `GET /api/atlas/corpus`.
- **3 new corpus docs ingested**, R2-first: `pump_hydraulic_design` (8), `pump_shaft_mechanical_design` (12), `engineering_drawings_gdt` (20). All `oversized_count: 0`.
- **PE gate cleared** against the physical API 610. Four foundation modules merged (`engineering-calcs` #10), 127 tests green.

### 🎯 THE SINGLE NEXT THING: PR-2 — shaft-geometry rewrite

`generateShaftGeometry()` is **untouched and still wrong**. It sizes a 150 HP / 3560 rpm pump shaft at
**1.0 in**; API 610 demands **~3.5 in**. Six defects, all still live:

1. `radialLoad` falls back to `2.5 * Math.sqrt(power) * applicationFactor` — ~46 lbf for a 150 HP pump. **Non-physical. Delete it. No fallback — throw instead.**
2. `if (shaftDiameter < 1.0) shaftDiameter = 1.0` — arbitrary floor masking #1. Delete.
3. `calculateDiameterForCombinedLoading(..., 2.0)` — hardcoded SF ignores `applicationFactor`.
4. Deflection limit `0.005` → must be **`0.002`** (§6.9.1.3).
5. Critical-speed target `speed * 1.4` → **`1.20`** wet / **`1.30`** dry (§6.9.1.2, §3.1.8).
6. **Profile inverted.** `bearingDiameter1 = shaftDiameter * 1.2` makes bearing seats LARGER than the body. Unassemblable.

Plus: impeller `D2`/`b2` were **fabricated by an LLM** and passed in. They are DESIGN OUTPUTS.

**PR-2 plan (4 commits, max — respect the rule):**
- **C1** — Kill the placeholder. Resolve `radialLoad` from `deriveImpellerGeometry()` when (head, flow, speed) present; accept vendor `D2`/`b2` **only** when `impellerSource === 'vendor'`; otherwise **throw `insufficient_inputs`**. Add impeller weight to `W` (Lobanoff: `W` = impeller weight **plus** radial thrust).
- **C2** — Sizing criteria + the **coupled convergence loop** (shaft Ø → `selectSealChamber()` → `minimumOverhang()` → `overhungDeflection()` → shaft Ø). Populate `checks[]`, every entry with a citation. **MUST detect non-convergence and fail loudly** — `d⁴` helps but `A2³` fights back; it converged on the test duty but may not on a longer span or heavier impeller.
- **C3** — Un-invert the profile. **Hard invariant (assembly geometry, not judgment): diameters decrease monotonically from the body toward BOTH ends.** Assert `bearingSeatDiameter <= bodyDiameter` — the exact inversion that shipped. Any step *ratio* used is an **assumption**, declared, not a standard.
- **C4** — Bearing **SYSTEM** life, §6.10.1.11 Eq. (3). **Read `src/modules/bearings/` first — an L10 impl exists. Call it, don't reimplement.** Test: `bearingSystemLife([25000, 25000]) ≈ 15,749 h` — **below both limits.** That assertion *is* the bug.

**Deflection station:** use `x = 0` (free end) as the **conservative bound** — it upper-bounds deflection
at any seal station, since `Y` decays monotonically to zero at the bearing. Declare it in `assumptions[]`.
The Lobanoff module is already parameterized on `x`, so **196C interrogation tightens this to the true
value with zero code change.**

### Then
Re-fire the pump spec (150 HP / 3560 rpm / 300 ft / 1000 gpm / SG 1.0 / single volute / AISI 4140) and
confirm the shaft comes out ~3.5 in with **deflection governing**, not 1.0 in.

---

## PE-SIGNED CONSTANTS — verified against the physical standard. Do not adjust.

| Constant | Value | Clause |
|---|---|---|
| Shaft deflection at primary seal faces | **0.002 in** | API 610 **6.9.1.3** |
| 1st dry critical / MCS, wet | **1.20×** | **6.9.1.2**, **3.1.8** |
| 1st dry critical / MCS, dry-capable | **1.30×** | **3.1.8** |
| Bearing **SYSTEM** L10h, rated | **25,000 h** | **6.10.1.11** |
| Bearing **SYSTEM** L10h, max loads | **16,000 h** | **6.10.1.11** |
| Per-bearing L10h method | ABMA 9 / ISO 281 | **6.10.1.10** |
| `KU` head coefficient | 1.0 (range 0.95–1.10) | *cancels out of radial load* |
| `KM2` | **0.10** (conservative; 0.10–0.13) | Lobanoff |
| `EPSILON2` | **0.90** (conservative; 0.90–0.95) | Lobanoff |
| `K_r` single volute @ shutoff | 0.36 | Stepanoff — already PE-validated in `radial-thrust.ts` |

**Karassik independently corroborates the first five.** Two sources, identical values.

### The bearing-life trap — do not lose this
**§6.10.1.11 gates the SYSTEM life, not per-bearing.** Two bearings at 25,000 h each →
system ≈ **15,749 h**, which FAILS both limits. **Gating per-bearing at 25,000 h passes pumps that fail
API 610 by ~40%.** The ~40,000 h/bearing figure in the NOTE is a NOTE, **not a threshold**.

---

## CORRECTIONS TO REV 13 (this doc's predecessor lied)

- ❌ *"Retrieval scores ~0.0164 → corpus too thin."* **False.** `0.0164 = 1/61` — an **RRF rank constant**
  (`1/(60+rank+1)`), identical on every query in the corpus. It carries **zero** information about
  quality. Cosine scores (0.79–0.87) are the real signal. The corpus was never "thin" — it was **27% deleted**.
- ❌ Bearing life cited as **§6.10.1**, per-bearing, 25,000 h. **Wrong clause AND wrong requirement.** See above.

---

## CORPUS DEFECTS — queued, not yet fixed

Fix in R2, then `POST /api/atlas/ingest` with the same `doc` (idempotent, overwrites in place):

1. 🔴 **`pump_rotordynamics` p1** — *"≥15% below / ≥25% above per typical API practice."* **Not API practice.** Contradicts the correct §3.1.8 chunk and will compete with it on every critical-speed query. Also gives `ω_c ≈ √(48EI/ML³)` — simply-supported central mass, **wrong model for an overhung rotor**. Kill.
2. 🔴 **`pump_shaft_mechanical_design` §7** + **`pump_hydraulic_design` §6** — bearing life cited as `6.10.1`, stated per-bearing. Correct to **§6.10.1.10 / §6.10.1.11** and **system** life.
3. 🟡 **`pump_hydraulic_design` §2** — *"a lower Ku yields a larger, more conservative impeller."* **Backwards.**
4. 🟡 **`pump_shaft_mechanical_design` §(c)** — unimplementable deflection section. **Superseded by Lobanoff** (now in code).

---

## THE BOARD — it lies in three directions

**~8 sprints stand between you and a Cascade demo.** Not 41.

**Real queue:** PR-2 · **30AK parametric handoff** · 196D calc-before-geometry · 196C interrogation ·
30W inline citations · 30X compliance checker · 30U BOM · 30V spec-sheet PDF · 30M project classifier ·
30N Cascade validation.

**🔴 30S is NOT done.** Live `artifact_registry`: `svg 103 · glb 98 · step 95 · dxf 80 · **pdf 0** · **stl 0**`.
**PDF has never been generated once** — and 30V sits on top of it.

**Board hygiene not yet executed (Connor's call — judgment, not fact):**
- **Defer/supersede the VR block:** `30AC` voice, `30AD` WebXR, `30AE` Jarvis loop, `30AF` spatial
  annotations, `30AG` DO sync, and the 6-sprint `PROGRAM — Phase C-8 VR/XR`. Hand-tracking is not the
  constraint on a product that sized a shaft at one inch this morning.
- **Evict the squatter:** `Sprint 31 — Voice AI Agents (VAPI/Retell competitor)` is not CAD. Reband.
- **30AH self-heal** is `in_progress` but the converge loop is live (24 converged / 2 exhausted / 3 failed). Probably closable — verify first.

### 30AK — the item that wasn't on the board
You emit a **dead STEP**. The client cannot change a dimension. Leo AI returns a **live parametric feature
tree**. The design intent (build123d script + calc-derived parameters) **already exists inside the
pipeline and is discarded at the last step.** Persist it to R2 + `artifact_registry`, expose on
`/cad/[runId]`. **This is a serialization change, not a GUI project — and it outranks 30J (Three.js canvas).
A parametric handoff with no GUI beats a beautiful GUI over a dead STEP.**

**GUI decision (standing):** web-native, **not** FreeCAD-embedded. Embedding means a desktop binary, GPL
entanglement, and abandoning the Cloudflare edge. But the *real* question is where Cascade's engineers
already live — find that out before building any shell.

---

## STANDING RULES (earned, not theoretical)

- **Never trust a self-report.** Claude Code said it pushed `feat/shaft-foundations`; GitHub had
  `claude/session-780zay`. Verify at the live branch head, every time.
- **`changes:1` is not proof.** Read back with a `SELECT` on the specific rows.
- **A store you cannot enumerate is a store you cannot trust.** D1 is truth, R2 is source, Vectorize is a
  derived cache. Anything in Vectorize must be rebuildable from R2 + code with zero human input.
- **The corpus cannot verify itself.** Primary source or nothing.
- **The LLM never originates engineering numbers.** Transcribe from a standard; never invent a correlation.
  When there's no source, say so and stop.
- **Conservative ≠ safe.** Non-conservative errors are the silent ones. They ship.
- **Max 4 commits per PR.** Hot files claimed. 3 audit passes before Connor sees a prompt.
- **PowerShell 5.1:** `&&` is invalid — use `;`. Bare `curl` is `Invoke-WebRequest` — use **`curl.exe`**.
  **`wrangler r2` defaults to LOCAL — always pass `--remote`.**
- **Free-plan Workers cap: 50 subrequests per invocation.** Window anything that fans out.
- **Vectorize is eventually consistent.** Never query in the same breath as a write. `vectorCount` lags.

---

## ENVIRONMENT

- `$BASE = https://ll-cockpit.connorpattern.workers.dev` *(the custom domain does NOT resolve)*
- `$SEC = engineering-30b` *(hardcoded in a public repo — debt)*
- D1: `831eeccf-60bc-4378-8a3b-71dfb910756e` (`ll-cockpit-db`)
- Vectorize: `atlas-engineering` — **1024-dim cosine**, `@cf/baai/bge-large-en-v1.5`, **512-token cap**.
  *(`nexus-knowledge` is 768-dim / bge-base — **different index, different model. Never cross them.**)*
- R2: `ll-cockpit-r2`, corpus at `atlas-corpus/*.md`
- **No Vectorize MCP.** The Cloudflare MCP here is the *bindings* server (D1/KV/R2/Workers/Hyperdrive).
  Corpus reads go through D1 (`rag_documents`) or the HTTP routes.
