import { NextRequest, NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'

// ORACLE Step 5 — Generate daily digest from top research items
export async function POST(req: NextRequest) {
  try {
    const { env } = await getCloudflareContext()
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return NextResponse.json({ ok: false, error: 'ANTHROPIC_API_KEY not configured' }, { status: 503 })

    const today = new Date().toISOString().slice(0, 10)  // YYYY-MM-DD

    // Check if digest already exists for today
    const existing = await env.DB.prepare(
      'SELECT id FROM research_digests WHERE digest_date = ?'
    ).bind(today).first()
    if (existing) return NextResponse.json({ ok: true, message: 'Digest already generated today', date: today })

    // Get top items from last 48 hours, sorted by relevance
    const items = await env.DB.prepare(
      `SELECT rq.*, rs.source_name
       FROM research_queue rq
       LEFT JOIN research_sources rs ON rq.source_id = rs.id
       WHERE rq.status IN ('summarized', 'vectorized')
         AND rq.collected_at > (unixepoch() - 172800)
       ORDER BY rq.relevance_score DESC
       LIMIT 10`
    ).all()

    if (!items.results.length) {
      return NextResponse.json({ ok: true, message: 'No items to digest yet', date: today })
    }

    // Build context for digest
    const itemSummaries = (items.results as any[]).slice(0, 5).map((item, i) => {
      const summary = JSON.parse(item.summary_json ?? '{}')
      return `${i + 1}. **${item.title}** (${item.source_name ?? 'Unknown'} · relevance: ${(item.relevance_score * 100).toFixed(0)}%)
   URL: ${item.url}
   Summary: ${summary.tldr ?? 'No summary'}
   Key points: ${(summary.key_points ?? []).slice(0, 2).join('; ')}
   Action: ${(summary.action_suggestions ?? [])[0] ?? 'No action suggested'}`
    }).join('\n\n')

    // Generate digest with Claude
    const digestPrompt = `You are ORACLE delivering a morning intelligence brief to an AI agency operator.
Format as clean markdown. Be direct and actionable. No fluff.

Date: ${today}
Top research items from last 48 hours:

${itemSummaries}

Write a morning digest with:
1. One-sentence overall theme of today's intelligence
2. The top 5 items formatted as: **Title** · Source · Relevance% → key takeaway + 1 action
3. A "sprint relevance" note: which item is most relevant to building an AI Cockpit for clients right now

Keep it under 400 words. Use markdown.`

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{ role: 'user', content: digestPrompt }],
      }),
    })

    const anthropicData = await anthropicRes.json() as any
    const digestMarkdown = anthropicData.content?.[0]?.text ?? 'Digest generation failed'

    // Save digest to D1
    const digestId = crypto.randomUUID()
    const itemIds = (items.results as any[]).slice(0, 5).map((i: any) => i.id)
    await env.DB.prepare(
      `INSERT INTO research_digests (id, digest_date, item_count, item_ids, digest_markdown, created_at)
       VALUES (?, ?, ?, ?, ?, unixepoch())`
    ).bind(digestId, today, itemIds.length, JSON.stringify(itemIds), digestMarkdown).run()

    // Save digest to R2
    await env.R2.put(`research/digests/${today}.md`, digestMarkdown, {
      httpMetadata: { contentType: 'text/plain' },
    })

    return NextResponse.json({
      ok: true,
      digestId,
      date: today,
      itemCount: itemIds.length,
      digest: digestMarkdown,
    })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}

// GET — retrieve latest digest
export async function GET() {
  try {
    const { env } = await getCloudflareContext()
    const digest = await env.DB.prepare(
      'SELECT * FROM research_digests ORDER BY digest_date DESC LIMIT 1'
    ).first()
    if (!digest) return NextResponse.json({ ok: true, digest: null })
    return NextResponse.json({ ok: true, digest })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
