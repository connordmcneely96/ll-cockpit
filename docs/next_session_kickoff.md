# NEXT SESSION KICKOFF — nexus-exec CAD toolchain foundation (FreeCAD + OpenSCAD)
*Written 2026-07-09 (rev 11: supersedes rev 10's build123d-native drawings framing. Connor's direction: FreeCAD + OpenSCAD are IN — they're the real drawing/FEA/CSG tools and already in the plan (30P OpenSCAD, 30S/30T TechDraw, 30Y FEM). Next slice is the container toolchain foundation, not a build123d shortcut.) READ-FIRST. Authority: live code (GitHub MCP refs/heads/main) + live D1 first; this doc second.*

## KICKOFF PROMPT (paste into a fresh chat)

Mode B kickoff — CAD vertical, nexus-exec TOOLCHAIN FOUNDATION (add FreeCAD + OpenSCAD to the sandbox container). Fresh session. FIRST: confirm the Cloudflare MCP tools actually exposed this session, plainly (Vectorize + KV were NOT exposed 2026-07-08/09; re-confirm — never fake capability). THEN fetch and read docs/next_session_kickoff.md (rev 11) from connordmcneely96/ll-cockpit main via GitHub MCP, answer its 5 verification questions from live state, and wait for greenlight. READ-FIRST — do not architect from memory.

STANDING RULES (learned the hard way this session):
- VERIFY MERGE STATE with pull_request_read BEFORE any behavioral test (a GREEN review is NOT a merge — this bit us on #191, producing a false finding + a wasted sprint).
- Every Claude Code prompt starts with git fetch origin + confirm base == origin/main before branching.
- Review every commit against LIVE PR head; D1 writes verified by read-back (changes:1 is not proof).

DIRECTION (Connor, explicit): the CAD toolchain is MULTI-TOOL, not build123d-only. build123d = parametric solids (working). OpenSCAD = CSG / non-shaft parts (30P). FreeCAD = drawings via TechDraw (30S/30T), FEA via FEM (30Y), and STEP/IGES/DXF/DWG interchange. FreeCAD + OpenSCAD must be IN the sandbox. A build123d-native DXF is a projection, NOT an engineering drawing — TechDraw (title blocks, dimensions, section/detail views, GD&T frames) is the actual deliverable. Do NOT try to avoid FreeCAD to save a container rebuild.

STATE (verify, don't trust) — CAD spine LIVE + calc-grounded for shafts:
- Six PRs shipped 2026-07-08/09: #187 prod endpoint; #188 Gate A (is_valid); #189 Gate A regex; #190 artifact↔run linkage + sentinel_pass (migration 0061 applied to remote D1 via MCP + tracked); #191 engineering_calc tool; #192 full imperial camelCase calc contract + honest ok telemetry.
- PROVEN LIVE (run 25de70d0): shaft spec → MODELER called shafts.analyze (imperial) → success:true real API-610 geometry; converged 128s; GLB+STEP linked, sentinel_pass=1. radialLoad-30x risk CLOSED for shafts.
- Calc grounding proven ONLY for shafts (other governed classes documented, unexercised).

THIS SLICE — nexus-exec toolchain foundation. Add FreeCAD + OpenSCAD to the nexus-exec container image so the modeler can produce TechDraw drawings, OpenSCAD parts, and (later) FEM + Gate-B renders. This is a FOUNDATION slice that unblocks 30S, 30T, 30P, 30Y, and Gate B vision at once. It is HEAVIER than the pure-hub slices — plan for it:
- The nexus-exec sandbox runs with internet DISABLED, so FreeCAD/OpenSCAD must be baked into the Docker IMAGE (nexus-exec/Dockerfile), not pip-installed at runtime.
- Image build happens in CI (GitHub Actions) — Connor's machine cannot run Docker. Confirm the CI build+deploy path for nexus-exec and the --containers-rollout consideration.
- FreeCAD is HEAVY (100s of MB) → image size + sandbox COLD-START latency risk (recall the container-starvation history: cold containers ~140s pre-fix). Measure/scope this; OpenSCAD is light, FreeCAD is the weight.
- Headless invocation: FreeCAD via FreeCADCmd/freecad.console (offscreen); OpenSCAD via its CLI on a .scad file. MODELER shells out to both from its sandbox Python — which means generating OpenSCAD + FreeCAD-macro code (a different codegen skill than build123d; a prompt/agent concern).

READ-FIRST SURFACES (report findings + trade-offs before scoping):
  - nexus-exec/Dockerfile (current: build123d + libgl1 only; how to add freecad + openscad headless — apt packages, size, offscreen deps).
  - nexus-exec CI (.github/workflows) — how the image is built + deployed; the terminal-free path.
  - nexus-exec/src/index.ts (the /run contract — returns every /work/out file as an artifact, so part.dxf/part.pdf/part.svg ride the existing channel; confirm no exec-transport change needed).
  - src/lib/agents.ts modeler prompt + AGENT_TOOLS — how MODELER would be taught to emit TechDraw/OpenSCAD (new codegen path; maybe a distinct tool or script mode).
  - The live 30S/30T/30P sprint rows (their tooling assumptions).

DECISION TO PROPOSE: scope the foundation slice — likely (1) Dockerfile: add openscad + freecad (headless) + verify import; (2) prove a minimal headless TechDraw drawing + a minimal OpenSCAD render inside the container; (3) THEN the modeler-facing wiring (30S/30T/30P) as follow-on slices. Sequence the heavy container work first, behind a CI build, verified before any modeler wiring. State the cold-start trade-off explicitly. Get greenlight, THEN author the prompt.

BOARD HYGIENE (fix early): 30H is falsely todo — DONE as 151A. 30AH ~60% done (Gate A + loop live; only Gate B vision missing). Correct both.

CARRIED DEBT: artifact DUPLICATION per multi-exec run (dedupe on (pipeline_run_id, artifact_name)); calc grounding shaft-only; reviewer-text still promoted as CAD deliverable; Gate B vision missing (30AH — this slice's FreeCAD render unblocks it); tool-loop router bypass (node a94e3731); runCadScript NEXUS_EXEC.fetch unbounded; qwen reseed hazard; split-brain model registry; reviewer/CAD-REVIEWER name mismatch (latent); vitest breaks tsc on main.

ANSWER THESE 5 BEFORE PROPOSING ANYTHING:
1. Current HEAD SHA on ll-cockpit main; confirm #192 merged (pull_request_read).
2. What does nexus-exec/Dockerfile install today, and what apt packages add FreeCAD (headless, FreeCADCmd) + OpenSCAD? Note offscreen/GL deps.
3. How is the nexus-exec container image built + deployed (CI workflow)? What's the terminal-free path, and the --containers-rollout consideration?
4. Does /run return ALL /work/out files as artifacts (so part.dxf/part.pdf need NO exec-transport change)? Confirm from nexus-exec/src/index.ts.
5. What image-size / cold-start impact does FreeCAD add, and how do we de-risk the container-starvation regression?

FIRST ACTIONS: (1) answer the 5 from live state; (2) read the surfaces, report findings + the cold-start/CI trade-offs; (3) propose the foundation-slice scope (Dockerfile + headless proof, modeler wiring deferred), wait for greenlight; (4) author the prompt (fetch-first, 3 audit passes). Fix board hygiene (30H, 30AH) early.
