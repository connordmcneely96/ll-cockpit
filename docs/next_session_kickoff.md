# NEXT SESSION KICKOFF — HERMES → CAD triad integration
*Written 2026-07-07 (rev 5: post viewer-slice + step-guard session). The new session
should read this ENTIRE file via GitHub MCP, then answer the 5 verification
questions before proposing anything. Full session records:
`nexus_changelog_2026-07-07_cad-viewer.md` (project folder) and PRs #185/#186.*

---

## KICKOFF PROMPT (Connor pastes in a fresh chat)

Mode B kickoff — CAD vertical, HERMES integration slice. Fresh session; you have
the Cloudflare MCP toolset per nexus_working_rules.md §4 (note: Vectorize tools
were NOT exposed in the 2026-07-07 session — re-confirm what's actually exposed,
never fake capability). FIRST: confirm exposed Cloudflare tools plainly. THEN
fetch and read docs/next_session_kickoff.md (this file, rev 5) from
connordmcneely96/ll-cockpit main via GitHub MCP, answer its 5 verification
questions from live D1/GitHub state, and wait for greenlight.

STATE (verify, don't trust):
- CAD VIEWER SHIPPED + BROWSER-VERIFIED. PR #185 (squash-merged): content route
  serves glb → model/gltf-binary and step → application/step with correct
  download extensions; new src/components/library/ModelViewer.tsx (default
  export, Three.js GLTFLoader + OrbitControls from three/examples/jsm — bundles
  cleanly through next build → OpenNext → Workers, NO CDN fallback needed);
  ArtifactCard mounts ModelViewer for glb (glb branch FIRST in the modal
  ternary — required, content stays null for glb). Connor confirmed live
  orbit rendering on ll-cockpit.connorpattern.workers.dev.
- STEP DOWNLOAD-ONLY GUARD LANDED. Commit 50ac58a via PR #186: openPreview()
  returns immediately for fmt==='step' (before setPreview), and the Preview
  button doesn't render for step. Closes viewer debt item 3.
- PR #186 QUIRK (don't be confused by it): Claude Code committed 50ac58a onto
  the already-squash-merged #185 branch from a STALE local clone (never fetched
  after Connor's merge). Pushing to a merged PR's branch lands nothing; the fix
  was a second PR (#186) from the same branch. Its diff showed 144 additions /
  4 commits because squash-merge divergence makes GitHub's three-dot diff
  re-show everything — git resolved the already-applied changes as no-ops and
  only the 8 guard lines changed content. Main verified clean by read-back.
- NEW PROCESS RULE (from that incident): every Claude Code prompt begins with
  `git fetch origin` + confirm the base branch is current with remote BEFORE
  creating any branch. Stale-clone stacking is a named hazard now.
- Branch hygiene: lane-a/cad-viewer-slice DELETED (verified 404 on 2026-07-07).
- Deploy gate for the step guard: confirm #186's merge-commit "Deploy to
  Cloudflare" Actions run went green and a live part.step row shows NO Preview
  button (Open/Download/Key only) — Connor confirmed repo state good; live
  check may already be done, ask rather than assume.

DEBT (current):
- ModelViewer: material.dispose() doesn't free textures (zero impact — build123d
  parts untextured; becomes a GPU leak if textured models land).
- ModelViewer: unmount-during-load leaks the parsed gltf.scene (disposed guard
  early-returns without disposing). One-off per occurrence.
- runCadScript's NEXUS_EXEC.fetch still unbounded (zombie surface). CARRIED.
- seed.ts / nexus_model_routing_seed.sql qwen reseed hazard. CARRIED.
- Split-brain model registry (live router claude-sonnet-4-5 vs Thompson rows
  claude-sonnet-4-6 / claude-opus-4-7). CARRIED.

NEXT SLICE — HERMES integration: real request → CAD triad. This is a READ-FIRST
session; do NOT architect from memory or docs. Before writing any prompt, read
live (GitHub MCP refs/heads/main + live D1):
  (a) the HERMES Queues consumer path — how subtask-queue messages are consumed,
      the 15-min wall budget, heartbeat cron;
  (b) DAG subtask creation — how a request becomes subtasks, executeOneSubtask,
      runToolLoop wiring (Sprint 46 state: wired for ANCHOR — what about the
      CAD triad agents?);
  (c) live ai_routing_policy rows for CAD task_types INCLUDING the `reviewer`
      row that exists ONLY in live D1 (nexus_model_routing_seed.sql lags and
      carries the qwen hazard — never trust it);
  (d) MODELER / CAD-REVIEWER wiring in live src/lib/agents.ts (these agents
      exist only in live code — no agent_*.md docs for them; real doc gap).
Then architect the request→triad flow, state trade-offs, get Connor's
greenlight, and only then author the prompt (≤4 commits, hot files claimed,
3 audit passes, fetch-first rule included).

SEQUENCE AFTER HERMES: 2c.2 independent re-measure → SENTINEL final gate →
standalone workspace 1b. Cleanup band unchanged.

ANSWER THESE 5 BEFORE PROPOSING ANYTHING:
1. Where does the .step download-only guard live, and what are its two parts?
   Verify against live main, not this doc.
2. Why did PR #186 show 144 additions / 4 commits for an 8-line change, and
   what process rule came out of that incident?
3. What two ModelViewer debt items remain open, and why is their impact
   near-zero today but real later?
4. Which routing row exists ONLY in live D1 and not in the seed file, and why
   must the seed file never be trusted for routing state?
5. What four live surfaces must be read before architecting the HERMES→triad
   slice, and which two CAD agents have no agent_*.md docs?

FIRST ACTIONS, in order:
1. Answer the 5 questions from live state (D1 reads + GitHub MCP reads).
2. Read surfaces (a)–(d) above. Report findings + doc-lag deltas.
3. Propose the request→triad architecture. Wait for greenlight.
4. Author the slice prompt (fetch-first step included, 3 audit passes).
