# NEXUS — Complete Project TODO
> Full list of everything to build from current state to PaaS-ready.
> Organized by category. Every item is sourced from the sprint plan, Sam's extraction, or agent tool chains.
> Updated: May 7, 2026.
> Current live URL: https://ll-cockpit.connorpattern.workers.dev

---

## HOW TO READ THIS LIST

- **[BLOCKED]** = cannot start until a dependency is resolved
- **[SPRINT 4]** = current active sprint
- **[SPRINT 5-10]** = queued sprints
- **[PAAS]** = required before selling Cockpit to any client
- **[PUBLIC SITE]** = required before leadershiplegacydigital.com goes live
- **[DAY 28]** = required before Phase 1 is complete

---

## A. IMMEDIATE — UNBLOCK STREAMING

- [ ] Add Anthropic credits at console.anthropic.com [BLOCKED: everything downstream]
- [ ] Confirm streaming works: send message to NEXUS → streaming text appears in AgentPanel
- [ ] Confirm messages persist in D1 cockpit_messages after page reload
- [ ] Confirm Supabase auth login/logout works in production
- [ ] Wire PermissionGate approve/reject loop end-to-end

---

## B. SPRINT 5 — IDE + R2 + DATA LAYER

### B1. Resizable Panels
- [ ] Write `useResizablePanels` TypeScript hook
  - ExplorerWidth: 190-440px default 250px
  - AgentWidth: 280-620px default 340px
  - TerminalHeight: 150-540px default 250px
  - All persist to localStorage
  - `beginDrag(type, mouseEvent)` pattern
- [ ] Add drag dividers between ExplorerPanel/main and main/AgentPanel
- [ ] cursor-col-resize on dividers

### B2. R2 API Routes
- [ ] `GET /api/r2/list?prefix=` — list objects (key, size, uploaded, etag)
- [ ] `GET /api/r2/text?key=` — read text/code file, validate extension
- [ ] `GET /api/r2/object/[...key]` — stream raw object with content-type
- [ ] `GET /api/r2/status` — bucket status + README preview
- [ ] `GET /api/ai/providers` — check which secrets are deployed, return per-provider status
- [ ] `POST /api/agent/code` — Anthropic code assist (body: filename, language, code, instruction)
- [ ] `GET /api/github/status` — which GitHub OAuth secrets are configured
- [ ] Enhanced `GET /api/health` — all binding checks (R2, AI, D1, KV, Queue, Anthropic)

### B3. Wire Monaco IDE (/ide page)
- [ ] `getLanguageFromKey(key)` — map .tsx/.ts/.js/.css/.sql/.md/.json to Monaco language
- [ ] File tree component backed by `/api/r2/list`
- [ ] Collapsible folders by R2 prefix
- [ ] Tab system — active file, close button, language badge
- [ ] Click file → fetch `/api/r2/text?key=` → load into Monaco
- [ ] Monaco config: minimap, font 13px, lineHeight 21, tabSize 2, vs-dark
- [ ] "Apply to editor" button in AgentPanel → `updateFile(code)` → Monaco updates live
- [ ] Terminal command preset strip (git status, wrangler deploy, git push, npm run build, etc)

### B4. D1 Migrations
- [ ] `0004_ai_provider_registry.sql` — cms_ai_providers, cms_ai_models, cms_ai_routing_policy
- [ ] `0005_r2_asset_registry.sql` — cms_r2_buckets, cms_assets
- [ ] `0006_analytics.sql` — analytics_events, analytics_sessions, ai_completions, ai_routing_decisions
- [ ] `0007_agent_tables.sql` — content_queue, subscribers, revenue, pending_approvals
- [ ] `0008_research_pipeline.sql` — research_sources, research_queue, research_digests, research_project_links
- [ ] `0009_full_cms_runtime.sql` — apply Sam's full 37KB CMS schema (tenants, workspaces, users, brand, themes, nav, pages, sections, components, versions, assets, services, case_studies, resources, forms, submissions, leads, redirects, seo_audits, publish_jobs, activity_log, analytics_events, routing_arms)
- [ ] `0010_cms_triggers.sql` — updated_at triggers
- [ ] `0011_cms_seed.sql` — seed pages, services, case studies for public site
- [ ] Apply all migrations: `wrangler d1 execute ll-cockpit-db --remote --file migrations/00XX.sql`

### B5. New Cockpit Pages
- [ ] `/ai-providers` — live provider status, model registry, routing lanes, blocked models
- [ ] `/storage` — full R2 browser: prefix drill-down, object list, open in IDE
- [ ] `/analytics` — session metrics, token usage, cost by provider/model from D1
- [ ] `/leads` — SCOUT lead CRM (cms_leads table), status board: new/qualified/proposal/won/lost
- [ ] `/cms` — page manager: list cms_pages, status filter, edit/publish buttons
- [ ] `/media` — R2 image/asset gallery with upload (cms_assets table)
- [ ] `/services` — manage cms_services (public site service pages)
- [ ] `/case-studies` — manage cms_case_studies

---

## C. SPRINT 6 — RESEARCH PIPELINE + TERMINAL

### C1. Terminal via Cloudflare PTY
- [ ] Wire xterm.js to Cloudflare native PTY tunnel → Google Cloud VM
- [ ] Validate Supabase JWT before accepting PTY connection
- [ ] Replace current sandbox terminal with real bash session
- [ ] Test: type real command → output appears

### C2. ORACLE Research Pipeline (5 steps)
- [ ] **Detect** — Cron Worker (hourly): YouTube Data API (free 10k/day), RSS feed polling from research_sources, X scraper on Google Cloud VM
- [ ] **Fetch** — Google Cloud VM scrapers: YouTube transcript extractor (port 3002), SearXNG web search, RSS Worker
- [ ] **Summarize** — Workers AI (Gemma/Llama): tldr, tags, relevance 0-1 against NEXUS/Cockpit/Fitness/CAD niches
- [ ] **Vectorize** — Embed + upsert to RESEARCH_INDEX. Metadata: source, date, tags, relevance.
- [ ] **Deliver** — Cron Worker (7am EST): query last 24h items, score, format, POST as ORACLE message in Cockpit chat
- [ ] Seed research_sources with 10+ YouTube channels + RSS feeds from cockpit_research_sources.md

### C3. Contextual Suggestions (Alive Mechanic #2)
- [ ] When project opens → query Vectorize RESEARCH_INDEX → surface 3-5 relevant items in ExplorerPanel
- [ ] Research card component: title, source, date, relevance score, open link

### C4. Automatic Artifact Generation (Alive Mechanic #5)
- [ ] HERALD auto-drafts LinkedIn post after every build session ends
- [ ] ORACLE delivers weekly research digest every Sunday 8am
- [ ] DISPATCH packages case study draft after every project is delivered
- [ ] SENTINEL captures agent tasks scoring ≥ 80 to training_data automatically

---

## D. SPRINT 7 — AGENT TOOL CHAINS (3 PIPELINES)

### D1. Pipeline 1 — Lead → Contract → Deposit
- [ ] Telegram Bot API wired to NEXUS — all Connor approvals as Telegram inline buttons
- [ ] ANCHOR + Stripe API — invoice creation, payment link, subscription management
- [ ] SCOUT Apollo.io loop (free tier: 50 credits/mo) — nightly Cron search + score leads
- [ ] Lead scorer: Workers AI scores each lead 0-100 against 3 niches (AI+Fitness, AI+CAD, Cloudflare+AI)
- [ ] Lead deduplication: D1 query before any Apollo call
- [ ] OpenClaw API — queue approved leads for outreach sequences
- [ ] Google Cloud VM LinkedIn scraper (port 3004) — pull public company/contact data
- [ ] INTAKE qualification flow — Gmail MCP reads replied emails, triggers qualification
- [ ] Proposal builder — Workers AI + template + ATLAS engineering data
- [ ] DocuSeal install on Google Cloud VM (port 3005) — open-source e-signature
- [ ] DocuSeal webhook → D1 on signature
- [ ] Google Calendar MCP — autonomous kickoff scheduling
- [ ] Stripe payment link creation on proposal send
- [ ] Full flow test: SCOUT finds lead → INTAKE qualifies → proposal → DocuSeal → deposit → kickoff booked

### D2. Pipeline 2 — Brief → Build → Deliver → Invoice
- [ ] FORGE pattern validator — Vectorize similarity check before generating new code
- [ ] FORGE GitHub push — push to feature branch via GitHub MCP
- [ ] GitHub Actions CI monitoring — FORGE monitors CI results via webhook → D1 → self-corrects
- [ ] BUILDER Playwright MCP integration (`npm install -g @playwright/mcp`)
- [ ] BUILDER self-heal loop — 3-retry: screenshot → Workers AI vision → diagnose → FORGE re-generates
- [ ] BUILDER Browser Rendering screenshots before/after deploy, visual regression check
- [ ] Sentry free tier — post-deploy error tracking
- [ ] SENTINEL scoring in /analytics — rolling avg score by agent + task_type
- [ ] DISPATCH packages deliverable → Drive upload → Gmail send → Calendar review call → trigger ANCHOR invoice
- [ ] ANCHOR dunning logic — 3-retry Gmail sequence at Day 1, 3, 7 on payment failure
- [ ] ANCHOR retainer auto-renewal — Calendar reminder 30 days before expiry, draft renewal proposal
- [ ] Full flow test: NEXUS routes brief → FORGE generates → BUILDER deploys → SENTINEL scores → DISPATCH delivers → ANCHOR invoices

### D3. Pipeline 3 — Intelligence → Content → Publish
- [ ] HERALD content scheduler: D1 content_queue + Cloudflare Cron Worker + LinkedIn API (free)
- [ ] Content scheduler webhook on Google Cloud VM (port 3006)
- [ ] LinkedIn API free tier setup — LinkedIn Developer Portal free app
- [ ] X API free basic tier setup
- [ ] Auto-trigger hooks: BUILDER deploy → HERALD draft → D1 content_queue → Telegram approval → publish
- [ ] Gmail MCP newsletter send: subscribers from D1 subscribers table, Gmail MCP sends batch
- [ ] In-house RSS aggregator Cron Worker — poll D1 research_sources, store to D1
- [ ] YouTube Data API v3 (free 10k/day) — channel tracker for ORACLE
- [ ] Full flow test: SearXNG + YouTube + RSS → ORACLE scores → digest → HERALD drafts → Telegram approval → publishes

---

## E. SPRINT 8 — TESTING + QUALITY GATES

### E1. Playwright Setup
- [ ] `npm install -g @playwright/mcp` + connect to Claude.ai
- [ ] `playwright.config.ts` — target ll-cockpit.connorpattern.workers.dev, Chromium, timeout 30s
- [ ] Auth fixture — login with test Supabase credentials before each suite

### E2. Core UI Tests (10)
- [ ] Layout renders — three panels, StatusBar visible
- [ ] Agent selection — click NEXUS → AgentPanel shows chat
- [ ] Agent streaming — message → dots → text response
- [ ] IDE opens — Monaco + R2 file tree
- [ ] Terminal — xterm.js → real bash via Cloudflare PTY
- [ ] Pipeline — Kanban columns + cards
- [ ] Dashboard — 6 stat cards + 11 agent cards
- [ ] Panel resize — drag divider → width persists on reload
- [ ] Command palette — ⌘K opens → Esc closes
- [ ] Research digest — /analytics → ORACLE cards

### E3. API Tests (7)
- [ ] GET /api/health → 200, all bindings, anthropic_configured: true
- [ ] GET /api/ai/providers → 200, Anthropic configured
- [ ] GET /api/r2/list → 200, objects array
- [ ] GET /api/r2/text?key= → 200, file content
- [ ] POST /api/knowledge → 200, {id, table, queued: true}
- [ ] POST /api/agent/stream → 200, SSE text events fire, done fires
- [ ] GET /api/research/digest → 200, today's digest with items

### E4. SENTINEL Integration
- [ ] SENTINEL scores every agent output 0-100, PASS = 80+, writes to D1 agent_perf
- [ ] BUILDER deploy gate — no deploy without SENTINEL PASS + Connor Telegram approval
- [ ] Quality trend dashboard in /analytics — rolling avg by agent + task_type
- [ ] META-COGNITION updates SENTINEL weights every Sunday nightly from D1 agent_perf
- [ ] PaaS readiness rubric gate (from Sam's RUBRIC.md):
  - [ ] Integration Setup ≥ 4
  - [ ] Secret Safety ≥ 4
  - [ ] Dashboard Usability ≥ 4
  - [ ] AI Tooling ≥ 4
  - [ ] Tool Execution Safety ≥ 4
  - [ ] Testing ≥ 4
  - [ ] Connor Readiness ≥ 3

---

## F. SPRINT 9 — DAY 28 GOAL: FIRST CLIENT THROUGH COCKPIT

- [ ] Full end-to-end client journey — no manual intervention except Telegram approvals
- [ ] All D1 tables have real data: 1 lead, 1 project, 1 invoice, agent_perf rows, 30+ training_data
- [ ] training_data ≥ 30 SENTINEL-approved interactions
- [ ] Demo Loom recorded — 5-min walkthrough of NEXUS handling real client project
- [ ] LinkedIn + X content blast — HERALD auto-generates from build log, Connor approves
- [ ] ORACLE 7am digest confirmed running daily without fail

---

## G. SPRINT 10 — PAAS MULTI-TENANT

### G1. Multi-Tenant Foundation
- [ ] D1: `nexus_tenants` table (id, slug, name, plan, status, created_at)
- [ ] D1: `nexus_workspaces` table (id, tenant_id, slug, name, r2_prefix, github_repo, default_model_id)
- [ ] D1: `nexus_workspace_scripts` table (id, workspace_id, name, purpose, runner, safe_to_run, owner_only)
- [ ] Per-tenant OAUTH_KV registration — auto-register on first connect
- [ ] Vectorize metadata filtering — `filter: { tenant_id }` on all queries
- [ ] API route tenant scoping — derive tenant_id from Supabase auth session, remove 'default' hardcoding
- [ ] MCP Worker multi-tenant — `this.props.tenantId` from OAuth token
- [ ] knowledge-mcp scoped per tenant

### G2. Supabase Multi-Tenant Telemetry
- [ ] Apply `sql/supabase/010_full_cms_analytics_rag.sql` (Sam's schema) to NEXUS Supabase project
- [ ] `ll_tenants` + `ll_workspaces` tables
- [ ] `ll_routing_arms` — Thompson Sampling per tenant + task_type
- [ ] `ll_routing_decisions` — every model selection logged
- [ ] `ll_stream_events` + `ll_tool_call_events` + `ll_error_events`
- [ ] `ll_eval_runs` — human-scored evals (architecture/quality/speed/cost 1-5)
- [ ] `ll_codebase_chunks` — code-aware RAG for ATLAS + FORGE
- [ ] Apply `sql/supabase/011_full_cms_functions.sql` — cost summary, model performance views

### G3. Thompson Sampling Routing
- [ ] Wire `cms_ai_routing_arms` in D1 for live routing decisions
- [ ] Wire `ll_routing_arms` in Supabase for analytics + optimization
- [ ] Routing logic: sample Beta(alpha, beta) per arm → select highest → log outcome → update arm
- [ ] Replace current deterministic routing with Thompson Sampling

### G4. KV Namespace Split
- [ ] Create LL_SESSIONS KV namespace
- [ ] Create LL_RATE_LIMITS KV namespace
- [ ] Create LL_OAUTH_STATE KV namespace
- [ ] Create LL_CACHE KV namespace
- [ ] Create LL_FLAGS KV namespace
- [ ] Migrate from single KV to split namespaces in wrangler.toml

### G5. Durable Objects
- [ ] Create `AgentSession` DO — terminal PTY state + long-running agent builds
- [ ] Create `DashboardSession` DO — live CMS editing state
- [ ] Add to wrangler.toml with new_sqlite_classes migration

### G6. Tenant Signup Flow
- [ ] `/signup` page → provision tenant → seed knowledge → register OAuth → issue MCP URL
- [ ] Stripe subscription creation on signup
- [ ] ANCHOR manages tenant billing lifecycle
- [ ] Dunning: 3-retry Gmail sequence on payment failure (Day 1, 3, 7)

### G7. Additional Cloudflare Resources
- [ ] Create `nexus_db` D1 database (separate from ll-cockpit-db, per wrangler master Section B)
- [ ] Create R2 buckets: nexus-artifacts, nexus-training-data, nexus-deliverables
- [ ] Add all new resources to wrangler.toml

---

## H. PUBLIC SITE — leadershiplegacydigital.com

### H1. CMS Foundation
- [ ] Apply D1 migration 0009 (full CMS runtime) to ll-cockpit-db
- [ ] Apply D1 migration 0010 (CMS triggers)
- [ ] Apply D1 migration 0011 (CMS seed — pages, services, case studies)
- [ ] Seed brand settings with Connor's tokens (#070b12 bg, #38bdf8 primary, #22c55e accent, Satoshi + JetBrains Mono)
- [ ] Seed navigation: Services, Work, About, Resources, Contact
- [ ] Seed homepage page record (route_path=/)

### H2. Public Site Pages
- [ ] Homepage — hero + services grid + case studies + CTA
- [ ] /services page — list from cms_services
- [ ] /services/ai-engineering
- [ ] /services/rag-systems
- [ ] /services/full-stack-apps
- [ ] /services/cad-automation
- [ ] /services/cad-to-video
- [ ] /services/business-automation
- [ ] /services/consulting
- [ ] /work page — cms_case_studies grid
- [ ] /about page
- [ ] /resources page — cms_resources list
- [ ] /contact page — cms_forms contact form → cms_leads

### H3. CMS Cockpit Integration
- [ ] /cms Cockpit page — list all cms_pages, status filter, edit/publish buttons
- [ ] Page editor — sections + components editor wired to D1
- [ ] Draft/publish workflow — cms_publish_jobs table
- [ ] Page version history — cms_page_versions table
- [ ] SEO audit view — cms_seo_audits table (SENTINEL auto-populates)
- [ ] Redirect manager — cms_redirects table
- [ ] Activity log view — cms_activity_log last 100 actions

### H4. Public Site Analytics
- [ ] Client-side analytics script → POST /api/analytics/events → cms_analytics_events in D1
- [ ] UTM tracking (utm_source, utm_medium, utm_campaign) on all events
- [ ] Lead event tracking — cms_lead_events
- [ ] /analytics Cockpit page — views, sessions, leads from D1
- [ ] Custom domain: assets.leadershiplegacydigital.com → ll-cockpit-r2

### H5. Contact + Leads
- [ ] Contact form → POST /api/forms/contact → cms_form_submissions → cms_leads
- [ ] INTAKE triggered on new lead — qualifies, drafts response
- [ ] Lead notification via Telegram
- [ ] Resend email confirmation to lead on submit
- [ ] /leads Cockpit page — full CRM view (status board, priority, owner, notes)

---

## I. INFRASTRUCTURE

### I1. Google Cloud VM Services
- [ ] SearXNG running and accessible via Cloudflare Tunnel (already done)
- [ ] YouTube transcript scraper (port 3002)
- [ ] X/Twitter scraper (port 3003)
- [ ] LinkedIn scraper (port 3004) — new
- [ ] DocuSeal e-signature (port 3005) — `docker pull docuseal/docuseal`
- [ ] Content scheduler webhook (port 3006) — new
- [ ] Terminal PTY server via Cloudflare native PTY (no custom server)

### I2. OAuth Flows
- [ ] `GET /api/oauth/github/start` — redirect to GitHub, scope: repo read:user user:email
- [ ] `GET /api/oauth/github/callback` — exchange code → KV: `oauth:github:{userId}`
- [ ] `GET /api/oauth/google/start` — redirect to Google, scope: openid + drive.readonly + gmail
- [ ] `GET /api/oauth/google/callback` — exchange code → KV: `oauth:google:{userId}`
- [ ] `GET /api/oauth/linkedin/start` — redirect to LinkedIn, scope: w_member_social

### I3. Email
- [ ] `npx wrangler secret put RESEND_API_KEY`
- [ ] POST /api/forms/contact — sends notification via Resend
- [ ] POST /api/leads/:id/send-followup — INTAKE sends followup
- [ ] Verify sender domain at leadershiplegacydigital.com

### I4. CAD Integration (ATLAS)
- [ ] OpenSCAD install on Google Cloud VM
- [ ] POST /api/cad/jobs — accept parametric spec, generate STL
- [ ] GET /api/cad/jobs/:id — poll job status
- [ ] GET /api/cad/jobs/:id/download — stream STL from R2
- [ ] R2 prefixes: assets/models/, snapshots/cad/, exports/cad/

---

## J. AGENT CONFIGURATIONS

### J1. NEXUS (Orchestrator)
- [ ] Cloudflare Cron Trigger (6:50am EST) — assemble MAPS briefing from D1 + ORACLE + ANCHOR
- [ ] Intent classifier — Workers AI classifies every prompt before routing
- [ ] Approval gate — pending_approvals table + Telegram callbacks
- [ ] MAPS briefing assembler — D1 query → format → POST to Cockpit chat

### J2. SCOUT (Lead Generation)
- [ ] Apollo.io free tier integration (50 credits/mo)
- [ ] Lead scorer: Workers AI scores 0-100 against 3 niches
- [ ] Deduplication check in D1 before Apollo call
- [ ] SearXNG enrichment — company news before outreach
- [ ] Firecrawl (free tier) — prospect website pain signal detection

### J3. INTAKE (Onboarding)
- [ ] Gmail MCP — read replied prospect emails, trigger qualification flow
- [ ] Google Calendar MCP — autonomous kickoff scheduling
- [ ] Notion MCP — create project brief page
- [ ] Contract generator — Worker generates HTML contract → R2 → Drive link
- [ ] DocuSeal webhook → D1 on signature received

### J4. FORGE (Code Generation)
- [ ] Pattern validator — Vectorize similarity before generating new code
- [ ] Static analysis pass — Workers AI basic syntax check before push
- [ ] Test scaffold generator — auto-generates tests alongside code
- [ ] GitHub Actions CI monitoring — re-generates if tests fail

### J5. BUILDER (Deploy)
- [ ] Cloudflare Pages Deploy API — autonomous deploy
- [ ] Browser Rendering screenshots — before/after visual regression
- [ ] Self-heal loop — 3-retry with Workers AI vision diagnosis
- [ ] Sentry free tier — post-deploy error tracking
- [ ] Playwright MCP — UI tests against preview URL

### J6. ATLAS (Engineering RAG)
- [ ] Doc ingestion Cron Worker — crawls tracked engineering doc URLs weekly via Firecrawl
- [ ] ATLAS_RAG Vectorize index — engineering specs as searchable vectors
- [ ] Spec update detector — SearXNG checks tracked spec pages for changes
- [ ] Citation tracker — every ATLAS answer includes source URL from Vectorize metadata
- [ ] OpenSCAD integration — engineering calcs → parametric CAD → STL

### J7. HERALD (Content)
- [ ] D1 content_queue table + Cron Worker — publish at scheduled time
- [ ] LinkedIn API free — direct publish from Cron Worker
- [ ] X API free basic — direct publish
- [ ] Auto-trigger hooks — build complete → Queue message → HERALD draft
- [ ] Newsletter sender — Gmail MCP + D1 subscribers table
- [ ] Build log post auto-draft — triggered at end of every session

### J8. SENTINEL (QA)
- [ ] Scoring rubric in D1 sentinel_config — weights stored, META-COGNITION updates
- [ ] Score every agent output before client delivery
- [ ] Queue failed outputs back to originating agent automatically
- [ ] SENTINEL blocks BUILDER deploy when score < 80
- [ ] SEO audit automation — score cms_pages, write to cms_seo_audits
- [ ] PaaS rubric gate — block client production until all 7 categories ≥ target score

### J9. DISPATCH (Delivery)
- [ ] Google Drive MCP — create client folder, upload deliverables
- [ ] Gmail MCP — send delivery email with Drive links
- [ ] Google Calendar MCP — book review call before closing (BAMFAM)
- [ ] Notion MCP — mark project as delivered
- [ ] Trigger ANCHOR invoice on delivery confirmation via Queue
- [ ] Trigger HERALD case study draft on delivery

### J10. ANCHOR (Revenue)
- [ ] Stripe API — create invoices, track payments, manage retainers
- [ ] D1 revenue table — all Stripe events logged
- [ ] Telegram notification on payment received
- [ ] Google Calendar MCP — retainer renewal reminders 30 days before expiry
- [ ] MRR calculator — Cron Worker nightly from D1 subscriptions
- [ ] Monthly burn report — aggregate D1 cost data

### J11. ORACLE (Market Intelligence)
- [ ] YouTube Data API v3 (free 10k/day) — channel tracking
- [ ] SearXNG hourly scans
- [ ] RSS aggregator Cron Worker
- [ ] GENESIS gap detector — Workers AI analyzes digest against 3 niches
- [ ] GENESIS gap alerts surface in Cockpit when they hit
- [ ] 7-day rule filter — discard tools spiking then disappearing in 48h
- [ ] Reflection loop scoring — evaluate gap on evidence quality before surfacing

### J12. REEL (Video — Phase 2)
- [ ] Veo 3 (Google AI Studio free tier) — video generation
- [ ] Workers AI TTS (free) — narration
- [ ] Canva MCP — thumbnails and covers
- [ ] R2 asset pipeline — REEL generates → R2 stores → Drive MCP exports
- [ ] SolidWorks STEP export → Veo 3 animation pipeline

### J13. META-COGNITION (Sunday Reviews)
- [ ] Sunday Cron Worker — aggregate agent_perf by agent + task_type
- [ ] Compute rolling avg quality score (last 20+ tasks)
- [ ] If avg < 0.70 → trigger system prompt rewrite for that agent
- [ ] Update sentinel_config weights in D1
- [ ] Weekly report delivered as ORACLE message in Cockpit

---

## K. KNOWLEDGE PIPELINE

- [ ] Google Drive Cron sync Worker — nightly D1 query → markdown → overwrite Drive doc
- [ ] Auto-seed at end of every session (trigger phrase: "Seed the knowledge base from this session")
- [ ] knowledge-mcp: add `cms_pages`, `cms_leads`, `cms_services` search tools
- [ ] Upgrade Vectorize embedding model: @cf/baai/bge-base-en-v1.5 (768) → @cf/baai/bge-large-en-v1.5 (1024)
- [ ] Update nexus-knowledge Vectorize index dimensions when upgrading

---

## L. PAAS PRODUCTIZATION

- [ ] Tenant signup → 10-phase onboarding (Foundation → CF Resources → Supabase → AI → Email → Google → GitHub → Tool Registry → Monitoring → Handoff)
- [ ] `/signup` onboarding flow in Cockpit
- [ ] Tenant provisioning automation — all 10 phases scripted
- [ ] Per-tenant MCP URL format: `https://knowledge-mcp.connorpattern.workers.dev/mcp` scoped by tenant
- [ ] Stripe webhook → provision/pause/cancel tenant
- [ ] Pricing tiers: Starter / Pro / Agency (design pricing before Sprint 10)
- [ ] Client onboarding Loom — recorded after Day 28 goal
- [ ] Demo site — one complete tenant as live example
- [ ] Security audit — run Sam's rubric against NEXUS PaaS before launch
- [ ] Legal: ToS + Privacy Policy for PaaS (use HERALD to draft, ATLAS to review)

---

## M. VALIDATION GATES (must pass before advancing each sprint)

### Sprint 4 Gate
- [ ] Streaming works end-to-end
- [ ] Messages persist in D1 after reload
- [ ] Auth works in production
- [ ] PermissionGate works for tool_call

### Sprint 5 Gate
- [ ] Drag divider → persists in localStorage
- [ ] /api/r2/list returns ll-cockpit-r2 objects
- [ ] R2 file opens in Monaco with correct language
- [ ] cms_ai_providers table exists with Anthropic seeded
- [ ] /ai-providers shows Anthropic configured

### Sprint 6 Gate
- [ ] Terminal connects to Google Cloud VM via Cloudflare PTY
- [ ] ORACLE 7am digest appears daily
- [ ] Digest has ≥ 3 relevance-scored items
- [ ] Project open surfaces research items from Vectorize
- [ ] HERALD auto-drafts post at end of session

### Sprint 7 Gate
- [ ] SCOUT Apollo nightly → scores → queues for OpenClaw
- [ ] DocuSeal contract sent to test prospect
- [ ] FORGE generates → GitHub push → CI → BUILDER deploys
- [ ] BUILDER self-heals on first injected error
- [ ] HERALD posts to LinkedIn without manual copy-paste

### Sprint 8 Gate
- [ ] All 10 UI Playwright tests pass
- [ ] All 7 API Playwright tests pass
- [ ] SENTINEL blocks BUILDER deploy when score < 80
- [ ] All 7 PaaS rubric categories score ≥ target

### Sprint 9 Gate (Phase 1 Finish Line)
- [ ] 1 real paying client delivered through Cockpit
- [ ] ORACLE digest running daily without fail
- [ ] Demo Loom published
- [ ] LinkedIn post published
- [ ] training_data ≥ 30 SENTINEL-approved interactions

### Sprint 10 Gate (PaaS Ready)
- [ ] Two different auth users see different tenant data
- [ ] New tenant signup flow provisions all resources end-to-end
- [ ] All 7 rubric categories score ≥ 4 for test tenant
- [ ] Stripe subscription + ANCHOR invoices correctly per tenant

---

## CURRENT BLOCKER COUNT

- **1 external blocker** — Anthropic credits (console.anthropic.com)
- **0 code blockers** — all Sprint 4 code is written and deployed

## TOTAL ITEM COUNT

- Immediate: 5
- Sprint 5: ~35
- Sprint 6: ~15
- Sprint 7: ~30
- Sprint 8: ~20
- Sprint 9: 6
- Sprint 10: ~25
- Public site: ~25
- Infrastructure: ~15
- Agent configs: ~50
- Knowledge pipeline: 5
- PaaS productization: 10

**Total: ~240 items from current state to PaaS-ready.**
