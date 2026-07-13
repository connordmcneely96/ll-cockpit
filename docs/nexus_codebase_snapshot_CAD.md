# NEXUS — Codebase Snapshot: CAD Vertical

**Regenerated:** 2026-07-13 from **live GitHub + live D1**, not from the previous snapshot.
This file lags reality the moment it is written. **It is a hint, never an authority.**
Authority = GitHub MCP at `refs/heads/<branch>` and D1 `SELECT`.

| Repo | main HEAD at regen |
|---|---|
| `ll-cockpit` | `ab11f6d7433d89a8104a533c09af4b71dd13dfd8` |
| `engineering-calcs` | `a48b9e13252bf189a4a7c0464889d2581a4e64e7` |
| `nexus-exec` | *(not re-read this session — verify before relying)* |

---

## 1. `engineering-calcs` — the calc engine

Hono worker. **Hard CI gate: `npm run typecheck` + `npm test` (vitest) before deploy.**

### `src/modules/shafts/` — the active front

| File | Blob | State |
|---|---|---|
| **`shaft-geometry.ts`** | `4ffacc1f` | 🔴 **BROKEN — 6 defects. NO TEST FILE.** |
| `shaft-stress.ts` | `4ae94b6d` | ok — `calculateTorqueFromPower`, `calculateDiameterForCombinedLoading(…, SF)` |
| `shaft-deflection.ts` | `28c4c9ba` | ok — `calculateRequiredDiameter` |
| `critical-speed.ts` | `6a7861a3` | ok — `calculateDiameterForCriticalSpeed` |
| `radial-thrust.ts` | `1e61675d` | ✅ **PE-VALIDATED** (Stepanoff `K_r`). Call it. **Never edit it.** |
| `seal-chamber.ts` | `7e660c04` | ✅ NEW — API 610 **Table 7**, all 10 rows |
| `overhung-deflection.ts` | `40bcae22` | ✅ NEW — **Lobanoff** Ch.16 p.340 |
| `impeller-sizing.ts` | `b3e2f91e` | ✅ NEW — `Ns`, `D2`, `Cm2`, `b2` |

Tests exist for: `impeller-sizing`, `overhung-deflection`, `radial-thrust`, `seal-chamber`.

> 🔴 **`shaft-geometry.ts` is the ONLY file in `shafts/` with no test.** It is also the most broken.
> **That is the diagnosis, not a coincidence.** PR-2 must ship `shaft-geometry.test.ts`.

### The 6 live defects in `shaft-geometry.ts`
1. `radialLoad` fallback `2.5 * Math.sqrt(power) * applicationFactor` → **~46 lbf for a 150 HP pump.** Non-physical. **Delete. No fallback — throw.**
2. `if (shaftDiameter < 1.0) shaftDiameter = 1.0` — arbitrary floor masking #1.
3. `calculateDiameterForCombinedLoading(..., 2.0)` — hardcoded SF; ignores `applicationFactor`.
4. Deflection limit `0.005` → must be **`0.002`** (API 610 §6.9.1.3).
5. Critical target `speed * 1.4` → **`1.20`** wet / **`1.30`** dry (§6.9.1.2, §3.1.8).
6. **Profile inverted:** `bearingDiameter1 = shaftDiameter * 1.2` puts bearing seats **above** the body. **Unassemblable.**

Plus: impeller `D2`/`b2` arrive **fabricated by an LLM**. They are DESIGN OUTPUTS. PR-2 must derive them
and override anything supplied unless `impellerSource === 'vendor'`.

### New module surfaces (merged, tested, **not yet wired**)
```ts
// seal-chamber.ts
API610_TABLE_7: readonly SealChamber[]              // 10 rows, transcribed from the standard
selectSealChamber(shaftDiameterAtSeal): SealChamber // smallest chamber where d1 >= shaft Ø. Throws > 4.331 in
minimumOverhang(chamber): number                    // = chamber.totalLengthMin  ← THE OVERHANG FLOOR
isBelowStandardOverhungSize(chamber): boolean       // size < 3 (footnote d)

// overhung-deflection.ts
momentOfInertia(d): number                          // π d⁴ / 64
overhungDeflection({ W, E, A2, B, x, D_A, D_B })    // Lobanoff. 0 <= x <= A2, else throws.
//   Y = (W/3E)(A2³/I_A + A2²B/I_B) − (W/3E)[ x(3A2²/2I_A + A2·B/I_B) − x³/2I_A ]
//   W = impeller weight PLUS radial thrust (not thrust alone)
//   Y(A2) = 0 exactly, for ANY D_A/D_B. Y(0) = classic free-end. Monotonic in between.

// impeller-sizing.ts
deriveImpellerGeometry({ head, flow, speed }): ImpellerGeometry
//   KU=1.0 (cancels out of radial load) · KM2=0.10 · EPSILON2=0.90  ← conservative corner
```

### `src/types.ts` — new, additive
`Assumption` · `Check` (**`citation` is REQUIRED**) · `SealChamber` · `ImpellerGeometry`
**`ShaftGeometryParams` / `ShaftGeometryResult` are UNCHANGED** — PR-2 extends them.

### Other calc modules
`bearings/` · `bolts/` · `columns/` · `gears/` · `junctions/` · `nozzles/` · `plates/` · `springs/` ·
`system/` · `vessels/`

> **`bearings/` already contains an L10 implementation.** PR-2 C4 must **read it and call it**, not
> reimplement. Its export signature was not captured this session — read before writing.

### The coupled loop PR-2 must build
```
shaft Ø  →  selectSealChamber()  →  minimumOverhang()  →  overhungDeflection()  →  shaft Ø
```
Bigger shaft → bigger chamber → **longer** overhang → **more** deflection. `d⁴` helps; `A2³` fights back.
**It converged on the pump test duty. It may not on a longer span or heavier impeller.**
**PR-2 MUST detect non-convergence and fail loudly.**

---

## 2. `ll-cockpit` — hub

### `src/lib/atlas/` — ATLAS RAG
| File | Note |
|---|---|
| `ingest-core.ts` | Shared by `/ingest` **and** `/seed-corpus`. Page-scoped IDs + D1 ledger write. **Do not let the routes drift — that is why the core is shared.** |
| `corpus-seed.ts` | 16 entries / 11 docs / **41 chunks**. **SSOT for the seeded corpus.** |
| `chunker.ts` | Splits on `## `. **Flags** oversized chunks; does **not** split them. |
| `retrieve.ts` | RRF merge. **Scores are `1/(60+rank+1)` — a RANK CONSTANT, not a quality metric.** |
| `rewriter.ts` | Query expansion. Measured delta = **0**. Kept for scale. |

Vector ID scheme: **`${doc}::p${page ?? 0}::${chunk_index}`** — page-scoped. Idempotent.
*(The old `${doc}::${chunk_index}` scheme silently destroyed 11 chunks over 6 weeks.)*

Routes: `/api/atlas/` → `ingest` · `seed-corpus` (`?from=&to=`) · `verify` · `query` · `eval` (`?from=&to=`) · `purge` · **`corpus`** (new)

Auth: `?secret=engineering-30b` — **hardcoded in a public repo. This is the top debt item.**

### CAD pipeline
intake → calc → MODELER → **Gate A** → `NEXUS_EXEC` (FreeCAD headless, sandbox `'cad-exec'`) → **Gate B**
→ CAD-REVIEWER → converge / self-heal → artifacts → R2 → `artifact_registry` → `/cad/[runId]`

**Do not rebuild the drawing engine. It works.** FreeCAD TechDraw headless, Y14.5 dimension placement,
pan/zoom deliverable page. The FreeCAD headless facts were expensive — they are in the kickoff.

---

## 3. D1 — `ll-cockpit-db` (`831eeccf-60bc-4378-8a3b-71dfb910756e`)

| Table | Note |
|---|---|
| `rag_documents` | **NEW (0062).** PK `(tenant_id, doc, page)`. `SUM(chunk_count)` = expected vectorCount. |
| `rag_chunks` | **NEW (0062).** PK `(tenant_id, doc, page, chunk_index)`. Mirrors `vector_id` exactly. |
| `artifact_registry` | `format` / `artifact_type`. **`pdf` = 0 rows. `stl` = 0 rows.** |
| `cad_convergence_runs` | 24 converged / 2 exhausted / 3 failed / **3 orphaned in `running`**. **Check for `running` orphans before any index rebuild.** |
| `sprint_items` | Board. Filter `deleted_at IS NULL`. **Sprint labels live in `title`** — search `title LIKE '%30S%'`. |
| `atlas_query_log` | `input_preview` / `result_preview`. Essential for diagnosing what tools actually received. |
| `agent_subtasks` | Error is in **`error_log`**, not `error`. |
| `ai_routing_policy` | **Live truth for task_types.** Not the seed file. |

Gotchas: multi-statement SQL returns **only the last result set**. `WHERE category != 'x'` silently drops
NULLs — use `OR category IS NULL`.

---

## 4. Bindings — from live `wrangler.toml` / dashboard

`AI` · `ASSETS` · **`ATLAS_RAG`** (Vectorize `atlas-engineering`, **1024/cosine**) · `DB` (D1) ·
`ENGINEERING_CALCS` (service) · `KNOWLEDGE_QUEUE` · `KNOWLEDGE_VECTORIZE` (**768**) · `KV` ·
**`NEXUS_EXEC`** (service) · `ORACLE_VECTORIZE` (768) · `R2` (`ll-cockpit-r2`) · `SUBTASK_QUEUE`

> **`atlas-engineering` is 1024-dim / `bge-large-en-v1.5`. `nexus-knowledge` is 768-dim / `bge-base`.**
> **Different indexes. Different models. NEVER cross them.**

**Never invent a binding.** Live `wrangler.toml` is authoritative; `nexus_wrangler_master.toml` lags.

---

## 5. Agents

`NEXUS` `SCOUT` `INTAKE` `FORGE` `BUILDER` `ATLAS` `HERALD` `REEL` `SENTINEL` `DISPATCH` `ANCHOR`
`ORACLE` `HERMES` **`MODELER`** **`CAD-REVIEWER`**

> `MODELER` and `CAD-REVIEWER` exist **only in live `src/lib/agents.ts`** — there is no `agent_modeler.md`
> or `agent_reviewer.md`. **Real doc gap.** Never invent an agent; read `agents.ts`.

---

## 6. What this snapshot cannot tell you

- `nexus-exec` internals — not re-read this session.
- `bearings/` export signatures — **read before PR-2 C4.**
- `ll-cockpit-studio` — untouched, out of scope for CAD.
- Anything that changed after `ab11f6d7` / `a48b9e13`.

**When this file and live state disagree, live state wins. Always.**
