# NEXT SESSION KICKOFF — Sprint 30AK: enforce calc-engine grounding in MODELER
*Written 2026-07-08 (rev 8: after the engineering-calcs wiring #191 shipped AND its first behavioral test exposed an adoption gap). READ-FIRST session. Full record: `nexus_changelog_2026-07-08_gate-a-hardening.md`, and D1 sprint row 30AK (`30ak-calc-grounding-enforcement-0001`).*

---

## KICKOFF PROMPT (Connor pastes in a fresh chat)

Mode B kickoff — CAD vertical, Sprint 30AK (calc-grounding ENFORCEMENT). Fresh session. FIRST: confirm the Cloudflare MCP tools actually exposed this session, plainly (Vectorize + KV were NOT exposed on 2026-07-08; re-confirm — never fake capability). THEN fetch and read `docs/next_session_kickoff.md` (this file, rev 8) from connordmcneely96/ll-cockpit main via GitHub MCP, answer its 5 verification questions from live D1/GitHub state, and wait for greenlight.

READ-FIRST. Do NOT architect from memory. The hard part is a design question (governed-part classification) that must be resolved against live code before any prompt is written.

STATE (verify, don't trust):
- ENGINEERING-CALCS ENGINE IS WIRED BUT NOT ADOPTED. PR #191 added the engineering_calc SAFE_TOOL (service binding ENGINEERING_CALCS -> engineering-calcs Worker, 20-route CALC_ROUTES allowlist, granted to modeler, MODELER prompt updated). Deployed, compile-clean. BUT the first behavioral test (run 200730f9, a pump-shaft spec) showed engineering_calc was called ZERO times — tool_call_log: query_knowledge x6, execute_cad_code x11, engineering_calc x0. MODELER did the OLD thing (RAG for the formula, then Python arithmetic). The radialLoad-30x-low risk class is STILL LIVE in practice. And the shaft still CONVERGED — Gate B (metrics reviewer) can't tell sizing wasn't calc-grounded.
- CAD triad otherwise live + healthy: prod endpoint (#187), Gate A is_valid (#188/#189), artifact linkage + sentinel_pass (#190, migration 0061 applied to remote D1 via MCP + tracked in d1_migrations).

THE SLICE — Sprint 30AK (full spec in D1 row 30ak-calc-grounding-enforcement-0001):
(a) Prompt hardening — resolve the CONTRADICTION in MODELER's ENGINEERING GROUNDING block (the surviving 'Apply it using ONLY inputs given...' sentence still licenses doing the math in Python); remove that escape hatch for governed values. Do NOT ship (a) alone — prompt-only already failed once.
(b) FORCING FUNCTION (the real fix) — extend deterministic Gate A (runGateA in cad-convergence.ts) so that for standard-governed part classes a run with ZERO engineering_calc calls FAILS the gate with feedback. Reuses the existing enforced-feedback mechanism.

RESOLVE READ-FIRST (the hard design question): how to classify 'is this part governed?' WITHOUT false-positives blocking simple ungoverned parts (brackets/washers). Read live:
  - src/lib/cad-convergence.ts (evaluateGateA/runGateA — currently parses modeler OUTPUT text; but the calc-call fact lives in tool_call_log keyed by pipeline_run_id — determine the cleanest signal source);
  - src/lib/tool-loop.ts (confirm engineering_calc calls are logged to tool_call_log with pipeline_run_id);
  - src/lib/agents.ts (the contradiction to resolve);
  - cad_convergence_runs schema (add a governed-class flag at request time? or classify from spec?).
Then propose the enforcement architecture (classifier location + gate check), state the false-positive trade-off, get greenlight, THEN author the prompt (<=4 commits, hot files claimed, 3 audit passes, fetch-first git fetch + base-current check).

CARRIED DEBT (do not silently reintroduce): tool-loop router bypass (MODELER hardcodes sonnet-4-5; node a94e3731); artifact duplication per multi-exec modeler run (dupe GLB/STEP rows — same run wrote part.glb/part.step twice; candidate dedupe on (pipeline_run_id, artifact_name)); reviewer-text still promoted as CAD deliverable (NON_DELIVERABLE_AGENTS cleanup deferred); Gate B is text-metrics only, no vision (30AH Gate B, deferred — needs a nexus-exec container render, folds into 30T drawings); runCadScript NEXUS_EXEC.fetch unbounded; qwen reseed hazard; split-brain model registry; reviewer/CAD-REVIEWER name mismatch (latent); vitest test-file breaks tsc on main.

ANSWER THESE 5 BEFORE PROPOSING ANYTHING:
1. Current HEAD SHA on main, and confirm engineering_calc is in SAFE_TOOLS + granted to modeler in AGENT_TOOLS.
2. Re-run or inspect: does tool_call_log record engineering_calc calls with pipeline_run_id? (Confirm the signal source for the gate.)
3. Where does runGateA get its data today (modeler text vs a DB read), and what's the cleanest place to check 'zero engineering_calc calls this run'?
4. Is there a governed-part signal available at request time (in the spec / cad_convergence_runs), or must it be classified? Propose the lowest-false-positive option.
5. What is the exact contradiction in the MODELER ENGINEERING GROUNDING block that let the model skip the calc tool?

FIRST ACTIONS, in order:
1. Answer the 5 questions from live state.
2. Read the 4 surfaces. Report findings + the governed-classification options.
3. Propose the enforcement architecture. Wait for greenlight.
4. Author the slice prompt (fetch-first, 3 audit passes).
