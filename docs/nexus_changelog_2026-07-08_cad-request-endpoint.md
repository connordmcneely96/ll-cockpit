# CHANGELOG — 2026-07-08 — CAD production request endpoint

Session record for the "real request → CAD triad" slice. Full state lives in
`nexus_session_context.md` (rev 2026-07-08) and `next_session_kickoff.md` (rev 6).
Companion PR: **#187** (merged + deployed + browser-verified).

---

## What shipped

**PR #187 — `feat(cad): production request endpoint + NEXUS/HERMES CAD carve-out`** — merged, deployed green, verified live.

- **Commit `de280cb`** — NEW `src/app/api/cad/requests/route.ts` (+56). Production entry point to the self-correcting CAD convergence pipeline. POST-only; Supabase auth → 401; `spec` required (trim → empty=400, >4000 chars=400, no cube fallback); `max_cycles` clamped [1,5] default 3; `createConvergenceRun(env, userId, spec, maxCycles, false)` — `seed_flaw` **not exposed**. Auth / `getBindings` / `json()` / error shapes copied from the admin smoke route. No GET.
- **Commit `28457dd`** — `src/lib/agents.ts` (+2 / −0). NEXUS prompt gains a bullet routing CAD/mechanical/3D-geometry requests to `POST /api/cad/requests` instead of decomposing; HERMES gains rule 9 telling it to suggest that endpoint rather than assign CAD modeling to a general agent. No logic touched.

Both commits reviewed GREEN against live PR head (not Claude Code self-report). Diff scope git-verified: exactly the two in-scope files, additive-only.

---

## Key finding — the integration point was NOT HERMES

The kickoff framed this as "wire HERMES into the CAD triad." Reading live code showed the triad was **already a complete, working, self-correcting engine** (`src/lib/cad-convergence.ts`, Slice A2b) independent of HERMES:

- `createConvergenceRun` inserts modeler+reviewer pairs directly; `advanceConvergence` (fired from `executeOneSubtask` on reviewer completion) re-spawns pairs on FAIL up to `max_cycles`, fail-closed verdict parsing.
- MODELER was already in the tool-loop allowlist with a bumped iteration cap (10); `reviewer` correctly takes the router (no tools).
- HERMES emits a **static one-shot DAG** — it structurally cannot represent a re-spawning convergence loop. Forcing CAD through it would regress the self-heal behavior.

So the slice became: **stand up a production entry point to the proven engine + point NEXUS/HERMES at it** — the same pattern already used for design builds (`/api/design/briefs`). Much smaller, much lower risk than teaching the generic orchestrator a second execution mode.

## Two recommendations dropped after reading live code (honest scope reduction)

- **MODELER routing row** — dropped. `runToolLoop` hardcodes `claude-sonnet-4-5` and never reads `ai_routing_policy`; a row would be dead config that lies. Carried as debt (tool-loop router integration, node `a94e3731`).
- **reviewer/CAD-REVIEWER name fix** — dropped. Traced unreachable (HERMES roster never lists CAD-REVIEWER; convergence uses the lowercase literal). Logged as latent risk, not fixed — fixing it would mean teaching HERMES about an agent we deliberately keep out of it.

Net: 4 planned commits → 2 shipped.

---

## Verification (live)

- `POST /api/cad/requests` with a real washer spec (40mm OD / 21mm bore / 3mm thick) → `200 { ok:true, runId:309ef189… }`.
- `cad_convergence_runs`: **converged, cycle 1**, ~51s (created 1783476767 → updated 1783476818).
- `agent_subtasks`: `st_m1` modeler `done` (`tool-loop:2i:1tc`, 4266 tok); `st_r1` reviewer `done` (`claude-sonnet-4-5`, 1148 tok).
- CAD-REVIEWER verdict: **pass, score 100** — quantitative, not rubber-stamp. OD/thickness via bbox; bore confirmed via volume (2730.829 vs 2730.88 mm³ theoretical, 0.02% err → proves the bore was cut); topology 4 faces / 6 edges / 1 solid.
- `artifact_registry`: `part.glb` (32,440 B) + `part.step` (9,369 B) in `ll-cockpit-r2` under `cad/…/`. Artifact-existence gate held — genuine build, not text-only "done."

---

## New debt logged this session

- **Artifact ↔ run linkage:** CAD GLB/STEP rows key on the sandbox `execution_id` + `producing_agent='cad-exec'`, no FK to `pipeline_run_id`. "Artifacts for run X" needs a timestamp join.
- **`sentinel_pass` not propagated:** CAD artifacts stay `sentinel_pass=null` after a CAD-REVIEWER PASS → Library shows them "untested."
- Both are candidates for a future polish slice (link artifacts to run; stamp pass from the convergence verdict).

## Pre-existing item surfaced

- `tsc --noEmit` reports `Cannot find module 'vitest'` in a chunker `*.test.ts` on `main`. Not introduced by #187 (neither commit touches test files/config). Repo-hygiene fix: exclude the test dir from the app typecheck, or move `vitest` to devDeps + tsconfig.

---

## Process notes

- Fetch-first rule honored (`main == origin/main` confirmed before branching) — no stale-clone stacking (the #186 hazard).
- `search_code` MCP returned 0 hits on every query this session (repo indexing quirk); fell back to directory browsing + direct `get_file_contents`, which worked.
- Cloudflare MCP tools exposed this session: D1, R2, Workers, docs search. **No Vectorize tools, no KV tools** exposed — confirmed plainly, never faked.
