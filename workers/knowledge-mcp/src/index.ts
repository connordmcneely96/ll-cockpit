// knowledge-mcp v1.2.0 — 6 tools: search_knowledge, get_sprint_status, seed_knowledge,
// update_sprint_status, update_sprint_item, delete_sprint_item
import OAuthProvider from '@cloudflare/workers-oauth-provider';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { McpAgent } from 'agents/mcp';
import { z } from 'zod';
import app from './auth';

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

export class KnowledgeMCP extends McpAgent<Env, Record<string, never>, Props> {
  server = new McpServer({
    name: 'nexus-knowledge-mcp',
    version: '1.2.0',
  });

  async init() {
    const tenantId = this.props.tenantId ?? 'default';

    // ───────────────────────────── search_knowledge ─────────────────────────────
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
        const embedding = (await this.env.AI.run('@cf/baai/bge-base-en-v1.5', { text: query })) as { data: number[][] };
        if (!embedding?.data?.[0]) {
          return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Embedding failed', results: [] }) }] };
        }
        const results = await this.env.KNOWLEDGE_VECTORIZE.query(embedding.data[0], { topK: cappedLimit, returnMetadata: 'all' });
        const settled = await Promise.allSettled(
          results.matches.map(async (match) => {
            const sepIdx = match.id.indexOf('::');
            if (sepIdx === -1) return null;
            const table = match.id.slice(0, sepIdx);
            const id = match.id.slice(sepIdx + 2);
            if (!id || (table !== 'study_nodes' && table !== 'sprint_items')) return null;
            const tableName = table as 'study_nodes' | 'sprint_items';
            // v1.2.0 — exclude soft-deleted sprint_items from search enrichment.
            const deletedFilter = tableName === 'sprint_items' ? ' AND deleted_at IS NULL' : '';
            const row = await this.env.DB.prepare(
              `SELECT * FROM ${tableName} WHERE id = ? AND tenant_id = ?${deletedFilter}`
            ).bind(id, tenantId).first();
            return row ? { score: match.score, type: table, ...row } : null;
          })
        );
        const enriched = settled
          .filter((r): r is PromiseFulfilledResult<Record<string, unknown>> => r.status === 'fulfilled' && r.value !== null)
          .map((r) => r.value);
        return { content: [{ type: 'text' as const, text: JSON.stringify({ results: enriched }) }] };
      }
    );

    // ───────────────────────────── get_sprint_status ─────────────────────────────
    this.server.registerTool(
      'get_sprint_status',
      {
        description:
          'Get current sprint items and their completion status. Use this to check what has been built, what is in progress, and what is pending. Soft-deleted items are excluded by default.',
        inputSchema: {
          sprint_number: z.number().optional().describe('Sprint number to filter by. Omit to get all sprints.'),
          status: z.enum(['todo', 'in_progress', 'done', 'superseded', 'cancelled']).optional().describe('Filter by status. Omit for all.'),
          include_deleted: z.boolean().optional().describe('Include soft-deleted items. Defaults to false.'),
        },
      },
      async ({ sprint_number, status, include_deleted = false }) => {
        let query = 'SELECT * FROM sprint_items WHERE tenant_id = ?';
        const bindings: (string | number)[] = [tenantId];
        if (!include_deleted) query += ' AND deleted_at IS NULL';
        if (sprint_number !== undefined) { query += ' AND sprint_number = ?'; bindings.push(sprint_number); }
        if (status) { query += ' AND status = ?'; bindings.push(status); }
        query += ' ORDER BY sprint_number ASC, priority ASC';
        const result = await this.env.DB.prepare(query).bind(...bindings).all();
        return { content: [{ type: 'text' as const, text: JSON.stringify({ items: result.results }) }] };
      }
    );

    // ───────────────────────────── seed_knowledge ─────────────────────────────
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
        const effectiveCategory = type === 'study_node' ? `study_node${category ? ':' + category : ''}` : (category ?? null);
        await this.env.DB.prepare(
          `INSERT INTO sprint_items
            (id, sprint_number, title, description, status, priority, agent, category, tenant_id, embed_status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
        ).bind(id, sprint_number, title, description, status, priority, agent ?? null, effectiveCategory, tenantId, now, now).run();
        return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, id, type, title, status }) }] };
      }
    );

    // ───────────────────────────── update_sprint_status ─────────────────────────────
    this.server.registerTool(
      'update_sprint_status',
      {
        description:
          'Update the status of a sprint item by ID. Use this to mark items as in_progress, done, superseded, or cancelled as work progresses.',
        inputSchema: {
          id: z.string().describe('The sprint item ID to update'),
          status: z.enum(['todo', 'in_progress', 'done', 'superseded', 'cancelled']).describe('New status'),
          notes: z.string().optional().describe('Optional completion notes to append to description'),
        },
      },
      async ({ id, status, notes }) => {
        const now = Math.floor(Date.now() / 1000);
        const completedAt = status === 'done' ? now : null;
        if (notes) {
          const existing = await this.env.DB.prepare('SELECT description FROM sprint_items WHERE id = ? AND tenant_id = ?').bind(id, tenantId).first<{ description: string }>();
          const updatedDescription = existing ? `${existing.description}\n\n--- COMPLETION NOTES ---\n${notes}` : notes;
          await this.env.DB.prepare('UPDATE sprint_items SET status = ?, completed_at = ?, updated_at = ?, description = ?, embed_status = ? WHERE id = ? AND tenant_id = ?').bind(status, completedAt, now, updatedDescription, 'pending', id, tenantId).run();
        } else {
          await this.env.DB.prepare('UPDATE sprint_items SET status = ?, completed_at = ?, updated_at = ?, embed_status = ? WHERE id = ? AND tenant_id = ?').bind(status, completedAt, now, 'pending', id, tenantId).run();
        }
        return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, id, status }) }] };
      }
    );

    // ───────────────────────────── update_sprint_item (v1.2.0 NEW) ─────────────────────────────
    this.server.registerTool(
      'update_sprint_item',
      {
        description:
          'Edit the content/metadata of an existing sprint item or study node by ID. Use this to recategorize misfiled items (change sprint_number), rename titles, rewrite descriptions, or adjust priority/agent/category. Only the fields you provide are changed; omitted fields are left untouched. Changing title or description automatically re-queues the item for re-embedding.',
        inputSchema: {
          id: z.string().describe('The sprint item ID to update'),
          title: z.string().optional().describe('New title'),
          description: z.string().optional().describe('New full description (replaces existing — does NOT append)'),
          sprint_number: z.number().optional().describe('New sprint number (use to recategorize misfiled items)'),
          priority: z.number().optional().describe('New priority: 1 (high) to 3 (low)'),
          agent: z.string().optional().describe('New primary agent'),
          category: z.string().optional().describe('New category tag'),
        },
      },
      async ({ id, title, description, sprint_number, priority, agent, category }) => {
        const existing = await this.env.DB.prepare('SELECT id FROM sprint_items WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL').bind(id, tenantId).first<{ id: string }>();
        if (!existing) {
          return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: 'not_found', id, note: 'No active (non-deleted) item with that id for this tenant.' }) }] };
        }
        const sets: string[] = [];
        const bindings: (string | number | null)[] = [];
        if (title !== undefined) { sets.push('title = ?'); bindings.push(title); }
        if (description !== undefined) { sets.push('description = ?'); bindings.push(description); }
        if (sprint_number !== undefined) { sets.push('sprint_number = ?'); bindings.push(sprint_number); }
        if (priority !== undefined) { sets.push('priority = ?'); bindings.push(priority); }
        if (agent !== undefined) { sets.push('agent = ?'); bindings.push(agent); }
        if (category !== undefined) { sets.push('category = ?'); bindings.push(category); }
        const now = Math.floor(Date.now() / 1000);
        const contentChanged = title !== undefined || description !== undefined;
        if (contentChanged) { sets.push('embed_status = ?'); bindings.push('pending'); }
        if (sets.length === 0) {
          return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: 'no_fields', id, note: 'No editable fields were provided.' }) }] };
        }
        sets.push('updated_at = ?'); bindings.push(now);
        bindings.push(id);
        bindings.push(tenantId);
        await this.env.DB.prepare(`UPDATE sprint_items SET ${sets.join(', ')} WHERE id = ? AND tenant_id = ?`).bind(...bindings).run();
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ ok: true, id, re_embedded: contentChanged }),
          }],
        };
      }
    );

    // ───────────────────────────── delete_sprint_item (v1.2.0 NEW) ─────────────────────────────
    this.server.registerTool(
      'delete_sprint_item',
      {
        description:
          'Soft-delete a sprint item or study node by ID. The item is marked deleted (recoverable) and excluded from future reads and search. Use this for genuinely bad records — for items that are simply no longer planned, prefer update_sprint_status with status "cancelled" or "superseded" so they remain visible in history.',
        inputSchema: {
          id: z.string().describe('The sprint item ID to soft-delete'),
          reason: z.string().optional().describe('Optional reason, appended to the description for the audit trail'),
        },
      },
      async ({ id, reason }) => {
        const existing = await this.env.DB.prepare('SELECT id, description, vector_id FROM sprint_items WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL').bind(id, tenantId).first<{ id: string; description: string | null; vector_id: string | null }>();
        if (!existing) {
          return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: 'not_found', id, note: 'No active (non-deleted) item with that id for this tenant.' }) }] };
        }
        const now = Math.floor(Date.now() / 1000);
        const updatedDescription = reason ? `${existing.description ?? ''}\n\n--- DELETED ${new Date(now * 1000).toISOString()} ---\n${reason}` : existing.description;
        await this.env.DB.prepare('UPDATE sprint_items SET deleted_at = ?, updated_at = ?, description = ? WHERE id = ? AND tenant_id = ?').bind(now, now, updatedDescription, id, tenantId).run();
        let vectorRemoved = false;
        if (existing.vector_id) {
          try {
            await this.env.KNOWLEDGE_VECTORIZE.deleteByIds([existing.vector_id]);
            vectorRemoved = true;
          } catch {
            vectorRemoved = false;
          }
        }
        return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, id, soft_deleted: true, vector_removed: vectorRemoved }) }] };
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
