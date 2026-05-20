// knowledge-mcp v1.2.0 — 6 tools: search_knowledge, get_sprint_status, seed_knowledge, update_sprint_status, update_sprint_item, delete_sprint_item
import OAuthProvider from '@cloudflare/workers-oauth-provider';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { McpAgent } from 'agents/mcp';
import { z } from 'zod';
import app from './auth';

// Props passed from OAuth token into the McpAgent
// Single-tenant: userId is always 'nexus-admin'
// Multi-tenant: userId becomes the tenant's authenticated user ID
export type Props = {
  userId: string;
  tenantId: string;
};

export interface Env {
  DB: D1Database;
  AI: Ai;
  KNOWLEDGE_VECTORIZE: VectorizeIndex;
  MCP_OBJECT: DurableObjectNamespace;
  OAUTH_KV: KVNamespace;
  COOKIE_ENCRYPTION_KEY: string;
}

// Status values accepted across the sprint tools.
// v1.2.0 (Issue #79): added 'superseded' and 'cancelled' so items can be
// archived without a false-completion signal. 'done' means shipped;
// 'superseded' means replaced by another item (e.g. a reorg target);
// 'cancelled' means abandoned/won't-do. The DB stores status as free TEXT,
// so these values were always storable — this just exposes them at the tool layer.
const SPRINT_STATUS = ['todo', 'in_progress', 'done', 'superseded', 'cancelled'] as const;

export class KnowledgeMCP extends McpAgent<Env, Record<string, never>, Props> {
  server = new McpServer({
    name: 'nexus-knowledge-mcp',
    version: '1.2.0',
  });

  async init() {
    // Single-tenant: tenantId is always 'default'
    // Multi-tenant: swap this.props.tenantId in for all queries
    const tenantId = this.props?.tenantId ?? 'default';

    // ─────────────────────────────────────────────
    // TOOL: search_knowledge
    // ─────────────────────────────────────────────
    this.server.registerTool(
      'search_knowledge',
      {
        description:
          'Search the NEXUS knowledge base for study guide concepts, architecture decisions, tech stack details, and agent descriptions. Use this when you need context about the NEXUS project during a build session.',
        inputSchema: {
          query: z.string().describe('Natural language search query'),
          limit: z.number().optional().describe('Number of results to return (default 5, max 10)'),
        },
      },
      async ({ query, limit = 5 }) => {
        const cappedLimit = Math.min(limit ?? 5, 10);

        const embedding = (await this.env.AI.run('@cf/baai/bge-base-en-v1.5', {
          text: query,
        })) as { data: number[][] };

        if (!embedding?.data?.[0]) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Embedding failed', results: [] }) }],
          };
        }

        const results = await this.env.KNOWLEDGE_VECTORIZE.query(embedding.data[0], {
          topK: cappedLimit,
          returnMetadata: 'all',
        });

        const settled = await Promise.allSettled(
          results.matches.map(async (match): Promise<Record<string, unknown> | null> => {
            const sepIdx = match.id.indexOf('::');
            if (sepIdx === -1) return null;
            const table = match.id.slice(0, sepIdx);
            const id = match.id.slice(sepIdx + 2);
            if (!id || (table !== 'study_nodes' && table !== 'sprint_items')) return null;
            const tableName = table as 'study_nodes' | 'sprint_items';
            // v1.2.0 (Issue #79): soft-deleted sprint_items are filtered out of
            // search results. A row whose deleted_at is set returns null here and
            // is dropped below. Orphaned vectors in Vectorize are thus harmless —
            // the D1 enrichment is the gate. study_nodes has no deleted_at column,
            // so the filter only applies to sprint_items.
            const deletedFilter = tableName === 'sprint_items' ? ' AND deleted_at IS NULL' : '';
            const row = await this.env.DB.prepare(
              `SELECT * FROM ${tableName} WHERE id = ? AND tenant_id = ?${deletedFilter}`
            )
              .bind(id, tenantId)
              .first();
            return row ? { score: match.score, type: table, ...row } : null;
          })
        );
        const enriched = settled
          .filter(
            (r): r is PromiseFulfilledResult<Record<string, unknown>> =>
              r.status === 'fulfilled' && r.value !== null
          )
          .map((r) => r.value);

        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ results: enriched }) }],
        };
      }
    );

    // ─────────────────────────────────────────────
    // TOOL: get_sprint_status
    // ─────────────────────────────────────────────
    this.server.registerTool(
      'get_sprint_status',
      {
        description:
          'Get current sprint items and their completion status. Use this to check what has been built, what is in progress, and what is pending. By default excludes soft-deleted items; pass include_deleted=true to see them.',
        inputSchema: {
          sprint_number: z.number().optional().describe('Sprint number to filter by. Omit to get all sprints.'),
          status: z
            .enum(SPRINT_STATUS)
            .optional()
            .describe('Filter by status (todo, in_progress, done, superseded, cancelled). Omit for all.'),
          include_deleted: z
            .boolean()
            .optional()
            .describe('Include soft-deleted items in results. Defaults to false.'),
        },
      },
      async ({ sprint_number, status, include_deleted = false }) => {
        let query = 'SELECT * FROM sprint_items WHERE tenant_id = ?';
        const bindings: (string | number)[] = [tenantId];

        // v1.2.0 (Issue #79): exclude soft-deleted rows unless explicitly requested.
        if (!include_deleted) {
          query += ' AND deleted_at IS NULL';
        }
        if (sprint_number !== undefined) {
          query += ' AND sprint_number = ?';
          bindings.push(sprint_number);
        }
        if (status) {
          query += ' AND status = ?';
          bindings.push(status);
        }
        query += ' ORDER BY sprint_number ASC, priority ASC';

        const result = await this.env.DB.prepare(query)
          .bind(...bindings)
          .all();
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ items: result.results }) }],
        };
      }
    );

    // ─────────────────────────────────────────────
    // TOOL: seed_knowledge
    // ─────────────────────────────────────────────
    this.server.registerTool(
      'seed_knowledge',
      {
        description:
          'Add a new sprint item or study node to the NEXUS knowledge base. Use this to log sprint plans, architecture decisions, working rules, and reference nodes so they persist across sessions.',
        inputSchema: {
          title: z.string().describe('Short title for the item (used in sprint status views)'),
          description: z.string().describe('Full content — architecture details, build steps, verification criteria, decisions'),
          type: z.enum(['sprint_item', 'study_node']).optional().describe('Type of knowledge: sprint_item (actionable) or study_node (reference). Defaults to sprint_item.'),
          sprint_number: z.number().optional().describe('Sprint number. Use 0 for global reference nodes.'),
          status: z.string().optional().describe('Status: todo, in_progress, done, superseded, cancelled, reference. Defaults to todo.'),
          priority: z.number().optional().describe('Priority: 1 (high) to 3 (low). Defaults to 2.'),
          agent: z.string().optional().describe('Primary agent this item belongs to (e.g. nexus, forge, scout)'),
          category: z.string().optional().describe('Category tag (e.g. infrastructure, agent-worker, hermes-parity, reference)'),
          tags: z.string().optional().describe('Comma-separated tags for search'),
        },
      },
      async ({ title, description, type = 'sprint_item', sprint_number = 0, status = 'todo', priority = 2, agent, category, tags }) => {
        const id = crypto.randomUUID();
        const now = Math.floor(Date.now() / 1000);

        const effectiveCategory = type === 'study_node'
          ? `study_node${category ? ':' + category : ''}`
          : (category ?? null);

        await this.env.DB.prepare(
          `INSERT INTO sprint_items
            (id, sprint_number, title, description, status, priority, agent, category, tenant_id, embed_status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
        )
          .bind(id, sprint_number, title, description, status, priority, agent ?? null, effectiveCategory, tenantId, now, now)
          .run();

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ ok: true, id, type, title, status }),
          }],
        };
      }
    );

    // ─────────────────────────────────────────────
    // TOOL: update_sprint_status
    // ─────────────────────────────────────────────
    this.server.registerTool(
      'update_sprint_status',
      {
        description:
          'Update the status of a sprint item by ID. Use this to mark items as in_progress, done, superseded, or cancelled as work progresses.',
        inputSchema: {
          id: z.string().describe('The sprint item ID to update'),
          status: z.enum(SPRINT_STATUS).describe('New status (todo, in_progress, done, superseded, cancelled)'),
          notes: z.string().optional().describe('Optional completion notes to append to description'),
        },
      },
      async ({ id, status, notes }) => {
        const now = Math.floor(Date.now() / 1000);
        const completedAt = status === 'done' ? now : null;

        if (notes) {
          const existing = await this.env.DB.prepare(
            'SELECT description FROM sprint_items WHERE id = ? AND tenant_id = ?'
          ).bind(id, tenantId).first<{ description: string }>();

          const updatedDescription = existing
            ? `${existing.description}\n\n--- COMPLETION NOTES ---\n${notes}`
            : notes;

          await this.env.DB.prepare(
            'UPDATE sprint_items SET status = ?, completed_at = ?, updated_at = ?, description = ?, embed_status = ? WHERE id = ? AND tenant_id = ?'
          ).bind(status, completedAt, now, updatedDescription, 'pending', id, tenantId).run();
        } else {
          await this.env.DB.prepare(
            'UPDATE sprint_items SET status = ?, completed_at = ?, updated_at = ?, embed_status = ? WHERE id = ? AND tenant_id = ?'
          ).bind(status, completedAt, now, 'pending', id, tenantId).run();
        }

        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, id, status }) }],
        };
      }
    );

    // ─────────────────────────────────────────────
    // TOOL: update_sprint_item  (v1.2.0 — Issue #79)
    // ─────────────────────────────────────────────
    // Patches any subset of an item's editable fields. This is the tool that
    // makes sprint reorganization possible — e.g. moving the 26 misfiled
    // "Sprint 18Z-*" items into Sprints 20/21/22 by patching sprint_number +
    // title. Only the fields provided are changed; omitted fields are left as-is.
    //
    // Re-embedding: if title or description changes, embed_status is reset to
    // 'pending' (matching the existing seed_knowledge / update_sprint_status
    // convention) so the row is re-vectorized. Patches that touch only
    // sprint_number/priority/agent/category do NOT reset embed_status,
    // because the searchable text (title + description) is unchanged.
    this.server.registerTool(
      'update_sprint_item',
      {
        description:
          'Edit the fields of an existing sprint item or study node by ID. Use this to recategorize, rename, re-prioritize, or re-tag items — e.g. moving a misfiled item to a different sprint_number, or fixing a title. Only the fields you provide are changed; everything else is left untouched. If you change title or description, the item is re-queued for embedding so search stays accurate.',
        inputSchema: {
          id: z.string().describe('The sprint item ID to update'),
          title: z.string().optional().describe('New title'),
          description: z.string().optional().describe('New full description/content'),
          sprint_number: z.number().optional().describe('New sprint number (e.g. move from 18 to 20)'),
          status: z.enum(SPRINT_STATUS).optional().describe('New status'),
          priority: z.number().optional().describe('New priority: 1 (high) to 3 (low)'),
          agent: z.string().optional().describe('New primary agent'),
          category: z.string().optional().describe('New category tag'),
        },
      },
      async ({ id, title, description, sprint_number, status, priority, agent, category }) => {
        // Confirm the row exists (and isn't already soft-deleted) before patching.
        const existing = await this.env.DB.prepare(
          'SELECT id FROM sprint_items WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL'
        ).bind(id, tenantId).first<{ id: string }>();

        if (!existing) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: 'not_found', id, message: 'No active sprint item with that ID (it may not exist, belong to another tenant, or be soft-deleted).' }) }],
          };
        }

        const sets: string[] = [];
        const bindings: (string | number | null)[] = [];

        if (title !== undefined) { sets.push('title = ?'); bindings.push(title); }
        if (description !== undefined) { sets.push('description = ?'); bindings.push(description); }
        if (sprint_number !== undefined) { sets.push('sprint_number = ?'); bindings.push(sprint_number); }
        if (status !== undefined) {
          sets.push('status = ?'); bindings.push(status);
          // Keep completed_at consistent with the existing update_sprint_status behavior.
          sets.push('completed_at = ?'); bindings.push(status === 'done' ? Math.floor(Date.now() / 1000) : null);
        }
        if (priority !== undefined) { sets.push('priority = ?'); bindings.push(priority); }
        if (agent !== undefined) { sets.push('agent = ?'); bindings.push(agent); }
        if (category !== undefined) { sets.push('category = ?'); bindings.push(category); }

        if (sets.length === 0) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: 'no_fields', id, message: 'No fields provided to update.' }) }],
          };
        }

        // Re-queue for embedding only when the searchable text changed.
        const textChanged = title !== undefined || description !== undefined;
        if (textChanged) { sets.push("embed_status = ?"); bindings.push('pending'); }

        const now = Math.floor(Date.now() / 1000);
        sets.push('updated_at = ?'); bindings.push(now);

        // id + tenant_id for the WHERE clause go last.
        bindings.push(id, tenantId);

        await this.env.DB.prepare(
          `UPDATE sprint_items SET ${sets.join(', ')} WHERE id = ? AND tenant_id = ?`
        ).bind(...bindings).run();

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              ok: true,
              id,
              updated_fields: sets
                .map((s) => s.split(' = ')[0])
                .filter((f) => f !== 'updated_at' && f !== 'completed_at' && f !== 'embed_status'),
              re_embedded: textChanged,
            }),
          }],
        };
      }
    );

    // ─────────────────────────────────────────────
    // TOOL: delete_sprint_item  (v1.2.0 — Issue #79)
    // ─────────────────────────────────────────────
    // Soft-delete: sets deleted_at to the current unix timestamp. The row stays
    // in the table (recoverable by clearing deleted_at directly in D1) but is
    // filtered out of search_knowledge and get_sprint_status by default.
    //
    // Best-effort vector cleanup: if the row has a vector_id, we also remove it
    // from Vectorize so it can't surface in semantic search. This is wrapped in
    // its own try/catch — a Vectorize failure does NOT block the soft-delete,
    // because the D1 enrichment filter already prevents deleted rows from
    // appearing in results.
    this.server.registerTool(
      'delete_sprint_item',
      {
        description:
          'Soft-delete a sprint item or study node by ID. The item is hidden from search and sprint status views but is recoverable. Use this for genuinely abandoned items. To merely archive/replace an item, prefer update_sprint_status with status="superseded" or "cancelled".',
        inputSchema: {
          id: z.string().describe('The sprint item ID to soft-delete'),
        },
      },
      async ({ id }) => {
        const existing = await this.env.DB.prepare(
          'SELECT id, vector_id FROM sprint_items WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL'
        ).bind(id, tenantId).first<{ id: string; vector_id: string | null }>();

        if (!existing) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: 'not_found', id, message: 'No active sprint item with that ID to delete.' }) }],
          };
        }

        const now = Math.floor(Date.now() / 1000);
        await this.env.DB.prepare(
          'UPDATE sprint_items SET deleted_at = ?, updated_at = ? WHERE id = ? AND tenant_id = ?'
        ).bind(now, now, id, tenantId).run();

        // Best-effort vector cleanup — non-fatal.
        let vectorRemoved = false;
        if (existing.vector_id) {
          try {
            await this.env.KNOWLEDGE_VECTORIZE.deleteByIds([existing.vector_id]);
            vectorRemoved = true;
          } catch {
            // Leave the orphaned vector — D1 enrichment filter keeps it out of results anyway.
            vectorRemoved = false;
          }
        }

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ ok: true, id, deleted_at: now, vector_removed: vectorRemoved }),
          }],
        };
      }
    );
  }
}

export default new OAuthProvider({
  apiRoute: '/mcp',
  apiHandler: KnowledgeMCP.serve('/mcp') as any,
  defaultHandler: app as any,
  authorizeEndpoint: '/authorize',
  tokenEndpoint: '/token',
  clientRegistrationEndpoint: '/register',
});
