interface KnowledgeMessage {
  id: string;
  table: 'study_nodes' | 'sprint_items';
  content: string;
  metadata: Record<string, string>;
}

interface Env {
  DB: D1Database;
  AI: Ai;
  KNOWLEDGE_VECTORIZE: VectorizeIndex;
}

export default {
  async queue(batch: MessageBatch<KnowledgeMessage>, env: Env): Promise<void> {
    const vectors: VectorizeVector[] = [];

    for (const message of batch.messages) {
      const { id, table, content, metadata } = message.body;

      if (!id || !table || !content) {
        message.ack();
        continue;
      }

      try {
        const result = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
          text: content,
        }) as { data: number[][] };

        if (!result?.data?.[0]) {
          message.retry();
          continue;
        }

        vectors.push({
          id: `${table}::${id}`,
          values: result.data[0],
          metadata: { ...metadata, table, record_id: id },
        });

        message.ack();
      } catch {
        message.retry();
      }
    }

    if (vectors.length > 0) {
      await env.KNOWLEDGE_VECTORIZE.upsert(vectors);
    }
  },
};
