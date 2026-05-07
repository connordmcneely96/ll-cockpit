# NEXUS SESSION CONTEXT

**The briefing document for every new Claude Chat session.**
Last updated: May 7, 2026 — full doc sync after Cockpit UI redesign + Sam's repo extraction.

---

## Current Sprint Goal

**Sprint 4:** Cockpit Core + UI — IN PROGRESS
**Next:** Sprint 5 — IDE + R2 + Sam Extraction

Sprint 4 remaining gaps:
- Agent streaming end-to-end (code complete — needs Anthropic credits at console.anthropic.com)
- Supabase auth verified in production
- D1 message persistence from UI
- Chat history persistence across sessions
- PermissionGate approve/reject loop

Sprint 5 (next):
- Resizable panels (useResizablePanels hook)
- R2 API routes (7 routes)
- Monaco IDE fully wired
- D1 migrations 0004-0008
- New Cockpit pages (AI Providers, R2 Storage, Analytics, Leads)

---

## Live Deployment

| Item | Value |
|---|---|
| Live URL | https://ll-cockpit.connorpattern.workers.dev |
| Repo | github.com/connordmcneely96/ll-cockpit |
| Branch | main |
| Last deploy | May 7, 2026 — version 9e7dec45 (three-panel layout live) |
| Current Worker version | d802885a (sam extraction + sprint plan) |

---

## What Is Actually Live Right Now (May 7, 2026)

| Feature | Status |
|---|---|
| Three-panel layout (ExplorerPanel + center + AgentPanel) | ✅ LIVE |
| Antigravity-style Dashboard (6 stat cards + agent grid) | ✅ LIVE |
| TopBar (LL logo + workspace badge + breadcrumb) | ✅ LIVE |
| StatusBar (NEXUS PRIME + claude-sonnet-4-5 + cost) | ✅ LIVE |
| ExplorerPanel (11 agents + R2 workspace section) | ✅ LIVE |
| AgentPanel (right panel — click agent → inline chat) | ✅ LIVE |
| Agent streaming code (/api/agent/stream) | ✅ Code complete — native fetch, not SDK |
| Agent streaming functional | ❌ Blocked — Anthropic credits needed |
| Supabase auth | ❓ Configured, not confirmed in prod |
| D1 message persistence | ❓ Code written, not confirmed |
| Monaco IDE (/ide) | ❓ Page exists, not wired to R2 |
| Terminal (/terminal) | ❓ xterm.js exists, not wired to PTY |
| Pipeline (/pipeline) | ✅ Kanban renders with seed data |
| Knowledge MCP | ✅ Live at https://knowledge-mcp.connorpattern.workers.dev/mcp |
| knowledge-embed-consumer Worker | ✅ Live |

---

## Confirmed Infrastructure (Audited May 7, 2026)

### Cloudflare Resources
| Resource | Name | ID / Binding |
|---|---|---|
| Worker | `ll-cockpit` | — |
| D1 Database | `ll-cockpit-db` | `831eeccf-60bc-4378-8a3b-71dfb910756e` / binding: `DB` |
| KV Namespace | `LL_COCKPIT_KV` | `db6866496e1f426e9d84758c9329ccfe` / binding: `KV` |
| R2 Bucket | `ll-cockpit-r2` | binding: `R2` |
| Vectorize Index | `nexus-knowledge` | 768-dim cosine / binding: `KNOWLEDGE_VECTORIZE` |
| Queue | `knowledge-embed-queue` | binding: `KNOWLEDGE_QUEUE` |
| Workers AI | — | binding: `AI` |

### Deployed Secrets (all confirmed via wrangler secret list)
- `ANTHROPIC_API_KEY` ✅
- `SUPABASE_URL` ✅
- `SUPABASE_ANON_KEY` ✅
- `SUPABASE_SERVICE_ROLE_KEY` ✅

### Compute
- **Google Cloud VM** (replaced original Hetzner plan)
- SearXNG self-hosted on Google Cloud VM
- Cloudflare Tunnel exposes VM services to Workers
- Terminal PTY: Cloudflare native PTY tunnels (no custom WebSocket server needed)

### Standalone Workers
| Worker | URL | Status |
|---|---|---|
| `knowledge-mcp` | https://knowledge-mcp.connorpattern.workers.dev/mcp | ✅ Live — v292d46c1 |
| `knowledge-embed-consumer` | Queue consumer | ✅ Live — vd43e04af |

---

## Actual Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 App Router |
| Deploy pipeline | @opennextjs/cloudflare → Cloudflare Workers |
| Auth | Supabase Auth SSR |
| Database | Cloudflare D1 (`ll-cockpit-db`) |
| KV | Cloudflare KV (`LL_COCKPIT_KV`) |
| Storage | Cloudflare R2 (`ll-cockpit-r2`) |
| Agent streaming | POST /api/agent/stream → native fetch → Anthropic SSE |
| State management | Zustand (agentStore, uiStore) |
| UI | Tailwind + base-1 through base-5 color palette + blue accent |
| Frontend pattern | Server Components default; 'use client' for Monaco, xterm.js, Zustand, SSE hooks |

---

## D1 Schema — `ll-cockpit-db` (15 core tables + growing)

| Table | Purpose |
|---|---|
| `cockpit_projects` | Project records |
| `cockpit_files` | IDE file storage |
| `cockpit_chats` | Chat sessions |
| `cockpit_messages` | Message history |
| `cockpit_terminal_sessions` | Terminal state |
| `cockpit_research` | Research items |
| `cockpit_research_sources` | Research source registry |
| `cockpit_research_digests` | Research digest output |
| `cockpit_research_project_links` | Research ↔ Project joins |
| `agent_sessions` | Agent conversation state |
| `agent_tasks` | Task queue |
| `agent_perf` | Performance/cost tracking |
| `tool_calls` | Tool call audit log |
| `training_data` | Fine-tune data collection |
| `study_nodes` | NEXUS knowledge base |
| `sprint_items` | Sprint tracking |

**Pending migrations (Sprint 5):**
- 0004: cms_ai_providers, cms_ai_models, cms_ai_routing_policy
- 0005: cms_r2_buckets, cms_r2_objects
- 0006: analytics_events, analytics_sessions, ai_completions, ai_routing_decisions
- 0007: content_queue, subscribers, revenue, pending_approvals
- 0008: research_sources, research_queue, research_digests, research_project_links

---

## Current Layout Structure (LIVE)

```
TopBar (40px) — LL logo + workspace badge + breadcrumb + cost meter
├── ExplorerPanel (220px) — Agent list + R2 workspace section
├── Center (flex) — Current page (Dashboard/IDE/Terminal/Pipeline/etc)
│   └── border-x between panels
└── AgentPanel (280px) — Click agent → inline chat, no navigation
StatusBar (24px) — NEXUS PRIME + model + tokens + cost
```

Key behavior: clicking agent in ExplorerPanel sets `uiStore.selectedAgent` → AgentPanel renders inline chat. No page navigation. Center stays on current view.

---

## New Files Added This Session (May 7, 2026)

| File | Location | Purpose |
|---|---|---|
| ExplorerPanel.tsx | src/components/layout/ | Left explorer panel |
| AgentPanel.tsx | src/components/layout/ | Right agent chat panel |
| ActivityBar.tsx | src/components/layout/ | (previous iteration, superseded) |
| SidePanel.tsx | src/components/layout/ | (previous iteration, superseded) |
| StatusBar.tsx | src/components/layout/ | Bottom status bar |
| docs/sam-repo-extraction.md | docs/ | Full extraction from SamPrimeaux/leadership-legacy |
| docs/sprint_plan_master.md | docs/ | Master sprint plan Sprints 1-10 |
| docs/agent-tool-chains.md | docs/ | Zero paid API agent tool chains |

---

## Critical Decisions Made May 7, 2026

1. **Anthropic SDK incompatible with CF Workers** → Always use native fetch to api.anthropic.com/v1/messages
2. **React #185 fixed** → EMPTY_MESSAGES stable ref outside component, useEffect on messageCount not messages
3. **Agent chat is a right panel** → No more /agent/[name] full-page navigation. selectedAgent in uiStore drives AgentPanel.
4. **Google Cloud VM** → Replaces Hetzner for all compute. Same cloudflared tunnel pattern.
5. **Cloudflare PTY tunnels** → No custom WebSocket PTY server needed for Terminal.
6. **Zero paid APIs** → Only Anthropic (LLM), Google Cloud VM (~$10/mo), Stripe (revenue cost only)
7. **Sam's Thompson Sampling** → Will replace deterministic routing in Sprint 10

---

## Wrangler.toml (canonical — never invent bindings)

```toml
name = "ll-cockpit"
main = ".open-next/worker.js"
compatibility_date = "2024-09-23"
compatibility_flags = ["nodejs_compat"]
assets = { directory = ".open-next/assets", binding = "ASSETS" }

[[d1_databases]]
binding = "DB"
database_name = "ll-cockpit-db"
database_id = "831eeccf-60bc-4378-8a3b-71dfb910756e"

[[kv_namespaces]]
binding = "KV"
id = "db6866496e1f426e9d84758c9329ccfe"

[[r2_buckets]]
binding = "R2"
bucket_name = "ll-cockpit-r2"

[[queues.producers]]
binding = "KNOWLEDGE_QUEUE"
queue = "knowledge-embed-queue"

[[ai]]
binding = "AI"

[[vectorize]]
binding = "KNOWLEDGE_VECTORIZE"
index_name = "nexus-knowledge"
```

---

## Pre-deploy Checklist
- [ ] SENTINEL score ≥ 80 on all changed components
- [ ] /api/health returns 200
- [ ] PermissionGate present on all destructive tools
- [ ] No secrets in frontend code
- [ ] TypeScript builds clean (npx tsc --noEmit)
- [ ] Remove-Item -Recurse -Force .next + .open-next before rebuild
- [ ] git pull origin main before building

---

## Sprint 5 First Actions (next session)

1. Add Anthropic credits → test streaming works end-to-end
2. Write useResizablePanels TypeScript hook
3. Add R2 API routes (/api/r2/list, /api/r2/text, /api/r2/object/[...key])
4. Wire Monaco IDE page to R2 file tree
5. Run D1 migration 0004 (AI provider registry)

---

## Session Kickoff Verification (5 Questions)

When starting a new build session, Claude Code should answer:
1. What is the current git HEAD SHA? (`git log --oneline -1`)
2. Is ANTHROPIC_API_KEY in wrangler secret list?
3. What is the current Worker version ID?
4. Does /api/health return 200 with all bindings?
5. What sprint item has priority P1 and status todo?
