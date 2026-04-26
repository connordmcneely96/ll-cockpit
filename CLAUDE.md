# LL Cockpit — Claude Code Session Config

## North Star
The Claude.ai project knowledge files are authoritative for all architectural decisions.
Key files to reference: cockpit_14day_build.md · cockpit_architecture.md · nexus_codebase_snapshot.md · nexus_session_context.md · nexus_working_rules.md

## Project
Leadership Legacy Digital AI Cockpit — NEXUS PRIME Phase 1 MVP.
Repo: github.com/connordmcneely96/ll-cockpit
Live URL: https://ll-cockpit.connorpattern.workers.dev/
Custom domain target: cockpit.leadershiplegacydigital.com
Framework: Next.js 15 App Router → Cloudflare Workers via @opennextjs/cloudflare
Auth: Supabase SSR (currently disabled in middleware.ts — do NOT enable without explicit instruction)

## Cloudflare Resources (confirmed live)
- D1: binding=DB · database_name=ll-cockpit-db · id=831eeccf-60bc-4378-8a3b-71dfb910756e
- KV: binding=KV · id=db6866496e1f426e9d84758c9329ccfe
- R2: binding=R2 · bucket=ll-cockpit-r2
- Vectorize: binding=RESEARCH_INDEX · index=cockpit-research (create if not exists)
- Vectorize: binding=MEMORY · index=cockpit-memory (create if not exists)
- Queue: binding=RESEARCH_QUEUE · queue=research-ingest (create if not exists)

## Data Model Boundaries — NEVER CROSS THESE
- DB (D1): files, projects, chat_messages, agent_tasks, agent_perf
- Supabase: auth sessions and user identities ONLY
- R2: file backups, research raw text, deliverables
- KV: active sessions, agent prompt cache, feature flags
- RESEARCH_INDEX (Vectorize): research item embeddings
- MEMORY (Vectorize): agent conversation memory embeddings

## Tech Stack
- Frontend: Next.js 15 App Router, React 19, TailwindCSS 3, Zustand
- Panels: react-resizable-panels
- Editor: @monaco-editor/react
- Terminal: @xterm/xterm + @xterm/addon-fit
- Data fetching: @tanstack/react-query
- Markdown: react-markdown + rehype-highlight + remark-gfm
- Auth: @supabase/ssr + @supabase/supabase-js
- AI: @anthropic-ai/sdk
- Backend: Next.js API routes → Cloudflare Workers via OpenNext

## Code Rules
- Server Components by default
- "use client" ONLY for: Monaco, xterm.js, Zustand stores, SSE hooks, event handlers
- Route groups: (auth) for /login /callback · (cockpit) for everything else
- NEVER touch leadershiplegacydigital.com main site
- Every destructive action (deploy, send_email, write_file, delete, run_command) requires PermissionGate — no exceptions
- Do NOT mix D1 and Supabase as data stores for the same entity type

## Secrets
Local dev: .dev.vars (gitignored) — copy from .env.example, fill in values
Production: wrangler secret put NAME
Required: ANTHROPIC_API_KEY · SUPABASE_URL · SUPABASE_ANON_KEY · SUPABASE_SERVICE_ROLE_KEY

## Access Patterns
- Cloudflare bindings: getBindings() from @/lib/cloudflare
- Supabase server: createClient() from @/lib/supabase-server
- Supabase browser: createClient() from @/lib/supabase-browser
- Agent config: getAgent(name) from @/lib/agents

## Agents (all 11)
NEXUS (orchestrator) · SCOUT (leads) · INTAKE (onboarding) · FORGE (code)
BUILDER (deploy — SENTINEL gate required) · ATLAS (engineering) · HERALD (content)
REEL (video) · SENTINEL (QA gate) · DISPATCH (delivery) · ANCHOR (MRR)

## Agent Streaming API
POST /api/agent/stream → SSE: { type: 'text' | 'tool_call' | 'done' | 'error' }
Hook: useAgentStream(agentName) in src/hooks/useAgentStream.ts

## Build & Deploy
npm run dev        # local Next.js dev
npm run preview    # CF Workers local preview (requires .dev.vars)
npm run deploy     # build + wrangler deploy

## Pre-Deploy Checklist
- /api/health returns 200 (D1 + KV green)
- PermissionGate on all destructive tools
- No secrets in frontend code
- No changes to leadershiplegacydigital.com
