# NEXUS — Session Context

**Regenerated:** 2026-07-13, session close (ATLAS corpus repair + shaft foundations).
**Supersedes** all prior `nexus_session_context.md`.

> **Authority order: live code (GitHub MCP, branch ref) and live D1 FIRST. This doc second.**
> Verify before you build on anything here.

---

## LIVE HEADS (verified at session close)

| Repo | main HEAD | Note |
|---|---|---|
| `ll-cockpit` | `ab11f6d7433d89a8104a533c09af4b71dd13dfd8` | PR #207 merged (`c171387`) |
| `engineering-calcs` | `a48b9e13252bf189a4a7c0464889d2581a4e64e7` | PR #10 merged (`665a0c4`) |

Canonical URL: **`https://ll-cockpit.connorpattern.workers.dev`**
*(`cockpit.leadershiplegacydigital.com` does NOT resolve. Do not use it.)*

---

## CURRENT SLICE / SPRINT GOAL

**PR-2 — the `shaft-geometry.ts` rewrite.** Single front. Nothing else is queued ahead of it.

`generateShaftGeometry()` sizes a 150 HP / 3560 rpm pump shaft at **1.0 in**. API 610 demands
**~3.5 in** — **deflection governs, not stress**. Every module the rewrite needs now exists, is tested,
and is merged. **It is sitting unused.** PR #10 deliberately did not touch `shaft-geometry.ts`.

**Blob SHA of the broken file: `4ffacc1fe86ca97b13a732392891052b1a7b6154`.** If that hash still matches
at session open, nothing has changed and the six defects are all still live.

---

## LOCKED (do not reopen without cause)

- **PE-signed API 610 constants.** Verified against the physical standard AND independently corroborated by Karassik. See kickoff rev 14. Not up for renegotiation.
- **Conservative hydraulic corner:** `KM2 = 0.10`, `EPSILON2 = 0.90`. Connor's call. `KU = 1.0` (cancels out of radial load).
- **Vectorize is a derived cache.** D1 is truth, R2 is source. Anything in the index must be rebuildable from R2 + code with zero human input.
- **GUI: web-native, not FreeCAD-embedded.** Standing recommendation. But `30AK` (parametric handoff) **outranks** `30J` (Three.js canvas) — a parametric handoff with no GUI beats a beautiful GUI over a dead STEP.
- **Deflection station `x = 0`** (free-end conservative bound) until 196C interrogation supplies a real seal-face station. The Lobanoff module is already parameterized on `x`, so that upgrade is zero-code-change.

---

## ATLAS CORPUS — healthy for the first time

| | |
|---|---|
| Index | `atlas-engineering` — **1024-dim cosine**, `@cf/baai/bge-large-en-v1.5`, **512-token cap** |
| Vectors | **81** — and the D1 ledger agrees: `expected_vector_count = 81` |
| Docs | 14 docs / 19 rows (`rag_documents`) |
| Eval | **18/18** (was 15/18) |

**Do not confuse indexes.** `nexus-knowledge` is **768-dim / bge-base**. Different index, different model.

New this session (R2-first, `r2_key` populated, `oversized_count: 0`):
`pump_hydraulic_design` (8) · `pump_shaft_mechanical_design` (12) · `engineering_drawings_gdt` (20)

---

## CAD PIPELINE — what actually exists

Verified from `artifact_registry`, not memory:

| format | type | count |
|---|---|---|
| `svg` | cad-drawing | 103 |
| `glb` | cad-model | 98 |
| `step` | cad-model | 95 |
| `dxf` | cad-drawing | 80 |
| **`pdf`** | — | **0** |
| **`stl`** | — | **0** |

**PDF has never been generated.** Sprint 30S ("STL + STEP + DXF + PDF") is **NOT done** despite looking
done — and 30V (spec-sheet PDF) sits directly on top of it.

Working end-to-end: intake → calc → MODELER → Gate A → nexus-exec (FreeCAD headless) → Gate B →
CAD-REVIEWER → converge/self-heal → GLB + STEP + SVG + DXF → R2 → `artifact_registry` → `/cad/[runId]`.
`cad_convergence_runs`: 24 converged / 2 exhausted / 3 failed / **3 orphaned in `running`** (~11h stale).

**The pipeline works. The pipeline is also wrong** — it produces a *file*, not an *answer*, because the
calc feeding it is broken.

---

## CODE MAP — the parts that matter now

### `engineering-calcs` · `src/modules/shafts/`
```
shaft-geometry.ts      4ffacc1f   ← BROKEN. 6 defects. NO TEST FILE.
shaft-stress.ts                     calculateTorqueFromPower, calculateDiameterForCombinedLoading
shaft-deflection.ts                 calculateRequiredDiameter
critical-speed.ts                   calculateDiameterForCriticalSpeed
radial-thrust.ts                    K_r Stepanoff — PE-VALIDATED. Read it, call it, do not edit it.
seal-chamber.ts        NEW ✅       API 610 Table 7, all 10 rows. selectSealChamber, minimumOverhang
overhung-deflection.ts NEW ✅       Lobanoff Ch.16 p.340. Parameterized on x. Stepped (I_A / I_B).
impeller-sizing.ts     NEW ✅       Ns, D2, Cm2, b2. Conservative corner.
```

> **`shaft-geometry.ts` is the ONLY file in `shafts/` without a test.** It is also the most broken file
> in the repo. That is not a coincidence — it is the diagnosis.

Other modules: `bearings/` · `bolts/` · `columns/` · `gears/` · `junctions/` · `nozzles/` · `plates/` ·
`springs/` · `system/` · `vessels/`

**`bearings/` contains an existing L10 implementation. PR-2 C4 must CALL it, not reimplement it.**

### `ll-cockpit` · `src/lib/atlas/`
```
ingest-core.ts    shared by /ingest AND /seed-corpus. Page-scoped IDs + D1 ledger write.
                  DO NOT let the two routes drift — that is why the core is shared.
corpus-seed.ts    16 entries / 11 docs / 41 chunks. THE SSOT for the seeded corpus.
chunker.ts        splits on `## `. Flags oversized; does NOT split them.
retrieve.ts       RRF merge — scores are 1/(60+rank+1), a RANK CONSTANT, not a quality score.
rewriter.ts       query expansion. Measured delta = 0 (kept for scale).
```

Routes: `/api/atlas/{ingest, seed-corpus, verify, query, eval, purge, corpus}`
D1 (migration 0062): `rag_documents`, `rag_chunks`, `idx_rag_chunks_doc`

---

## ENVIRONMENT

- D1: `831eeccf-60bc-4378-8a3b-71dfb910756e` (`ll-cockpit-db`)
- R2: `ll-cockpit-r2` — corpus at `atlas-corpus/*.md`
- `$SEC = engineering-30b` — **hardcoded in a public repo. Debt.**
- **No Vectorize MCP.** Cloudflare MCP here is the *bindings* server (D1/KV/R2/Workers/Hyperdrive).
  Corpus reads go through D1 (`rag_documents`) or the HTTP routes.
- **PowerShell 5.1:** `&&` invalid → use `;`. Bare `curl` is `Invoke-WebRequest` → use **`curl.exe`**.
  **`wrangler r2` defaults to LOCAL → always `--remote`.**
- Free-plan Workers: **50 subrequests per invocation.** Window anything that fans out.
- Vectorize is **eventually consistent**. Never query in the same breath as a write.

---

## OPEN DEBT

1. **`engineering-30b`** gates *writes* to the engineering corpus and is hardcoded in a public repo. The failure mode isn't a leaked key — it's **silently wrong engineering shipped under a PE seal.** Needs session auth + Worker secret.
2. **4 corpus content defects** (2 red) — see kickoff rev 14. Idempotent re-ingests.
3. **3 orphaned `cad_convergence_runs`** stuck in `running`. Reaper (PR #205) only fires on modeler-subtask failure.
4. **Supabase fossil KB** — `sprint_items` (36), `study_nodes` (173). Nobody reads it. Split-brain.
5. **Qwen reseed hazard** — `seed.ts` / `nexus_model_routing_seed.sql` reference models removed from live `ai_routing_policy`. Will reintroduce on any reseed.
6. **Split-brain model registry** — live router uses `claude-sonnet-4-5`; Thompson sampling registers different strings.
7. **`runCadScript`'s `NEXUS_EXEC.fetch` unbounded.** Hardening slice queued.
8. **Open PE question:** `Ku`/`Km2` are *radial-impeller* correlations, but the Ns warning band is 500–4000. The pump test duty runs at **Ns = 1562 (Francis/mixed-flow)**. Validity band may be narrower than the warning band.

---

## HOW WE WORK (earned today, not theoretical)

- **Never trust a self-report.** Claude Code said it pushed `feat/shaft-foundations`; GitHub had `claude/session-780zay`. `chunks_ingested: 41` while the index held 30. Verify at the live branch head. Every time.
- **`changes:1` is not proof.** `SELECT` read-back on the specific rows.
- **A store you cannot enumerate is a store you cannot trust.** An 11-chunk hole hid for six weeks and cost two sprints purely because Vectorize has no list primitive.
- **The corpus cannot verify itself.** Retrieving a clause number at 0.81 proves the ingest worked, not that API 610 says it. **Primary source or nothing.**
- **The LLM never originates engineering numbers.** Transcribe from a standard. When there's no source, say so and stop — don't invent a correlation.
- **Conservative ≠ safe.** Non-conservative errors are the silent ones. The bearing-life bug would have passed pumps failing API 610 by 40%, forever, quietly.
- Max 4 commits per PR. 3 audit passes before Connor sees a prompt. Connor holds merge/deploy/destructive authority — **including migrations.**
