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
    // Collect messages that successfully produced embeddings — ack only after upsert succeeds.
    const toAck: (typeof batch.messages)[0][] = [];

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
        toAck.push(message);
      } catch {
        message.retry();
      }
    }

    if (vectors.length > 0) {
      try {
        await env.KNOWLEDGE_VECTORIZE.upsert(vectors);
        // Ack only after successful upsert — prevents silent data loss on Vectorize errors.
        for (const msg of toAck) msg.ack();
      } catch (err) {
        console.error('[knowledge-embed] Vectorize upsert failed:', String(err));
        // Let the queue retry the whole batch.
        for (const msg of toAck) msg.retry();
      }
    }
  },
};
