# NEXT SESSION KICKOFF — CAD viewer slice (roadmap resequenced)
*Written 2026-07-07 (rev 4: post container-starvation fix). The new session should
read this ENTIRE file via GitHub MCP, then answer the 5 verification questions
before proposing anything. Full session record:
`docs/nexus_changelog_2026-07-07_container-starvation.md`.*

---

## KICKOFF PROMPT (Connor pastes in a fresh chat)

Mode B kickoff — CAD vertical, viewer slice. Fresh session; you have the FULL
Cloudflare MCP toolset per nexus_working_rules.md §4. FIRST: confirm which
Cloudflare tools are actually exposed and say so plainly (never fake capability).
THEN fetch and read docs/next_session_kickoff.md (this file, rev 4) from
connordmcneely96/ll-cockpit main via GitHub MCP, answer its 5 verification
questions from live D1/GitHub state, and wait for greenlight.

STATE (verify, don't trust):
- Cycle-2 latency SOLVED. Root cause: nexus-exec created a new sandbox per request
  (random UUID) under max_instances:1 — every call starved ~140s on the single
  container slot then 500'd "Container is starting". Fixed in nexus-exec PR #1
  (stable 'cad-exec' sandbox + per-run /work wipe), deployed. Post-fix run
  654e2536: converged cycle 2, 0 failed calls, cycle-2 build 10.4s warm, 49.1s
  total instrumented (was ~618s cycle-2 alone).
- Telemetry live (ll-cockpit PR #184, merged+deployed): tool_call_log rows per
  LLM iteration ('_llm') and per tool call; 180s AbortController on Anthropic
  fetches; optional AI Gateway routing (gateway nexus-llm ACTIVE via
  ANTHROPIC_GATEWAY_URL secret ending in /anthropic; Authenticated Gateway OFF);
  Workers Logs enabled.
- Workflows promotion DEMOTED: full runs now use ~5% of the 15-min Queues consumer
  wall budget (was ~69% for cycle-2 alone). Revisit when part complexity/DAG depth
  demands. Remaining zombie surface: runCadScript's NEXUS_EXEC.fetch is still
  unbounded (debt).
- Roadmap RESEQUENCED — viewer first. The pipeline manufactures and stores real
  models (R2: part.glb + part.step per run, artifact_registry rows); nobody can
  see them. Shortest path to product-feel + demo material.

NEXT SLICE — CAD viewer in Library (was Phase 3 item 7, now item 1):
R2-streamed GLB + inline Three.js viewer. Rough shape (architect before
prompting): (a) auth-gated artifact-stream route serving GLB bytes from R2 by
artifact_registry id (correct Content-Type: model/gltf-binary); (b) viewer
component (Three.js GLTFLoader + OrbitControls or <model-viewer>) rendering that
URL; (c) Library surface listing cad-model artifacts with the viewer inline.
Verify live Library code + artifact_registry schema BEFORE writing the prompt.

SEQUENCE AFTER VIEWER: HERMES integration (real request → triad) → 2c.2
independent re-measure → SENTINEL final gate → standalone workspace 1b.
Cleanup band unchanged (see changelog debt list).

ANSWER THESE 5 BEFORE PROPOSING ANYTHING:
1. What was the cycle-2 root cause, the exact 2-line fix, and the before/after
   numbers from tool_call_log?
2. Which two awaits in the tool-loop path were unbounded, which one is now fixed
   and how, and which remains as debt?
3. Why was Workflows promotion demoted, and what number backs it?
4. Where do CAD artifacts live right now (table + example storage_ref pattern),
   and what two file formats does each converged run produce?
5. What is the next slice and its three components?

FIRST ACTIONS, in order:
1. Read live artifact_registry schema (D1) + one recent cad-model row; read the
   live Library page code (GitHub MCP) to find the mount point.
2. Confirm Three.js availability strategy for the Next.js/OpenNext worker bundle
   (dependency vs CDN vs <model-viewer>) — pick one, state trade-offs, get
   Connor's greenlight.
3. Author the viewer slice prompt (≤4 commits, hot files claimed, 3 audit passes).
