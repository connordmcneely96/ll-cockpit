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

export class KnowledgeMCP extends McpAgent<Env, Record<string, never>, Props> {
  server = new McpServer({
    name: 'nexus-knowledge-mcp',
    version: '1.0.0',
  });

  async init() {
    // Single-tenant: tenantId is always 'default'
    // Multi-tenant: swap this.props.tenantId in for all queries
    const tenantId = this.props.tenantId ?? 'default';

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
          // Multi-tenant: uncomment and use tenantId filter
          // filter: { tenant_id: tenantId },
        });

        const enriched = await Promise.all(
          results.matches.map(async (match) => {
            const [table, id] = match.id.split('::');
            const tableName = table === 'study_nodes' ? 'study_nodes' : 'sprint_items';
            const row = await this.env.DB.prepare(
              `SELECT * FROM ${tableName} WHERE id = ? AND tenant_id = ?`
            )
              .bind(id, tenantId)
              .first();
            return { score: match.score, type: table, ...row };
          })
        );

        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ results: enriched }) }],
        };
      }
    );

    this.server.registerTool(
      'get_sprint_status',
      {
        description:
          'Get current sprint items and their completion status. Use this to check what has been built, what is in progress, and what is pending.',
        inputSchema: {
          sprint_number: z.number().optional().describe('Sprint number to filter by. Omit to get all sprints.'),
          status: z
            .enum(['todo', 'in_progress', 'done'])
            .optional()
            .describe('Filter by status. Omit for all.'),
        },
      },
      async ({ sprint_number, status }) => {
        let query = 'SELECT * FROM sprint_items WHERE tenant_id = ?';
        const bindings: (string | number)[] = [tenantId];

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
  }
}

// OAuthProvider wraps everything:
// - Routes /mcp traffic to McpAgent (the actual MCP tools)
// - Routes everything else to the Hono auth app (handles /authorize, /approve)
// - Handles /token and /register automatically
export default new OAuthProvider({
  apiRoute: '/mcp',
  apiHandler: KnowledgeMCP.serve('/mcp') as any,
  defaultHandler: app as any,
  authorizeEndpoint: '/authorize',
  tokenEndpoint: '/token',
  clientRegistrationEndpoint: '/register',
});
