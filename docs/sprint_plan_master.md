# NEXUS Cockpit — Master Sprint Plan

> Living document. Updated: May 7, 2026.
> Source of truth for all build sequencing.
> Original plan: `cockpit_14day_build.md` + `nexus_phase1_orchestration.html`
> Rule: Nothing ships without streaming working first.

---

## The End Goal (Day 28)

First real paying client delivered through Cockpit. NEXUS PRIME running the business autonomously. Demo Loom recorded. LinkedIn post published. The platform earns its first dollar.

---

## The 5 “Alive” Mechanics (Must Exist in v1)

Every sprint decision is evaluated against these five — if a feature doesn’t serve one, it’s deferred.

| # | Mechanic | What it means |
|---|---|---|
| 1 | **Constant Inbound Data** | ORACLE scrapes 10-20 YouTube channels + RSS + X daily. 7am digest in Cockpit chat. You wake up to value already arrived. |
| 2 | **Contextual Suggestions** | Opening a project surfaces 3-5 relevant research items. Writing code suggests related clips. Cockpit connects dots unprompted. |
| 3 | **Memory + Trace** | Every session, agent call, and file edit logged in D1 + Vectorize. “Last time you worked on X you decided Y.” Memory compounds. |
| 4 | **Parallel Agent Activity** | Right panel shows all agents running simultaneously. SCOUT searching, FORGE generating, HERALD drafting — all visible. |
| 5 | **Automatic Artifact Generation** | HERALD auto-drafts a build log post after every session. ORACLE delivers weekly research digest. DISPATCH packages a case study after every project. |

---

## Sprint Status Overview

| Sprint | Theme | Status |
|---|---|---|
| Sprint 1 | Cloudflare Foundation | ✅ COMPLETE |
| Sprint 2 | Knowledge Pipeline + MCP | ✅ COMPLETE |
| Sprint 3 | Supabase Mirror + ChatGPT | ✅ COMPLETE |
| Sprint 4 | Cockpit Core + UI Redesign | 🔄 IN PROGRESS |
| Sprint 5 | IDE + R2 + Sam Extraction | 🔲 NEXT |
| Sprint 6 | Research Pipeline + VPS Terminal | 🔲 QUEUED |
| Sprint 7 | Agent Tool Chains (3 Pipelines) | ⏳ QUEUED |
| Sprint 8 | Testing + Quality Gates | ⏳ QUEUED |
| Sprint 9 | Day 28 Goal + First Client | ⏳ QUEUED |
| Sprint 10 | PaaS Multi-Tenant Prep | ⏳ QUEUED |

---

## ✅ Sprint 1 — Cloudflare Foundation (COMPLETE)

| Item | Status |
|---|
| Create nexus-knowledge Vectorize index | ✅ done |
| Create knowledge-embed-queue Queue | ✅ done |
| D1 migration 0002 — study_nodes + sprint_items | ✅ done |
| knowledge-embed-consumer Worker deployed | ✅ done |
| /api/knowledge POST endpoint | ✅ done |
| Root wrangler.toml updated with 3 new bindings | ✅ done |
| D1 migration 0003 — tenant_id added | ✅ done |

**Sprint 1 Validation Gate:**
- [ ] D1 schema has all 15 tables
- [ ] wrangler secret list shows all 4 secrets
- [ ] /api/health returns 200

---

## ✅ Sprint 2 — Knowledge Pipeline + MCP (COMPLETE)

| Item | Status |
|---|
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
|---|
| Supabase mirror + pgvector + Edge Functions | ✅ done |
| ChatGPT Custom GPT Action wired to knowledge-search | ✅ done |
| Google Drive Cron sync Worker | ⏳ deferred (manual MCP for now) |

---

## 🔄 Sprint 4 — Cockpit Core + UI (IN PROGRESS)

| Item | Status | Priority |
|---|---|---|
| Agent streaming end-to-end — native fetch (needs Anthropic credits) | 🔄 in_progress | P1 |
| Three-panel layout — ExplorerPanel + AgentPanel | ✅ done | P1 |
| Antigravity-style Dashboard + TopBar | ✅ done | P1 |
| Frontend redesign — Cursor/Antigravity blue-black palette | ✅ done | P1 |
| Verify Supabase auth working in production | 🔲 todo | P2 |
| Wire D1 message persistence from UI | 🔲 todo | P2 |
| Chat history persistence across sessions | 🔲 todo | P2 |
| PermissionGate approve/reject loop end-to-end | 🔲 todo | P3 |

**Sprint 4 Validation Gate:**
- [ ] Send message to NEXUS → streaming text appears in AgentPanel
- [ ] Messages persist in D1 cockpit_messages after page reload
- [ ] Supabase auth login/logout works in production
- [ ] PermissionGate approve/reject works for a tool_call

---

## 🔲 Sprint 5 — IDE + R2 + Sam Extraction (NEXT)

> Derived from `docs/sam-repo-extraction.md`.
> Focus: Make Cockpit a real IDE. Wire real data. Add missing pages.

### 5A — Resizable Panels
| Item | Details |
|---|---|
| `useResizablePanels` TypeScript hook | ExplorerWidth (190-440px), AgentWidth (280-620px), TerminalHeight (150-540px). Persist to localStorage. |
| Drag dividers | `cursor-col-resize` between ExplorerPanel/main and main/AgentPanel. |

### 5B — R2 API Routes
| Route | Description |
|---|---|
| `GET /api/r2/list?prefix=` | List R2 objects. Returns key, size, uploaded, etag. |
| `GET /api/r2/text?key=` | Read text/code file from R2. Validates extension. |
| `GET /api/r2/object/[...key]` | Stream raw R2 object with proper content-type. |
| `GET /api/ai/providers` | Check which AI provider secrets are deployed. |
| `POST /api/agent/code` | Anthropic code assistance. Input: filename, language, code, instruction. |
| `GET /api/github/status` | Returns which GitHub OAuth secrets are configured. |
| Enhanced `GET /api/health` | Binding presence checks (R2, AI, D1, KV, Queue). |

### 5C — Wire Monaco IDE (/ide page)
| Item | Details |
|---|---|
| Language detection by file extension | `getLanguageFromKey(key)` — .tsx/.ts/.js/.css/.sql etc |
| File tree backed by R2 | `/api/r2/list` → collapsible tree by prefix |
| Tab system | Active file tracking, close button, multiple open files |
| Open R2 file in editor | Click tree → fetch `/api/r2/text?key=` → load Monaco |
| Monaco config | Minimap, font 13px, lineHeight 21, tabSize 2, vs-dark |
| Agent-to-editor apply | AgentPanel code response → “Apply to editor” → `updateFile(code)` |
| Terminal command preset strip | `git status`, `wrangler deploy`, `git push`, `npm run build` |

### 5D — D1 Migrations
| Migration | Tables | Priority |
|---|---|---|
| 0004_ai_provider_registry.sql | `cms_ai_providers`, `cms_ai_models`, `cms_ai_routing_policy` | P1 |
| 0005_r2_asset_registry.sql | `cms_r2_buckets`, `cms_r2_objects` | P1 |
| 0006_analytics.sql | `analytics_events`, `analytics_sessions`, `ai_completions`, `ai_routing_decisions` | P2 |
| 0007_agent_tables.sql | `content_queue`, `subscribers`, `revenue`, `pending_approvals` | P2 |

### 5E — New Cockpit Pages
| Page | Route | Description | Priority |
|---|---|---|---|
| AI Providers | `/ai-providers` | Provider status, model registry, routing lanes, blocked models | P1 |
| R2 Storage | `/storage` | Full R2 browser — prefix drill-down, object list, open in IDE | P1 |
| Analytics | `/analytics` | Session metrics, token usage, cost by provider/model | P2 |
| Leads | `/leads` | SCOUT lead pipeline — status board with scoring | P2 |
| Media Library | `/media` | R2 image/asset gallery with upload | P3 |
| CMS Pages | `/cms` | Public site page manager | P3 |

**Sprint 5 Validation Gate:**
- [ ] Drag ExplorerPanel divider → width changes → persists after reload
- [ ] `/api/r2/list` returns objects from ll-cockpit-r2
- [ ] Click R2 file in IDE → opens in Monaco with correct language
- [ ] `cms_ai_providers` table exists in D1 with Anthropic seeded
- [ ] /ai-providers page loads and shows Anthropic as configured

---

## 🔲 Sprint 6 — Research Pipeline + VPS Terminal

> From original Cockpit Days 8-14 (`cockpit_strategic_pivot.md`, `cockpit_research_pipeline.md`).
> This sprint makes Cockpit ALIVE — constant inbound data + real terminal.

### 6A — VPS Terminal WebSocket
| Item | Details |
|---|---|
| WebSocket PTY server on Hetzner VPS | Node.js PTY server on port 3007. Spawns bash shell per connection. |
| Cloudflare Tunnel route | Add port 3007 route to existing cloudflared tunnel. |
| xterm.js connects via WebSocket | Replace sandbox terminal with real PTY connection to VPS. |
| Auth on WS connection | Validate Supabase JWT before accepting WebSocket. |

### 6B — ORACLE Research Pipeline

Detect → Fetch → Summarize → Vectorize → Deliver

| Step | Component | Details |
|---|---|---|
| Detect | Cron Worker (hourly) | YouTube Data API (free, 10k/day) + RSS from `research_sources` + X scraper VPS |
| Fetch | VPS transcript scraper (port 3002) | YouTube transcripts. SearXNG web search. RSS Worker for feeds. |
| Summarize | Workers AI (Gemma/Llama) | tldr, tags, relevance scores against NEXUS/Cockpit/Fitness/CAD niches |
| Vectorize | RESEARCH_INDEX | Embed + upsert. Metadata: source, date, tags, relevance. |
| Deliver | Cron Worker (7am EST) | Queries last 24h, scores, formats, posts as ORACLE message in Cockpit chat |

**D1 Migration 0008_research_pipeline.sql:**
```sql
CREATE TABLE IF NOT EXISTS research_sources (id, source_type, source_url, source_name, active, last_checked, added_at);
CREATE TABLE IF NOT EXISTS research_queue (id, source_id, external_id, title, url, status, raw_r2_key, summary_json, vector_id, collected_at, processed_at);
CREATE TABLE IF NOT EXISTS research_digests (id, digest_date, item_ids, digest_html, delivered_at);
CREATE TABLE IF NOT EXISTS research_project_links (research_id, project_id, relevance_score);
```

Seed data: 10+ YouTube channels + RSS feeds from `cockpit_research_sources.md`.

### 6C — Contextual Suggestions (Alive Mechanic #2)
| Item | Details |
|---|---|
| Project-aware research surface | Open project → query Vectorize RESEARCH_INDEX → surface 3-5 items in ExplorerPanel |
| Research card component | Title, source, date, relevance score, open link |

### 6D — Automatic Artifact Generation (Alive Mechanic #5)
| Trigger | Artifact | Agent |
|---|---|---|
| End of every build session | Auto-draft LinkedIn build log post | HERALD |
| Every Sunday 8am | Weekly research digest | ORACLE |
| Project delivered | Case study draft | DISPATCH |
| Agent task scored ≥ 80 | Captured to training_data | SENTINEL |

**Sprint 6 Validation Gate:**
- [ ] VPS terminal opens in Cockpit and accepts real bash commands
- [ ] ORACLE cron fires at 7am → digest appears as ORACLE message in Cockpit
- [ ] Digest has ≥ 3 items scored by relevance
- [ ] Opening a project surfaces relevant research items from Vectorize
- [ ] HERALD auto-drafts a post at end of build session

---

## ⏳ Sprint 7 — Agent Tool Chains: Three Autonomous Pipelines

> Zero paid APIs. Ref: `docs/agent-tool-chains.md`.

### Pipeline 1 — Lead → Contract → Deposit
| Item | Agent |
|---|---|
| ANCHOR + Stripe invoice flow | ANCHOR |
| Telegram Bot API wired to NEXUS approval gate | NEXUS |
| SCOUT Apollo loop + OpenClaw outreach | SCOUT |
| VPS LinkedIn scraper (port 3004) | BUILDER |
| INTAKE + DocuSeal contract generation | INTAKE |
| DocuSeal install on VPS (port 3005) | BUILDER |

### Pipeline 2 — Brief → Build → Deliver → Invoice
| Item | Agent |
|---|---|
| FORGE pattern matching + GitHub push | FORGE |
| BUILDER Playwright MCP integration | BUILDER |
| BUILDER self-heal loop (3-retry + Browser Rendering vision) | BUILDER |
| SENTINEL scoring dashboard in /analytics | SENTINEL |
| DISPATCH delivery automation | DISPATCH |

### Pipeline 3 — Intelligence → Content → Publish
| Item | Agent |
|---|---|
| HERALD content scheduler (D1 queue + LinkedIn free API) | HERALD |
| Content scheduler webhook on VPS (port 3006) | BUILDER |
| In-house RSS aggregator Cron Worker | ORACLE |
| YouTube channel tracker (YouTube Data API free 10k/day) | ORACLE |

**Sprint 7 Validation Gate:**
- [ ] SCOUT runs Apollo nightly → scores leads → queues for OpenClaw
- [ ] Prospect replies → INTAKE qualifies → DocuSeal contract sent
- [ ] FORGE generates → pushes to GitHub → CI → BUILDER deploys
- [ ] BUILDER screenshots → Playwright tests → SENTINEL scores → PASS → PR merged
- [ ] HERALD drafts post → D1 content_queue → LinkedIn publishes via Cron

---

## ⏳ Sprint 8 — Testing + Quality Gates

### 8A — Playwright Setup
| Item | Details |
|---|---|
| Install Playwright MCP | `npm install -g @playwright/mcp` + connect to Claude.ai |
| `playwright.config.ts` | Target: `ll-cockpit.connorpattern.workers.dev`. Chromium. Timeout: 30s. |
| Auth fixture | Login with test Supabase credentials before each suite. |

### 8B — Core UI Test Suite
| Test | Assertion |
|---|---|
| Layout renders | Three panels present. ExplorerPanel, AgentPanel, StatusBar all visible. |
| Agent selection | Click NEXUS → AgentPanel shows “What should we work on?” |
| Agent streaming | Send message → streaming dots → text response renders |
| IDE opens | /ide → Monaco → R2 file tree loads with objects |
| Terminal opens | /terminal → xterm.js → real bash prompt from VPS |
| Pipeline loads | /pipeline → Kanban with BACKLOG/IN PROGRESS/REVIEW/DONE |
| Dashboard stats | 6 stat cards + all 11 agent cards render |
| Panel resize | Drag divider → width changes → persists on reload |
| Command palette | ⌘K opens → results appear → Esc closes |
| Research digest | /analytics → ORACLE digest cards visible |

### 8C — Agent API Test Suite
| Test | Endpoint | Assertion |
|---|---|---|
| Health | GET /api/health | 200, all bindings, anthropic_configured: true |
| AI providers | GET /api/ai/providers | 200, Anthropic configured, routing policy loaded |
| R2 list | GET /api/r2/list | 200, objects from ll-cockpit-r2 |
| R2 text | GET /api/r2/text?key= | 200, text content of known file |
| Knowledge POST | POST /api/knowledge | 200, {id, table, queued: true} |
| Agent stream | POST /api/agent/stream | 200, SSE text events fire, done event fires |
| Research digest | GET /api/research/digest | 200, today’s digest with items |

### 8D — SENTINEL Integration
| Item | Details |
|---|---|
| Scores all agent outputs | 0-100. PASS = 80+. Written to D1 agent_perf. |
| BUILDER deploy gate | No deploy without SENTINEL PASS + Connor approval. |
| Quality trend in /analytics | Rolling avg score by agent + task_type. Last 30 days. |
| AUTO rubric updates | META-COGNITION updates weights Sunday nightly. |

**Sprint 8 Validation Gate:**
- [ ] All 10 UI tests pass
- [ ] All 7 API tests pass
- [ ] SENTINEL correctly blocks BUILDER deploy when score < 80
- [ ] playwright.config.ts committed and runs clean

---

## ⏳ Sprint 9 — Day 28 Goal: First Client Through Cockpit

> The original plan’s finish line. Real paid client. Real money. Platform proven.

| Item | Details |
|---|---|
| Full end-to-end client journey | SCOUT finds lead → INTAKE qualifies → FORGE builds → BUILDER deploys → DISPATCH delivers → ANCHOR invoices. Telegram approvals only. |
| All D1 tables have real data | 1 real lead, 1 real project, 1 real invoice, agent_perf rows, 30+ training_data captures |
| training_data ≥ 30 interactions | SENTINEL-scored, high-quality, ready for fine-tuning |
| Demo Loom recorded | 5-min walkthrough of NEXUS handling a real client project |
| LinkedIn + X content blast | “I built a 13-agent company OS in 28 days.” HERALD auto-generates from build log. |

**Sprint 9 Validation Gate (Phase 1 Finish Line):**
- [ ] Cockpit is your daily IDE + chat replacement
- [ ] ORACLE delivers 7am digest every day without fail
- [ ] At least 1 real paying client delivered through Cockpit
- [ ] NEXUS routes tasks without manual intervention
- [ ] D1 agent_perf has cost + quality data for every agent
- [ ] training_data has ≥ 30 SENTINEL-approved interactions
- [ ] Demo Loom recorded and published
- [ ] LinkedIn post published and live

---

## ⏳ Sprint 10 — PaaS Multi-Tenant Prep

| Item | Details |
|---|---|
| Tenant provisioning | `tenants` table in D1. Provision on signup. |
| Per-tenant OAuth | OAUTH_KV keyed by tenant. Auto-register on first connect. |
| Vectorize filtering | `filter: { tenant_id }` on all queries |
| API tenant scoping | Derive from Supabase auth. Remove ‘default’ hardcoding. |
| MCP Worker multi-tenant | `this.props.tenantId` from OAuth token. |
| Stripe lifecycle | ANCHOR manages billing + dunning via Gmail MCP. |
| Tenant signup flow | /signup → provision → seed → register OAuth → issue MCP URL |
| nexus_db creation | Separate D1 for NEXUS agents (see `nexus_wrangler_master.toml` Section B) |
| Additional R2 buckets | nexus-artifacts, nexus-training-data, nexus-deliverables |

---

## Deferred Items

| Item | Deferred Until | Reason |
|---|---|---|
| Google Drive Cron sync Worker | Sprint 6+ | Manual MCP sync sufficient |
| REEL video agent | Phase 2 | Veo 3 free tier not yet wired |
| Mac Mini / local Ollama | Replaced | OpenRouter/Anthropic covers Phase 1 |
| n8n automation | Phase 2 | Per original Phase 2 plan |
| GENESIS gap scoring (advanced) | Sprint 6 | ORACLE basic digest first |
| ATLAS doc auto-ingestion | Sprint 7 | Firecrawl + Cron pattern ready |
| DocuSeal e-signature | Sprint 7 | VPS install + webhook setup |

---

## OAuth Integration Queue

| Service | Scope | KV Key |
|---|---|---|
| GitHub OAuth | repo read:user user:email | `oauth:github:{userId}` |
| Google (Drive + Gmail) | drive.readonly + gmail.readonly + gmail.compose | `oauth:google:{userId}` |
| LinkedIn | w_member_social | `oauth:linkedin:{userId}` |

Routes: `/api/oauth/github/start`, `/api/oauth/github/callback`, `/api/oauth/google/start`, `/api/oauth/google/callback`

---

## Build Sequencing Rules (Non-Negotiable)

1. **Streaming confirmed working** before any agent tool chains
2. **R2 API routes** before Monaco IDE wiring
3. **D1 migrations** before new Cockpit pages
4. **VPS terminal** before ORACLE research pipeline
5. **Validation gate passes** before advancing to next sprint — no skipping
6. **Playwright tests** cover every new feature before prod
7. **SENTINEL scores** every agent output before it reaches a client
8. **Zero paid APIs** — Anthropic, Hetzner $8/mo, Stripe (revenue cost only)
9. **Seed knowledge base** at end of every session
10. **Day 28 goal** is the Phase 1 finish line
