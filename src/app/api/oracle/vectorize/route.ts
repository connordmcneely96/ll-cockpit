import { NextRequest, NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'

// ORACLE Step 4 — Vectorize summarized items into nexus-knowledge index
export async function POST(req: NextRequest) {
  try {
    const { env } = await getCloudflareContext()
    const body = await req.json() as { batch_size?: number }
    const batchSize = body.batch_size ?? 5

    const items = await env.DB.prepare(
      "SELECT * FROM research_queue WHERE status = 'summarized' ORDER BY relevance_score DESC LIMIT ?"
    ).bind(batchSize).all()

    const results: { id: string; title: string; vectorId: string }[] = []

    for (const item of items.results as any[]) {
      try {
        const summary = JSON.parse(item.summary_json ?? '{}')
        const textToEmbed = [
          `Title: ${item.title}`,
          `URL: ${item.url}`,
          `Summary: ${summary.tldr ?? ''}`,
          `Key points: ${(summary.key_points ?? []).join('. ')}`,
          `Tags: ${(summary.tags ?? []).join(', ')}`,
          `Relevance: ${summary.relevance_reason ?? ''}`,
        ].join('\n')

        // Generate embedding via Workers AI
        const embedResult = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
          text: [textToEmbed],
        }) as { data: number[][] }

        const vector = embedResult.data[0]
        if (!vector) throw new Error('Empty embedding returned')

        const vectorId = `research-${item.id}`

        // Upsert into Vectorize
        await env.KNOWLEDGE_VECTORIZE.upsert([{
          id: vectorId,
          values: vector,
          metadata: {
            type: 'research',
            title: item.title,
            url: item.url,
            source_id: item.source_id,
            relevance_score: item.relevance_score,
            collected_at: item.collected_at,
            tags: (summary.tags ?? []).join(','),
          },
        }])

        await env.DB.prepare(
          `UPDATE research_queue SET status = 'vectorized', vector_id = ? WHERE id = ?`
        ).bind(vectorId, item.id).run()

        results.push({ id: item.id, title: item.title, vectorId })
      } catch (err) {
        await env.DB.prepare(
          `UPDATE research_queue SET status = 'failed', error_log = ? WHERE id = ?`
        ).bind(`vectorize: ${String(err)}`, item.id).run()
      }
    }

    return NextResponse.json({ ok: true, vectorized: results.length, results })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
