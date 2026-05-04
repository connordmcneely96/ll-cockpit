import { McpAgent } from 'agents/mcp';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

interface Env {
  DB: D1Database;
  AI: Ai;
  KNOWLEDGE_VECTORIZE: VectorizeIndex;
  MCP_OBJECT: DurableObjectNamespace;
}

export class KnowledgeMCP extends McpAgent<Env> {
  server = new McpServer({
    name: 'nexus-knowledge-mcp',
    version: '1.0.0',
  });

  async init() {
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

        const enriched = await Promise.all(
          results.matches.map(async (match) => {
            const [table, id] = match.id.split('::');
            const tableName = table === 'study_nodes' ? 'study_nodes' : 'sprint_items';
            const row = await this.env.DB.prepare(`SELECT * FROM ${tableName} WHERE id = ?`)
              .bind(id)
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
        let query = 'SELECT * FROM sprint_items WHERE 1=1';
        const bindings: (string | number)[] = [];

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

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);

    if (url.pathname === '/mcp') {
      return KnowledgeMCP.serve('/mcp').fetch(request, env, ctx);
    }

    return new Response('NEXUS Knowledge MCP — connect at /mcp', { status: 200 });
  },
};
