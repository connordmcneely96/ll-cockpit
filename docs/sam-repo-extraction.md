# Sam's Repo Extraction — leadership-legacy (COMPLETE)

> Full value extraction from `SamPrimeaux/leadership-legacy`.
> Stack: Vite + vanilla React + Cloudflare Worker.
> Updated: May 7, 2026 — includes full docs/ and sql/ review.
> Nothing is copied directly — all patterns are adapted for Next.js 15 + TypeScript + Tailwind.

---

## 1. Worker API Routes (Add to ll-cockpit)

Sam's `src/worker/index.js` has these routes we adapt as Next.js API routes:

| Route | Description | Priority |
|---|---|---|
| `GET /api/health` | Enhanced — reports all binding presence (R2, D1, KV, AI, Anthropic) + timestamp | P1 |
| `GET /api/ai/providers` | Live status of all AI provider secrets. Returns configured/missing per provider. | P1 |
| `GET /api/r2/list?prefix=` | List R2 objects (key, size, uploaded, etag). Up to 100 per call. | P1 |
| `GET /api/r2/text?key=` | Read text/code file from R2. Validates extension is text type before returning. | P1 |
| `GET /api/r2/object/[...key]` | Stream raw R2 object with proper content-type and cache headers. | P2 |
| `GET /api/r2/status` | R2 bucket status + README preview. | P2 |
| `POST /api/agent/code` | Anthropic-powered code assistance (replaces Sam's OpenAI version). Body: filename, language, code, instruction. Returns complete rewritten file. | P1 |
| `GET /api/github/status` | Returns which GitHub OAuth/App secrets are configured. | P2 |
| `GET /api/oauth/github/start` | OAuth redirect to GitHub. Scope: repo read:user user:email. | P3 |
| `GET /api/oauth/google/start` | OAuth redirect to Google. Scopes: openid + email + profile + drive.readonly + gmail.readonly + gmail.compose. | P3 |

---

## 2. D1 Schema (New Migrations for ll-cockpit)

### Migration 0004 — AI Provider Registry
```sql
cms_ai_providers (id, provider_key, display_name, secret_name, status, use_cases_json, metadata_json, created_at)
cms_ai_models (id, provider_key, model_key, display_name, lane, is_enabled, is_blocked, input_price_per_mtok, output_price_per_mtok)
cms_ai_routing_policy (id, policy_key, default_text_model, cheap_text_model, senior_text_model, review_provider, blocked_models_json)
```
Seed: Anthropic (sonnet=default_workhorse, haiku=cheap_fast), OpenAI lanes, blocked models policy.
Routing: `cheap=claude-haiku`, `default=claude-sonnet-4-5`, `senior=claude-opus-4`, `review=anthropic`.

### Migration 0005 — R2 Asset Registry
```sql
cms_r2_buckets (id, binding_name, bucket_name, public_dev_url, s3_endpoint, status, metadata_json)
cms_r2_objects (id, bucket_binding, object_key, object_type, content_type, size_bytes, public_url, etag, usage_context)
```
Enables D1 catalog of all R2 objects for fast browsing without calling R2 list every time.

### Migration 0006 — Analytics
```sql
analytics_events (id, workspace_id, tenant_id, event_name, page_path, session_id, metadata_json, created_at)
analytics_sessions (id, workspace_id, visitor_id, session_id, first_page, last_page, referrer, started_at)
ai_completions (id, provider, model_key, task_type, input_tokens, output_tokens, cost_usd, latency_ms, success)
ai_routing_decisions (id, workspace_id, task_type, selected_model, provider, routing_strategy, cost_usd, success)
```

### Migration 0007 — Agent Tables
```sql
content_queue (id, agent, platform, content, visual_url, publish_at, status, created_at)
subscribers (id, email, name, status, subscribed_at)
revenue (id, stripe_event_id, project_id, type, amount_usd, status, created_at)
pending_approvals (id, agent, action_type, payload, telegram_message_id, status, created_at, resolved_at)
```

### Migration 0008 — Research Pipeline
```sql
research_sources (id, source_type, source_url, source_name, active, last_checked, added_at)
research_queue (id, source_id, external_id, title, url, status, raw_r2_key, summary_json, vector_id, collected_at, processed_at)
research_digests (id, digest_date, item_ids, digest_html, delivered_at)
research_project_links (research_id, project_id, relevance_score)
```

---

## 3. Supabase Schema — Full PaaS Telemetry Layer

Sam's `sql/supabase/010_full_cms_analytics_rag.sql` (23KB) defines the full multi-tenant analytics + RAG + agent telemetry system. This is the backbone of the PaaS observability layer.

### Multi-Tenant Foundation
```sql
ll_tenants (id, slug, name, status, metadata, created_at)          — one row per client
ll_workspaces (id, tenant_id, slug, name, site_url, timezone)       — one per project/brand
```
Every other table has `tenant_id` + `workspace_id` columns for row-level isolation. This is the exact multi-tenant pattern NEXUS uses (same design, already proven).

### RAG / Knowledge Tables
```sql
ll_documents (id, tenant_id, source, content, embedding vector(1024), embed_model, metadata)
ll_semantic_search_log (id, tenant_id, query_hash, match_threshold, top_similarity, latency_ms, success)
ll_knowledge_edges (id, entity_a, relation, entity_b, source_type, confidence)  — knowledge graph
```
Note: Sam uses `vector(1024)` with `@cf/baai/bge-large-en-v1.5`. Our current setup uses `vector(768)` with `@cf/baai/bge-base-en-v1.5`. The larger model produces better embeddings. Consider upgrading Vectorize indexes.

### Website Analytics
```sql
ll_site_sessions (id, tenant_id, session_id, first_page, referrer, country, started_at)
ll_site_events (id, tenant_id, event_name, page_path, utm_source, utm_campaign, lead_id)
ll_lead_events (id, tenant_id, lead_id, event_name, pipeline_status, project_type, budget_range)
```

### AI Routing with Thompson Sampling
```sql
ll_model_cost_snapshots (id, provider, model_key, input_rate_per_mtok, output_rate_per_mtok, effective_at)
ll_routing_arms (id, tenant_id, provider, model_key, task_type, alpha, beta, total_runs, successes, avg_cost_usd, avg_quality_score)
ll_routing_decisions (id, tenant_id, task_type, selected_model, routing_strategy, routing_arm_id, override_reason, fallback_used, actual_cost_usd, success, human_score, latency_ms)
```
The `ll_routing_arms` table implements Thompson Sampling: `alpha`/`beta` are Beta distribution parameters updated per outcome. `alpha += 1` on success, `beta += 1` on failure. The model with the highest sampled value wins. This is the production routing strategy for NEXUS multi-provider.

### Full Agent Telemetry
```sql
ll_prompt_runs (id, tenant_id, agent_id, prompt_profile_key, system_prompt_hash, total_prompt_chars, included_prompts, context_sources)
ll_stream_events (id, tenant_id, request_id, event_type, selected_model, provider, input_tokens, output_tokens, cost_usd, chunk_count, duration_ms, first_token_ms, success)
ll_tool_call_events (id, tenant_id, tool_name, tool_category, tool_source, call_index, cost_usd, duration_ms, success, input_json, output_json)
ll_error_events (id, tenant_id, source, severity, error_type, error_message, retryable, resolved, resolution_notes)
```
This is production-grade observability. Every stream event, tool call, and error is logged with full context. SENTINEL feeds this.

### Evals System
```sql
ll_eval_suites (id, suite_key, display_name, task_type, prompt, acceptance_criteria)
ll_eval_runs (id, suite_id, tenant_id, agent_tool, provider, model_key, status, success, input_tokens, cost_usd, build_passed, tests_passed, deploy_passed, human_score_architecture, human_score_quality, human_score_speed, human_score_cost)
```
`ll_eval_runs` has human scoring across 4 dimensions (architecture, quality, speed, cost) — 1-5 scale. This feeds SENTINEL's adaptive rubric.

### Design Studio / R2 Analytics
```sql
ll_r2_object_events (id, tenant_id, bucket_name, object_key, event_name, size_bytes)
ll_designstudio_runs (id, workflow_run_id, tenant_id, status, cost_usd, duration_ms)
ll_designstudio_asset_metrics (id, workflow_run_id, asset_type, r2_key, size_bytes)
```

### Codebase Indexing (ATLAS RAG)
```sql
ll_codebase_snapshots (id, snapshot_id, workspace_id, commit_sha, file_count, chunk_count, r2_prefix)
ll_codebase_files (id, snapshot_id, file_path, language, category, is_priority, line_count)
ll_codebase_chunks (id, snapshot_id, file_path, chunk_type, content, embedding vector(1024), symbol_name, language)
ll_codebase_symbols (id, snapshot_id, file_path, symbol_type, symbol_name, http_method, line_number, signature)
```
`chunk_type` enum: code, comment, route, function, class, config, markdown, other
`symbol_type` enum: route, function, class, export, constant, import, other

This is the exact schema for ATLAS's code-aware RAG. FORGE can query codebase_symbols to find all routes, functions, and exports before generating new code.

### Pre-built Views
```sql
v_ll_site_overview_30d — page_views, cta_clicks, lead_submits, sessions by workspace
v_ll_page_performance_30d — top pages by views, clicks, leads
v_ll_stream_run_summary — per-request aggregated stream telemetry
v_ll_recent_errors — last 100 error events
```
All 24 tables have Row Level Security enabled.

---

## 4. RUBRIC.md — PaaS Readiness Scoring System

This is directly applicable to NEXUS PaaS client onboarding. Sam defined a 0-5 rubric across 7 categories:

| Category | Target Score | Meaning |
|---|---|---|
| Integration Setup | 4 | Integration works through dashboard/API with safe errors |
| Secret Safety | 4 | Secret usage audited, never returned to browser |
| Dashboard Usability | 4 | Clear, fast, and role-aware |
| AI Tooling | 4 | Provider routing, cost logs, and fallbacks work |
| Tool Execution Safety | 4 | Tools have risk levels, approval gates, and audit logs |
| Testing | 4 | Core dashboard/API workflows tested |
| Connor Readiness | 3 | Can run, test, and deploy with a guide |

Production decision: block deploy if any category is below target, any secrets exposed, any destructive tool without approval, or build/Playwright/health endpoints fail.

Action: Port this rubric as the SENTINEL scoring matrix for PaaS client readiness gating.

---

## 5. KV Namespace Strategy (Multi-Namespace Pattern)

Sam uses 5 separate KV namespaces instead of one general KV:
```
LL_SESSIONS     — user session state
LL_RATE_LIMITS  — per-user/per-route rate limit counters
LL_CACHE        — response caching
LL_OAUTH_STATE  — temporary OAuth state tokens (short TTL)
LL_FLAGS        — feature flags
```
ll-cockpit currently uses one general KV. For PaaS: separate into at least SESSIONS + RATE_LIMITS + OAUTH_STATE.

---

## 6. Durable Objects Plan

Sam planned DOs for realtime sessions:
```
DashboardSession    — live CMS editing state
AgentSession        — agent run + stream state
CMSCollaborationSession — multi-user document editing
```
For ll-cockpit: `AgentSession` DO for terminal PTY state + long-running agent builds. Already planned in `nexus_wrangler_master.toml` Section B.

---

## 7. Workspace Registration Pattern (PaaS Core)

From `docs/AGENTSAM_WORKSPACE_REGISTRATION.md` and Sam's D1 schema:

Every tenant gets a workspace registration record:
```sql
agentsam_workspace (id, workspace_slug, name, r2_bucket, r2_prefix, github_repo, default_model_id)
agentsam_scripts (id, workspace_id, name, path, purpose, runner, safe_to_run, owner_only)
```

Scripts per workspace are tagged `safe_to_run=1` (read/build/test) or `safe_to_run=0` (deploy/mutate). This is the exact pattern for NEXUS tenant tool registry.

Action: When Sprint 10 (PaaS) runs, create `nexus_workspaces` and `nexus_workspace_scripts` tables following this pattern.

---

## 8. End-to-End Integration Playbook (10 Phases)

Sam's `docs/END_TO_END_INTEGRATION_PLAYBOOK.md` defines the exact onboarding sequence for every new tenant:

```
Phase 1:  Clean Foundation    — npm install, audit, build, test, deploy
Phase 2:  Cloudflare Resources — Worker, R2, D1, KV, DOs, Workers AI
Phase 3:  Supabase            — apply SQL, verify tables
Phase 4:  AI Providers        — add secrets, verify /api/ai/providers
Phase 5:  Email (Resend)      — add key, build contact/lead/admin routes
Phase 6:  Google              — OAuth, Drive import, Gmail draft
Phase 7:  GitHub              — OAuth or App, repo list, file read, PR
Phase 8:  Tool Registry       — tools table, risk levels, approval gates, logs
Phase 9:  Monitoring          — page views, agent runs, costs, errors, deploys
Phase 10: Handoff             — Connor demonstrates: run, build, test, deploy, inspect, diagnose
```

This 10-phase playbook IS the NEXUS PaaS onboarding flow. Every new client goes through all 10 phases.

---

## 9. Thompson Sampling AI Routing (Production Pattern)

From `docs/PROVIDER_ROUTING_PLAN.md`:

Routing strategy: deterministic guardrails → then Thompson Sampling inside safe model pool → then log all outcomes.

Thompson Sampling mechanics:
- Each model/task_type combination is a `routing_arm` with `alpha` (successes + 1) and `beta` (failures + 1)
- On each request: sample a Beta(alpha, beta) value for each eligible arm
- Select arm with highest sampled value
- After completion: increment alpha (success) or beta (failure)
- Arms naturally self-optimize — better models get more traffic over time

This is superior to our current deterministic routing. Implement in Sprint 10 alongside `ll_routing_arms` Supabase table.

---

## 10. Integration Surface (Full PaaS List)

From `docs/CONNECTORS_SETUP_GUIDE.md` — every connector a NEXUS PaaS tenant needs:

| Integration | Purpose | Secret |
|---|---|---|
| Anthropic | Primary LLM (default + senior lanes) | ANTHROPIC_API_KEY |
| OpenAI | Image generation, eval comparison | OPENAI_API_KEY |
| Gemini | Long-context, multimodal, fallback | GEMINI_API_KEY |
| Workers AI | Embeddings, utility inference (free) | Binding: AI |
| Resend | Email notifications, lead confirmations | RESEND_API_KEY |
| Gmail (OAuth) | Read threads, draft replies, send followups | GOOGLE_CLIENT_ID/SECRET |
| Google Drive (OAuth) | RAG ingestion, file sync, asset imports | Same OAuth |
| GitHub (OAuth or App) | Repo browser, file read, commit, PR | GITHUB_CLIENT_ID/SECRET |
| Supabase | Analytics, RAG, evals, telemetry | SUPABASE_URL + SERVICE_KEY |
| Cloudflare D1 | CMS runtime, agent state, tool registry | Binding: DB |
| Cloudflare R2 | Assets, media, code snapshots, exports | Binding: R2 |
| Cloudflare KV | Sessions, rate limits, OAuth state, flags | Binding: KV |
| Cloudflare DO | Live sessions, terminal PTY state | Binding: AGENT_SESSION |
| Spline | 3D hero visuals, interactive scenes | Embed URL in CMS |
| OpenSCAD | CAD file generation, STL exports | Server-side only |
| Local Llama/Ollama | Cheap local draft/coding fallback | LOCAL_LLM_BASE_URL |

---

## 11. CAD + OpenSCAD Integration

Sam documented OpenSCAD as a server-side tool (not browser) for:
- Parametric CAD generation from text description
- Scripted part generation
- STL generation → R2 storage → download link
- CAD-to-video asset pipeline (feeds REEL)
- Technical product demos

R2 prefixes: `assets/models/`, `snapshots/cad/`, `exports/cad/`
Worker routes: `POST /api/cad/jobs`, `GET /api/cad/jobs/:id`, `GET /api/cad/jobs/:id/download`

Action: ATLAS agent's OpenSCAD integration follows this pattern. Engineering calcs → OpenSCAD script → STL → R2 → client download.

---

## 12. UI Patterns (Adapt to Cockpit)

### `useResizablePanels` hook
- `explorerWidth` default 250px (min 190, max 440)
- `agentWidth` default 340px (min 280, max 620)
- `terminalHeight` default 250px (min 150, max 540)
- `beginDrag(type, mouseEvent)` — adds mousemove/mouseup listeners, removes on mouseup
- All widths persist to localStorage under `ll-explorer-width`, `ll-agent-width`, `ll-terminal-height`

### Monaco Editor file tree
- `getLanguageFromKey(key)` — maps .tsx/.ts/.js/.jsx/.json/.css/.html/.md/.sql/.yml to Monaco language
- File tree backed by R2 list (folder.children array)
- `updateFile(content)` — called by agent panel to apply AI code edit
- Tabs: active file tracking, filename display, language badge, close button

### Terminal command presets strip
Clickable preset commands above xterm. Click → copies to clipboard + echoes in terminal:
`npm run dev`, `npm run build`, `wrangler deploy`, `git status`, `git add -A`, `git commit -m "..."`, `git push`

### Agent panel “apply to editor” pattern
Agent response includes code block → “Apply to editor” button → calls `updateFile(code)` → Monaco updates live.

### ExplorerPanel R2 section
- Refresh + Upload buttons
- Prefix filter buttons (Root, cms/, assets/, snapshots/)
- Shows up to 24 objects in sidebar list
- Click object → calls `/api/r2/text?key=` → loads in Monaco

---

## 13. Dashboard Pages to Add

| Sam's page | ll-cockpit route | Priority |
|---|---|---|
| AIProviders.jsx | `/ai-providers` | P1 |
| R2Storage.jsx | `/storage` | P1 |
| Analytics.jsx | `/analytics` | P2 |
| Leads.jsx | `/leads` | P2 |
| MediaLibrary.jsx | `/media` | P3 |
| CMSPages.jsx | `/cms` | P3 |

---

## 14. Safety Rules (Production Non-Negotiables)

From `docs/CONNECTORS_SETUP_GUIDE.md` Production Safety Rules — add to NEXUS working rules:

```
❌ Never commit secrets
❌ Never expose Supabase service-role keys to the browser
❌ Never store OAuth refresh tokens in localStorage
❌ Never let untrusted CAD/OpenSCAD execute without sandboxing
❌ Never route expensive models without cost logging
❌ Never let image generation run without user/project quotas
❌ Never deploy dashboard auth as only a client-side password in production
```

---

## Build Sequencing (Recommended Order)

1. Resizable panels — `useResizablePanels` TypeScript port
2. R2 API routes — `/api/r2/list`, `/api/r2/text`, `/api/r2/object/[...key]`, `/api/agent/code`
3. Wire Monaco IDE — file tree from R2, tabs, language detection, agent edit apply
4. D1 migrations 0004-0008
5. AI Providers page — reads from D1 + `/api/ai/providers`
6. R2 Storage page — full browser
7. Analytics page — from D1 + Supabase
8. Supabase telemetry tables — ll_routing_arms, ll_routing_decisions, ll_stream_events
9. Thompson Sampling routing — wire to cms_ai_routing_policy
10. OAuth flows — GitHub + Google Drive
11. Workspace registration pattern — Sprint 10 PaaS
12. Rubric readiness gate — block PaaS client deploy until all 7 categories score ≥ 4
