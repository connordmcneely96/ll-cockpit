# Changelog — 2026-07-13 · ATLAS corpus repair + shaft foundations

**Session type:** Mode B (Senior Engineer)
**Merged:** ll-cockpit **#207** (`c171387`) · engineering-calcs **#10** (`665a0c4`, +437/7 files)

---

## Headline

Went in to ingest 3 corpus docs. Found and killed **four silent, ship-blocking defects**. Every one of
them would have printed correct-looking engineering under a PE seal.

| Defect | Nature | Age |
|---|---|---|
| 11 corpus chunks silently overwritten in Vectorize | data destruction | ~6 weeks |
| 2 sprints spent tuning retrieval over deleted data | wasted work | 30C + 30D |
| Bearing-life gate wrong in the **non-conservative** direction | would pass failing pumps | since corpus authored |
| Pump shaft undersized by **3.5×** | 1.0 in shipped; API 610 wants ~3.5 | since shaft-geometry authored |

---

## 1. ATLAS vector-ID collision (ll-cockpit #207)

### Root cause
`ingest-core.ts` built vector IDs as `` `${doc}::${chunk_index}` ``. `chunkDocument()` restarts
`chunk_index` at 0 every call, and `corpus-seed.ts` has **multiple entries per doc** distinguished only
by `page` — which lived in the *metadata*, not the *ID*. **Page 2 overwrote page 1.**

### Evidence
- `wrangler vectorize info atlas-engineering` → **vectorCount = 30**. Corpus authored **41**.
- Live retrieval returned `AISC360_structural::1` carrying **`page: 2`** content (§E3 sitting where §F2 belonged).
- `AISC360_structural::2` (page 1) *survived* — page 2 only had 2 chunks. Exactly the predicted mechanic.
- Independently reproduced from code: old scheme yields **30 unique IDs from 41 chunks**.

### The 11 destroyed chunks
AISC 360 §F2 (Flexural Mp) · pump **Affinity Laws** · **Shaft Critical Speed** · B31.3 §302.3 (A106-B
allowable) · NEMA §12.1 · AGMA Scope · and 5 more.

**The three eval questions failing since 30C map exactly onto three of these.** 30C called it a ranking
problem. 30D built a query rewriter to fix "recall" and measured **delta = 0** — because there was nothing
to recall. Two sprints spent optimizing retrieval over a **27%-deleted corpus**.

### Fix
- `19d2f97` — page-scoped IDs: `` `${doc}::p${page ?? 0}::${chunk_index}` ``. Idempotent. Regression test asserts no duplicate IDs across the whole corpus.
- `c56fb15` — **D1 corpus ledger**: `rag_documents` + `rag_chunks`, migration **0062**. Written only *after* a successful Vectorize upsert.
- `9c8f89c` — `GET /api/atlas/corpus` reconcile route (D1-only).
- `c171387` — window `seed-corpus` via `?from=&to=`. Ledger write took per-entry cost to 3 subrequests; 16 entries = 48 vs the free-plan cap of **50**.

### Rebuild executed
Index deleted + recreated (1024/cosine), re-seeded from code in 2 windows.
**Gate met: `vectorize info` = 41, `/api/atlas/corpus` `expected_vector_count` = 41.**

### Eval: 15/18 → **18/18**
All three "permanent" misses resolved on their own. They were never a ranking problem.

---

## 2. Corpus expanded — 41 → 81 vectors

3 new docs ingested **R2-first** (`atlas-corpus/*.md`), by `r2_key`, `oversized_count: 0` on all three:

| doc | chunks |
|---|---|
| `pump_hydraulic_design` | 8 |
| `pump_shaft_mechanical_design` | 12 |
| `engineering_drawings_gdt` | 20 |

Stepanoff/impeller query now returns `pump_hydraulic_design §2 Impeller Outside Diameter D2` @ 0.797.
Previously returned *Pipe Flow — Minor Losses*. **This is the hole that made MODELER fabricate D₂ = 12 in.**

---

## 3. PE gate — API 610 verified against the physical standard

| Constant | Value | Clause | Status |
|---|---|---|---|
| Shaft deflection at primary seal faces | **0.002 in** | **6.9.1.3** | ✅ verified |
| 1st dry critical / MCS (wet) | **1.20×** | **6.9.1.2**, **3.1.8** | ✅ verified |
| 1st dry critical / MCS (dry-capable) | **1.30×** | **3.1.8** | ✅ verified |
| Bearing **SYSTEM** L10h, rated | **25,000 h** | **6.10.1.11** | 🔴 **corpus was wrong** |
| Bearing **SYSTEM** L10h, max loads | **16,000 h** | **6.10.1.11** | 🔴 **corpus was wrong** |

### 🔴 The bearing-life error — the most dangerous find of the session
Corpus said *"L10 ≥ 25,000 h"* and cited **§6.10.1**. Both wrong.

- §6.10.1 is about **bearing arrangement**, not life. Life lives in **§6.10.1.10 / §6.10.1.11**.
- §6.10.1.11 gates the **SYSTEM** life via Eq. (3):
  `L10h_system = [ Σ (1/L10h_i)^(3/2) ]^(-2/3)`
- **Two bearings at 25,000 h each → system life ≈ 15,749 h.** That FAILS *both* the 25,000 h and the
  16,000 h limits. Gating per-bearing life at 25,000 h **passes pumps that fail API 610 by ~40%.**
- Per the §6.10.1.11 NOTE, meeting the system limit needs ~40,000 h **per bearing** — a NOTE, **not a threshold.**

**Non-conservative. Silent. Would have shipped.**

### Corroboration
**Karassik (Pump Handbook) independently confirms all three limits** — 0.002 in, 120% dry critical,
25,000 h / 16,000 h. Two independent sources, identical values.

---

## 4. Shaft foundations (engineering-calcs #10)

Four new modules. **`shaft-geometry.ts` zero diff** — nothing existing could break.

- **`seal-chamber.ts`** — API 610 **Table 7**, all 10 rows transcribed. Shaft Ø at seal → chamber size → `totalLengthMin` = **the overhang floor**.
- **`overhung-deflection.ts`** — **Lobanoff Ch.16 p.340**, deflection at *any* station `x` between impeller and inboard bearing. Stepped shaft (`I_A` overhang / `I_B` span). `W` = impeller weight **plus** radial thrust.
- **`impeller-sizing.ts`** — `Ns`, `D2`, `Cm2`, `b2`. Conservative corner `KM2=0.10`, `EPSILON2=0.90`.
- **`types.ts`** — `Assumption`, `Check` (citation **required**), `SealChamber`, `ImpellerGeometry`.

**127 tests green. Typecheck clean.**

### Key derivations (verified, not assumed)
1. **`Y(x = A2) = 0` — algebraically exact, for any `D_A`/`D_B`.** Substituting `x=A2` collapses `relief` into precisely `base`. The equation proves its own transcription.
2. **`Y(x = 0)`** = classic `W·A2²(A2+B)/(3EI)` to 1e-9.
3. **KU cancels out of radial load.** `b2 ∝ 1/D2` by continuity ⇒ `D2·b2` is independent of `D2`, and Stepanoff uses **only the product**. The 0.95–1.10 Ku uncertainty **does not reach the shaft.** Only `KM2·ε2` does (0.090 conservative vs 0.101 nominal ⇒ ±16% on radial load).

### The coupled loop (Karassik + Table 7 + §6.9.1.3)
> *"The seal chamber dimensions set the minimum overhang the pump can have and limit how stiff the shaft can be."*

Bigger shaft → bigger seal chamber → **longer** minimum overhang → **more** deflection. Shaft diameter
and overhang **fight each other**. Running it:

```
 d_seal  chamber  l_min   Y_free    vs 0.002 in
   1.75      4     6.50   0.02302      FAIL
   2.75      6     6.89   0.00433      FAIL
   3.50      8     7.28   0.00188      PASS  <-
```

**The shipped code produces 1.0 in. The standard demands ~3.5 in.** Deflection governs, not stress —
which is exactly why API 610 shafts are fatter than any stress calc would justify.

Also: the old test case (`overhang = 6 in`) is **physically impossible** — Table 7 requires ≥ 6.30 in of
seal-chamber length alone for any shaft above 1.575 in.

---

## Corpus content defects found (queued, not yet fixed)

1. 🔴 **`pump_rotordynamics::p1::1`** — *"≥15% below / ≥25% above per typical API practice."* **Not API practice.** Contradicts the live §3.1.8 chunk. Also gives `ω_c ≈ √(48EI/ML³)` — a simply-supported central-mass model, wrong for an overhung rotor. **Kill it.**
2. 🔴 **`pump_shaft_mechanical_design::p0::11`** + `pump_hydraulic_design::p0::6` — bearing life cited as `6.10.1`, requirement stated as per-bearing. **Both wrong** (see §3). Correct to §6.10.1.10/.11 and **system** life.
3. 🟡 **`pump_hydraulic_design::p0::2`** — *"a lower Ku yields a larger, more conservative impeller."* **Backwards.** `D2 = 1840·Ku·√H/N` ⇒ lower Ku gives a **smaller** D2.
4. 🟡 **`pump_shaft_mechanical_design::p0::5`** — hands you the free-end deflection formula, then says *"NOT at the free end."* Unimplementable as written. **Superseded by Lobanoff** (now in code).

All fixes are idempotent re-ingests: edit in R2 → `POST /api/atlas/ingest` with the same `doc`.

---

## Board writes (D1, read-back verified)

- `Sprint 30AB — glTF/GLB export` → **done** (98 GLB artifacts in `artifact_registry`).
- `Sprint 30AK — Parametric handoff` → **seeded, P1**. Highest-leverage unscheduled item.

### 🔴 Near-miss worth recording
Almost closed **Sprint 30S (multi-format export)** as shipped from memory. The registry says:
`svg 103 · glb 98 · step 95 · dxf 80 · **pdf 0** · **stl 0**`.
**PDF has never been generated.** And 30V (spec-sheet PDF) sits directly on top of it. 30S stays open.
*Same failure class as trusting `chunks_ingested`. The registry is truth; recollection is not.*

---

## Principles established

1. **A store you cannot enumerate is a store you cannot trust.** Vectorize has no list primitive. That single gap let an 11-chunk hole hide for six weeks and cost two sprints. **D1 is truth, R2 is source, Vectorize is a derived cache.**
2. **`chunks_ingested` was a self-report, not a receipt.** The route counted what it *sent*, not what *survived*. Same class as trusting Claude Code's "pushed" (it pushed to `claude/session-780zay`, not the branch name in the prompt).
3. **The corpus cannot verify itself.** Retrieving a clause number at 0.81 proves the ingest worked. It proves nothing about API 610. **Primary source or nothing.**
4. **RRF scores are not quality scores.** The `0.0164` figure in kickoff rev-13 is `1/(60+rank+1)` — a rank constant, identical on every query. It says nothing about corpus health. Cosine scores (0.79–0.87) are the real signal.
5. **Conservative ≠ safe.** The bearing-life error was *non-conservative* and therefore silent. Loud errors are cheap; quiet ones ship.

---

## Debt

- `EXEC_SECRET` / `engineering-30b` — the ingest secret is **hardcoded in a public repo** and is the *write* gate on the engineering corpus. Poison surface. Needs session auth + Worker secret.
- 3 orphan `cad_convergence_runs` stuck in `running` ~11h. Reaper (PR #205) only fires on modeler-subtask failure. Gap.
- Supabase carries a **fossil knowledge base** (`sprint_items` 36 rows, `study_nodes` 173). Nobody reads it. Split-brain waiting to confuse someone.
- `momentOfInertia` assumes a **solid** shaft. Fine for pump shafts; note it.
- **Open PE question:** `Ku`/`Km2` are *radial-impeller* correlations, but the warning band is Ns 500–4000. The test duty runs at **Ns = 1562 (Francis/mixed-flow)**. Validity band may be narrower than the warning band.
