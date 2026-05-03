interface Env {
  DB: D1Database;
  AI: Ai;
  KNOWLEDGE_VECTORIZE: VectorizeIndex;
}

interface MCPTool {
  name: string;
  description: string;
  inputSchema: object;
}

const TOOLS: MCPTool[] = [
  {
    name: 'search_knowledge',
    description: 'Search the NEXUS knowledge base for study guide concepts, architecture decisions, tech stack details, and agent descriptions. Use this when you need context about the NEXUS project during a build session.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Natural language search query',
        },
        limit: {
          type: 'number',
          description: 'Number of results to return (default 5, max 10)',
        },
        category: {
          type: 'string',
          description: 'Optional filter: study_node or sprint_item',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_sprint_status',
    description: 'Get the current sprint items and their completion status. Use this to check what has been built, what is in progress, and what is pending.',
    inputSchema: {
      type: 'object',
      properties: {
        sprint_number: {
          type: 'number',
          description: 'Sprint number to filter by. Omit to get all sprints.',
        },
        status: {
          type: 'string',
          enum: ['todo', 'in_progress', 'done'],
          description: 'Filter by status. Omit to get all statuses.',
        },
      },
      required: [],
    },
  },
];

async function searchKnowledge(
  query: string,
  limit: number = 5,
  category: string | undefined,
  env: Env
): Promise<object> {
  const cappedLimit = Math.min(limit, 10);

  const embedding = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
    text: query,
  }) as { data: number[][] };

  if (!embedding?.data?.[0]) {
    return { results: [], error: 'Failed to generate query embedding' };
  }

  const queryOptions: VectorizeQueryOptions = {
    topK: cappedLimit,
    returnMetadata: 'all',
  };

  if (category) {
    queryOptions.filter = { table: category === 'sprint_item' ? 'sprint_items' : 'study_nodes' };
  }

  const results = await env.KNOWLEDGE_VECTORIZE.query(
    embedding.data[0],
    queryOptions
  );

  const enriched = await Promise.all(
    results.matches.map(async (match) => {
      const [table, id] = match.id.split('::');
      const tableName = table === 'study_nodes' ? 'study_nodes' : 'sprint_items';
      const row = await env.DB.prepare(
        `SELECT * FROM ${tableName} WHERE id = ?`
      ).bind(id).first();
      return {
        score: match.score,
        type: table,
        ...row,
      };
    })
  );

  return { results: enriched };
}

async function getSprintStatus(
  sprint_number: number | undefined,
  status: string | undefined,
  env: Env
): Promise<object> {
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

  const result = await env.DB.prepare(query).bind(...bindings).all();
  return { items: result.results };
}

function jsonResponse(data: object, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (req.method === 'OPTIONS') {
      return jsonResponse({}, 204);
    }

    // MCP endpoint: list tools
    if (req.method === 'GET' && url.pathname === '/') {
      return jsonResponse({
        name: 'nexus-knowledge-mcp',
        version: '1.0.0',
        description: 'NEXUS knowledge base search — study guide and sprint tracker',
        tools: TOOLS,
      });
    }

    // MCP endpoint: call tool
    if (req.method === 'POST' && url.pathname === '/call') {
      const body = await req.json() as { tool: string; input: Record<string, unknown> };
      const { tool, input } = body;

      if (!tool || !input) {
        return jsonResponse({ error: 'Missing tool or input' }, 400);
      }

      try {
        let result: object;

        if (tool === 'search_knowledge') {
          result = await searchKnowledge(
            input.query as string,
            (input.limit as number) ?? 5,
            input.category as string | undefined,
            env
          );
        } else if (tool === 'get_sprint_status') {
          result = await getSprintStatus(
            input.sprint_number as number | undefined,
            input.status as string | undefined,
            env
          );
        } else {
          return jsonResponse({ error: `Unknown tool: ${tool}` }, 400);
        }

        return jsonResponse({ result });
      } catch (err) {
        return jsonResponse({ error: String(err) }, 500);
      }
    }

    return jsonResponse({ error: 'Not found' }, 404);
  },
};
