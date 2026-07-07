# NEXUS Changelog — 2026-07-07 · Container starvation: found, named, killed

*Session: telemetry arc. The cycle-2 CAD latency mystery (4 blind PRs, ~618s runs,
zombie invocations) was root-caused and fixed same-session with a 2-line diff.
Cycle-2 modeler: ~618s → ~25s. Full converged run: ~660s+ → 49.1s instrumented.*

---

## Shipped

**ll-cockpit PR #184 — telemetry slice (4 commits, merged + deployed):**
1. `migrations/0045_tool_call_log.sql` (repo consistency; already applied in prod, id 42)
2. `src/lib/tool-loop.ts` — per-LLM `_llm` rows + per-tool rows into `tool_call_log`
   (best-effort, never breaks the loop); **AbortController 180s** on every Anthropic
   fetch (distinct `timeout 180000ms` error via existing network-error path);
   optional AI Gateway routing via `ANTHROPIC_GATEWAY_URL` (+ `cf-aig-metadata`
   header); unset ⇒ byte-identical direct api.anthropic.com behavior
3. `src/lib/orchestrator.ts` — one line: `logContext` (subtaskId/pipelineRunId/agentName)
4. `wrangler.toml` — `[observability] enabled = true` (Workers Logs)

**nexus-exec PR #1 — the fix (1 commit, merged + deployed via
`npx wrangler deploy --containers-rollout=none`):**
- `getSandbox(env.Sandbox, crypto.randomUUID())` → `getSandbox(env.Sandbox, 'cad-exec')`
- `mkdir -p /work/out` → `rm -rf /work/out /work/script.py && mkdir -p /work/out`

**Infra/config:**
- AI Gateway `nexus-llm` created; secret `ANTHROPIC_GATEWAY_URL =
  https://gateway.ai.cloudflare.com/v1/{acct}/nexus-llm/anthropic` (must end at
  `/anthropic`); Authenticated Gateway **disabled** (our code sends only x-api-key)
- GitHub Pages on ll-cockpit unpublished + source set to None (red-noise workflow dead)

## Root cause (data-proven)

`nexus-exec` created a **new sandbox per request** (random UUID) while
`wrangler.jsonc` caps `max_instances: 1`. Every call queued a fresh cold container
on the single slot still held by the previous container. The Sandbox SDK blocks
~140s then 500s `SandboxError: Container is starting`.

Run `ef9217ff` (pre-fix) cycle-2 anatomy from `tool_call_log`:
- 6 LLM turns: **~27s combined** (4–6s each)
- execute_cad_code: **4 consecutive ~140s failures** (139.6/140.0/139.8/140.0s), then 36.7s success
- 4 × 140s starvation = 560s → the historical ~618s fully accounted for

Run `654e2536` (post-fix): converged cycle 2, **0 failed calls**, cycle-2 build
**10.4s warm**, total instrumented 49.1s. Artifacts in R2: `part.glb` 3,280 B,
`part.step` 15,468 B + both reviewer verdict docs.

## Hypotheses formally closed
- (a) RAG-prohibition-ignored: **dead** — query_knowledge was never the cost; #183 is confirmed dead weight (remove opportunistically)
- (b) slow LLM turns at 8192 max_tokens: **dead** — every turn measured 4–6s
- (c)+(d) were **one compound mechanism**: unbounded await (LLM fetch then, exec fetch really) rides the 15-min Queues consumer wall kill → no error path → row stranded at `running`. LLM side now bounded (180s); exec side is remaining debt (below)
- Config misfires en route (both diagnosed in-band by the new telemetry in <1s each):
  gateway 401 `AiGatewayError 2009` = Authenticated Gateway on; gateway 400 `2019`
  = secret pointed at compat endpoint instead of `/anthropic`

## Strategic updates
- **Workflows promotion DEMOTED.** Pre-fix: cycle-2 ate ~69% of the 15-min consumer
  budget on a cube. Post-fix: a full run uses ~5%. Workflows returns when part
  complexity/DAG depth demands it. Phase 1 item 3 shrinks to a minimal stall-reaper.
- **Roadmap resequenced — viewer first.** The pipeline already manufactures and
  stores models; the shortest path to a product-feeling deliverable (and demo
  material) is Phase-3 item 7 (R2-streamed GLB + Three.js in Library). Next slice.

## Debt added
1. `/work` collision if two `/run` requests overlap on the shared sandbox
   (accepted; revisit at Workflows promotion)
2. `runCadScript`'s `NEXUS_EXEC.fetch` has no AbortController — the last unbounded
   await in the loop (small hardening slice)
3. #183 prompt prohibition = dead weight, remove opportunistically
4. nexus-exec deploys need `--containers-rollout=none` on machines without Docker
   (image unchanged); wrangler 4.107.0 update available
5. Reviewer (router path) has no tool_call_log coverage — telemetry is tool-loop-only

## Run IDs (forensics)
`e9819002` gateway 401 · `c106fa7d` gateway 400 · `ef9217ff` pre-fix anatomy (converged cycle 2 despite starvation) · `654e2536` post-fix proof (49.1s)
