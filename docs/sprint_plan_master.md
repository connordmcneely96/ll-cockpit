# NEXUS Cockpit — Master Sprint Plan

> Living document. Updated: May 7, 2026.
> Source of truth for all build sequencing.
> Rule: Nothing ships without streaming working first.

---

## Sprint Status Overview

| Sprint | Theme | Status |
|---|---|---|
| Sprint 1 | Cloudflare Foundation | ✅ COMPLETE |
| Sprint 2 | Knowledge Pipeline + MCP | ✅ COMPLETE |
| Sprint 3 | Supabase Mirror + ChatGPT | ✅ COMPLETE |
| Sprint 4 | Cockpit Core + UI Redesign | 🔄 IN PROGRESS |
| Sprint 5 | IDE + R2 + Sam Extraction | 🔲 NEXT |
| Sprint 6 | Agent Tool Chains (Pipelines 1-3) | ⏳ QUEUED |
| Sprint 7 | Testing + Quality Gates | ⏳ QUEUED |
| Sprint 8 | PaaS Multi-Tenant Prep | ⏳ QUEUED |

---

## ✅ Sprint 1 — Cloudflare Foundation (COMPLETE)

| Item | Status |
|---|---|---|
| Create nexus-knowledge Vectorize index | ✅ done |
| Create knowledge-embed-queue Queue | ✅ done |
| D1 migration 0002 — study_nodes + sprint_items | ✅ done |
| knowledge-embed-consumer Worker deployed | ✅ done |
| /api/knowledge POST endpoint | ✅ done |
| Root wrangler.toml updated with 3 new bindings | ✅ done |
| D1 migration 0003 — tenant_id added | ✅ done |

---

## ✅ Sprint 2 — Knowledge Pipeline + MCP (COMPLETE)

| Item | Status |
|---|---|---|
| knowledge-mcp Worker with OAuthProvider deployed | ✅ done |
| OAUTH_KV namespace created and wired | ✅ done |
| COOKIE_ENCRYPTION_KEY secret set | ✅ done |
| NEXUS Knowledge MCP connector connected to Claude.ai | ✅ done |
| GitHub MCP connected | ✅ done |
| Knowledge base seeded from May 2-3 sessions | ✅ done |
| Pre-recommendation checklist in working rules | ✅ done |
| Multi-tenant blueprint documented | ✅ done |

---

## ✅ Sprint 3 — Supabase Mirror + ChatGPT (COMPLETE)

| Item | Status |
|---|---|---|
| Supabase mirror + pgvector + Edge Functions | ✅ done |
| ChatGPT Custom GPT Action wired to knowledge-search | ✅ done |
| Google Drive Cron sync Worker | ⏳ deferred (manual MCP for now) |

---

## 🔄 Sprint 4 — Cockpit Core + UI (IN PROGRESS)

| Item | Status | Priority |
|---|---|---|
| Agent streaming end-to-end (blocked: Anthropic credits) | 🔄 in_progress | P1 |
| Three-panel layout — ExplorerPanel + AgentPanel | ✅ done | P1 |
| Antigravity-style Dashboard + TopBar | ✅ done | P1 |
| Frontend redesign — Cursor/Antigravity palette | ✅ done | P1 |
| Verify Supabase auth working in production | 🔲 todo | P2 |
| Wire D1 message persistence from UI | 🔲 todo | P2 |
| Wire IDE (Monaco) route end-to-end | 🔲 todo | P2 |
| Wire Terminal (xterm.js) to VPS via WebSocket | 🔲 todo | P2 |
| Resizable panels (drag dividers between panels) | 🔲 todo | P2 |
| Chat history persistence across sessions | 🔲 todo | P3 |
| PermissionGate approve/reject loop end-to-end | 🔲 todo | P3 |

---

## 🔲 Sprint 5 — IDE + R2 + Sam Extraction (NEXT)

> All items derived from `docs/sam-repo-extraction.md`.
> Focus: Make the Cockpit a real IDE. Wire real data. Add missing pages.

### 5A — Resizable Panels
| Item | Details |
|---|---|
| `useResizablePanels` TypeScript hook | Port Sam's hook. ExplorerWidth (190-440px), AgentWidth (280-620px), TerminalHeight (150-540px). Persist to localStorage. |
| Drag dividers in layout | Add drag handles between ExplorerPanel/main and main/AgentPanel. `cursor-col-resize` on hover. |

### 5B — R2 API Routes (from Sam's worker/index.js)
| Route | Description |
|---|---|
| `GET /api/r2/list?prefix=` | List R2 objects with pagination. Returns key, size, uploaded, etag. |
| `GET /api/r2/text?key=` | Read text/code file from R2 by key. Validates extension is text type. |
| `GET /api/r2/object/[...key]` | Stream raw R2 object with proper content-type headers. |
| `GET /api/ai/providers` | Check which AI provider secrets are deployed. Returns status per provider. |
| `PUT /api/agent/code` | Anthropic-powered code assistance. Input: filename, language, code, instruction. |
| `GET /api/github/status` | Returns which GitHub OAuth secrets are configured. |
| Enhanced `GET /api/health` | Add binding presence checks (R2, AI, D1, KV, Queue). |

### 5C — Wire Monaco IDE (/ide page)
| Item | Details |
|---|---|
| Language detection by file extension | `getLanguageFromKey(key)` function — maps .tsx/.ts/.js/.css/.sql etc |
| File tree backed by R2 | Call `/api/r2/list` → render as collapsible tree by prefix |
| Tab system | Active file tracking, close button, multiple open files |
| Open R2 file in editor | Click tree item → fetch `/api/r2/text?key=` → load into Monaco |
| Monaco config | Minimap enabled, font 13px, lineHeight 21, tabSize 2, vs-dark theme |
| Agent-to-editor apply | AgentPanel code response → "Apply to editor" button calls `updateFile(code)` |
| Terminal command presets | Clickable strip above xterm: `git status`, `wrangler deploy`, `git push`, `npm run build`, etc |

### 5D — D1 New Migrations (from Sam's SQL)
| Migration | Tables | Priority |
|---|---|---|
| 0004_ai_provider_registry.sql | `cms_ai_providers`, `cms_ai_models`, `cms_ai_routing_policy` | P1 |
| 0005_r2_asset_registry.sql | `cms_r2_buckets`, `cms_r2_objects` | P1 |
| 0006_analytics.sql | `analytics_events`, `analytics_sessions`, `ai_completions`, `ai_routing_decisions` | P2 |
| 0007_agent_tables.sql | `content_queue`, `subscribers`, `revenue`, `pending_approvals` | P2 |

### 5E — New Cockpit Pages
| Page | Route | Description | Priority |
|---|---|---|---|
| AI Providers | `/ai-providers` | Live provider status, model registry, routing lanes, blocked models policy | P1 |
| R2 Storage | `/storage` | Full R2 browser — prefix drill-down, object list, open in IDE | P1 |
| Analytics | `/analytics` | Session metrics, token usage, cost by provider/model from D1 | P2 |
| Leads | `/leads` | SCOUT lead pipeline — status board with scoring | P2 |
| Media Library | `/media` | R2 image/asset gallery with upload | P3 |
| CMS Pages | `/cms` | Public site page manager (future) | P3 |

---

## ⏳ Sprint 6 — Agent Tool Chains: Three Autonomous Pipelines

> Zero paid APIs policy applies to everything here.
> Ref: `docs/agent-tool-chains.md`

### Pipeline 1 — Lead → Contract → Deposit
| Item | Agent | Week |
|---|---|---|
| ANCHOR + Stripe invoice flow | ANCHOR | Week 1 |
| Telegram Bot API wired to NEXUS approval gate | NEXUS | Week 1 |
| SCOUT Apollo loop + OpenClaw outreach | SCOUT | Week 2 |
| VPS LinkedIn scraper (port 3004) | BUILDER | Week 2 |
| INTAKE + DocuSeal contract generation | INTAKE | Week 4 |
| DocuSeal install on VPS (port 3005) | BUILDER | Week 4 |

### Pipeline 2 — Brief → Build → Deliver → Invoice
| Item | Agent | Week |
|---|---|---|
| FORGE pattern matching + GitHub push | FORGE | Week 3 |
| BUILDER Playwright MCP integration | BUILDER | Week 3 |
| BUILDER self-heal loop (3-retry + vision) | BUILDER | Week 5 |
| SENTINEL scoring dashboard in Cockpit | SENTINEL | Week 5 |
| DISPATCH delivery automation | DISPATCH | Week 6 |

### Pipeline 3 — Intelligence → Content → Publish
| Item | Agent | Week |
|---|---|---|
| HERALD content scheduler (D1 queue + LinkedIn free API) | HERALD | Week 4 |
| Content scheduler webhook on VPS (port 3006) | BUILDER | Week 4 |
| ORACLE 7am digest (RSS + YouTube + SearXNG) | ORACLE | Week 5 |
| In-house RSS aggregator Worker | ORACLE | Week 5 |

---

## ⏳ Sprint 7 — Testing + Quality Gates

> Playwright MCP is the primary test runner for Cockpit UI.
> All agents route through SENTINEL before shipping to clients.

### 7A — Playwright Setup
| Item | Details |
|---|---|
| Install Playwright MCP | `npm install -g @playwright/mcp` + connect to Claude.ai |
| `playwright.config.ts` | Target: `ll-cockpit.connorpattern.workers.dev`. Chromium only. |
| Auth fixture | Login with test Supabase credentials before each test suite. |

### 7B — Core UI Test Suite
| Test | What it covers |
|---|---|
| Layout renders | Three panels visible. ExplorerPanel, AgentPanel, StatusBar all present. |
| Agent selection | Click NEXUS in explorer → AgentPanel shows NEXUS chat. |
| Agent streaming | Send message to NEXUS → streaming dots appear → response renders. |
| IDE opens | Navigate to /ide → Monaco renders → R2 file tree loads. |
| Terminal opens | Navigate to /terminal → xterm.js renders → $ prompt visible. |
| Pipeline loads | Navigate to /pipeline → Kanban columns render with task cards. |
| Dashboard stats | Dashboard loads → 6 stat cards visible → agent grid renders all 11 agents. |
| Panel resize | Drag ExplorerPanel divider → width changes → persists after reload. |
| Command palette | Press ⌘K → palette opens → Esc closes it. |

### 7C — Agent API Test Suite
| Test | Endpoint | Assertion |
|---|---|---|
| Health check | GET /api/health | 200, all bindings present |
| AI providers | GET /api/ai/providers | 200, Anthropic configured |
| R2 list | GET /api/r2/list | 200, objects array |
| Knowledge POST | POST /api/knowledge | 200, {id, table, queued: true} |
| Agent stream | POST /api/agent/stream | 200, SSE events fire |

### 7D — SENTINEL Integration
| Item | Details |
|---|---|
| SENTINEL scores all agent outputs | Score 0-100. PASS = 80+. Results to D1 agent_perf. |
| BUILDER deploy gate | No deploy without SENTINEL PASS on current output. |
| Quality trend dashboard | /analytics shows rolling avg score by agent + task_type. |
| AUTO rubric updates | META-COGNITION updates SENTINEL weights Sunday nightly via D1. |

---

## ⏳ Sprint 8 — PaaS Multi-Tenant Prep

> Single-tenant reference is already PaaS-ready (tenant_id on all tables).
> Estimated 2-3 focused sprints to go full multi-tenant.

| Item | Details |
|---|---|
| Tenant provisioning table | `tenants` (id, name, plan, created_at) in D1 |
| Per-tenant OAuth client registration | OAUTH_KV keyed by tenant. Auto-register on first connect. |
| Vectorize metadata filtering | Add `filter: { tenant_id: tenantId }` to all Vectorize queries. |
| API route tenant scoping | Derive tenant_id from Supabase auth session. Remove 'default' hardcoding. |
| MCP Worker multi-tenant | `this.props.tenantId` from OAuth token. Scope all D1 queries. |
| Stripe subscription lifecycle | ANCHOR manages tenant billing. Dunning via Gmail MCP. |
| Tenant signup flow | /signup → provision tenant → seed knowledge → register OAuth client → issue MCP URL. |

---

## OAuth Integration Queue (Future Sprint)

> From Sam's repo extraction. Build when tool chains need them.

| Service | Scope | KV Key Pattern |
|---|---|---|
| GitHub OAuth | repo read:user user:email | `oauth:github:{userId}` |
| Google (Drive + Gmail) | drive.readonly + gmail.readonly + gmail.compose | `oauth:google:{userId}` |
| LinkedIn | w_member_social (publishing) | `oauth:linkedin:{userId}` |

Routes to add: `/api/oauth/github/start`, `/api/oauth/github/callback`, `/api/oauth/google/start`, `/api/oauth/google/callback`

---

## Deferred Items

| Item | Deferred Until | Reason |
|---|---|---|
| Google Drive Cron sync Worker | Sprint 5+ | Manual MCP sync sufficient for current volume |
| REEL video agent | Phase 2 | Veo 3 free tier not yet wired |
| DocuSeal e-signature | Sprint 6 | Needs VPS install + webhook setup |
| QuickBooks / accounting | Phase 2 | D1 revenue table sufficient for Phase 1 |
| ATLAS doc auto-ingestion | Sprint 6 | Firecrawl + Cron Worker pattern ready |

---

## Build Sequencing Rules (Non-Negotiable)

1. **Agent streaming must be confirmed working** before any agent tool chains are built
2. **R2 API routes** before Monaco IDE wiring (IDE depends on R2)
3. **D1 migrations** before new Cockpit pages (pages depend on tables)
4. **Playwright test suite** must cover each new feature before shipping to prod
5. **SENTINEL scores** every agent output before it reaches a client
6. **Zero paid APIs** — only Anthropic, Hetzner $8/mo, Stripe (revenue cost)
7. **Seed knowledge base** at the end of every session
