# NEXT SESSION KICKOFF — CAD drawings deliverable (30S multi-format export → 30T multi-view)
*Written 2026-07-09 (rev 10: after the calc-grounding line landed — #191/#192 merged, 30AK done, calc moat proven for shafts). READ-FIRST. Authority: live code (GitHub MCP refs/heads/main) + live D1 first; this doc second. Full record: `nexus_changelog_2026-07-08_gate-a-hardening.md`.*

## KICKOFF PROMPT (paste into a fresh chat)

Mode B kickoff — CAD vertical, drawings deliverable. Fresh session. FIRST: confirm the Cloudflare MCP tools actually exposed this session, plainly (Vectorize + KV were NOT exposed 2026-07-08/09; re-confirm — never fake capability). THEN fetch and read docs/next_session_kickoff.md (this file, rev 10) from connordmcneely96/ll-cockpit main via GitHub MCP, answer its 5 verification questions from live D1/GitHub state, and wait for greenlight. READ-FIRST — do not architect from memory.

STANDING RULES (learned the hard way this session):
- VERIFY MERGE STATE with pull_request_read BEFORE any behavioral test. #191 was reviewed GREEN but tested before it was actually merged, producing a false "adoption gap" finding and a wasted sprint. Never trust the merge flow.
- Every Claude Code prompt starts with git fetch origin + confirm base == origin/main before branching (stale-clone hazard).
- Review every commit against LIVE PR head (get_commit full_patch / get_file_contents refs/pull/N/head), never Claude Code self-reports. D1 writes verified by read-back (changes:1 is not proof).

STATE (verify, don't trust) — the CAD spine is LIVE and calc-grounded for shafts:
- Six PRs shipped 2026-07-08/09: #187 prod CAD endpoint (POST /api/cad/requests); #188 deterministic Gate A (is_valid + geometry, in cad-convergence.ts runGateA, before the reviewer); #189 Gate A regex fix; #190 artifact↔run linkage + sentinel_pass stamping (migration 0061 — pipeline_run_id/subtask_id on artifact_registry — applied to remote D1 via Cloudflare MCP + tracked in d1_migrations); #191 engineering_calc tool (service binding ENGINEERING_CALCS → engineering-calcs Worker, 20-route CALC_ROUTES allowlist, granted to modeler); #192 full imperial camelCase contract in the tool description + honest ok telemetry (non-2xx throws → tool_call_log.ok=0, field error still reaches the model).
- PROVEN LIVE (run 25de70d0): a pump-shaft spec → MODELER called shafts.analyze with imperial camelCase params {power,speed,overhang,bearingSpan,material} → success:true, real Shigley/API-610 geometry; converged cycle 1 128s; GLB(514KB)+STEP linked to run with sentinel_pass=1. The radialLoad-30x-low risk class is CLOSED for the shaft path.
- LIMITATION (carry): calc grounding proven ONLY for shafts. Vessels/bolts/gears/etc. are documented in the tool contract but unexercised, and most analysis-level endpoints (shafts.stress, vessels.bowl_mawp, gears.spur_agma…) require PRE-DERIVED inputs MODELER can't assemble from a spec. Design-level endpoints (shafts.analyze/generate, bearings.life, columns.buckling, springs.helical, calculations.torque, materials.suggest) are the LLM-usable set.

BOARD HYGIENE (fix early — the board lies in two spots):
- 30H is marked todo but is DONE (shipped as Sprint 151A, the engineering-calcs Worker). Mark it done/superseded.
- 30AH (CAD self-heal) is ~60% done (Gate A + loop + artifact backstop live) but marked todo; only Gate B VISION critique is missing (needs a GLB→PNG render — a nexus-exec container change; folds naturally into 30T). Note status honestly.

NEXT SLICE — CAD DRAWINGS (30S multi-format export, then 30T multi-view). This is the biggest untouched deliverable (~0%) and next on the critical path to a sellable v1 (30AK done → drawings → GD&T 30AI → BOM 30U + DFM 30AJ → spec-sheet PDF 30V → canvas 30J → validate 30N). 30S = STL+STEP+DXF+PDF; 30T = top/front/side/iso/exploded views.

THE KEY READ-FIRST QUESTION (resolve before scoping): does 2D drawing export need FreeCAD/ezdxf (a nexus-exec CONTAINER image change + redeploy — heavy, Docker-in-CI), OR can build123d/OCC do it NATIVELY in the existing container? build123d ships ExportSVG, ExportDXF, and section()/project() 2D operations — if those cover multi-view + DXF, 30S/30T stay a pure modeler-script + hub change with NO container rebuild. Read:
  - nexus-exec/Dockerfile (what's installed — build123d only? any FreeCAD/ezdxf?).
  - build123d's 2D export surface (ExportSVG/ExportDXF/Export2D, section/project) — can it produce the needed views + DXF/PDF from the existing GLB/STEP model in-sandbox?
  - src/lib/agents.ts modeler prompt + how execute_cad_code returns artifacts (any /work/out file is returned + registered — so a part.dxf/part.svg/part.pdf would ride the existing artifact channel with no exec-transport change).
  - The full 30S + 30T sprint descriptions in D1 (their stated tooling assumptions may predate this build123d-native option).
Then propose: build123d-native (preferred if it covers the need — no container touch) vs FreeCAD-in-container (only if native can't). State the trade-off, get greenlight, THEN author the prompt (≤4 commits, hot files claimed, 3 audit passes, fetch-first).

CARRIED DEBT: artifact DUPLICATION per multi-exec run (dup GLB/STEP rows — dedupe on (pipeline_run_id, artifact_name)); calc grounding shaft-only (extend + validate other governed classes as parts need them); reviewer-text still promoted as CAD deliverable (NON_DELIVERABLE_AGENTS cleanup deferred); Gate B vision missing (30AH); tool-loop router bypass (MODELER hardcodes sonnet-4-5, node a94e3731); runCadScript NEXUS_EXEC.fetch unbounded; qwen reseed hazard; split-brain model registry; reviewer/CAD-REVIEWER name mismatch (latent); vitest test-file breaks tsc on main.

ANSWER THESE 5 BEFORE PROPOSING ANYTHING:
1. Current HEAD SHA on main; confirm #192 merged (pull_request_read) and engineering_calc's description carries the imperial/camelCase 20-route contract on live main.
2. What does nexus-exec/Dockerfile install today, and is FreeCAD or ezdxf present? (Determines whether drawings need a container rebuild.)
3. Can build123d export the needed 2D views + DXF/PDF natively (ExportSVG/ExportDXF/section/project)? Cite the API. If yes, 30S/30T is a no-container-change slice.
4. How does execute_cad_code return + register artifacts, and would a new part.dxf/part.pdf in /work/out ride the existing channel with no exec change?
5. What do the live 30S and 30T sprint rows specify, and do their tooling assumptions still hold given (3)?

FIRST ACTIONS: (1) answer the 5 from live state; (2) read the surfaces + resolve the build123d-native-vs-FreeCAD fork, report findings; (3) propose the drawings architecture, wait for greenlight; (4) author the prompt (fetch-first, 3 audit passes). Also fix board hygiene (30H done, 30AH status note) early.
