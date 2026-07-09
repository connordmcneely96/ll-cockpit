# NEXT SESSION KICKOFF — Sprint 30AK: fix the engineering_calc param contract
*Written 2026-07-09 (rev 9: supersedes rev 8's "adoption gap" framing, which was WRONG — see below). READ-FIRST session. Authority: live code (GitHub MCP refs/heads/main) + live D1 first; this doc second. Full record: `nexus_changelog_2026-07-08_gate-a-hardening.md` (corrected) + D1 row `30ak-calc-param-contract-0002`.*

---

## CORRECTION THAT PRODUCED THIS REV (read first — it is the whole lesson)
Rev 8 said MODELER "refuses to call" the calc engine (an adoption gap) and seeded an enforcement sprint. That was WRONG, caused by a process error: PR #191 (the engineering_calc tool) was reviewed GREEN mid-session but NOT merged until 2026-07-09 03:45. The first shaft test (run 200730f9) ran against main WITHOUT #191, so the tool literally did not exist — "zero calls" was an artifact of the unmerged PR, not model behavior. LESSON, now standing rule: **verify merge state via pull_request_read BEFORE any behavioral test** — never trust the merge flow. After #191 was actually merged, re-running the shaft (run ac9841d7) showed MODELER DID call engineering_calc (2x). No adoption gap exists. The old enforcement sprint was soft-deleted; this rev points at the REAL gap.

## KICKOFF PROMPT (Connor pastes in a fresh chat)

Mode B kickoff — CAD vertical, Sprint 30AK (engineering_calc PARAM CONTRACT fix). Fresh session. FIRST: confirm the Cloudflare MCP tools actually exposed this session, plainly (Vectorize + KV were NOT exposed 2026-07-08/09; re-confirm — never fake capability). THEN fetch and read docs/next_session_kickoff.md (this file, rev 9) from connordmcneely96/ll-cockpit main via GitHub MCP, answer its 5 verification questions from live D1/GitHub state, and wait for greenlight. READ-FIRST — do not architect from memory.

STATE (verify, don't trust):
- #187–#191 all merged + live (verified via pull_request_read). CAD triad + both gates + artifact linkage (#190, migration 0061 applied to remote D1 via MCP + tracked in d1_migrations) + engineering_calc tool (#191) are all live.
- THE REAL GAP (grounded, run ac9841d7, #191 live): MODELER calls engineering_calc but every call 400s (VALIDATION_ERROR). It sends the wrong contract on THREE axes:
  1. NAMING: snake_case (diameter_mm) vs engine camelCase (diameter).
  2. UNITS: metric (mm/N/Nm) vs engine IMPERIAL (in/lbf/lb-in/psi) — the dangerous axis; a unit mismatch that didn't 400 would be radialLoad-30x silently.
  3. QUANTITY MODEL: sent power_hp+speed_rpm to shafts.stress (which wants torque+bendingMoment); power/speed→loads is the job of shafts.generate.
  The shaft CONVERGED with zero SUCCESSFUL calcs (Gate B can't see calc-grounding). tool_call_log logged ok=1 despite the 400 (handler only catches throws).

ENGINE CONTRACT (verified engineering-calcs/src/types.ts @ ef5c6e27; modules/* are authoritative for exact zod — READ THEM): ALL IMPERIAL, camelCase.
  shafts.stress: {diameter(in), torque(lb-in), bendingMoment(lb-in), axialLoad?(lbf), material}
  shafts.deflection: {diameter,length,load(lbf),position,material,supportType:'simply-supported'|'fixed-fixed'|'cantilevered'}
  shafts.critical_speed: {diameter,length,material,supportType:'simply-supported'|'fixed-fixed',overhangMass?,overhangDistance?}
  shafts.generate: {power(HP),speed(RPM),overhang(in),bearingSpan(in),material,applicationFactor?,+pump terms} → RETURNS diameter/length/torque/radialLoad/bendingMoment (this is the endpoint that turns power+speed into the loads the others consume).

THE WORK (Sprint 30AK, full spec in D1 row 30ak-calc-param-contract-0002):
  Recommend (A)+(C): (A) replace engineering_calc's free-form params with a typed per-calc input_schema (or discriminated union on calc) so names+units+quantities are unmissable; (C) prompt the generate→stress SEQUENCE. (B) a handler normalization/alias+unit-convert layer only if a SAFE explicit map is warranted (unit-guessing in a shim is itself risky — fail-closed, never assume a unit).
  SECONDARY (do here): fix the engineering_calc handler to log ok=0 on engine non-2xx (telemetry truth: 'called' != 'succeeded').
  CARRY (don't necessarily build): a future forcing function requiring >=1 SUCCESSFUL calc for governed part classes — but the governed-classification false-positive problem applies; keep separate.

READ-FIRST SURFACES: engineering-calcs/src/modules/* (exact zod per endpoint, authoritative over types.ts); src/lib/tool-loop.ts (engineering_calc def + handler + ok-flag fix); src/lib/agents.ts (MODELER ENGINEERING GROUNDING block — add contract + sequence).

CARRIED DEBT: artifact duplication per multi-exec run (dupe part.glb/part.step; dedupe on (pipeline_run_id, artifact_name)); reviewer-text still promoted as CAD deliverable (NON_DELIVERABLE_AGENTS cleanup deferred); Gate B vision missing (30AH, needs nexus-exec render, folds into 30T); tool-loop router bypass (MODELER hardcodes sonnet-4-5, node a94e3731); runCadScript NEXUS_EXEC.fetch unbounded; qwen reseed hazard; split-brain model registry; reviewer/CAD-REVIEWER name mismatch (latent); vitest test-file breaks tsc on main.

ANSWER THESE 5 BEFORE PROPOSING ANYTHING:
1. Confirm #191 is merged (pull_request_read) and engineering_calc is in SAFE_TOOLS + granted to modeler on live main.
2. Read engineering-calcs/src/modules/* for shafts.stress + shafts.generate: what are the EXACT zod field names, types, and units? (types.ts is a hint; modules are truth.)
3. In the live engineering_calc tool def, what is the params schema today (free-form object)? What's the minimal typed schema that makes names/units unmissable?
4. Where does the engineering_calc handler decide ok for tool_call_log, and what's the one-line change to log ok=0 on a non-2xx engine response?
5. What is the generate→stress data sequence (which endpoint's outputs feed which endpoint's inputs) that MODELER must follow?

FIRST ACTIONS: (1) answer the 5 from live state; (2) read the module schemas + tool def + prompt block, report findings; (3) propose the schema+sequence approach, wait for greenlight; (4) author the prompt (fetch-first, 3 audit passes).
