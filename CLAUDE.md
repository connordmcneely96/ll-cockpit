# LL Cockpit — Claude Code Session Config

## Identity
Project: Leadership Legacy Digital AI Cockpit — Phase 1 MVP of NEXUS PRIME
Repo: github.com/connordmcneely96/ll-cockpit
Live URL: ll-cockpit.connorpattern.workers.dev
Target domain: cockpit.leadershiplegacydigital.com
Owner: Connor McNeely — Leadership Legacy Digital

## Tech Stack (Actual)
Frontend: Next.js 15 App Router (React 19, TypeScript, TailwindCSS)
Deploy: Cloudflare Workers via @opennextjs/cloudflare
Auth: Supabase Auth (OAuth, SSR, server + browser clients)
Database: Cloudflare D1 (SQLite at edge) — primary structured store
KV: Cloudflare KV — agent prompts, sessions, feature flags
R2: Cloudflare R2 — file storage, artifacts, research text
Vectorize: Cloudflare Vectorize — agent memory, RAG, research index
Queues: Cloudflare Queues — async agent tasks, research ingestion
AI binding: Cloudflare Workers AI — embeddings
State: Zustand (client-side UI state only)
Components: Monaco Editor (IDE), xterm.js (terminal)

## Cloudflare Bindings (canonical — NEVER invent names outside this list)

| Binding        | Type         | Name / ID                                                        |
|----------------|--------------|------------------------------------------------------------------|
| DB             | D1           | ll-cockpit-db · 831eeccf-60bc-4378-8a3b-71dfb910756e            |
| KV             | KV Namespace | db6866496e1f426e9d84758c9329ccfe                                 |
| R2             | R2 Bucket    | ll-cockpit-r2                                                    |
| MEMORY         | Vectorize    | nexus-memory                                                     |
| ATLAS_RAG      | Vectorize    | atlas-engineering                                                |
| RESEARCH_INDEX | Vectorize    | cockpit-research                                                 |
| TASKS          | Queue        | nexus-tasks                                                      |
| RESEARCH_QUEUE | Queue        | research-ingest                                                  |
| AI             | Workers AI   | (platform binding — no ID)                                       |
| ASSETS         | Static       | .open-next/assets                                                |

## Access Patterns
Cloudflare bindings (server components / route handlers only):
  import { getCloudflareContext } from '@opennextjs/cloudflare';
  const { env } = await getCloudflareContext();
  const result = await env.DB.prepare('SELECT * FROM files WHERE id = ?').bind(id).first();

Supabase server: import { createClient } from '@/lib/supabase-server';
Supabase browser: import { createClient } from '@/lib/supabase-browser';

## Design System (LOCKED — do not change)
Background:   #0a0e1a  (deep navy)
Surface:      #111827  (card/panel)
Border:       #1e2d3d
Primary:      #00d4ff  (cyan)
Accent:       #f59e0b  (gold)
Text primary: #e2e8f0
Text muted:   #64748b
Fonts: JetBrains Mono (code), Barlow (UI)
Never use rounded corners > rounded-lg. Never use white backgrounds.
Agent status dots: ● running · ○ idle · ✗ error

## Agents — Full Roster (13)

| Agent    | Role                                                              | Permission            |
|----------|-------------------------------------------------------------------|-----------------------|
| NEXUS    | Master Orchestrator — routes every task to correct specialist     | READ                  |
| SCOUT    | Lead Generation — Apollo searches, scores leads, queues outreach  | WRITE                 |
| INTAKE   | Client Onboarding — qualifies prospects, proposals, D1 records   | WRITE                 |
| FORGE    | Full-Stack Engineer — production code, no placeholders, no TODOs | WRITE                 |
| BUILDER  | Autonomous Deploy + Self-Heal — prompt-to-live-URL pipeline       | DEPLOY (SENTINEL req) |
| ATLAS    | Engineering RAG — CAD / API 610-682 / mechanical specs           | WRITE (Connor review) |
| HERALD   | Content Engine — LinkedIn, X threads, blog, case studies         | WRITE                 |
| REEL     | Video + Visual — Veo 3 / InVideo production                      | WRITE                 |
| SENTINEL | QA Gate — scores 0-1, below 0.85 routes back, above ships        | READ                  |
| DISPATCH | Client Delivery — packages deliverables, Drive, delivery emails  | WRITE                 |
| ANCHOR   | Revenue + MRR — Stripe invoices, payment tracking, retainers     | WRITE                 |
| ORACLE   | Market Intelligence — hourly YouTube/RSS/X scan, 7am digest      | READ                  |
| HERMES   | Inter-Agent Coordination — ambiguous prompts, multi-agent decomp | WRITE                 |

## Agent Streaming API
Endpoint: POST /api/agent/stream
Body:     { agentName: string, message: string, chatId: string }
Response: SSE stream
Events:   { type: 'text' | 'tool_call' | 'done' | 'error', data: string }
Hook:     useAgentStream(agentName) in src/hooks/useAgentStream.ts

## Agent System Prompts
Agent prompts live in Cloudflare KV under keys prompt:AGENTNAME (e.g. prompt:NEXUS, prompt:FORGE).
Read at runtime: const systemPrompt = await env.KV.get('prompt:NEXUS');
Source of truth: agent_*.md files in Claude Chat project knowledge.

## Quality Rules
- Every agent output gets a quality_score written to the agent_perf D1 table
- Below 0.85 → SENTINEL routes back to originating agent
- At/above 0.85 → eligible for training_data
- BUILDER always requires SENTINEL score >= 80 before deploy
- /api/health must return 200 (D1 + KV + Supabase green) before any deploy

## Code Rules
- Server Components by default. "use client" ONLY for: Monaco, xterm.js, Zustand stores, SSE hooks, event handlers
- Route groups: (auth) for /login /callback · (cockpit) for everything else
- Co-locate components with their route page
- Every destructive operation (deploy, send_email, write_file, delete, run_command) requires PermissionGate — no exceptions
- NEVER touch leadershiplegacydigital.com domain or DNS
- D1 schema is append-only — never DROP tables, never rename columns in production
- Never invent a CF binding name — always reference the binding table above

## Secrets
Local dev: .dev.vars (gitignored)
Production: wrangler secret put NAME

Required:
  ANTHROPIC_API_KEY          Claude API — all agent calls
  OPENROUTER_API_KEY         Llama / Mistral / Gemini fallback
  SUPABASE_URL               Supabase project URL
  SUPABASE_ANON_KEY          Supabase anon key
  SUPABASE_SERVICE_ROLE_KEY  Supabase service role (server-only)
  TERMINAL_SECRET            Shared secret for VPS WebSocket auth
  VPS_TUNNEL_URL             Cloudflare Tunnel URL to Hetzner VPS
  GITHUB_TOKEN               GitHub API — FORGE code push
  YOUTUBE_API_KEY            YouTube Data API v3 — ORACLE channel scanning
  APOLLO_API_KEY             Apollo.io — SCOUT lead gen (Phase 2)
  STRIPE_SECRET_KEY          Stripe — ANCHOR invoicing (Phase 2)

## Build & Deploy
  npm run dev          local Next.js dev
  npm run preview      Cloudflare Workers local preview
  npm run deploy       build + wrangler deploy

## Pre-deploy Checklist
  [ ] SENTINEL score >= 80 on all changed components
  [ ] /api/health returns 200 (D1 + KV + Supabase all green)
  [ ] PermissionGate present on all destructive tools
  [ ] No secrets in frontend code or committed to git
  [ ] npx tsc --noEmit passes with zero errors

## MCP Servers (register in Claude Code settings)
fetch · filesystem · playwright · memory · cloudflare · github
