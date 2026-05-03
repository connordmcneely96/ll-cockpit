import { WorkerEntrypoint } from 'cloudflare:workers';
import { ProxyToSelf } from 'workers-mcp';

interface Env {
  DB: D1Database;
  AI: Ai;
  KNOWLEDGE_VECTORIZE: VectorizeIndex;
  SHARED_SECRET: string;
}

export default class KnowledgeMCP extends WorkerEntrypoint<Env> {
  /**
   * Search the NEXUS knowledge base for study guide concepts,
   * architecture decisions, tech stack details, and agent descriptions.
   * Use this when you need context about the NEXUS project during a build session.
   * @param query {string} Natural language search query
   * @param limit {number} Number of results to return (default 5, max 10)
   * @returns {string} JSON array of matching knowledge records with relevance scores
   */
  async search_knowledge(query: string, limit: number = 5): Promise<string> {
    const cappedLimit = Math.min(limit, 10);

    const embedding = await this.env.AI.run('@cf/baai/bge-base-en-v1.5', {
      text: query,
    }) as { data: number[][] };

    if (!embedding?.data?.[0]) {
      return JSON.stringify({ error: 'Failed to generate query embedding', results: [] });
    }

    const results = await this.env.KNOWLEDGE_VECTORIZE.query(
      embedding.data[0],
      { topK: cappedLimit, returnMetadata: 'all' }
    );

    const enriched = await Promise.all(
      results.matches.map(async (match) => {
        const parts = match.id.split('::');
        const table = parts[0];
        const id = parts[1];
        const tableName = table === 'study_nodes' ? 'study_nodes' : 'sprint_items';
        const row = await this.env.DB.prepare(
          `SELECT * FROM ${tableName} WHERE id = ?`
        ).bind(id).first();
        return { score: match.score, type: table, ...row };
      })
    );

    return JSON.stringify({ results: enriched });
  }

  /**
   * Get current sprint items and their completion status.
   * Use this to check what has been built, what is in progress, and what is pending.
   * @param sprint_number {number} Sprint number to filter by. Omit to get all sprints.
   * @param status {string} Filter by status: todo, in_progress, or done. Omit for all.
   * @returns {string} JSON array of sprint items ordered by sprint number and priority
   */
  async get_sprint_status(sprint_number?: number, status?: string): Promise<string> {
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
    return JSON.stringify({ items: result.results });
  }

  async fetch(request: Request): Promise<Response> {
    return new ProxyToSelf(this).fetch(request);
  }
}
