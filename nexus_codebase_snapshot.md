# NEXUS CODEBASE SNAPSHOT

**What the code actually looks like as of May 7, 2026.** Updated after three-panel layout deployment.

---

## Repo

`github.com/connordmcneely96/ll-cockpit` · branch: `main` · ~80 commits

---

## Root File Structure

```
ll-cockpit/
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   └── auth/callback/route.ts
│   │   ├── (cockpit)/
│   │   │   ├── layout.tsx          ← 'use client', 3-panel layout (TopBar+ExplorerPanel+center+AgentPanel+StatusBar)
│   │   │   ├── page.tsx            ← Dashboard — 6 stat cards + agent grid
│   │   │   ├── agent/[name]/
│   │   │   │   ├── page.tsx           ← redirect — sets selectedAgent + router.replace('/')
│   │   │   │   ├── AgentChat.tsx      ← kept for reference (inline version in AgentPanel)
│   │   │   │   ├── AgentMessage.tsx   ← message renderer (imported by AgentPanel)
│   │   │   │   └── PermissionGate.tsx
│   │   │   ├── ide/page.tsx        ← Monaco editor (not yet wired to R2)
│   │   │   ├── terminal/
│   │   │   │   ├── page.tsx           ← terminal chrome (traffic lights + Connected status)
│   │   │   │   └── TerminalPane.tsx   ← xterm.js (sandbox PTY, not yet wired to CF PTY)
│   │   │   ├── orchestrator/page.tsx
│   │   │   ├── pipeline/page.tsx   ← Kanban board with seed data
│   │   │   └── settings/page.tsx
│   │   ├── api/
│   │   │   ├── agent/
│   │   │   │   ├── stream/route.ts    ← CRITICAL — native fetch to Anthropic, SSE streaming
│   │   │   │   └── approve/route.ts   ← PermissionGate approval handler
│   │   │   ├── agents/route.ts
│   │   │   ├── health/route.ts
│   │   │   ├── knowledge/route.ts  ← D1 + Supabase + Queue writes
│   │   │   ├── sessions/route.ts
│   │   │   └── tools/[name]/route.ts
│   │   ├── globals.css         ← base-1..5 tokens, blue palette, noise texture, glass mixin
│   │   └── layout.tsx          ← root layout (fonts, Supabase provider)
│   ├── components/
│   │   ├── layout/
│   │   │   ├── ExplorerPanel.tsx   ← NEW — 220px left panel, agent list + R2 workspace
│   │   │   ├── AgentPanel.tsx      ← NEW — 280px right panel, inline agent chat
│   │   │   ├── TopBar.tsx          ← 40px, LL logo + workspace badge + breadcrumb
│   │   │   ├── StatusBar.tsx       ← 24px, NEXUS PRIME + model + tokens + cost
│   │   │   ├── CommandPalette.tsx  ← ⌘K palette
│   │   │   ├── ActivityBar.tsx     ← previous iteration (superseded)
│   │   │   ├── SidePanel.tsx       ← previous iteration (superseded)
│   │   │   └── Sidebar.tsx         ← original (superseded, kept for reference)
│   │   └── ui/                 ← Button, Badge, Card, CostMeter, StreamText, etc.
│   ├── hooks/
│   │   └── useAgentStream.ts   ← SSE consumer hook, reads agentStore, sends messages
│   ├── lib/
│   │   ├── agents.ts           ← AGENTS config (11 agents, system prompts, tools)
│   │   ├── cloudflare.ts       ← getBindings() — pulls DB, KV, R2, AI from CF context
│   │   ├── cost.ts             ← calculateCost(inputTokens, outputTokens), SESSION_TOKEN_LIMIT
│   │   ├── supabase-server.ts  ← createClient() for server-side Supabase
│   │   ├── supabase-browser.ts ← createClient() for client-side
│   │   └── training.ts         ← captureTrainingData() — writes to D1 training_data
│   ├── stores/
│   │   ├── agentStore.ts       ← Zustand — sessions, isStreaming, sessionTokens, sessionCost
│   │   └── uiStore.ts          ← Zustand — commandPaletteOpen, selectedAgent, setSelectedAgent
│   └── types/
│       └── index.ts            ← AgentConfig, AgentName, ChatMessage, SSEEvent, CloudflareEnv
├── docs/
│   ├── agent-tool-chains.md        ← Zero paid API agent architecture (13 agents, 3 pipelines)
│   ├── sam-repo-extraction.md      ← Full extraction from SamPrimeaux/leadership-legacy
│   ├── sprint_plan_master.md       ← Master sprint plan Sprints 1-10
│   ├── multi-tenant-blueprint.md
│   └── chatgpt-action-openapi.yaml
├── scripts/
│   └── seed-knowledge.js           ← NEXUS Knowledge base seeder
├── workers/
│   ├── knowledge-embed-consumer/   ← Queue consumer (embed + vectorize). v d43e04af
│   └── knowledge-mcp/              ← MCP Worker (McpAgent + OAuthProvider). v 292d46c1
├── migrations/                     ← D1 migrations (0001-0003 applied)
├── tailwind.config.ts              ← base/blue/gold/cyan palette
├── wrangler.toml                   ← ll-cockpit canonical config
├── open-next.config.ts
├── next.config.ts
├── tsconfig.json                   ← excludes: workers, supabase dirs
└── CLAUDE.md
```

---

## Critical Code Patterns (Read Before Generating)

### Agent Streaming Route (`/api/agent/stream/route.ts`)
```typescript
// NEVER use Anthropic SDK — incompatible with CF Workers
// ALWAYS use native fetch
const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
  },
  body: JSON.stringify({ model, max_tokens, stream: true, system, messages }),
});
// Parse SSE from anthropicRes.body using getReader()
```

### EMPTY_MESSAGES Pattern (prevents React #185)
```typescript
// OUTSIDE component — stable reference
const EMPTY_MESSAGES: never[] = []

// INSIDE component
const rawMessages = useAgentStore((s) => s.sessions[agentName])
const messages = rawMessages ?? EMPTY_MESSAGES

// useEffect depends on count not array
const messageCount = messages.length
useEffect(() => { scrollToBottom() }, [messageCount])
```

### uiStore selectedAgent (drives AgentPanel)
```typescript
const selectedAgent = useUiStore((s) => s.selectedAgent)  // string | null
const setSelectedAgent = useUiStore((s) => s.setSelectedAgent)
// Clicking agent: setSelectedAgent(agent.name)
// Closing panel: setSelectedAgent(null)
// AgentPanel: <AgentChatInner agentName={selectedAgent as AgentName} />
```

### getBindings() pattern
```typescript
import { getBindings } from '@/lib/cloudflare'
const { DB, KV, R2, AI, ANTHROPIC_API_KEY } = getBindings()
const apiKey = ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY
```

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

## Deploy Sequence (Windows PowerShell)

```powershell
# Always in this order:
git pull origin main
Remove-Item -Recurse -Force .next
Remove-Item -Recurse -Force .open-next
npx @opennextjs/cloudflare build
wrangler deploy
```

**Never:** `wrangler deploy --config` from root (OpenNext intercepts)
**Never:** deploy without `git pull` first (stale local files)
**Never:** deploy without clearing .next + .open-next (stale CSS)

---

## Key Invariants (Never Break)

1. Anthropic SDK is NOT in route handlers — native fetch only
2. EMPTY_MESSAGES declared outside component — stable reference
3. Agent chat is a right panel — no full-page /agent/[name] navigation
4. uiStore.selectedAgent drives AgentPanel state
5. tsconfig excludes workers/ and supabase/ dirs
6. No secrets in frontend code
7. PermissionGate required for all destructive tool calls
8. SENTINEL score ≥ 80 before BUILDER deploys anything
