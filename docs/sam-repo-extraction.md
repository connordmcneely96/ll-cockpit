# Sam's Repo Extraction — leadership-legacy

> Full value extraction from `SamPrimeaux/leadership-legacy`.
> Stack: Vite + vanilla React + Cloudflare Worker.
> Nothing is copied directly — all patterns are adapted for Next.js 15 + TypeScript + Tailwind.
> Last reviewed: May 7, 2026.

---

## 1. Worker API Routes (High Value — Add to ll-cockpit)

Sam's `src/worker/index.js` has these API routes we can adapt directly to Next.js API routes:

### `/api/health` — Enhanced health check
Current ll-cockpit /api/health is minimal. Sam's version reports:
- `openaiConfigured` / `anthropicConfigured` (key presence check)
- `r2Binding` (R2 binding available)
- `worker: 'online'` + timestamp

Action: Update `/api/health` to report all binding presence checks.

### `/api/ai/providers` — Live AI provider status
Returns configured state of all AI providers (Anthropic, OpenAI, Gemini, Workers AI)
based on which secrets are present as env vars. Used to drive the AI Providers dashboard page.

Action: Add `/api/ai/providers` route to ll-cockpit — checks which secrets are deployed.

### `/api/r2/list` — R2 object browser
Accepts `?prefix=` query param. Returns up to 100 objects with key, size, uploaded, etag.
Used to wire the R2 section in ExplorerPanel.

Action: Add `/api/r2/list` route — ll-cockpit already has R2 binding as env.R2.

### `/api/r2/text` — R2 file reader
Accepts `?key=` param. Validates file is text-type by extension. Returns file content as text.
Used to open R2 files in Monaco editor.

Action: Add `/api/r2/text` route.

### `/api/r2/object/:key` — R2 raw object streaming
Streams raw binary/text object from R2 with proper content-type headers.
Used for asset previews (images, PDFs, etc).

Action: Add `/api/r2/object/[...key]` dynamic route.

### `/api/agent/code` — AI code assistance (Adapted)
Sam uses OpenAI for code edits. We replace with Anthropic.
POST body: `{ model, filename, language, code, instruction }`
Returns: `{ ok, model, filename, language, code, usage }`
This wires the right AgentPanel's Monaco edit capability.

Action: Add `/api/agent/code` route using Anthropic instead of OpenAI.

### `/api/github/status` — GitHub OAuth status
Returns which GitHub secrets are configured.

Action: Add this route — drives GitHub integration status in ExplorerPanel.

### `/api/oauth/github/start` + `/api/oauth/google/start`
OAuth redirect initiators for GitHub and Google Drive.
GitHub scope: `repo read:user user:email`
Google scope: openid + email + profile + drive.readonly + gmail.readonly + gmail.compose

Action: Add these routes when wiring GitHub/Drive OAuth flows.

---

## 2. D1 Schema (High Value — New Migrations)

### `002_dashboard_ai_and_cms_runtime.sql` → D1 Migration

Three new tables for ll-cockpit:

```sql
-- AI provider registry
CREATE TABLE IF NOT EXISTS cms_ai_providers (
  id TEXT PRIMARY KEY,
  provider_key TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  secret_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'needs_secret',
  use_cases_json TEXT NOT NULL DEFAULT '[]',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- AI model registry
CREATE TABLE IF NOT EXISTS cms_ai_models (
  id TEXT PRIMARY KEY,
  provider_key TEXT NOT NULL,
  model_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  lane TEXT NOT NULL,       -- cheap_fast_router, default_workhorse, senior_reasoning, blocked
  is_enabled INTEGER NOT NULL DEFAULT 1,
  is_blocked INTEGER NOT NULL DEFAULT 0,
  input_price_per_mtok REAL,
  output_price_per_mtok REAL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(provider_key, model_key)
);

-- AI routing policy
CREATE TABLE IF NOT EXISTS cms_ai_routing_policy (
  id TEXT PRIMARY KEY,
  policy_key TEXT NOT NULL UNIQUE,
  default_text_model TEXT,
  cheap_text_model TEXT,
  senior_text_model TEXT,
  default_image_model TEXT,
  standard_image_model TEXT,
  review_provider TEXT,     -- 'anthropic' for code review, 'openai' for generation
  blocked_models_json TEXT NOT NULL DEFAULT '[]',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

Seed data includes: Anthropic (claude-sonnet, claude-haiku) + OpenAI lanes + blocked models policy.
Routing policy: `cheap_text=gpt-5.4-nano`, `default=claude-sonnet-4-5`, `senior=claude-opus-4`, `review_provider=anthropic`.

### `003_r2_asset_registry.sql` → D1 Migration

Two new tables:
```sql
-- R2 bucket registry
CREATE TABLE IF NOT EXISTS cms_r2_buckets (
  id TEXT PRIMARY KEY,
  binding_name TEXT NOT NULL UNIQUE,  -- 'R2' in ll-cockpit
  bucket_name TEXT NOT NULL,           -- 'll-cockpit-r2'
  public_dev_url TEXT,
  s3_endpoint TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- R2 object catalog (metadata index)
CREATE TABLE IF NOT EXISTS cms_r2_objects (
  id TEXT PRIMARY KEY,
  bucket_binding TEXT NOT NULL,
  object_key TEXT NOT NULL,
  object_type TEXT NOT NULL DEFAULT 'asset',
  content_type TEXT,
  size_bytes INTEGER,
  public_url TEXT,
  etag TEXT,
  usage_context TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(bucket_binding, object_key)
);
```

This enables the IDE to index and catalog all R2 objects in D1 for fast browsing.

---

## 3. Supabase Schema (High Value — Reference for Analytics + RAG)

Sam's `010_full_cms_analytics_rag.sql` (23KB) defines:

### Analytics tables (adapt to ll-cockpit)
- `analytics_events` — page views, sessions, referrers, user agents
- `analytics_sessions` — session tracking
- `analytics_page_performance` — LCP, FCP, CLS metrics
- `analytics_goal_completions` — conversion tracking

### RAG tables (adapt to ATLAS_RAG Vectorize)
- `rag_documents` — document registry
- `rag_chunks` — text chunks with embeddings
- `rag_queries` — query history + scores
- `rag_evals` — evaluation runs

### AI telemetry tables
- `ai_completions` — every AI call logged (provider, model, tokens, cost, latency)
- `ai_routing_decisions` — which model was selected and why
- `ai_evals_results` — eval scores by provider/model

These map directly to ll-cockpit's `agent_perf` and `tool_calls` tables. Sam's schema is more mature.

### Functions (`011_full_cms_functions.sql`)
- `get_analytics_summary(days)` — aggregated page view summary
- `get_top_pages(limit, days)` — top performing pages
- `get_ai_cost_summary(days)` — cost breakdown by provider/model
- `get_model_performance_summary()` — quality + cost per model

Action: Use these as reference when building SENTINEL's analytics dashboard and ORACLE's cost reporting.

---

## 4. UI Patterns (Adapt to Cockpit)

### `useResizablePanels` hook
Drag-resizable panel widths/heights stored in localStorage.
- `explorerWidth` default 250px (min 190, max 440)
- `agentWidth` default 340px (min 280, max 620)
- `terminalHeight` default 250px (min 150, max 540)
- Drag dividers: `beginDrag(type, mouseEvent)` pattern

Action: Port to TypeScript for ll-cockpit layout.

### Terminal command presets strip
A row of clickable preset commands above the terminal.
Click → copies to clipboard + echoes in xterm.
Sam's presets: `npm run dev`, `npm run build`, `wrangler deploy`, `git status`, `git add -A`, `git commit -m "..."`, `git push`

Action: Add command strip to our terminal dock.

### Monaco Editor file tree pattern
- Language detection by file extension (`getLanguageFromKey`)
- File tree backed by R2 objects (list R2 → render as tree)
- Tab system with active file tracking
- `updateFile(content)` pattern for agent edit → apply to editor
- Minimap enabled, font size 13, line height 21, tab size 2

Action: Use as reference to wire our `/ide` page fully.

### ExplorerPanel R2 section pattern
- `loadR2Objects(prefix)` → fetches `/api/r2/list?prefix=`
- `openR2Object(key)` → fetches `/api/r2/text?key=` → opens in Monaco
- Refresh button + Upload button + prefix filter buttons (Root, cms/, assets/, snapshots/)
- Shows up to 24 objects in the sidebar list

### Agent panel "apply to editor" pattern
```jsx
// Agent response includes a code block
// "Apply to editor" button calls updateFile(code)
// This syncs AI output directly into Monaco
```
Action: Wire AgentPanel's AI responses to Monaco editor in IDE view.

---

## 5. Dashboard Pages to Add to Cockpit

| Sam's page | ll-cockpit equivalent | Priority |
|---|---|---|
| `DashboardHome.jsx` | Already have (stat cards + agent grid) | Done |
| `AIProviders.jsx` | New: `/ai-providers` — shows provider status, model registry, routing policy | High |
| `R2Storage.jsx` | New: `/storage` — full R2 object browser with prefix drill-down | High |
| `Analytics.jsx` | New: `/analytics` — session/page/cost metrics from D1 + Supabase | Medium |
| `Leads.jsx` | New: `/leads` — SCOUT lead pipeline view | Medium |
| `MediaLibrary.jsx` | New: `/media` — R2 image/asset gallery | Low |
| `CMSPages.jsx` | New: `/cms` — public site page manager | Low |
| `Publishing.jsx` | Part of HERALD agent toolchain | Low |
| `DevCockpit.jsx` | Already covered by IDE + Pipeline views | Skip |
| `Settings.jsx` | Already have `/settings` | Extend |

---

## 6. Services/Positioning (Reference Only — No Code Change)

Sam's `nav.config.js` defines the service lines for Leadership Legacy Digital:

```
- AI Engineering
- RAG Systems
- Full-Stack Apps
- CAD Automation
- CAD-to-Video
- Business Automation
- Consulting
```

These should map to NEXUS agent capabilities and be reflected in the HERALD content scheduler
and INTAKE qualification questions.

---

## 7. AI Provider Architecture (Critical — Adapt for NEXUS)

Sam's routing policy design is the right model for NEXUS multi-provider routing:

```
Lane              Model               Use case
─────────────────────────────────────────────────────
cheap_fast_router  claude-haiku        Classification, routing, simple Q&A
default_workhorse  claude-sonnet-4-5   Standard agent tasks (current default)
senior_reasoning   claude-opus-4       Complex reasoning, architecture decisions
review_provider    anthropic           Code review (SENTINEL), QA
budget_image       Workers AI Flux     Internal image generation
standard_image     Veo 3 (free)        Client-facing video/visuals
blocked            (any model policy)  Blocked by project decision
```

This directly informs `nexus_model_routing_seed.sql` — our routing table should mirror this lane structure.

---

## 8. OAuth Integration Pattern (For Future Sprint)

Sam has the exact redirect flow pattern for:
- **GitHub OAuth**: `client_id` + `redirect_uri` + `scope: repo read:user user:email`
- **Google OAuth**: Scopes include drive.readonly + gmail.readonly + gmail.compose

For ll-cockpit, these routes become:
- `GET /api/oauth/github/start` → redirect to GitHub
- `GET /api/oauth/github/callback` → exchange code for token, store in KV
- `GET /api/oauth/google/start` → redirect to Google
- `GET /api/oauth/google/callback` → exchange code, store in KV

Tokens stored in Cloudflare KV under `oauth:github:{userId}` and `oauth:google:{userId}`.

---

## 9. cleanOpenAIKey / Key Validation Pattern

Sam has a robust API key cleaning function that handles common mistakes:
- Keys accidentally including `OPENAI_API_KEY=` prefix
- Keys wrapped in quotes
- Trailing whitespace

Adapt for ll-cockpit's `ANTHROPIC_API_KEY` validation in `/api/health`.

---

## Build Sequencing (Recommended Order)

Based on this extraction, here is what to build next in priority order:

1. **Resizable panels** — `useResizablePanels` TypeScript port into CockpitLayout
2. **R2 API routes** — `/api/r2/list`, `/api/r2/text`, `/api/r2/object/[...key]`
3. **Wire Monaco IDE** — file tree from R2, tabs, language detection, agent edit apply
4. **AI Providers page** — `/ai-providers` reading from D1 + `/api/ai/providers`
5. **D1 migrations** — `cms_ai_providers`, `cms_ai_models`, `cms_ai_routing_policy`, `cms_r2_buckets`, `cms_r2_objects`
6. **R2 Storage page** — `/storage` full browser
7. **Analytics page** — `/analytics` from D1 agent_perf + Supabase
8. **OAuth flows** — GitHub + Google Drive
9. **Command strip** — terminal preset commands
10. **Agent-to-editor bridge** — AgentPanel AI output applies directly to Monaco
