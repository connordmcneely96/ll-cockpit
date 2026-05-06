#!/usr/bin/env node
// NEXUS Knowledge Base Seeder
// Parses May 2-3 2026 session history into structured study_nodes and sprint_items
// Run: node scripts/seed-knowledge.js
// Requires: ll-cockpit deployed and accessible

const BASE_URL = 'https://ll-cockpit.connorpattern.workers.dev';

async function post(type, data) {
  const res = await fetch(`${BASE_URL}/api/knowledge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, data }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Failed: ${JSON.stringify(json)}`);
  return json;
}

async function seed(label, type, data) {
  try {
    const result = await post(type, data);
    console.log(`✅ ${label} → ${result.id}`);
  } catch (err) {
    console.error(`❌ ${label} → ${err.message}`);
  }
}

async function main() {
  console.log('\n🧠 NEXUS Knowledge Base Seeder — May 2-3 2026 Sessions\n');

  // ─────────────────────────────────────────────
  // STUDY NODES — Failure Patterns
  // ─────────────────────────────────────────────

  await seed('Failure: OpenNext intercepts wrangler deploy', 'study_node', {
    title: 'OpenNext Intercepts wrangler deploy --config',
    category: 'failure_pattern',
    content: 'Symptom: Running wrangler deploy --config workers/[name]/wrangler.toml from the project root is intercepted by OpenNext, which substitutes its own build pipeline and ignores the --config flag. Root cause: When wrangler detects a Next.js + OpenNext project structure at the current working directory, OpenNext hooks into the deploy command. Fix: Always cd into the Worker subdirectory first (e.g. cd workers/knowledge-embed), then run wrangler deploy with no --config flag. Wrangler finds the local wrangler.toml directly and OpenNext has no project structure to detect.',
    tags: 'wrangler,opennext,deploy,workers,cloudflare',
    source: 'session_log_may2',
  });

  await seed('Failure: Git merge conflict in wrangler.toml', 'study_node', {
    title: 'Git Merge Conflicts in wrangler.toml Break TOML Parsing',
    category: 'failure_pattern',
    content: 'Symptom: git pull produces CONFLICT (content): Merge conflict in wrangler.toml. Wrangler then fails with ParseError: Invalid TOML document — conflict markers (<<<<<<< HEAD, =======, >>>>>>>) are treated as invalid TOML keys. Root cause: When multiple branches add bindings to wrangler.toml, git cannot auto-merge and inserts conflict markers. Fix: Use PowerShell Set-Content with a here-string (@\' ... \'@) to overwrite wrangler.toml entirely with the correct merged content, bypassing git merge. Then git add + commit + push. Never trust git pull to resolve wrangler.toml conflicts automatically.',
    tags: 'git,wrangler,toml,merge-conflict,powershell',
    source: 'session_log_may2',
  });

  await seed('Failure: Claude Code hallucination on file creation', 'study_node', {
    title: 'Claude Code Hallucination — Reporting Files Created That Were Not',
    category: 'failure_pattern',
    content: 'Symptom: Claude Code reports files as created, shows dry-run output as proof, and commits them — but the files are never written to disk. Running dir [path] shows the directory does not exist. Root cause: Claude Code fabricated the file creation and dry-run output. The identical bundle size between deploys is the diagnostic signal — if the size matches exactly, the new code likely did not land. Fix: Always verify with dir [path] or cat [file] before trusting any Claude Code report. Use PowerShell Set-Content with a here-string to write critical files directly to disk, bypassing Claude Code entirely. Never push based on report alone.',
    tags: 'claude-code,hallucination,file-creation,verification,debugging',
    source: 'session_log_may2',
  });

  await seed('Failure: workers-mcp vs McpAgent OAuth incompatibility', 'study_node', {
    title: 'workers-mcp Incompatible with Claude.ai Custom Connectors',
    category: 'failure_pattern',
    content: 'Symptom: Claude.ai connector returns Unauthorized despite correct SHARED_SECRET. Root cause: The workers-mcp package (ProxyToSelf pattern) uses a shared-secret model built for Claude Desktop and MCP CLI — not Claude.ai web custom connectors. Claude.ai requires full OAuth2 authorization code flow with PKCE. These are architecturally incompatible. Fix: Use Cloudflare agents SDK McpAgent class wrapped with OAuthProvider from @cloudflare/workers-oauth-provider for any MCP server intended to connect to Claude.ai. workers-mcp is only appropriate for Claude Desktop or CLI tooling.',
    tags: 'mcp,oauth,workers-mcp,claude-ai,connector,mcpagent',
    source: 'session_log_may3',
  });

  await seed('Failure: McpAgent mount path wrong', 'study_node', {
    title: 'McpAgent Must Be Mounted at /mcp Not /',
    category: 'failure_pattern',
    content: 'Symptom: GET /.well-known/oauth-protected-resource returns Canceled with waitUntil() timeout. OAuth discovery requests time out. Root cause: McpAgent.mount(\'/\') routes all traffic including OAuth discovery endpoints through the Durable Object, which takes too long for simple static responses. The official Cloudflare template mounts at /mcp. Fix: Mount McpAgent at /mcp using MyMCP.serve(\'/mcp\'). Handle OAuth discovery endpoints (/.well-known/oauth-protected-resource, /.well-known/oauth-authorization-server) separately in the default fetch handler before routing to McpAgent. Update the Claude.ai connector URL to include /mcp suffix.',
    tags: 'mcpagent,mount,oauth-discovery,cloudflare,workers',
    source: 'session_log_may3',
  });

  await seed('Failure: OAuthProvider rejects unregistered client_id', 'study_node', {
    title: 'OAuthProvider Rejects Unregistered client_id Before Auth Handler Runs',
    category: 'failure_pattern',
    content: 'Symptom: Internal Server Error at /authorize. Tail log shows: Error: Invalid client. The clientId provided does not match to this client. Root cause: OAuthProvider validates the client_id against OAUTH_KV before the auth handler is called. Claude.ai sends a cached client_id (from GitHub OAuth App setup) that was never registered in OAUTH_KV. Deleting and re-adding the connector does not clear Claude.ai cached credentials per server URL. Fix: In the /authorize handler, check OAUTH_KV for the client_id at the start of the handler before calling parseAuthRequest. If not found, auto-register the client as a public PKCE client (tokenEndpointAuthMethod: none). This is also the correct PaaS pattern — any connecting client is registered on first contact.',
    tags: 'oauth,oauth-kv,client-id,authorize,paas,registration',
    source: 'session_log_may3',
  });

  await seed('Failure: Durable Objects free plan migration tag', 'study_node', {
    title: 'Durable Objects Free Plan Requires new_sqlite_classes Not new_classes',
    category: 'failure_pattern',
    content: 'Symptom: wrangler deploy fails with code 10097: In order to use Durable Objects with a free plan, you must create a namespace using a new_sqlite_classes migration. Root cause: The wrangler.toml migrations block used new_classes which is for paid plans. Free plan requires new_sqlite_classes. Fix: Update the [[migrations]] block in wrangler.toml to use new_sqlite_classes = ["ClassName"] instead of new_classes = ["ClassName"].',
    tags: 'durable-objects,wrangler,cloudflare,free-plan,migration',
    source: 'session_log_may3',
  });

  await seed('Failure: GitHub push protection blocked committed secret', 'study_node', {
    title: 'GitHub Push Protection Blocks Push When Secret in Commit History',
    category: 'failure_pattern',
    content: 'Symptom: git push rejected with GH013: Repository rule violations found. GitHub identifies a Personal Access Token in a past commit even if the current file is clean. Root cause: GitHub Push Protection scans all commit history on push, not just current file state. Even if the token was rewritten in a later commit, the original commit SHA still contains it. Fix: Step 1 — Revoke the token immediately at github.com/settings/tokens. Step 2 — Navigate to the GitHub secret scanning unblock URL from the push error output. Step 3 — Confirm revocation on that page to unblock the push. Prevention: Add sensitive config files (.mcp.json, .env.local, .dev.vars) to .gitignore immediately after creation.',
    tags: 'github,security,push-protection,secret-scanning,pat,gitignore',
    source: 'session_log_may2',
  });

  // ─────────────────────────────────────────────
  // STUDY NODES — Architecture Decisions
  // ─────────────────────────────────────────────

  await seed('Architecture: MCP OAuth auto-approve pattern', 'study_node', {
    title: 'MCP OAuth Auto-Approve Pattern — Single Tenant Reference',
    category: 'architecture',
    content: 'The knowledge-mcp Worker uses OAuthProvider from @cloudflare/workers-oauth-provider wrapping McpAgent.serve(\'/mcp\'). The /authorize handler auto-registers any connecting client_id in OAUTH_KV on first contact, then immediately completes authorization as nexus-admin with tenantId: default — no login screen shown. This is the single-tenant reference implementation. Multi-tenant migration: replace auto-approve with a real identity check before completeAuthorization, derive tenantId from the authenticated user session, and validate client identity before auto-registering.',
    tags: 'mcp,oauth,oauth-provider,mcpagent,single-tenant,paas',
    source: 'session_log_may3',
  });

  await seed('Architecture: Tenant ID isolation design', 'study_node', {
    title: 'Tenant ID Isolation — PaaS Multi-Tenant Blueprint',
    category: 'architecture',
    content: 'Migration 0003 added tenant_id TEXT NOT NULL DEFAULT default to study_nodes and sprint_items tables. All queries in the MCP tools scope by tenant_id. Single-tenant: all rows use tenant_id = default. Multi-tenant PaaS pattern: D1 shared database with row-level tenant_id isolation (upgrade to per-tenant D1 when any tenant approaches 1GB). Vectorize shared index with metadata filter: { tenant_id: tenantId } on every query. Queue messages include tenant_id in payload. One Worker serves all tenants — isolation is at the data layer not compute layer. Estimated 100 tenants run on same infrastructure as 1 tenant.',
    tags: 'multi-tenant,paas,tenant-id,d1,vectorize,isolation,scale',
    source: 'session_log_may3',
  });

  await seed('Architecture: Knowledge pipeline end-to-end', 'study_node', {
    title: 'NEXUS Knowledge Pipeline — Full End-to-End Architecture',
    category: 'architecture',
    content: 'Four-layer pipeline: Layer 1 — POST /api/knowledge writes to D1 (study_nodes or sprint_items table) and publishes to knowledge-embed-queue. Layer 2 — knowledge-embed-consumer Worker dequeues messages, calls Workers AI (@cf/baai/bge-base-en-v1.5) to generate 768-dimension embeddings, upserts vectors to nexus-knowledge Vectorize index with metadata (table, record_id, type, title). Layer 3 — knowledge-mcp Worker exposes search_knowledge and get_sprint_status tools via McpAgent + OAuthProvider, callable from Claude.ai and NEXUS agents. Layer 4 (planned) — Supabase mirror via Edge Function for ChatGPT Custom GPT Action. Google Drive Cron sync for human-readable living docs.',
    tags: 'knowledge-pipeline,d1,queue,vectorize,workers-ai,mcp,architecture',
    source: 'session_log_may2',
  });

  await seed('Architecture: Cloudflare binding inventory', 'study_node', {
    title: 'll-cockpit Cloudflare Binding Inventory',
    category: 'codebase',
    content: 'Root wrangler.toml bindings for ll-cockpit Worker: DB (D1 Database ll-cockpit-db, ID 831eeccf-60bc-4378-8a3b-71dfb910756e), KV (KV Namespace ID db6866496e1f426e9d84758c9329ccfe), R2 (Bucket ll-cockpit-r2), KNOWLEDGE_QUEUE (Queue producer for knowledge-embed-queue), AI (Workers AI binding), KNOWLEDGE_VECTORIZE (Vectorize index nexus-knowledge). Separate Workers: knowledge-embed-consumer (binds DB + AI + KNOWLEDGE_VECTORIZE, consumes knowledge-embed-queue), knowledge-mcp (binds DB + AI + KNOWLEDGE_VECTORIZE + OAUTH_KV + MCP_OBJECT Durable Object).',
    tags: 'bindings,wrangler,d1,kv,r2,queue,vectorize,ai,cloudflare',
    source: 'session_log_may2',
  });

  await seed('Architecture: Standalone Worker deploy pattern', 'study_node', {
    title: 'Standalone Worker Deploy Pattern — Avoid OpenNext Intercept',
    category: 'process',
    content: 'Any Worker in the workers/ subdirectory must be deployed independently from the main ll-cockpit app. The correct pattern: cd into the Worker directory first (cd workers/knowledge-embed or cd workers/knowledge-mcp), then run wrangler deploy with no flags. This prevents OpenNext from intercepting the deploy command. Do NOT run wrangler deploy --config workers/[name]/wrangler.toml from the project root — OpenNext ignores the --config flag and deploys the full Next.js app instead. Workers in subdirectories have their own package.json, wrangler.toml, and node_modules — run npm install inside the directory after git pull if new packages were added.',
    tags: 'workers,deploy,opennext,cloudflare,standalone,pattern',
    source: 'session_log_may2',
  });

  await seed('Architecture: Pre-recommendation checklist', 'study_node', {
    title: 'Pre-Recommendation Checklist — Senior Engineer Non-Negotiable',
    category: 'process',
    content: 'Before any code recommendation, prompt, or architectural decision involving an existing file or external technology: Step 1 — Check GitHub first using Github Read Project Contextualization MCP. Call get_file_contents on every relevant file. Never assume contents from Claude Code reports. Step 2 — Check official docs using web_search + web_fetch. Fetch the specific page relevant to the feature. Technologies always requiring doc check: Cloudflare Workers, Agents SDK, McpAgent, wrangler config, Durable Objects, Queues, Vectorize, any new npm package, any OAuth or MCP implementation. Step 3 — State findings before recommending. If either step skipped, name it explicitly as Verify Before Suggesting failure mode.',
    tags: 'process,checklist,senior-engineer,github-mcp,docs,verify',
    source: 'session_log_may3',
  });

  await seed('Architecture: NEXUS as PaaS blueprint', 'study_node', {
    title: 'NEXUS ll-cockpit as PaaS Reference Implementation',
    category: 'architecture',
    content: 'Everything built in ll-cockpit is the blueprint for a multi-tenant multi-agent orchestration code-build PaaS. Every pattern — MCP OAuth flow, agent wiring, embedding architecture, tenant_id isolation, knowledge pipeline — gets cloned per tenant when the PaaS launches. Design principle: build the single-tenant reference implementation first with PaaS-compatible patterns (tenant_id columns, shared indexes with metadata filtering, one Worker serving all tenants). Document what changes for multi-tenant in docs/multi-tenant-blueprint.md. Estimated migration effort from single to multi-tenant: 2-3 focused sprints on top of the reference implementation.',
    tags: 'paas,multi-tenant,blueprint,architecture,scale,isolation',
    source: 'session_log_may3',
  });

  await seed('Technology: OAuthProvider package usage', 'study_node', {
    title: '@cloudflare/workers-oauth-provider — Correct Usage Pattern',
    category: 'technology',
    content: 'The @cloudflare/workers-oauth-provider package wraps McpAgent to add proper OAuth2 for Claude.ai connectors. Correct export: export default new OAuthProvider({ apiRoute: /mcp, apiHandler: KnowledgeMCP.serve(\'/mcp\'), defaultHandler: app, authorizeEndpoint: /authorize, tokenEndpoint: /token, clientRegistrationEndpoint: /register }). The defaultHandler is a Hono app handling /authorize. Requires OAUTH_KV binding (KV namespace) and COOKIE_ENCRYPTION_KEY secret. The /authorize handler must: 1) auto-register unknown client_ids in OAUTH_KV, 2) call parseAuthRequest, 3) call completeAuthorization with userId and props (tenantId etc). The OAUTH_KV client record format: { clientId, redirectUris, grantTypes, responseTypes, tokenEndpointAuthMethod: none, registrationDate }.',
    tags: 'oauth-provider,cloudflare,mcpagent,hono,oauth2,kv,authorize',
    source: 'session_log_may3',
  });

  await seed('Technology: McpAgent registerTool pattern', 'study_node', {
    title: 'McpAgent registerTool vs tool — Correct API',
    category: 'technology',
    content: 'The official Cloudflare agents SDK McpAgent uses this.server.registerTool() not this.server.tool(). registerTool signature: this.server.registerTool(name, { description, inputSchema: { field: z.type() } }, async (args) => { return { content: [{ type: \'text\', text: result }] }; }). Tools must return content array with type: text as const. Props from OAuth token are available via this.props inside tool handlers. Environment bindings accessed via this.env. The McpServer is initialized as server = new McpServer({ name, version }) — this is a class property, not in the constructor.',
    tags: 'mcpagent,registertool,cloudflare,agents-sdk,mcp,tools',
    source: 'session_log_may3',
  });

  await seed('Technology: Workers AI embedding model', 'study_node', {
    title: 'Workers AI Embedding Model — @cf/baai/bge-base-en-v1.5',
    category: 'technology',
    content: 'The embedding model used across the NEXUS knowledge pipeline is @cf/baai/bge-base-en-v1.5. Called via: const result = await env.AI.run(\'@cf/baai/bge-base-en-v1.5\', { text: content }) as { data: number[][] }. Returns 768-dimension vectors. The Vectorize index nexus-knowledge was created with --dimensions=768 --metric=cosine. Always check result.data[0] exists before using. On failure, retry the Queue message rather than failing silently. Upsert to Vectorize using: await env.KNOWLEDGE_VECTORIZE.upsert([{ id: table::recordId, values: result.data[0], metadata: { table, record_id, type, title } }]).',
    tags: 'workers-ai,embedding,bge,vectorize,768,cosine,cloudflare',
    source: 'session_log_may2',
  });

  await seed('Technology: D1 migration conventions', 'study_node', {
    title: 'D1 Migration Conventions — Append-Only Pattern',
    category: 'technology',
    content: 'All D1 migrations are append-only. Never DROP tables or columns in production. Migration files live in migrations/ directory numbered sequentially: 0001_cockpit_schema.sql, 0002_knowledge_tables.sql, 0003_knowledge_tenant_id.sql. Apply locally: wrangler d1 migrations apply ll-cockpit-db --local. Apply to production: wrangler d1 migrations apply ll-cockpit-db --remote. Migration 0002 created study_nodes and sprint_items tables. Migration 0003 added tenant_id TEXT NOT NULL DEFAULT default to both tables with composite indexes. All inserts use ON CONFLICT(id) DO UPDATE SET for idempotent upserts.',
    tags: 'd1,migrations,cloudflare,append-only,schema,wrangler',
    source: 'session_log_may2',
  });

  // ─────────────────────────────────────────────
  // SPRINT ITEMS — Completed Build Work
  // ─────────────────────────────────────────────

  const sprintItems = [
    {
      id: 'sprint-1-vectorize',
      sprint_number: 1,
      title: 'Create nexus-knowledge Vectorize index',
      description: 'wrangler vectorize create nexus-knowledge --dimensions=768 --metric=cosine. 768-dim cosine similarity index for NEXUS knowledge pipeline.',
      status: 'done',
      priority: 1,
      agent: 'BUILDER',
      category: 'infrastructure',
    },
    {
      id: 'sprint-1-queue',
      sprint_number: 1,
      title: 'Create knowledge-embed-queue Queue',
      description: 'wrangler queues create knowledge-embed-queue. Cloudflare Queue for async embedding pipeline.',
      status: 'done',
      priority: 1,
      agent: 'BUILDER',
      category: 'infrastructure',
    },
    {
      id: 'sprint-1-d1-migration',
      sprint_number: 1,
      title: 'D1 migration 0002 — study_nodes and sprint_items tables',
      description: 'Created study_nodes (id, title, category, content, tags, source) and sprint_items (id, sprint_number, title, description, status, priority, agent, category) with indexes. Append-only migration.',
      status: 'done',
      priority: 1,
      agent: 'BUILDER',
      category: 'database',
    },
    {
      id: 'sprint-1-consumer-worker',
      sprint_number: 1,
      title: 'knowledge-embed-consumer Worker deployed',
      description: 'Standalone Queue consumer Worker at workers/knowledge-embed/. Binds DB + AI + KNOWLEDGE_VECTORIZE. Dequeues messages, generates embeddings via Workers AI, upserts to Vectorize. Version d43e04af.',
      status: 'done',
      priority: 1,
      agent: 'BUILDER',
      category: 'workers',
    },
    {
      id: 'sprint-1-api-route',
      sprint_number: 1,
      title: '/api/knowledge POST endpoint',
      description: 'Next.js API route writing to D1 + publishing to KNOWLEDGE_QUEUE. Accepts { type: study_node|sprint_item, data }. Uses ON CONFLICT upsert. Queues embed message. Debt: curl test skipped — needs full build artifacts.',
      status: 'done',
      priority: 1,
      agent: 'BUILDER',
      category: 'api',
    },
    {
      id: 'sprint-1-wrangler-bindings',
      sprint_number: 1,
      title: 'Root wrangler.toml updated with 3 new bindings',
      description: 'Appended KNOWLEDGE_QUEUE (Queue producer), AI (Workers AI), KNOWLEDGE_VECTORIZE (Vectorize index nexus-knowledge) to ll-cockpit root wrangler.toml. Required multiple merge conflict resolutions.',
      status: 'done',
      priority: 1,
      agent: 'BUILDER',
      category: 'infrastructure',
    },
    {
      id: 'sprint-1-tenant-id',
      sprint_number: 1,
      title: 'D1 migration 0003 — tenant_id added to knowledge tables',
      description: 'Added tenant_id TEXT NOT NULL DEFAULT default to study_nodes and sprint_items. Created composite indexes for tenant-scoped queries. PaaS multi-tenant blueprint documented in docs/multi-tenant-blueprint.md.',
      status: 'done',
      priority: 1,
      agent: 'BUILDER',
      category: 'database',
    },
    {
      id: 'sprint-2-mcp-worker',
      sprint_number: 2,
      title: 'knowledge-mcp Worker with OAuthProvider — deployed',
      description: 'McpAgent wrapped with @cloudflare/workers-oauth-provider. Tools: search_knowledge (Vectorize semantic search) and get_sprint_status (D1 query). Auto-registers OAuth clients in OAUTH_KV. Auto-approves as nexus-admin. Version 292d46c1.',
      status: 'done',
      priority: 1,
      agent: 'BUILDER',
      category: 'workers',
    },
    {
      id: 'sprint-2-oauth-kv',
      sprint_number: 2,
      title: 'OAUTH_KV namespace created and wired',
      description: 'wrangler kv namespace create OAUTH_KV. ID: 1ac0b09075f04bcd9b83d0976e12b2b2. Bound to knowledge-mcp Worker. Stores OAuth client registrations.',
      status: 'done',
      priority: 1,
      agent: 'BUILDER',
      category: 'infrastructure',
    },
    {
      id: 'sprint-2-cookie-key',
      sprint_number: 2,
      title: 'COOKIE_ENCRYPTION_KEY secret set on knowledge-mcp',
      description: 'Generated 32-char alphanumeric key. Uploaded via wrangler secret put COOKIE_ENCRYPTION_KEY --name knowledge-mcp.',
      status: 'done',
      priority: 1,
      agent: 'BUILDER',
      category: 'security',
    },
    {
      id: 'sprint-2-claude-connector',
      sprint_number: 2,
      title: 'NEXUS Knowledge MCP connector connected to Claude.ai',
      description: 'Custom connector added at claude.ai Settings > Connectors. URL: https://knowledge-mcp.connorpattern.workers.dev/mcp. Both tools visible: search_knowledge and get_sprint_status. OAuth auto-approve working. Took 9 iterations to connect.',
      status: 'done',
      priority: 1,
      agent: 'NEXUS',
      category: 'mcp',
    },
    {
      id: 'sprint-2-github-mcp',
      sprint_number: 2,
      title: 'GitHub Read Project Contextualization MCP connected',
      description: 'GitHub OAuth App created at github.com/settings/developers. Callback URL: https://claude.ai/api/mcp/auth_callback. Connected via claude.ai Settings > Connectors. Gives Senior Engineer autonomous file read/write access to ll-cockpit repo.',
      status: 'done',
      priority: 1,
      agent: 'NEXUS',
      category: 'mcp',
    },
    {
      id: 'sprint-2-working-rules',
      sprint_number: 2,
      title: 'Pre-recommendation checklist added to nexus_working_rules.md',
      description: 'Mandatory 3-step rule: 1) Check GitHub via MCP, 2) Fetch official docs, 3) State findings. Added 6 lessons learned from May 2-3 sessions. Failure mode named: Verify Before Suggesting.',
      status: 'done',
      priority: 2,
      agent: 'NEXUS',
      category: 'process',
    },
    {
      id: 'sprint-2-multi-tenant-doc',
      sprint_number: 2,
      title: 'Multi-tenant blueprint documented',
      description: 'docs/multi-tenant-blueprint.md committed. Documents what changes at each layer (D1, Vectorize, Queue, MCP OAuth, API route) when moving from single-tenant to multi-tenant PaaS. Estimated 2-3 sprint migration effort.',
      status: 'done',
      priority: 2,
      agent: 'NEXUS',
      category: 'architecture',
    },
    {
      id: 'sprint-2-seed-knowledge',
      sprint_number: 2,
      title: 'Seed knowledge base from May 2-3 session history',
      description: 'Parsed both session log Word documents into structured study_nodes and sprint_items. POSTed to /api/knowledge. Embedded into nexus-knowledge Vectorize via Queue consumer.',
      status: 'done',
      priority: 1,
      agent: 'NEXUS',
      category: 'knowledge',
    },
    {
      id: 'sprint-3-supabase-mirror',
      sprint_number: 3,
      title: 'Step 3: Supabase mirror + pgvector + Edge Functions',
      description: 'Mirror study_nodes and sprint_items to Supabase Postgres with pgvector. Edge Function auto-embeds on insert using Cloudflare Workers AI. REST search endpoint for ChatGPT Custom GPT Action.',
      status: 'todo',
      priority: 1,
      agent: 'BUILDER',
      category: 'supabase',
    },
    {
      id: 'sprint-3-gdrive-sync',
      sprint_number: 3,
      title: 'Step 4: Google Drive Cron sync Worker',
      description: 'Cloudflare Cron Worker that runs nightly, queries D1 for current state of study_nodes and sprint_items, generates markdown, writes to Google Drive via Drive API. Keeps human-readable living docs in sync.',
      status: 'todo',
      priority: 2,
      agent: 'BUILDER',
      category: 'sync',
    },
    {
      id: 'sprint-2-debt-curl-test',
      sprint_number: 2,
      title: '[DEBT] /api/knowledge POST endpoint end-to-end curl test',
      description: 'Curl test was skipped during commit 2 verification. Requires full wrangler build artifacts (.open-next/). Verify after next wrangler build: POST {type:study_node,data:{...}} should return {id, table:study_nodes, queued:true}.',
      status: 'todo',
      priority: 3,
      agent: 'BUILDER',
      category: 'debt',
    },
  ];

  for (const item of sprintItems) {
    await seed(`Sprint ${item.sprint_number}: ${item.title.substring(0, 50)}`, 'sprint_item', item);
  }

  console.log('\n✅ Seeding complete. Embeddings are queuing in the background.');
  console.log('Wait ~30 seconds for the consumer Worker to process, then test:');
  console.log('search_knowledge({ query: "OAuth McpAgent" })');
  console.log('get_sprint_status({ status: "done" })');
}

main().catch(console.error);
