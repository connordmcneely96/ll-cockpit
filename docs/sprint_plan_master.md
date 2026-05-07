# NEXUS Cockpit — Master Sprint Plan

> Living document. Updated: May 7, 2026.
> Source of truth for all build sequencing.
> Original plan: `cockpit_14day_build.md` + `nexus_phase1_orchestration.html`
> Rule: Nothing ships without streaming working first.

---

## Infrastructure Notes

**Compute:** Google Cloud VM (replaces original Hetzner plan)
**Terminal PTY:** Cloudflare provides native PTY tunnels — no custom WebSocket server needed
**SearXNG:** Already self-hosted on Google Cloud VM
**Cloudflare Tunnel:** `cloudflared` exposes Google Cloud VM services to Workers

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
| Sprint 6 | Research Pipeline + Terminal | 🔲 QUEUED |
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

**Validation Gate:**
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

**Validation Gate:**
- [ ] Send message to NEXUS → streaming text in AgentPanel
- [ ] Messages persist in D1 after page reload
- [ ] Supabase auth login/logout works in production
- [ ] PermissionGate approve/reject works for a tool_call

---

## 🔲 Sprint 5 — IDE + R2 + Sam Extraction (NEXT)

> Derived from `docs/sam-repo-extraction.md`.

### 5A — Resizable Panels
| Item | Details |
|---|---|
| `useResizablePanels` TypeScript hook | ExplorerWidth (190-440px), AgentWidth (280-620px), TerminalHeight (150-540px). Persist to localStorage. |
| Drag dividers | `cursor-col-resize` between panels. `beginDrag(type, e)` pattern. |

### 5B — R2 API Routes
| Route | Description |
|---|---|
| `GET /api/r2/list?prefix=` | List objects. Returns key, size, uploaded, etag. |
| `GET /api/r2/text?key=` | Read text/code file. Validates extension. |
| `GET /api/r2/object/[...key]` | Stream raw object with content-type headers. |
| `GET /api/ai/providers` | Check which AI provider secrets are deployed. |
| `POST /api/agent/code` | Anthropic code assist. Body: filename, language, code, instruction. |
| `GET /api/github/status` | GitHub OAuth secret status. |
| Enhanced `GET /api/health` | All binding presence checks. |

### 5C — Wire Monaco IDE
| Item | Details |
|---|---|
| Language detection | `getLanguageFromKey(key)` — .tsx/.ts/.js/.css/.sql etc |
| File tree from R2 | `/api/r2/list` → collapsible tree by prefix |
| Tab system | Active file, close button, language badge |
| Open R2 file | Click → `/api/r2/text?key=` → Monaco |
| Monaco config | Minimap, font 13px, lineHeight 21, tabSize 2, vs-dark |
| Agent-to-editor | AgentPanel response → “Apply to editor” → `updateFile(code)` |
| Terminal preset strip | git status, wrangler deploy, git push, npm run build |

### 5D — D1 Migrations
| Migration | Tables |
|---|---|
| 0004_ai_provider_registry | cms_ai_providers, cms_ai_models, cms_ai_routing_policy |
| 0005_r2_asset_registry | cms_r2_buckets, cms_r2_objects |
| 0006_analytics | analytics_events, analytics_sessions, ai_completions, ai_routing_decisions |
| 0007_agent_tables | content_queue, subscribers, revenue, pending_approvals |

### 5E — New Cockpit Pages
| Page | Route | Priority |
|---|---|---|
| AI Providers | `/ai-providers` | P1 |
| R2 Storage | `/storage` | P1 |
| Analytics | `/analytics` | P2 |
| Leads | `/leads` | P2 |
| Media Library | `/media` | P3 |
| CMS Pages | `/cms` | P3 |

**Validation Gate:**
- [ ] Drag ExplorerPanel divider → width changes → persists after reload
- [ ] `/api/r2/list` returns objects from ll-cockpit-r2
- [ ] Click R2 file in IDE → opens in Monaco with correct language
- [ ] `cms_ai_providers` table exists with Anthropic seeded
- [ ] /ai-providers page shows Anthropic as configured

---

## 🔲 Sprint 6 — Research Pipeline + Terminal

> From original Cockpit Days 8-14 plan.
> Makes Cockpit ALIVE — constant inbound data + real terminal.

### 6A — Terminal via Cloudflare PTY
| Item | Details |
|---|---|
| Cloudflare PTY tunnel | Cloudflare provides native PTY tunnel support. Wire xterm.js to Cloudflare’s PTY service pointing at Google Cloud VM. No custom WebSocket PTY server needed. |
| Auth on PTY connection | Validate Supabase JWT before accepting connection. |
| Replace sandbox terminal | Current xterm.js shows sandbox only. Replace with real PTY to Google Cloud VM. |

### 6B — ORACLE Research Pipeline
| Step | Component | Details |
|---|---|---|
| Detect | Cron Worker (hourly) | YouTube Data API (free 10k/day) + RSS from research_sources + X scraper on Google Cloud VM |
| Fetch | Google Cloud VM scrapers | YouTube transcripts (port 3002), SearXNG search, RSS polling |
| Summarize | Workers AI (Gemma/Llama) | tldr, tags, relevance scores against NEXUS/Cockpit/Fitness/CAD niches |
| Vectorize | RESEARCH_INDEX | Embed + upsert. Metadata: source, date, tags, relevance. |
| Deliver | Cron Worker (7am EST) | Queries last 24h, scores, formats, posts as ORACLE message in Cockpit |

**D1 Migration 0008_research_pipeline:**
```sql
research_sources, research_queue, research_digests, research_project_links
```
Seed: 10+ YouTube channels + RSS feeds from `cockpit_research_sources.md`.

### 6C — Contextual Suggestions (Alive Mechanic #2)
| Item | Details |
|---|---|
| Project research surface | Open project → query Vectorize RESEARCH_INDEX → show 3-5 relevant items in ExplorerPanel |
| Research card component | Title, source, date, relevance score, open link |

### 6D — Automatic Artifact Generation (Alive Mechanic #5)
| Trigger | Artifact | Agent |
|---|---|---|
| End of every build session | Auto-draft LinkedIn build log post | HERALD |
| Every Sunday 8am | Weekly research digest | ORACLE |
| Project delivered | Case study draft | DISPATCH |
| Agent task scored ≥ 80 | Captured to training_data | SENTINEL |

**Validation Gate:**
- [ ] Terminal connects to Google Cloud VM via Cloudflare PTY
- [ ] ORACLE cron fires at 7am → digest appears as ORACLE message in Cockpit
- [ ] Digest has ≥ 3 items scored by relevance
- [ ] Opening a project surfaces relevant research from Vectorize
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
| Google Cloud VM LinkedIn scraper (port 3004) | BUILDER |
| INTAKE + DocuSeal contract generation | INTAKE |
| DocuSeal install on Google Cloud VM (port 3005) | BUILDER |

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
| Content scheduler webhook on Google Cloud VM (port 3006) | BUILDER |
| In-house RSS aggregator Cron Worker | ORACLE |
| YouTube channel tracker (YouTube Data API free 10k/day) | ORACLE |

**Validation Gate:**
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

### 8B — Core UI Test Suite (10 tests)
| Test | Assertion |
|---|---|
| Layout renders | Three panels present. ExplorerPanel, AgentPanel, StatusBar visible. |
| Agent selection | Click NEXUS → “What should we work on?” appears in AgentPanel |
| Agent streaming | Send message → streaming dots → text response renders |
| IDE opens | /ide → Monaco → R2 file tree loads |
| Terminal opens | /terminal → xterm.js → real bash prompt via Cloudflare PTY |
| Pipeline loads | /pipeline → Kanban columns with cards |
| Dashboard stats | 6 stat cards + all 11 agent cards render |
| Panel resize | Drag divider → width changes → persists on reload |
| Command palette | ⌘K opens → results appear → Esc closes |
| Research digest | /analytics → ORACLE digest cards visible |

### 8C — Agent API Test Suite (7 tests)
| Test | Endpoint | Assertion |
|---|---|---|
| Health | GET /api/health | 200, all bindings, anthropic_configured: true |
| AI providers | GET /api/ai/providers | 200, Anthropic configured |
| R2 list | GET /api/r2/list | 200, objects from ll-cockpit-r2 |
| R2 text | GET /api/r2/text?key= | 200, file text content |
| Knowledge POST | POST /api/knowledge | 200, {id, table, queued: true} |
| Agent stream | POST /api/agent/stream | 200, SSE text events fire |
| Research digest | GET /api/research/digest | 200, today’s digest |

### 8D — SENTINEL Integration + Rubric Gate
| Item | Details |
|---|---|
| Scores all agent outputs | 0-100. PASS = 80+. Written to D1 agent_perf. |
| BUILDER deploy gate | No deploy without SENTINEL PASS + Connor approval. |
| Quality trend in /analytics | Rolling avg score by agent + task_type. Last 30 days. |
| AUTO rubric updates | META-COGNITION updates weights Sunday nightly. |
| PaaS readiness rubric (from Sam) | 7-category readiness score (0-5). Block PaaS client deploy if any category < 4. Categories: Integration Setup, Secret Safety, Dashboard Usability, AI Tooling, Tool Safety, Testing, Connor Readiness. |

**Validation Gate:**
- [ ] All 10 UI tests pass
- [ ] All 7 API tests pass
- [ ] SENTINEL blocks BUILDER deploy when score < 80
- [ ] PaaS rubric scores ≥ 4 on all categories

---

## ⏳ Sprint 9 — Day 28 Goal: First Client Through Cockpit

| Item | Details |
|---|---|
| Full end-to-end client journey | SCOUT finds lead → INTAKE qualifies → FORGE builds → BUILDER deploys → DISPATCH delivers → ANCHOR invoices. Telegram approvals only. |
| All D1 tables have real data | 1 real lead, 1 real project, 1 real invoice, agent_perf rows, 30+ training_data captures |
| training_data ≥ 30 interactions | SENTINEL-scored, high-quality |
| Demo Loom recorded | 5-min walkthrough of NEXUS handling a real client project |
| LinkedIn + X content blast | HERALD auto-generates from build log. Connor approves. |

**Validation Gate (Phase 1 Finish Line):**
- [ ] Cockpit is your daily IDE + chat replacement
- [ ] ORACLE delivers 7am digest every day without fail
- [ ] At least 1 real paying client delivered through Cockpit
- [ ] NEXUS routes tasks without manual intervention
- [ ] D1 agent_perf has cost + quality data for every agent
- [ ] training_data has ≥ 30 SENTINEL-approved interactions
- [ ] Demo Loom recorded and published
- [ ] LinkedIn post live

---

## ⏳ Sprint 10 — PaaS Multi-Tenant Prep

> Based on Sam’s workspace registration pattern + NEXUS multi-tenant blueprint.
> Ref: `docs/sam-repo-extraction.md` sections 3, 5, 7, 8, 9.

### 10A — Multi-Tenant Foundation
| Item | Details |
|---|---|
| `tenants` table in D1 | id, slug, name, plan, status, created_at |
| `nexus_workspaces` table | id, tenant_id, slug, name, r2_prefix, github_repo, default_model_id |
| `nexus_workspace_scripts` table | id, workspace_id, name, purpose, runner, safe_to_run, owner_only |
| Per-tenant OAuth registration | OAUTH_KV keyed by tenant_id. Auto-register on first connect. |
| Vectorize metadata filtering | `filter: { tenant_id }` on all queries |
| API route tenant scoping | Derive from Supabase auth. Remove ‘default’ hardcoding. |
| MCP Worker multi-tenant | `this.props.tenantId` from OAuth token. |

### 10B — PaaS Onboarding Flow (Sam’s 10-Phase Playbook)
| Phase | Action |
|---|---|
| Phase 1 | Clean foundation: build, test, deploy pass |
| Phase 2 | Cloudflare resources provisioned (Worker, R2, D1, KV, DO, AI) |
| Phase 3 | Supabase project created + SQL applied |
| Phase 4 | AI provider secrets added + verified |
| Phase 5 | Resend email wired |
| Phase 6 | Google OAuth (Drive + Gmail) wired |
| Phase 7 | GitHub OAuth or App wired |
| Phase 8 | Tool registry built (risk levels, approval gates, audit logs) |
| Phase 9 | Monitoring active (page views, agent runs, costs, errors, deploys) |
| Phase 10 | Client handoff: demonstrates run/build/test/deploy/inspect/diagnose |

### 10C — Supabase Multi-Tenant Telemetry
| Item | Details |
|---|---|
| `ll_tenants` + `ll_workspaces` tables | Multi-tenant foundation from Sam’s schema |
| `ll_routing_arms` table | Thompson Sampling per tenant + task_type |
| `ll_routing_decisions` table | Every model selection logged with cost, latency, success |
| `ll_stream_events` + `ll_tool_call_events` + `ll_error_events` | Full agent telemetry per tenant |
| `ll_eval_runs` | Human-scored evals (architecture, quality, speed, cost — 1-5 each) |
| `ll_codebase_chunks` | Code-aware RAG for ATLAS + FORGE |
| Apply via Supabase dashboard | `sql/supabase/010_full_cms_analytics_rag.sql` (adapted) |

### 10D — Revenue + Billing
| Item | Details |
|---|---|
| Stripe subscription lifecycle | ANCHOR manages tenant billing. Dunning via Gmail MCP. |
| Tenant signup flow | /signup → provision tenant → seed knowledge → register OAuth → issue MCP URL |
| nexus_db creation | Separate D1 for NEXUS agents per `nexus_wrangler_master.toml` Section B |
| Additional R2 buckets | nexus-artifacts, nexus-training-data, nexus-deliverables |
| KV namespace split | LL_SESSIONS + LL_RATE_LIMITS + LL_OAUTH_STATE + LL_CACHE + LL_FLAGS (per Sam’s 5-namespace pattern) |

**Validation Gate:**
- [ ] Two different Supabase auth users see different tenant data
- [ ] New tenant signup flow provisions all resources end-to-end
- [ ] PaaS rubric scores ≥ 4 on all 7 categories for a test tenant
- [ ] Stripe subscription created + ANCHOR invoices correctly

---

## OAuth Integration Queue

| Service | Scope | KV Key |
|---|---|---|
| GitHub OAuth | repo read:user user:email | `oauth:github:{userId}` |
| Google (Drive + Gmail) | drive.readonly + gmail.readonly + gmail.compose | `oauth:google:{userId}` |
| LinkedIn | w_member_social | `oauth:linkedin:{userId}` |

Routes: `/api/oauth/github/start`, `/api/oauth/github/callback`, `/api/oauth/google/start`, `/api/oauth/google/callback`

---

## Deferred Items

| Item | Deferred Until | Reason |
|---|---|---|
| Google Drive Cron sync Worker | Sprint 6+ | Manual MCP sync sufficient |
| REEL video agent | Phase 2 | Veo 3 free tier not yet wired |
| OpenSCAD CAD generation | Sprint 7+ | ATLAS needs it for CAD-to-video pipeline |
| n8n automation | Phase 2 | Per original Phase 2 plan |
| GENESIS gap scoring (advanced) | Sprint 6 | ORACLE basic digest first |
| ATLAS doc auto-ingestion | Sprint 7 | Firecrawl + Cron pattern ready |
| DocuSeal e-signature | Sprint 7 | Google Cloud VM install + webhook |
| Thompson Sampling routing | Sprint 10 | ll_routing_arms Supabase table first |
| Codebase indexing (ll_codebase_chunks) | Sprint 10 | ATLAS code-aware RAG |

---

## Build Sequencing Rules (Non-Negotiable)

1. **Streaming confirmed working** before any agent tool chains
2. **R2 API routes** before Monaco IDE wiring
3. **D1 migrations** before new Cockpit pages
4. **Cloudflare PTY terminal** before ORACLE research pipeline
5. **Validation gate passes** before advancing to next sprint — no skipping
6. **Playwright tests** cover every new feature before prod
7. **SENTINEL scores** every agent output before it reaches a client
8. **Zero paid APIs** — Anthropic, Google Cloud VM (~$10/mo), Stripe (revenue cost only)
9. **Seed knowledge base** at end of every session
10. **Day 28 goal** is the Phase 1 finish line
