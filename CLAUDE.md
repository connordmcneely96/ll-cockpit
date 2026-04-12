# LL Cockpit — Claude Code Session Config

## North Star
Read `nexus_master_cheatsheet.html` before any architectural decisions.

## Project
Leadership Legacy Digital AI Cockpit — Phase 1 MVP of NEXUS PRIME.
Repo: github.com/connordmcneely96/ll-cockpit
Deploy target: sandbox.leadershiplegacydigital.com
Framework: Next.js 15 App Router → Cloudflare Workers via @opennextjs/cloudflare

## Cloudflare Resources
- D1 database: `ll-cockpit-db` (id: 831eeccf-60bc-4378-8a3b-71dfb910756e)
- KV namespace: `LL_COCKPIT_KV` (id: db6866496e1f426e9d84758c9329ccfe)
- R2 bucket: `ll-cockpit-r2`

## MCP Servers
fetch, filesystem, playwright, memory, cloudflare, github (register all in settings)

## Docs to Fetch When Needed
- Next.js App Router:  https://nextjs.org/docs/app
- OpenNext CF:         https://opennext.js.org/cloudflare/get-started
- CF D1:              https://developers.cloudflare.com/d1/
- Supabase Auth SSR:  https://supabase.com/docs/guides/auth/server-side/nextjs
- Paperclip:          https://docs.paperclip.ing/start/what-is-paperclip

## Code Rules
- Server Components by default. `"use client"` ONLY for: Monaco, xterm.js, Zustand stores, SSE hooks, event handlers
- Co-locate components with their route page (e.g. AgentChat.tsx lives next to agent/[name]/page.tsx)
- Route groups: `(auth)` for /login, /callback. `(cockpit)` for everything else.
- Never touch leadershiplegacydigital.com
- Every destructive tool call (deploy, send_email, write_file, delete, run_command) REQUIRES PermissionGate before executing — no exceptions

## Secrets
Local dev: `.dev.vars` (gitignored)
Production: `wrangler secret put NAME`
Required secrets: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

## Access Patterns
Cloudflare bindings (D1, KV, R2): `getBindings()` from `@/lib/cloudflare`
Supabase server: `createClient()` from `@/lib/supabase-server`
Supabase browser: `createClient()` from `@/lib/supabase-browser`
Agent config: `getAgent(name)` from `@/lib/agents`
Cost calc: `calculateCost(inputTokens, outputTokens)` from `@/lib/cost`

## Agents (all 11)
NEXUS (orchestrator), SCOUT (leads), INTAKE (onboarding), FORGE (code),
BUILDER (deploy — SENTINEL pass + approval required), ATLAS (engineering),
HERALD (content), REEL (video), SENTINEL (QA gate), DISPATCH (delivery), ANCHOR (MRR)

## Agent Streaming
POST /api/agent/stream → SSE events: { type: 'text' | 'tool_call' | 'done' | 'error' }
Hook: useAgentStream(agentName) in src/hooks/useAgentStream.ts

## Build & Deploy
```bash
npm run dev          # local Next.js dev
npm run preview      # Cloudflare Workers local preview
npm run deploy       # build + wrangler deploy
```

## Pre-deploy Checklist
- [ ] SENTINEL score ≥ 80 on all changed components
- [ ] /api/health returns 200 (D1 + KV + Supabase all green)
- [ ] PermissionGate present on all destructive tools
- [ ] No secrets in frontend code
- [ ] No changes to leadershiplegacydigital.com
