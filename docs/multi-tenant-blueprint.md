# Multi-Tenant Blueprint

> Reference document for cloning the NEXUS knowledge pipeline into the PaaS architecture.
> Single-tenant reference implementation lives in `ll-cockpit`. This doc describes what changes at each layer when adding tenant isolation.

---

## What Stays the Same

- D1 table schemas (tenant_id column already added in migration 0003)
- Vectorize index structure (metadata filtering handles tenant scoping)
- Queue consumer Worker pattern
- MCP Worker tool definitions
- OAuth flow structure

---

## What Changes Per Layer

### Layer 1 — D1 (Structured Data)

**Single-tenant (current):**
```sql
SELECT * FROM study_nodes WHERE category = 'cloudflare'
```

**Multi-tenant:**
```sql
SELECT * FROM study_nodes WHERE tenant_id = :tenant_id AND category = 'cloudflare'
```

**PaaS decision point:** Shared D1 database with tenant_id row isolation vs. one D1 per tenant.
- Shared DB: cheaper, simpler ops, but tenants share the 10GB D1 limit
- Per-tenant DB: full isolation, higher cost, requires dynamic binding lookup
- **Recommendation:** Start with shared DB + tenant_id rows. Migrate to per-tenant D1 when any single tenant approaches 1GB.

---

### Layer 2 — Vectorize (Embeddings)

**Single-tenant (current):**
```typescript
await env.KNOWLEDGE_VECTORIZE.query(vector, { topK: 5, returnMetadata: 'all' });
```

**Multi-tenant:**
```typescript
await env.KNOWLEDGE_VECTORIZE.query(vector, {
  topK: 5,
  returnMetadata: 'all',
  filter: { tenant_id: tenantId }  // metadata filter
});
```

All vectors must be upserted with `metadata.tenant_id` set. The consumer Worker
(`knowledge-embed-consumer`) needs to pass tenant_id through the Queue message
and write it to Vectorize metadata.

**PaaS decision point:** Shared Vectorize index with metadata filtering vs. one index per tenant.
- Cloudflare Vectorize supports metadata filtering — shared index is viable.
- Per-tenant index requires dynamic binding, currently not supported natively.
- **Recommendation:** Shared index with mandatory tenant_id metadata filter.

---

### Layer 3 — Queue Messages

**Single-tenant (current):**
```typescript
await KNOWLEDGE_QUEUE.send({ id, table, content, metadata });
```

**Multi-tenant:**
```typescript
await KNOWLEDGE_QUEUE.send({ id, table, content, tenant_id, metadata });
```

The consumer Worker reads `tenant_id` from the message and passes it to:
1. The Vectorize upsert metadata
2. Any D1 write operations for cross-referencing

---

### Layer 4 — MCP OAuth

**Single-tenant (current):**
- One `OAUTH_KV` namespace
- One `COOKIE_ENCRYPTION_KEY` secret
- One `knowledge-mcp` Worker
- OAuth flow auto-approves (no real user login)

**Multi-tenant:**
- One `OAUTH_KV` namespace per tenant OR shared namespace with tenant-keyed entries
- OAuth flow shows real login (Cloudflare Access or third-party provider)
- MCP Worker receives authenticated user context from `OAuthProvider`
- All tool calls scoped to `props.tenantId` derived from the OAuth token claims

```typescript
// Multi-tenant McpAgent pattern
export class KnowledgeMCP extends McpAgent<Env, State, Props> {
  async init() {
    const { tenantId } = this.props; // from OAuth token
    this.server.registerTool('search_knowledge', ..., async ({ query }) => {
      // All queries scoped to tenantId
      const results = await this.env.KNOWLEDGE_VECTORIZE.query(vector, {
        filter: { tenant_id: tenantId }
      });
    });
  }
}
```

---

### Layer 5 — API Route (/api/knowledge)

**Single-tenant (current):**
```typescript
// tenant_id defaults to 'default' via D1 column default
await DB.prepare('INSERT INTO study_nodes ...').bind(...);
```

**Multi-tenant:**
```typescript
// tenant_id extracted from authenticated session
const tenantId = session.tenant_id;
await DB.prepare('INSERT INTO study_nodes ... (tenant_id) VALUES (...)').bind(tenantId, ...);
```

The Supabase auth session or Cloudflare Access JWT carries the tenant_id claim.

---

## PaaS Tenant Provisioning Sequence

When a new tenant signs up:

1. Create tenant record in `tenants` table (tenant_id, name, plan, created_at)
2. Seed `study_nodes` with tenant's onboarding knowledge (platform docs, their stack)
3. Seed `sprint_items` with their initial sprint structure
4. Register tenant's OAuth client in `OAUTH_KV`
5. Issue tenant their MCP connector URL (same Worker, scoped by OAuth token)

One Worker serves all tenants. Isolation is at the data layer, not the compute layer.

---

## Cost Model at Scale

| Resource | Single Tenant | 100 Tenants | Notes |
|---|---|---|---|
| D1 | 1 shared DB | 1 shared DB | Row-level isolation, 10GB limit |
| Vectorize | 1 shared index | 1 shared index | Metadata filter per query |
| Queue | 1 queue | 1 queue | tenant_id in message payload |
| MCP Worker | 1 deployment | 1 deployment | OAuth scopes per tenant |
| KV (OAuth) | 1 namespace | 1 namespace | Tenant-keyed entries |

This is the cost advantage of the Cloudflare-first architecture — 100 tenants
run on the same infrastructure as 1 tenant, with zero additional deployment overhead.

---

## Migration Path: Single → Multi-Tenant

1. `tenant_id` column already added (migration 0003) — no schema change needed
2. Update `/api/knowledge` to read `tenant_id` from session instead of hardcoding
3. Update `knowledge-embed-consumer` to pass `tenant_id` through Queue → Vectorize
4. Update MCP Worker to filter all queries by `props.tenantId` from OAuth
5. Add `tenants` provisioning table and signup flow
6. Update `OAUTH_KV` registration to support dynamic client registration per tenant

Estimated effort: 2–3 focused sprints on top of the reference implementation.
