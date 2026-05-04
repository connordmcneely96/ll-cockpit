import { McpAgent } from 'agents/mcp';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

interface Env {
  DB: D1Database;
  AI: Ai;
  KNOWLEDGE_VECTORIZE: VectorizeIndex;
  MCP_OBJECT: DurableObjectNamespace;
  SHARED_SECRET: string;
}

const WORKER_URL = 'https://knowledge-mcp.connorpattern.workers.dev';

export class KnowledgeMCP extends McpAgent<Env> {
  server = new McpServer({
    name: 'nexus-knowledge-mcp',
    version: '1.0.0',
  });

  async init() {
    this.server.tool(
      'search_knowledge',
      'Search the NEXUS knowledge base for study guide concepts, architecture decisions, tech stack details, and agent descriptions. Use this when you need context about the NEXUS project during a build session.',
      {
        query: z.string().describe('Natural language search query'),
        limit: z.number().optional().describe('Number of results to return (default 5, max 10)'),
      },
      async ({ query, limit = 5 }) => {
        const cappedLimit = Math.min(limit, 10);

        const embedding = await this.env.AI.run('@cf/baai/bge-base-en-v1.5', {
          text: query,
        }) as { data: number[][] };

        if (!embedding?.data?.[0]) {
          return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Embedding failed', results: [] }) }] };
        }

        const results = await this.env.KNOWLEDGE_VECTORIZE.query(
          embedding.data[0],
          { topK: cappedLimit, returnMetadata: 'all' }
        );

        const enriched = await Promise.all(
          results.matches.map(async (match) => {
            const [table, id] = match.id.split('::');
            const tableName = table === 'study_nodes' ? 'study_nodes' : 'sprint_items';
            const row = await this.env.DB.prepare(
              `SELECT * FROM ${tableName} WHERE id = ?`
            ).bind(id).first();
            return { score: match.score, type: table, ...row };
          })
        );

        return { content: [{ type: 'text' as const, text: JSON.stringify({ results: enriched }) }] };
      }
    );

    this.server.tool(
      'get_sprint_status',
      'Get current sprint items and their completion status. Use this to check what has been built, what is in progress, and what is pending.',
      {
        sprint_number: z.number().optional().describe('Sprint number to filter by. Omit to get all sprints.'),
        status: z.enum(['todo', 'in_progress', 'done']).optional().describe('Filter by status. Omit for all.'),
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

        const result = await this.env.DB.prepare(query).bind(...bindings).all();
        return { content: [{ type: 'text' as const, text: JSON.stringify({ items: result.results }) }] };
      }
    );
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function jsonResponse(data: object, status = 200) {
  return Response.json(data, { status, headers: corsHeaders });
}

const mcpHandler = KnowledgeMCP.mount('/');

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // OAuth discovery endpoints — respond immediately, no DO needed
    if (url.pathname === '/.well-known/oauth-protected-resource') {
      return jsonResponse({
        resource: WORKER_URL,
        authorization_servers: [WORKER_URL],
      });
    }

    if (url.pathname === '/.well-known/oauth-authorization-server') {
      return jsonResponse({
        issuer: WORKER_URL,
        authorization_endpoint: `${WORKER_URL}/authorize`,
        token_endpoint: `${WORKER_URL}/token`,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code'],
        code_challenge_methods_supported: ['S256'],
        scopes_supported: ['mcp'],
      });
    }

    // OAuth2 authorize endpoint
    // Generate a code and redirect back to Claude.ai
    if (url.pathname === '/authorize') {
      const redirectUri = url.searchParams.get('redirect_uri');
      const state = url.searchParams.get('state');

      if (!redirectUri || !state) {
        return jsonResponse({ error: 'invalid_request', error_description: 'Missing redirect_uri or state' }, 400);
      }

      // Encode state as the auth code (simple pass-through — we verify state at token exchange)
      const code = btoa(JSON.stringify({ state, ts: Date.now() }));

      const redirectUrl = new URL(redirectUri);
      redirectUrl.searchParams.set('code', code);
      redirectUrl.searchParams.set('state', state);

      return Response.redirect(redirectUrl.toString(), 302);
    }

    // OAuth2 token endpoint
    // Exchange code for access token
    if (url.pathname === '/token' && request.method === 'POST') {
      const body = await request.text();
      const params = new URLSearchParams(body);
      const code = params.get('code');

      if (!code) {
        return jsonResponse({ error: 'invalid_grant', error_description: 'Missing code' }, 400);
      }

      try {
        JSON.parse(atob(code)); // validate code format
      } catch {
        return jsonResponse({ error: 'invalid_grant', error_description: 'Invalid code' }, 400);
      }

      return jsonResponse({
        access_token: env.SHARED_SECRET,
        token_type: 'bearer',
        scope: 'mcp',
      });
    }

    // All other requests go to McpAgent (the actual MCP SSE handler)
    return mcpHandler.fetch(request, env, ctx);
  },
};
