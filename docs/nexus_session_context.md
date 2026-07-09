# NEXUS SESSION CONTEXT

**The briefing document for every new Claude Chat session.**
Last full replace: **2026-07-08 (rev b)** — doc sync after Gate A hardening (#188), regex fix (#189), and CAD plan-gap closure (sprints 30AI/30AJ seeded).
Authority order for anything technical: **live code (GitHub MCP, `refs/heads/main`) and live D1 first; this doc second.** This file is a starting hint and lags reality by design.

---

## Current State (2026-07-08, end of session)

**Shipped + verified this session (3 PRs):**
- **#187** — `POST /api/cad/requests` production entry point to the CAD triad.
- **#188** — deterministic **Gate A** (`is_valid` + geometry) before the reviewer.
- **#189** — Gate A regex tolerance fix (retired a live false-positive YELLOW).

**Plan updated:** two missing-vision sprints seeded to D1 — **30AI (GD&T annotation)**, **30AJ (DFM analysis)**.

**Next slice (queued, read-first):** artifact ↔ run linkage + `sentinel_pass` stamping. Thread `pipelineRunId`/`subtaskId` through the tool-handler context into `meterCadExec`; migration to add `pipeline_run_id` to `artifact_registry`; stamp the reviewer verdict on the `cad-model` (GLB/STEP) rows; stop promoting reviewer-text as the run deliverable. Edits the tool-execution hot path + adds a column — deserves its own read-first pass.

**Live hub URL:** https://ll-cockpit.connorpattern.workers.dev
**Repo:** github.com/connordmcneely96/ll-cockpit — branch `main`
**HEAD:** post-#189 merge (verify exact SHA next session via `git log --oneline -1`).

---

## The CAD triad — WORKING END-TO-END with two gates

- **Entry:** `POST /api/cad/requests` (prod) — `{ spec, max_cycles? }`, POST-only, auth 401, spec required (no fallback), `max_cycles` [1,5] default 3, `seedFlaw=false` hardcoded. Test-only: `/api/admin/cad-converge-async-smoke`.
- **Engine:** `src/lib/cad-convergence.ts`. `createConvergenceRun` seeds modeler(ready)+reviewer(pending); enqueues on `subtask-queue`.
- **Gate A (deterministic, NEW #188/#189):** `evaluateGateA` + `runGateA` in `cad-convergence.ts`, hooked in `executeOneSubtask` after a MODELER subtask, BEFORE the reviewer. Fail-closed asserts artifact present + `solids>=1` + `volume_mm3>0` + `is_valid===true`. FAIL -> delete current-cycle unrun reviewer, spawn next pair with feedback, or `exhausted` at cap. PASS -> reviewer runs. Regex: `/GEOMETRY_METRICS:[^{]*(\{.*\})/g`.
- **Gate B (LLM):** `reviewer` (CAD-REVIEWER, sonnet-4-5) — quantitative metrics judge; PASS->`converged`, FAIL->respawn via `advanceConvergence`, cap->`exhausted`.
- **Modeler:** emits `GEOMETRY_METRICS: {bbox_mm, volume_mm3, faces, edges, solids, is_valid}` verbatim; tool loop, iteration cap 10; `execute_cad_code` (build123d in `nexus-exec` sandbox) -> GLB + STEP in R2.
- **Verified runs (2026-07-08):** washer converged cycle 1 ~62s (good path); zero-thickness plate exhausted with reviewers deleted (fail path, LLM short-circuited); post-#189 plate reached reviewer on the corrected cycle (regex fix proven).
- **CAD routes AROUND HERMES** (mirrors design-build -> `/api/design/briefs`). NEXUS/HERMES prompts point CAD requests at the endpoint.

---

## Agents (live `src/lib/agents.ts` — authoritative)
`nexus, hermes, scout, intake, forge, builder, atlas, herald, reel, sentinel, dispatch, anchor, designer, composer, assembler, modeler, reviewer (displayName CAD-REVIEWER), critic`.
- Doc gap: `modeler` / `reviewer` have no `agent_*.md`.
- Latent, unreachable: `reviewer` key vs `CAD-REVIEWER` displayName mismatch (HERMES never lists CAD-REVIEWER; convergence uses the lowercase literal).

## Live routing (`ai_routing_policy` in D1 — authoritative; `.sql` seeds are a RETIRED schema, never trust)
`*/default -> claude-sonnet-4-5` · `reviewer/default -> claude-sonnet-4-5` · `sentinel/default,review -> claude-haiku-4-5` · `anchor/default -> claude-haiku-4-5` · `builder/default -> claude-sonnet-4-5`. No `modeler` row (moot — tool loop hardcodes sonnet-4-5, never reads the router).

## Wrangler bindings (live `wrangler.toml` — authoritative; never invent)
D1 `DB->ll-cockpit-db` (831eeccf-60bc-4378-8a3b-71dfb910756e) · KV `db6866496e1f426e9d84758c9329ccfe` · R2 `ll-cockpit-r2` · Queues `KNOWLEDGE_QUEUE->knowledge-embed-queue`, `SUBTASK_QUEUE->subtask-queue` (consumer batch=1) · service `NEXUS_EXEC->nexus-exec` · `AI` · Vectorize `KNOWLEDGE_VECTORIZE->nexus-knowledge`, `ORACLE_VECTORIZE->oracle-research`, `ATLAS_RAG->atlas-engineering`. `cpu_ms=300000`, observability on, crons `0 13`/`0 *`/`*/15`. (No `nexus-vector-index` — stale ref.)

---

## Carried Debt
1. **Artifact<->run linkage + `sentinel_pass`** — GLB/STEP written by `meterCadExec` (`src/lib/exec/cad-exec.ts`) keyed on a fresh `execution_id`, no `pipeline_run_id`/`subtask_id`; `promoteArtifactsForRun` promotes only the reviewer's text verdict and can't read the reviewer verdict for `sentinel_pass` (reviewer not in `QA_AGENTS`). **Next queued slice.**
2. **Tool-loop router bypass** — MODELER/tool-loop agents hardcode sonnet-4-5; `ai_routing_policy` ignored; cost logs $0. Node `a94e3731`.
3. `runCadScript` `NEXUS_EXEC.fetch` unbounded (zombie surface).
4. `seed.ts` / `nexus_model_routing_seed.sql` qwen reseed hazard (retired `model_routing` schema; nonexistent models).
5. Split-brain model registry (router sonnet-4-5 vs Thompson 4-6/opus-4-7).
6. reviewer/CAD-REVIEWER name mismatch (latent, unreachable).
7. ModelViewer texture-dispose + unmount-during-load leaks (near-zero today).
8. Repo hygiene: a `*.test.ts` (chunker) breaks `tsc --noEmit` with `Cannot find module 'vitest'` on main. Pre-existing.

---

## Architecture Locks
Native fetch to `api.anthropic.com` only (no SDK). TypeScript-only Workers. CAD substrate = Cloudflare Sandbox via `nexus-exec` (`NEXUS_EXEC`). CAD + design builds route around HERMES to dedicated endpoints. Deploys via GitHub Actions ("Deploy to Cloudflare"). Connor retains merge/deploy/destructive authority; Claude reads live code + D1 before any verdict.

## Session Kickoff Verification (answer from LIVE state before proposing)
1. Current HEAD SHA on `main`? (`git log --oneline -1`)
2. Confirm Gate A is live in `cad-convergence.ts` (`evaluateGateA`/`runGateA`) and its four fail-closed asserts.
3. How are CAD GLB/STEP artifacts keyed in `artifact_registry`, and why does that block "artifacts for run X" + `sentinel_pass` stamping?
4. Which sprints are 30AI and 30AJ, and what grounding guardrail do both carry?
5. What is the artifact-linkage slice's exact file surface (name the 3-4 files + the migration)?
