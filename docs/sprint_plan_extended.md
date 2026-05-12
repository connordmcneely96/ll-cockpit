# NEXUS Cockpit — Extended Sprint Plan (11–15)

> Added May 11, 2026. Synthesized from BridgeMind/BridgeSpace + Hermes Agent (Nous Research) + OpenClaw/Hermes pattern (Alex Finn).
> These sprints layer on top of the original Sprints 1–10 from `sprint_plan_master.md`.
> Goal: build an autonomous, multi-agent, self-improving system that mirrors and evolves past Cursor + Antigravity + BridgeSpace.

---

## Why These Sprints

Connor's vision: a Cockpit where 16 agents work in parallel terminals, share a hive mind of memory and skills, route every LLM call to the optimal model for the job (free where possible, premium where it matters), and seamlessly hand off to a human when AI judgment falls short.

Inspiration sources (studied and synthesized into this plan):

| Source | What we're borrowing |
|---|---|
| **BridgeSpace** (BridgeMind) | Multi-pane terminal grid (1–16), Warp-style command blocks, integrated Kanban, workspace templates, agent-from-task-card launch |
| **Hermes Agent** (Nous Research, MIT) | Self-improving learning loop, agent-curated MEMORY.md/USER.md, autonomous skill creation + self-improvement, FTS5 session search, heartbeat consolidation cron, pluggable context engines, subagent delegation, programmatic tool calling, any-model abstraction, Honcho user modeling |
| **OpenClaw + Hermes pattern** (Alex Finn) | Heavy + light pairing — premium model for planning, cheap/local for monitoring + execution. Shared Obsidian-style human-readable workspace. |
| **Cursor / Antigravity** | IDE-grade DX, file watching, syntax highlighting, agent-in-editor |

---

## Sprint 11 — BridgeSpace-Style Multi-Terminal Workspace
**Depends on:** Sprint 6 (Cloudflare PTY terminal) done first.

### 11A — Multi-Pane Terminal Grid
- [ ] Resizable grid layout in `/terminal` page — supports 1, 2x1, 2x2, 3x2, 4x4 splits up to 16 panes
- [ ] Per-pane agent binding (dropdown: any agent in roster + plain shell)
- [ ] Per-pane independent PTY connection to nexus-vm via Cloudflare PTY tunnel
- [ ] Pane resize via drag dividers, persists to D1 `terminal_layouts` table
- [ ] Pane focus indicator, keyboard nav (Ctrl+1..9 to focus)

### 11B — Warp-Style Command Blocks
- [ ] `terminal_blocks` D1 table: id, terminal_id, agent_name, command, output, exit_code, started_at, completed_at, duration_ms
- [ ] Each command captured as a visual block (collapsible, scrollable back through history)
- [ ] Per-block actions: copy command, copy output, re-run, share to agent
- [ ] FTS5 search across all blocks ("when did I run that wrangler deploy that failed?")

### 11C — Integrated Kanban Board (`/pipeline` evolution)
- [ ] Columns: Backlog → Routing (HERMES) → In-Progress → Review (SENTINEL) → Done
- [ ] Click task card → HERMES decomposes → terminals auto-launch with agent assignments
- [ ] Drag tasks between columns
- [ ] Per-card: assigned agents, terminal pane refs, cost so far, ETA

### 11D — Workspace Templates
- [ ] Template: "Build Sprint" — FORGE + BUILDER + SENTINEL in 3 panes + Monaco
- [ ] Template: "Lead Pipeline" — SCOUT + INTAKE + HERALD
- [ ] Template: "CAD Day" — ATLAS + FORGE + Monaco
- [ ] Template: "Research Day" — ORACLE + HERALD
- [ ] User-saved custom templates in D1

### 11E — Tab System + Themes
- [ ] Multiple named workspace tabs, color-coded, persisted to D1
- [ ] Theme picker: current cyan/navy default + 5 alternates (Plasma, Cybernetics, Synthwave, Obsidian, Hex)

**Validation Gate:**
- [ ] Open `/terminal` → see 4-pane grid with NEXUS / SCOUT / FORGE / shell bound
- [ ] Run `git status` in pane 4 → command block captures + persists
- [ ] Click Kanban card → HERMES dispatches → terminals show live agent activity
- [ ] Reload page → layout + tabs persist

---

## Sprint 12 — Cognitive Architecture (Memory + Skills + Hive Mind)
**Depends on:** R2 (✅), agent_messages (✅).
**Direct port of Hermes Agent's self-improvement loop.**

### 12A — Per-Agent Memory Files
- [ ] R2 layout: `hive/agents/{name}/MEMORY.md` + `hive/users/{userId}/USER.md`
- [ ] `MEMORY.md` schema: facts, preferences, lessons learned, common patterns, failure modes
- [ ] `USER.md` schema: communication style, technical level, decision criteria, channel preferences
- [ ] Agent system prompt includes current MEMORY.md + USER.md (refreshed at session start)
- [ ] Periodic memory writes during long sessions (every N tool calls or task completions)

### 12B — Skill Creation & Self-Improvement
- [ ] D1 `agent_skills` table: id, agent_name, skill_name, version, description, steps_md, success_count, failure_count, last_used, created_at
- [ ] After complex task → agent checks for reusable skill match (semantic via Vectorize)
- [ ] If match → executes via skill; logs outcome (success/failure + reason)
- [ ] If no match → agent creates new skill (version 1)
- [ ] If repeated failure on existing skill → agent rewrites and bumps version
- [ ] agentskills.io open standard compatibility (portable JSON schema)
- [ ] Skill marketplace inside `/skills` page — list + diff versions + manual edit

### 12C — Session Search (FTS5)
- [ ] Virtual table `agent_messages_fts` on D1 (body + subject + payload_json)
- [ ] NEXUS uses FTS5 search on every routing decision: "have we handled this before?"
- [ ] `/search` Cockpit page — query all past messages with snippet highlighting

### 12D — Heartbeat Consolidation
- [ ] Cron Worker every 6 hours — wakes each active agent
- [ ] Per heartbeat: review skills, consolidate redundant entries in MEMORY.md, clean stale state, write status file to R2 `hive/status/{agent}.json`
- [ ] Heartbeat log written to `agent_heartbeats` D1 table for audit

### 12E — Pluggable Context Engines
- [ ] Interface in `src/lib/context-engine.ts`: `compress()`, `retrieve()`, `prune()`
- [ ] Default impl: lossy summarization via Claude Haiku 4.5
- [ ] Alt impls (future): semantic chunking, importance-weighted retention, agent-specific rules
- [ ] Per-agent config selects engine in D1 `agent_config` table

### 12F — Hive Mind
- [ ] Vectorize index `hive-memory` — embeds every MEMORY.md update + every completed task summary
- [ ] Cross-agent semantic search: "any agent ever solved this?"
- [ ] HERMES uses hive-memory for routing decisions ("FORGE solved this on project X 3 weeks ago")
- [ ] Project contextualization sub-graph: filter Vectorize by `pipeline_id` for "what did we learn on this engagement?"
- [ ] Hive dashboard `/hive` — visualization of memory clusters, recent learnings, skill counts per agent

### 12G — USER.md Evolution
- [ ] INTAKE + every agent that interacts with Connor contributes learnings to `USER.md`
- [ ] Append-only diff log in `user_profile_diffs` D1 table
- [ ] Honcho-inspired dialectic modeling: when Connor corrects an agent → diff vs original → memory update
- [ ] Per-channel style memory (LinkedIn voice ≠ email voice ≠ proposal voice — separate USER.md sections)

**Validation Gate:**
- [ ] FORGE completes a task → creates `feature_implementation_v1` skill in D1
- [ ] FORGE retries same task pattern → matches skill via Vectorize → executes via skill steps
- [ ] After heartbeat → `hive/status/FORGE.json` exists with skill counts + last activity
- [ ] Cross-agent: ATLAS searches hive-memory for "stress analysis" → finds FORGE's prior CAD work

---

## Sprint 13 — Benchmark-Driven LLM Router (In-House OpenRouter)
**Depends on:** Sprint 5 analytics tables (0006).
**Replaces paid OpenRouter dependency entirely.**

### 13A — Provider Abstraction
- [ ] `src/lib/llm/providers/` — one file per provider (Anthropic, OpenAI, OpenRouter, Workers AI, Groq, NVIDIA NIM, local Ollama)
- [ ] Unified interface: `complete(model, messages, tools, max_tokens)` returns `{ content, tokens, cost_usd, latency_ms }`
- [ ] Streaming support across all providers (SSE → uniform event stream)
- [ ] Tool-use normalization (some providers don't support tool-use → fall back to JSON schema prompting)

### 13B — Model Registry
- [ ] `cms_ai_models` D1 table (already planned for Sprint 5): provider, model_id, context_window, cost_per_1k_input, cost_per_1k_output, latency_p50_ms, license, free_tier, tier
- [ ] Seed: Claude family, GPT-5/5.5, Gemini 2.5, Llama 3.3, Qwen 2.5, Mistral, DeepSeek, Workers AI models, local Qwen on nexus-vm
- [ ] Auto-discovery: nightly Cron checks models.dev for new releases, alerts Connor

### 13C — Benchmark Harness
- [ ] `src/lib/llm/benchmark.ts` — 12 standardized tasks:
  - Code generation (TypeScript/Python/SQL)
  - JSON schema extraction
  - Summarization (long → short)
  - Lead qualification (structured output)
  - Reasoning chain (multi-step)
  - Tool-use (multi-call)
  - Vision (image → description)
  - Translation
  - Style transfer (formal ↔ casual)
  - Code review
  - Bug diagnosis
  - Creative copy (LinkedIn post)
- [ ] Weekly Cron runs all enabled models against all tasks
- [ ] SENTINEL scores each output 0-10 (rubric per task type)
- [ ] Results to `model_benchmarks` D1 table: model_id, task_type, score, tokens, cost, latency, sample_output

### 13D — Routing Policy
- [ ] `ai_routing_policy` D1 table: agent_name, task_type, model_id, priority, fallback_chain (JSON array of model_ids)
- [ ] NEXUS reads policy on every LLM call
- [ ] Override mechanism: force a specific model for a single call

### 13E — Thompson Sampling
- [ ] `ai_routing_arms` table (per Sprint 10 plan): agent_name, task_type, model_id, alpha, beta, last_updated
- [ ] On each call: sample Beta(α, β) per candidate model → select highest sample → log decision
- [ ] On outcome (success + within budget) → arm.alpha += 1; on failure → arm.beta += 1
- [ ] Online learning replaces static policy over time

### 13F — Cost Guardrails
- [ ] Per-session cap: $X per chat session
- [ ] Per-day cap: $Y per user per day
- [ ] Per-agent cap: $Z per agent per day
- [ ] Hard-stop if exceeded; show graceful message to user
- [ ] Telegram alert when 80% of daily cap reached

### 13G — Free Model Pool
- [ ] Workers AI free tier models (Gemma, Llama, Mistral, Phi)
- [ ] OpenRouter free models (gemma-9b-it, llama-3.1-8b, etc.)
- [ ] Local Ollama on nexus-vm: Qwen 2.5 7B + Llama 3.2 3B (free, runs on the e2-micro after swap fix)
- [ ] Free models used for: summarization, classification, JSON extraction, simple Q&A
- [ ] Premium models reserved for: code generation, reasoning, qualification, client-facing copy

### 13H — Cost Dashboard
- [ ] `/ai-providers` page expansion: live cost per agent, per task_type, per day
- [ ] Per-model usage breakdown (calls, tokens, cost, avg latency, success %)
- [ ] Kill-switch per model
- [ ] Benchmark leaderboard tab: weekly rankings per task type

### 13I — Local Inference
- [ ] Install Ollama on nexus-vm: `curl -fsSL https://ollama.com/install.sh | sh`
- [ ] Pull Qwen 2.5 7B + Llama 3.2 3B
- [ ] Expose via Cloudflare Tunnel on port 11434
- [ ] Add `ollama-local` provider in registry
- [ ] Measure latency from Workers → tunnel → Ollama

**Validation Gate:**
- [ ] Benchmark Cron runs nightly, populates `model_benchmarks` with ≥ 10 models × 12 tasks
- [ ] SCOUT qualification call uses claude-haiku (cheap+fast) not opus
- [ ] HERALD content draft uses claude-opus (best quality) not haiku
- [ ] Local Qwen on nexus-vm handles summarization at $0 marginal cost
- [ ] `/ai-providers` shows daily cost trend, top 3 models by usage

---

## Sprint 14 — Multi-Agent Parallel Execution Engine (your HERMES)
**Depends on:** agent_messages (✅), git worktrees (✅).
**Most plumbing already exists — this sprint is closer than the others.**

### 14A — HERMES Decomposer Agent
- [ ] New agent role added to `src/lib/agents.ts`: HERMES (Inter-Agent Coordination)
- [ ] System prompt: receives complex task → outputs JSON subtask DAG (subtasks + dependencies + agent assignments + estimated cost + risk)
- [ ] HERMES is invoked when NEXUS detects a task that touches 2+ agents

### 14B — Subtask Graph
- [ ] `agent_subtasks` D1 table: id, parent_task_id, pipeline_id, agent_name, depends_on_subtask_id, status (queued|running|done|failed|cancelled), input_payload, output_payload, cost_usd, tokens, started_at, completed_at
- [ ] Topological scheduler: subtask runs only when all `depends_on` are `done`

### 14C — Parallel Execution Orchestrator
- [ ] `src/lib/orchestrator.ts` — dispatches subtasks via Cloudflare Queues
- [ ] Each completion fires an event → orchestrator checks for unblocked dependents → dispatches them
- [ ] Worker handler `workers/orchestrator-consumer.ts` — runs the subtask, writes outcome

### 14D — Conflict Resolution
- [ ] `file_locks` D1 table: file_path, agent_name, locked_at, expires_at, lock_token
- [ ] Agent must acquire lock before editing a file in a shared worktree
- [ ] On conflict: HERMES requests both agents' diffs → uses Claude to do semantic merge → SENTINEL reviews → applies

### 14E — Worktree Isolation
- [ ] (✅ Done) Each agent has its own worktree at `~/ll-cockpit-{agent}` on nexus-vm
- [ ] Worktree branch naming: `agent/{agent_name}/{subtask_id}`
- [ ] After subtask done → SENTINEL scores → if pass, branch ready for merge to main

### 14F — Live Progress Dashboard
- [ ] `/orchestrator` page — visual DAG (react-flow or mermaid)
- [ ] Live status per node, cost rollup, ETA
- [ ] Click node → drill into agent_messages for that subtask
- [ ] Streaming updates via SSE

### 14G — Cancellation / Pause / Replay
- [ ] UI controls: cancel subtask, pause pipeline, replay from failed subtask
- [ ] State machine on `pipeline_runs.status`: running | paused | completed | failed | cancelled
- [ ] Replay copies subtask inputs and re-dispatches (does not duplicate completed work)

### 14H — SENTINEL Merge Gate
- [ ] Before merging worktree branches to main → SENTINEL scores all branches
- [ ] Blocks if any < 80
- [ ] Auto-merges if all ≥ 80 AND no conflicts
- [ ] Telegram approval if any conflict requires Connor's call

### 14I — Telegram Parallel Summaries
- [ ] HERMES sends one rolled-up Telegram message: "Pipeline X completed. 4 subtasks done. FORGE shipped Y. BUILDER deployed Z. SENTINEL passed all. Total cost $A. Approve merge?"
- [ ] Single inline button approves whole pipeline

**Validation Gate:**
- [ ] Send NEXUS: "build a Stripe integration with tests and a deploy"
- [ ] HERMES decomposes into 4 subtasks: FORGE writes code, FORGE writes tests, BUILDER runs CI, BUILDER deploys
- [ ] 3 of 4 run in parallel where dependencies allow
- [ ] `/orchestrator` shows live DAG with cost ticking up
- [ ] On completion → Telegram summary → Connor approves → merged

---

## Sprint 15 — Human-in-the-Loop Creativity Bridge
**Depends on:** PermissionGate (Sprint 4), Telegram (Sprint 7).
**Where AI hands off to your judgment — and learns from what you do next.**

### 15A — Confidence Scoring
- [ ] Every agent output gets a confidence 0-1
- [ ] Combined from: model's self-report ("how sure are you?" 1-10), SENTINEL's quality score, novelty score (Vectorize distance from past work)
- [ ] `agent_outputs.confidence` column added in D1
- [ ] Below threshold (default 0.7) → HITL gate triggered

### 15B — Approval Queue Page
- [ ] `/approvals` page — cards listing pending HITL items
- [ ] Per-card: diff preview, agent context, confidence breakdown, source task chain
- [ ] Actions: Approve / Edit / Reject (with reason)
- [ ] Bulk approve for trusted patterns

### 15C — Telegram Inline Approvals
- [ ] Approve / Edit / Reject buttons on Telegram message
- [ ] For Edit: deep-link to `/approvals/{id}` for full textarea editing
- [ ] Confirmation echoed back in Cockpit

### 15D — Edit-Learning Loop
- [ ] When Connor edits an output → HERMES diff-compares Connor's edit vs original
- [ ] Diff stored in `style_corrections` D1 table: agent_name, channel, original, corrected, diff, context
- [ ] Style corrections fed into HERALD/INTAKE prompt-builders on future tasks ("Connor typically rewrites X → Y")

### 15E — Creative Gates
- [ ] Specific stages flagged "human-required" in `ai_routing_policy`:
  - Final proposal language (INTAKE)
  - Case study tone (DISPATCH)
  - Brand-sensitive copy (HERALD)
  - First sentence of every cold email (SCOUT)
- [ ] These can never auto-publish; always queue to `/approvals`

### 15F — Pair Programming Mode
- [ ] Live cursor visibility in Monaco — FORGE's edits stream to editor in real-time
- [ ] Connor can interject mid-stream (Ctrl+. accepts current state, gives feedback in inline comment)
- [ ] Y/N prompts inline in editor for FORGE's design decisions

### 15G — Reasoning Trace Surfacing
- [ ] Before Connor approves anything → show agent's reasoning ("I chose to phrase it this way because the prospect's LinkedIn shows X")
- [ ] Reasoning stored in `agent_messages.body` as a structured block (`<reasoning>...</reasoning>`)
- [ ] Helps Connor calibrate trust and refine prompts

### 15H — Per-Channel Style Memory
- [ ] `USER.md` partitioned per channel: linkedin, email, proposal, blog, slack, telegram
- [ ] Each channel section evolves independently as Connor edits in that channel
- [ ] HERALD picks correct section based on output destination

**Validation Gate:**
- [ ] HERALD drafts LinkedIn post with confidence 0.62 → routes to `/approvals` automatically
- [ ] Connor edits it on Telegram inline → diff captured in `style_corrections`
- [ ] Next LinkedIn post HERALD writes → reflects the captured style preference
- [ ] FORGE shows reasoning trace for every code change before merge

---

## Cross-Sprint Architecture Map

| Capability | Provided by Sprint |
|---|---|
| Multi-pane terminal UI | 11 |
| Visual command blocks | 11 |
| Kanban → agent dispatch | 11 + 14 |
| Per-agent persistent memory | 12 |
| Skill creation + self-improvement | 12 |
| Cross-agent hive mind | 12 |
| Heartbeat consolidation | 12 |
| Multi-provider LLM access | 13 |
| Benchmark-driven model selection | 13 |
| Thompson Sampling routing | 13 (overlaps with Sprint 10 G3) |
| Free + local model pool | 13 |
| Cost guardrails | 13 |
| Parallel agent execution | 14 |
| File-level conflict resolution | 14 |
| Subtask DAG visualization | 14 |
| HITL approval queue | 15 |
| Edit-learning feedback loop | 15 |
| Reasoning trace surfacing | 15 |
| Per-channel style memory | 15 |

## Total Added Items
- Sprint 11: ~25
- Sprint 12: ~25
- Sprint 13: ~30
- Sprint 14: ~20
- Sprint 15: ~20

**Subtotal: ~120 new items.**
**Grand total (with original ~240): ~360 items from current state to fully autonomous, self-improving, multi-agent NEXUS Cockpit.**

---

## Suggested Sequencing

**Recommended order:** 14 → 13 → 12 → 11 → 15

**Rationale:**
- **Sprint 14 first** because most plumbing already exists (agent_messages ✅, worktrees ✅, Pipeline 1 spine in progress). Quick win that validates the whole multi-agent thesis.
- **Sprint 13 second** because cost control becomes urgent once 14 spawns parallel agents (you'll bleed money fast without a router).
- **Sprint 12 third** because once agents are running in parallel + routing intelligently, memory/skills compound the quality.
- **Sprint 11 fourth** — the UI layer that makes it all visible and usable as a daily driver.
- **Sprint 15 last** — HITL bridge sits on top of everything else and benefits from confidence scores from 13 + routing context from 14.

Alternative if "build the showcase first" matters more: 11 → 14 → 13 → 12 → 15 (Cockpit looks impressive immediately, then layer in the brains).
