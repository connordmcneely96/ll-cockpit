# NEXT SESSION KICKOFF — CAD telemetry arc + remaining phases
*Written 2026-07-06 (rev 3: added full remaining-phase roadmap). The new session
should read this ENTIRE file via GitHub MCP, then answer the 5 verification
questions before proposing anything.*

---

## KICKOFF PROMPT (Connor pastes this — or the short fetch-version — in a fresh chat)

Mode B kickoff — CAD vertical, telemetry arc. Fresh session; you have the FULL
Cloudflare MCP toolset (docs search, workers, KV/R2/D1) per nexus_working_rules.md §4
and NEXUS Knowledge node 8b6dc4c8-6a06-4d54-99b8-be8380bc8775. FIRST: confirm which
Cloudflare tools are actually exposed to you and say so plainly (working rule — never
fake capability).

STATE (verify, don't trust):
- Slices A1/A2a/A2b shipped; async self-correcting convergence PROVEN (converged
  cycle 2 on runs de813bdc and a6168aaf).
- Fix arc: #180 modeler maxIterations 10 (confirmed working), #181 deterministic
  seed flaw (merged — cycle-1 modeler gets a wrong-spec task, reviewer judges real
  spec), #182 agent_subtasks.model_id persisted (migration 0044; format
  tool-loop:{N}i:{M}tc), #183 cycle-2 feedback forbids query_knowledge (DEPLOYED but
  FAILED to fix latency — failed hypothesis, logged debt, left in as harmless).
- Measured: cycle-1 modeler ~24-30s (2i:1tc). Cycle-2 modeler 611-618s (6i:5tc,
  exactly ONE cost_ledger build row) — and post-#183 behavior unchanged. Open
  hypotheses: (a) prohibition ignored, (b) per-LLM-turn latency at 8192 max_tokens,
  (c) consumer invocation kills + redelivery gaps, (d) HUNG non-streaming Anthropic
  fetch — runToolLoop's fetch has NO timeout in current code; a hung await holds the
  invocation forever. (d) is addressed in-code by the appendix slice (AbortController
  180s); it is the leading zombie explanation.
- Zombie incident: run abeb46e3 st_m2 stuck 'running' 37+ min, no error_log, no
  build rows — consistent with (d) hung fetch and/or (c) invocation kill; tidied via
  conditional D1 UPDATE. Zombie rule codified (working rules §6).
- Migration 0045 tool_call_log applied + reconciled in prod (d1_migrations id 42).
  The CODE slice (appendix below) may or may not be merged yet — ASK CONNOR, then
  verify the PR against live main.
- GET trigger live: /api/admin/cad-converge-async-smoke?seed_flaw=1 (auth-gated;
  bare visit returns help).
- AI Gateway: Connor may have created gateway `nexus-llm` and set secret
  ANTHROPIC_GATEWAY_URL — ask; unset means direct api.anthropic.com (fine).
- Connor's pending 3-min tasks: create the gateway + secret; disable GitHub Pages
  (repo Settings → Pages → Source: None) to silence the red noise workflow.

FIRST ACTIONS, in order:
1. search_cloudflare_documentation:
   (a) Cloudflare Queues consumer wall-clock/duration limits — refines the zombie
       diagnosis and decides whether the Workflows hardening slice is promoted;
   (b) AI Gateway Anthropic provider endpoint URL shape + cf-aig-metadata header.
2. Telemetry PR: review against live main and issue verdict if Connor ran the
   prompt; otherwise hand him the appendix prompt for Claude Code.
3. After merge + CONFIRMED green "Deploy to Cloudflare" run for that commit
   (deploy-timing rule — burned us 3x): Connor fires ONE seeded run; decompose it
   from tool_call_log (per-LLM '_llm' rows vs tool rows by name vs wall-clock gaps)
   and name the real cycle-2 bottleneck with data. Fix follows the data:
   (a) still querying -> allowlist fix (drop query_knowledge from cycle-2 call);
   (b) slow LLM turns -> token/output budget fix;
   (c/d) timeouts/kills now visible as '_llm' ok=false rows -> retry policy and/or
   promote Workflows migration slice.

ANSWER THESE 5 BEFORE PROPOSING ANYTHING:
1. Last reconciled migration in d1_migrations (name + id)?
2. What happened to run abeb46e3 and what are the two candidate mechanisms?
3. Why is #183 logged as a failed hypothesis, and what in-band evidence proved it
   was deployed for the run that failed to improve?
4. Which two Cloudflare doc facts are owed verification, and what decision hangs
   on each?
5. What is the critical path to naming the cycle-2 bottleneck?

---

## REMAINING CAD VERTICAL PHASES (roadmap to "done")

Sequence: Phase 1 items 1→2, then Phase 2 item 4, then Phase 1 item 3, then
Phase 2 item 5, then Phase 3 items 6→7→8, cleanup band throughout.

**Phase 1 · Make the loop trustworthy (current):**
1. Telemetry slice (appendix; includes 180s LLM fetch timeout) — the immediate next
   merge.
2. Speed root-cause + targeted fix from tool_call_log data (hypotheses a-d above).
3. Failed-dependency / zombie hardening — convergence-failure path or stall-reaper
   so a failed modeler doesn't strand its reviewer at 'pending' until the */15
   heartbeat. Cloudflare Workflows is the candidate end-state architecture; the
   promote/defer decision is gated on the doc-verified Queues consumer limits.

**Phase 2 · Make it engineering-grade (the moat):**
4. 2c.2 independent re-measure — reviewer re-imports the exported STEP and measures
   fresh, closing the metric-provenance gap (metrics currently flow through the
   modeler's own prose).
5. SENTINEL final gate — wire task_executions.sentinel_pass so every converged run
   gets the independent quality verdict.

**Phase 3 · Make it a product:**
6. HERMES integration — triad reachable from real HERMES decomposition, not admin
   smoke routes ("design me a bracket" -> HERMES plans -> modeler/reviewer DAG).
7. CAD viewer in Library — R2-streamed GLB + inline Three.js (parts are unviewable
   today).
8. CAD standalone workspace Slice 1b — own shell + New Project form, hub hands off
   via ?token= (already scoped).

**Phase 4 · Ops + docs debt (cleanup band):**
nexus-exec GHA deploy (off Connor's laptop); calibrate CAD_EXEC_USD_PER_SEC
(0.000005 placeholder); LLM-side cost into cost_ledger (tool-loop costUsd=0 today);
artifact_registry.client_id NULL on promote path; create agent_modeler.md +
agent_reviewer.md (agents exist only in src/lib/agents.ts); regen
nexus_codebase_snapshot_CAD.md/_PATCH.md; add reviewer routing row + qwen cleanup to
nexus_model_routing_seed.sql before any reseed; doc-sync (nexus_session_context.md
full replace + dated changelog file).

---

## APPENDIX — Telemetry Claude Code prompt (send verbatim if not yet run)

TASK: Full telemetry for the agent tool loop + fetch timeout + optional AI Gateway
routing. We are blind on why cycle-2 CAD modelers run 600s+ (one zombied at
status='running' 37+ min with no error — the current code's Anthropic fetch has NO
timeout, so a hung request holds the invocation forever). Persist per-TOOL-call rows
AND per-LLM-iteration rows to tool_call_log (table ALREADY EXISTS in prod D1,
reconciled as migration 0045 — do NOT apply; just add the file), bound every
Anthropic call with an AbortController timeout, route through Cloudflare AI Gateway
when an env var is set, and enable Workers Logs. Run in ll-cockpit. Branch
lane-b/tool-loop-telemetry off main; open a PR, do NOT merge.

GROUNDED FACTS (live main):
- src/lib/tool-loop.ts: const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
  the loop does a bare `await fetch(...)` each iteration (no signal/timeout); the
  tool_use branch loops toolUses -> dispatchTool -> pushes ToolCallRecord;
  args.env.DB is available; AnthropicResponse carries usage tokens + stop_reason;
  there is an existing network-error return path in a try/catch around the fetch.
- src/lib/orchestrator.ts executeOneSubtask tool-loop branch calls runToolLoop({env,
  apiKey, userId, userMessage, systemPrompt, maxTokens, maxIterations, allowedTools}).
- Prod table (applied): tool_call_log(id TEXT PK, subtask_id TEXT, pipeline_run_id
  TEXT, agent_name TEXT, user_id TEXT NOT NULL, tool_name TEXT NOT NULL, ok INTEGER
  NOT NULL DEFAULT 0, latency_ms INTEGER, input_preview TEXT, result_preview TEXT,
  created_at INTEGER NOT NULL) + indexes idx_tool_call_log_run,
  idx_tool_call_log_subtask.

ITERATION LIMIT: 8. On failure STOP + write /tmp/telemetry-report.md.

=== COMMIT 1 — migrations/0045_tool_call_log.sql (repo consistency only; already
applied in prod, do not run) ===
CREATE TABLE tool_call_log (id TEXT PRIMARY KEY, subtask_id TEXT, pipeline_run_id
TEXT, agent_name TEXT, user_id TEXT NOT NULL, tool_name TEXT NOT NULL, ok INTEGER
NOT NULL DEFAULT 0, latency_ms INTEGER, input_preview TEXT, result_preview TEXT,
created_at INTEGER NOT NULL);
CREATE INDEX idx_tool_call_log_run ON tool_call_log(pipeline_run_id);
CREATE INDEX idx_tool_call_log_subtask ON tool_call_log(subtask_id);

=== COMMIT 2 — src/lib/tool-loop.ts ===
1. ToolLoopArgs gains:
     /** Optional provenance for tool_call_log rows (subtask lane). */
     logContext?: { subtaskId?: string; pipelineRunId?: string; agentName?: string }
2. Module-level helper logToolCall(env, logContext, userId, toolName, ok, latencyMs,
   inputPreview, resultPreview): INSERT into tool_call_log inside try/catch{}
   (best-effort — logging must NEVER break the loop). created_at =
   Math.floor(Date.now()/1000); previews .slice(0, 300).
3. FETCH TIMEOUT (zombie fix): const LLM_TIMEOUT_MS = 180_000. Each iteration:
     const ac = new AbortController()
     const timer = setTimeout(() => ac.abort(), LLM_TIMEOUT_MS)
   pass signal: ac.signal to the fetch, and clearTimeout(timer) in a finally.
   An abort surfaces through the EXISTING network-error catch/return path; ensure
   its error string distinguishes timeout (e.g. `timeout ${LLM_TIMEOUT_MS}ms`)
   from other network errors.
4. Gateway routing: replace the hardcoded fetch URL with
     const gatewayBase = (args.env as { ANTHROPIC_GATEWAY_URL?: string })
       .ANTHROPIC_GATEWAY_URL?.trim()
     const anthropicUrl = gatewayBase
       ? gatewayBase.replace(/\/$/, '') + '/v1/messages' : ANTHROPIC_URL
   and when gatewayBase is set, add ONE extra request header:
     'cf-aig-metadata': JSON.stringify({ subtask: args.logContext?.subtaskId ?? null,
       agent: args.logContext?.agentName ?? null })
   Unset env var => byte-identical URL/header behavior to today.
5. Per-LLM-iteration telemetry: around each fetch capture t0/latencyMs; after parsing
   call logToolCall with tool_name '_llm', ok=true, input_preview
   `iter ${iter} model ${model}`, result_preview
   `stop=${data.stop_reason} in=${data.usage?.input_tokens ?? 0} out=${data.usage?.output_tokens ?? 0}`.
   On the failure returns (network error incl. timeout / non-ok status) log '_llm',
   ok=false, result_preview = the error string, then return as today.
6. Per-tool-call telemetry: in the tool_use branch, time each dispatchTool and after
   the existing toolCalls.push call logToolCall with the real tool name, ok, JSON
   input preview, content preview.
Touch nothing else (SAFE_TOOLS handlers, dispatchTool, AGENT_TOOLS unchanged).

=== COMMIT 3 — src/lib/orchestrator.ts (HOT FILE: one line) ===
Add to the runToolLoop({...}) call:
  logContext: { subtaskId: subtask.id, pipelineRunId: subtask.pipeline_run_id,
    agentName: subtask.agent_name },

=== COMMIT 4 — wrangler.toml (HOT FILE: one block, nothing else) ===
Add:
  [observability]
  enabled = true
(If an [observability] block already exists, ensure enabled = true and change
nothing else.)

VERIFY: npm run build passes each commit; grep: exactly one INSERT INTO
tool_call_log (the helper); AbortController appears exactly once;
ANTHROPIC_GATEWAY_URL read in exactly one place; unset-env path still references
api.anthropic.com.
COMMITS: "chore(db): 0045 tool_call_log migration file" / "feat(tool-loop): per-tool
+ per-LLM telemetry, 180s LLM fetch timeout, optional AI Gateway routing" /
"feat(orchestrator): pass logContext to runToolLoop" / "chore(wrangler): enable
Workers Logs". Open a PR, do NOT merge. Write /tmp/telemetry-report.md (diffs).
