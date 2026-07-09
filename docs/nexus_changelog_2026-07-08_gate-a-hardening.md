# CHANGELOG — 2026-07-08 — CAD Gate A + artifact linkage + calc-engine wiring

Second session record for 2026-07-08 (the first, `nexus_changelog_2026-07-08_cad-request-endpoint.md`, covers PR #187 — the production CAD request endpoint). This file covers PRs #188–#191, migration 0061, three seeded sprints (30AI/30AJ/30AK), and the calc-engine adoption-gap finding. Full current state: `nexus_session_context.md` (rev b) and `next_session_kickoff.md` (rev 8).

Every PR below was reviewed GREEN against LIVE PR head via GitHub MCP (not Claude Code self-reports) and verified live before/after merge. Fetch-first honored on all.

---

## PR #188 — deterministic Gate A (is_valid + geometry) before reviewer — merged, deployed, verified
- `b261721` — `src/lib/agents.ts` (modeler prompt): added `'is_valid':bool(part.is_valid())` to the printed `GEOMETRY_METRICS` JSON; instructed that False is_valid = non-manufacturable solid and the one-line JSON must be reproduced verbatim.
- `8e5d1f8` — `src/lib/cad-convergence.ts` (+`GateAResult`, `evaluateGateA`, `runGateA`) + `src/lib/orchestrator.ts` (+hook). Gate A runs after a MODELER subtask, BEFORE the reviewer LLM. Fail-closed asserts: artifact present, `solids>=1`, `volume_mm3>0`, `is_valid===true`. FAIL deletes the current-cycle unrun reviewer (keeps COUNT(*) accounting), spawns next pair with feedback, or `exhausted` at cap. PASS = reviewer proceeds as Gate B. advanceConvergence/createConvergenceRun/refreshRunAggregates/cascadeReady untouched.

## PR #189 — Gate A regex tolerates decorated label — merged, deployed, verified
- One line in `evaluateGateA`: `/GEOMETRY_METRICS:\s*(\{.*\})/g` -> `/GEOMETRY_METRICS:[^{]*(\{.*\})/g`. Fixes a live false-positive where the modeler emitted `GEOMETRY_METRICS:** {...}` on a retry and Gate A fail-closed on GOOD geometry.

### Gate A verification (3 runs)
1. Washer (good) `4bb9d183` — converged cycle 1 ~62s; is_valid:true emitted verbatim; reviewer ran; no false positive. (Modeler now ~3i/2tc vs 2i/1tc pre-Gate-A — the OCC check costs one tool call.)
2. Zero-thickness plate `6e062f95` — exhausted cycle 2, both reviewers DELETED (Gate A short-circuited the sonnet LLM on solids:0/volume:0). Exposed the decorated-label false-positive -> #189.
3. Zero-thickness plate post-#189 `97d1f785` — cycle 1 fails Gate A (degenerate); cycle 2's corrected 1mm plate PARSES, passes Gate A, reaches the reviewer, which legitimately fails it (score 40, Z dim != spec 0mm) -> exhausted for the RIGHT reason. Both gates working in concert.

## PR #190 — link GLB/STEP artifacts to run + stamp sentinel_pass — merged, deployed, verified
- `1389790` migration 0061 (pipeline_run_id + subtask_id columns + index). `f29c7e5` meterCadExec writes the two columns (12 placeholders = 12 binds, positional alignment hand-verified). `3209c25` threads logContext through ToolHandler/dispatchTool -> execute_cad_code -> meterCadExec (hot-path signature change; other two tools ignore the additive field). `87acb27` advanceConvergence PASS branch stamps `sentinel_pass=1` on the run's cad-model rows.
- **Migration 0061 applied to REMOTE D1 via Cloudflare MCP** (no terminal available): ran the two ADD COLUMN + index, then INSERT INTO d1_migrations ('0061_artifact_registry_run_linkage.sql') so a future `wrangler d1 migrations apply` sees it done. Read-back confirmed both columns + index + tracker row. Applied BEFORE merge so schema led code — zero silent-drop window.
- Verified live (washer `11a2f7bf`, converged 71s): GLB/STEP rows now carry pipeline_run_id + subtask_id, and sentinel_pass=1 stamped on all. Linkage + verdict propagation proven.
- **NEW DEBT surfaced:** artifacts are DUPLICATED (2x part.glb, 2x part.step per run) — the multi-exec modeler loop re-registers on each successful execute_cad_code under a fresh execution_id; INSERT OR IGNORE doesn't dedupe (fresh UUID id). Low impact today; candidate dedupe on (pipeline_run_id, artifact_name).

## PR #191 — wire deterministic engineering-calcs engine into MODELER — CODE CORRECT; TWO CORRECTIONS BELOW

- `ae60263` ENGINEERING_CALCS service binding + Fetcher type. `d198bf8` engineering_calc SAFE_TOOL: 20-route CALC_ROUTES allowlist over the service binding; granted to modeler. `9b94a0e` MODELER prompt: the NUMBER for governed values must come from engineering_calc. Reviewed GREEN against live PR head; code is correct.

- **CORRECTION 1 — merge timing.** #191 was reviewed GREEN mid-session but NOT merged until 2026-07-09 03:45 (verified via pull_request_read). The first behavioral test (run 200730f9) ran against `main` WITHOUT #191, so engineering_calc could not have been called — the 'zero calls / adoption gap' conclusion from that run was WRONG (an artifact of the unmerged PR, not model behavior). Process failure on my part: I trusted the merge flow instead of verifying merge state before testing. #187–#190 were independently confirmed genuinely merged; only #191 lagged.

- **CORRECTION 2 — the real gap is a PARAM CONTRACT mismatch (run ac9841d7, #191 live).** With the tool actually merged, MODELER DID call engineering_calc (2x) — so no adoption gap exists. BUT both calls returned HTTP 400 VALIDATION_ERROR: MODELER sent the wrong contract on three axes — naming (snake_case diameter_mm vs engine camelCase diameter), UNITS (metric mm/N/Nm vs engine imperial in/lbf/lb-in — the dangerous one; a units mismatch that didn't 400 would be radialLoad-30x all over again), and quantity model (sent power_hp+speed_rpm to shafts.stress, which wants torque+bendingMoment from shafts.generate). The shaft still CONVERGED with zero SUCCESSFUL calcs — Gate B (metrics reviewer) can't see that sizing wasn't calc-grounded. Also: tool_call_log logged ok=1 despite the 400 (handler only catches throws, not non-2xx) — 'called' != 'succeeded'.

- **NET:** the calc engine is wired AND invoked but returns zero usable numbers today, for a param-contract reason. radialLoad-class risk still effectively live. This is the correctly-scoped next slice (see 30AK below), NOT an adoption/enforcement problem.

---

## Sprints seeded to D1 this session (direct insert + read-back; params must all be strings for the D1 MCP tool — cast numerics in SQL)

- **30AI — GD&T annotation engine** (`30ai-gdt-annotation-0001`, cad-vertical P1, atlas). Datums, FCFs per ASME Y14.5, tolerance callouts. Closes the vision gap where 30T = views only. Grounding guardrail: tolerance values from calc package / spec / cited standards, never LLM-invented; PE validation before any default table. Deps 30T + 30H + 30E; feeds 30V, 30X.
- **30AJ — DFM / manufacturing analysis** (`30aj-dfm-analysis-0001`, cad-vertical P1, atlas). Process classification, manufacturability flags, material/stock flags, relative cost-driver profile (no fabricated $). Runs post-Gate-A. Grounding: capability thresholds from cited/PE-validated tables. Deps converged geometry + 30AI + 30E; feeds 30U, 30V, 30X, 30N.
- **30AK — fix engineering_calc PARAM CONTRACT** (`30ak-calc-param-contract-0002`, cad-vertical P1, modeler). The FIRST 30AK (`...enforcement-0001`, 'adoption gap') was SOFT-DELETED — premised on the unmerged-#191 non-event. Replaced with the grounded fix: MODELER must send the engine's real contract (camelCase, IMPERIAL units, correct quantity model — call shafts.generate to get torque/loads, THEN shafts.stress/critical_speed). Approach: typed per-calc input_schema in the tool + prompt the generate→stress sequence; also fix the handler to log ok=0 on engine non-2xx. Acceptance re-runs the ac9841d7 shaft spec expecting success:true calcs.

## Board reconciliation finding
30H (engineering calc library port) is marked `todo` on the cad-vertical board but is DONE — reconciled 2026-05-26 into Sprint 151A ('Engineering Calc Engine Worker', status `done`), with 151C-1/2/3 (plates/bolts, nozzle+WRC-107, Annex F) also done, oracle-tested vs workbook TDP_PCA_0258. Parent 151 is `superseded`. The board is stale on 30H/30K — do NOT rebuild them. The engineering-calcs Worker is deployed (all 12 modules live); #191 wired it in. The gap was never the engine — it was connection (done) and now enforcement (30AK).

## Carried debt (net, end of session)
Gate A regex YELLOW — RETIRED (#189). Artifact linkage + sentinel_pass — RETIRED (#190). New/open: calc-engine PARAM-CONTRACT gap (30AK, reseeded) — engine invoked but 400s on wrong names/units/quantities; artifact duplication per multi-exec run; reviewer-text still promoted as CAD deliverable (NON_DELIVERABLE_AGENTS cleanup deferred); Gate B vision missing (30AH, needs nexus-exec render, folds into 30T). Still carried: tool-loop router bypass (MODELER hardcodes sonnet-4-5, node a94e3731); runCadScript NEXUS_EXEC.fetch unbounded; qwen reseed hazard; split-brain model registry; reviewer/CAD-REVIEWER name mismatch (latent); vitest test-file breaks tsc on main (pre-existing).

## Process notes
- 5 PRs (#187–#191), all reviewed against live PR head, all fetch-first.
- Migration 0061 applied via Cloudflare D1 MCP (schema DDL + d1_migrations tracker row) since no terminal was available — safe, replicates `wrangler d1 migrations apply`.
- Cloudflare MCP tools exposed this session: D1, R2, Workers, docs. No Vectorize, no KV.
- search_code MCP returned 0 hits all session (repo indexing quirk); used directory browsing + get_file_contents.
