# NEXUS WORKING RULES
*Regenerated 2026-07-05 (post CAD-triad / async-convergence / telemetry arc).
Authority order for anything technical: live code (GitHub MCP, branch ref) and
live D1 first; live Cloudflare account state second; project docs third.
This file is behavioral law for Mode B. Full replace — no append edits.*

---

## 1 · Lanes & locks

- Four build lanes: **A** `ll-cockpit-cad` · **B** `ll-cockpit` (revenue spine +
  agent foundation) · **C** parity surfaces · **D** new verticals. Never edit
  another lane's repo without an explicit lane switch from Connor.
- **Hot files** (lane-lock claim required before writing; minimal diff surface):
  `src/types/**`, `src/lib/agents.ts`, `src/lib/orchestrator.ts`, `wrangler.toml`.
- Branch naming: `lane-<x>/<slug>` off `main`. Claude Code opens a PR, never merges.
- Max 4 commits per PR. Diff targets: 30–50 lines per commit, 200 max for mega.

## 2 · Verification discipline (non-negotiable)

- **Live code is the authority.** Read via GitHub MCP `get_file_contents` with
  `ref: refs/heads/main` (or `refs/pull/{N}/head` for PR review) before describing
  any code. Snapshots (`nexus_codebase_snapshot_CAD.md` / `_PATCH.md`) are hints
  that lag reality.
- **D1 read-back after every write.** `changes:1` / `{ok:true}` is not proof.
  This applies to MCP tools too — `update_sprint_status` and `seed_knowledge`
  can report ok on writes that must still be SELECT-verified.
- Never trust Claude Code's self-reported typecheck without `npm ci` first;
  lockfile must be in sync with `package.json`.
- **Deploy-timing rule (burned us 3×):** after any merge, confirm the
  **"Deploy to Cloudflare"** Actions run for *that commit* is green before
  running behavioral tests. A test fired inside the deploy window tests OLD
  code and produces false verdicts. In-band check: if the change altered a
  prompt/task string, verify the new text appears in the D1 row the run
  produced (task-text deploy check).
- The GitHub-managed "pages build and deployment" workflow failing is noise
  (Pages should be disabled: repo Settings → Pages → Source: None). It cannot
  block the Cloudflare deploy.

## 3 · D1 & migrations

- Wrangler `d1 migrations apply` throws 7403 → workaround is law: apply DDL via
  D1 MCP, then reconcile `INSERT INTO d1_migrations (name)`, then SELECT
  read-back, then commit the matching `migrations/00NN_*.sql` file for repo
  consistency (marked "already applied in prod — do not run").
- **Column/table before code**: schema must exist in prod before code that
  writes it deploys.
- Lane B migration band: **0040–0059** exclusively. Last reconciled:
  `0045_tool_call_log.sql` (d1_migrations id 42).
- Multi-statement MCP queries return only the LAST result set — put the SELECT
  last, split diagnostics.
- `strftime('%s','now')` for Unix timestamps; `check` is reserved in SQLite —
  alias as `chk`/`label`. `ALTER TABLE ... ADD COLUMN` is safe standalone.
- Prod schema facts that bit us: `agent_subtasks` has `started_at`/`completed_at`
  (populated every run) but NO `updated_at`; per-subtask `model_id` TEXT added
  in 0044; `tool_call_log` added in 0045.

## 4 · Cloudflare MCP access — FULL (granted 2026-07-05)

Connor granted **Always Allow on ALL Cloudflare Developer Platform MCP tools**
(read + write/delete groups). Standing rule every session:

- USE them proactively — no per-call permission asks.
- `search_cloudflare_documentation`: verify platform facts (limits, API shapes)
  BEFORE any architecture decision leans on them. Never claim a lookup that
  did not run.
- `workers_list` / `get_worker` / `get_worker_code`: live deploy ground truth.
- KV / R2 / D1 get+list: live binding verification — live account state now sits
  alongside the repo `wrangler.toml` for the "never invent a binding" rule.
- **Destructive tools** (delete database/bucket/namespace): permission layer says
  Always Allow, but Claude NEVER calls them unless Connor explicitly names the
  target in-chat. Connor retains destructive/merge/deploy authority. Read-back
  after every write stays mandatory.
- Tool exposure is per-conversation: if a session exposes only a subset, Claude
  says so plainly (per-chat tools menu or fresh chat fixes it) — never fakes
  capability. Rule also seeded in NEXUS Knowledge: node
  `8b6dc4c8-6a06-4d54-99b8-be8380bc8775` (sprint 0, status reference).

## 5 · NEXUS Knowledge MCP quirks

- `search_knowledge` misses freshly-seeded nodes until embed completes — verify
  fresh seeds with `get_sprint_status` (explicit sprint number) or direct D1.
- Seeds land in the **`sprint_items`** table even when `type=study_node`
  (`study_nodes` table stays empty) — read-back there. No `type` column;
  `status` includes `reference`.
- `seed_knowledge`: `sprint_number` as integer; `tags` as comma-separated string.
- Verify sprint-number availability with `get_sprint_status` before proposing.

## 6 · Async lane / orchestration rules

- Async verification is **D1 polling**, not the browser Promise and not the UI.
  Decompose with `started_at − created_at` (queue wait) vs `completed_at −
  started_at` (exec); `model_id` carries `tool-loop:{N}i:{M}tc` for tool agents,
  the real model id for router agents; `tool_call_log` has per-tool AND per-LLM
  (`_llm`) rows once the telemetry slice is deployed.
- **Zombie rule:** a subtask `running` with no completion far beyond its class
  norm (~30-60s modeler, ~10s reviewer) and no fresh `cost_ledger` build rows is
  a suspected killed consumer invocation (error path never ran). Tidy via
  conditional D1 UPDATE (`... AND status='running'`), mark run/convergence
  failed, cancel stranded dependents, log the incident.
- Known open gap: a failed/zombied modeler strands its dependent reviewer at
  `pending` until the */15 heartbeat — convergence-failure path is a pending
  hardening slice (Cloudflare Workflows is the candidate end-state; decision
  gated on the documented Queues consumer wall-clock limit — verify via docs
  tool).
- Regression testing of the convergence loop uses the **deterministic seed flaw**
  (cycle-1 modeler gets a self-consistent wrong spec; reviewer judges the real
  spec) — soft "build it wrong" instructions are probabilistic and forbidden.
- Reviewer verdicts are fail-closed: unparseable JSON = reject.

## 7 · Engineering integrity (the moat — never relax)

- Connor provides **PE-level sign-off** on every engineering coefficient, load
  model, or physically-consequential formula before it enters code. LLMs are
  transcription assistants, never originators of engineering facts, standards
  citations, or safety steps.
- Engineering blocks (FMEA, spec sheets, compliance matrices) use structured
  settings injection, not LLM repopulation.
- All LLM calls: native fetch to `api.anthropic.com` — never the SDK. (AI
  Gateway routing, when enabled via `ANTHROPIC_GATEWAY_URL` secret, is a
  base-URL swap and stays native-fetch — architecture-compatible.)

## 8 · Naming / numbering

- Parity programs are 119/120/121/122 (not 19–22). Agent-worker band: 44–63.
- "HERMES" has a four-way collision (coordinator agent #13, Hermes-core sprints,
  Hermes-mirror 147–150, Nous Hermes Agent) — disambiguate explicitly.
- CAD slice lineage: 1 → 1.5 → 2a → 2b → 2c → A1 → A2a → A2b (+ fix arc
  #180–#183, telemetry slice).

## 9 · Doc & session hygiene

- Doc-sync triggers: 20–30 commits/slices, drift detected, major architecture
  decision, new band/phase, before long breaks.
- Regenerate as **full replaces**: `nexus_session_context.md`, snapshots.
  Changelogs are a **new dated file per session**
  (`nexus_changelog_<YYYY-MM-DD>_<topic>.md`) — the project folder is
  add-or-replace only; never plan to append.
- YELLOW verdicts require a logged debt entry in the current dated changelog.
  Standing debts include: #183 feedback instruction stayed in but did NOT fix
  cycle-2 latency (failed hypothesis, harmless); qwen reseed hazard + missing
  `reviewer` row in `nexus_model_routing_seed.sql`; `agent_modeler.md` /
  `agent_reviewer.md` don't exist (agents live only in `src/lib/agents.ts`);
  snapshot regen owed; nexus-exec GHA deploy; CAD_EXEC_USD_PER_SEC placeholder;
  tool-loop LLM costUsd=0; artifact_registry.client_id NULL on promote path.
