# NEXT SESSION KICKOFF — CAD telemetry arc
*Written 2026-07-06. Paste the KICKOFF PROMPT below as the first message of a fresh
chat in the NEXUS project (fresh chat = full Cloudflare MCP toolset loads). This file
is self-contained: state, verification questions, first actions, and the full
telemetry Claude Code prompt appendix.*

---

## KICKOFF PROMPT (paste verbatim)

Mode B kickoff — CAD vertical, telemetry arc. Fresh session; you have the FULL
Cloudflare MCP toolset (docs search, workers, KV/R2/D1) per nexus_working_rules.md §4
and NEXUS Knowledge node 8b6dc4c8-6a06-4d54-99b8-be8380bc8775.

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
  (c) consumer invocation kills + redelivery gaps.
- Zombie incident: run abeb46e3 st_m2 stuck 'running' 37+ min, no error_log —
  suspected queue-consumer invocation kill; tidied via conditional D1 UPDATE. Zombie
  rule codified (working rules §6).
- Migration 0045 tool_call_log applied + reconciled in prod (d1_migrations id 42).
  The CODE slice (appendix below) may or may not be merged yet — ASK CONNOR, then
  verify the PR against live main.
- GET trigger live: /api/admin/cad-converge-async-smoke?seed_flaw=1 (auth-gated;
  bare visit returns help).
- AI Gateway: Connor may have created gateway `nexus-llm` and set secret
  ANTHROPIC_GATEWAY_URL — ask; unset means direct api.anthropic.com (fine).

FIRST ACTIONS, in order:
1. search_cloudflare_documentation:
   (a) Cloudflare Queues consumer wall-clock/duration limits — decides the zombie
       diagnosis and whether the Workflows hardening slice is promoted to now;
   (b) AI Gateway Anthropic provider endpoint URL shape + cf-aig-metadata header.
2. Telemetry PR: review against live main and issue verdict if Connor ran the
   prompt; otherwise hand him the appendix prompt for Claude Code.
3. After merge + CONFIRMED green "Deploy to Cloudflare" run for that commit
   (deploy-timing rule — burned us 3x): Connor fires ONE seeded run; decompose it
   from tool_call_log (per-LLM '_llm' rows vs tool rows by name vs wall-clock gaps)
   and name the real cycle-2 bottleneck with data. Fix follows the data:
   (a) still querying -> allowlist fix (drop query_knowledge from cycle-2 call);
   (b) slow LLM turns -> token/output budget fix;
   (c) unattributed gaps -> invocation kills -> promote Workflows migration slice.

ANSWER THESE 5 BEFORE PROPOSING ANYTHING:
1. Last reconciled migration in d1_migrations (name + id)?
2. What happened to run abeb46e3 and what standing rule did it create?
3. Why is #183 logged as a failed hypothesis, and what in-band evidence proved it
   was deployed for the run that failed to improve?
4. Which two Cloudflare doc facts are owed verification, and what decision hangs
   on each?
5. What is the critical path to naming the cycle-2 bottleneck?

---

## APPENDIX — Telemetry Claude Code prompt (send verbatim if not yet run)

TASK: Full telemetry for the agent tool loop + optional AI Gateway routing. We are
blind on why cycle-2 CAD modelers run 600s+ (one zombied at status='running' with no
error — suspected queue-consumer invocation kill). Persist per-TOOL-call rows AND
per-LLM-iteration rows to tool_call_log (table ALREADY EXISTS in prod D1, reconciled
as migration 0045 — do NOT apply; just add the file), route Anthropic through
Cloudflare AI Gateway when an env var is set, and enable Workers Logs. Run in
ll-cockpit. Branch lane-b/tool-loop-telemetry off main; open a PR, do NOT merge.

GROUNDED FACTS (live main):
- src/lib/tool-loop.ts: const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
  the loop fetches it each iteration; the tool_use branch loops toolUses ->
  dispatchTool -> pushes ToolCallRecord; args.env.DB is available; AnthropicResponse
  carries usage tokens + stop_reason.
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
3. Gateway routing: replace the hardcoded fetch URL with
     const gatewayBase = (args.env as { ANTHROPIC_GATEWAY_URL?: string })
       .ANTHROPIC_GATEWAY_URL?.trim()
     const anthropicUrl = gatewayBase
       ? gatewayBase.replace(/\/$/, '') + '/v1/messages' : ANTHROPIC_URL
   and when gatewayBase is set, add ONE extra request header:
     'cf-aig-metadata': JSON.stringify({ subtask: args.logContext?.subtaskId ?? null,
       agent: args.logContext?.agentName ?? null })
   Unset env var => byte-identical behavior to today.
4. Per-LLM-iteration telemetry: around each fetch capture t0/latencyMs; after parsing
   call logToolCall with tool_name '_llm', ok=true, input_preview
   `iter ${iter} model ${model}`, result_preview
   `stop=${data.stop_reason} in=${data.usage?.input_tokens ?? 0} out=${data.usage?.output_tokens ?? 0}`.
   On the two failure returns (network error / non-ok status) log '_llm', ok=false,
   result_preview = the error string, then return as today.
5. Per-tool-call telemetry: in the tool_use branch, time each dispatchTool and after
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
tool_call_log (the helper); ANTHROPIC_GATEWAY_URL read in exactly one place;
unset-env path still references api.anthropic.com.
COMMITS: "chore(db): 0045 tool_call_log migration file" / "feat(tool-loop): per-tool
+ per-LLM telemetry to tool_call_log; optional AI Gateway routing" /
"feat(orchestrator): pass logContext to runToolLoop" / "chore(wrangler): enable
Workers Logs". Open a PR, do NOT merge. Write /tmp/telemetry-report.md (diffs).
