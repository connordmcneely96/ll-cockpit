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
    // Track id+table per vector so we can write embed_status back to D1 after upsert.
    const vectorMeta: { id: string; table: string }[] = [];

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
        vectorMeta.push({ id, table });
      } catch {
        message.retry();
      }
    }

    if (vectors.length > 0) {
      try {
        await env.KNOWLEDGE_VECTORIZE.upsert(vectors);

        // Write embed_status='done' and vector_id back to D1 so we have
        // full visibility into which records are in Vectorize.
        await Promise.allSettled(
          vectorMeta.map(({ id, table }) =>
            env.DB.prepare(
              `UPDATE ${table} SET embed_status = 'done', vector_id = ? WHERE id = ?`
            ).bind(`${table}::${id}`, id).run()
          )
        );

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
