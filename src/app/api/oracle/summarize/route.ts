import { NextRequest, NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'

// ORACLE Step 2+3 — Fetch content + Summarize with Claude Haiku
export async function POST(req: NextRequest) {
  try {
    const { env } = await getCloudflareContext()
    const body = await req.json() as { item_id?: string; batch_size?: number }
    const batchSize = body.batch_size ?? 3

    // Get pending items
    const items = body.item_id
      ? await env.DB.prepare("SELECT * FROM research_queue WHERE id = ?").bind(body.item_id).all()
      : await env.DB.prepare(
          "SELECT * FROM research_queue WHERE status = 'pending' ORDER BY collected_at DESC LIMIT ?"
        ).bind(batchSize).all()

    const results: { id: string; title: string; status: string; error?: string }[] = []
    const apiKey = process.env.ANTHROPIC_API_KEY

    for (const item of items.results as any[]) {
      try {
        // Mark as fetching
        await env.DB.prepare("UPDATE research_queue SET status = 'fetching' WHERE id = ?")
          .bind(item.id).run()

        // Step 1: Fetch the page content
        let rawText = ''
        try {
          const pageRes = await fetch(item.url, {
            headers: { 'User-Agent': 'NEXUS-ORACLE/1.0' },
            signal: AbortSignal.timeout(10000),
          })
          const html = await pageRes.text()
          // Strip HTML tags for plain text
          rawText = html
            .replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/<style[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 8000)  // first 8k chars
        } catch {
          rawText = `Title: ${item.title}\nURL: ${item.url}\n(Content unavailable — summarizing from title only)`
        }

        // Step 2: Store raw in R2
        const r2Key = `research/raw/${item.id}.txt`
        await env.R2.put(r2Key, rawText, { httpMetadata: { contentType: 'text/plain' } })

        // Step 3: Summarize with Claude Haiku (cheapest)
        if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')

        await env.DB.prepare("UPDATE research_queue SET status = 'summarizing', raw_r2_key = ? WHERE id = ?")
          .bind(r2Key, item.id).run()

        const summaryPrompt = `You are ORACLE, a research intelligence agent for an AI consulting agency.
Analyze this content and respond ONLY with a JSON object — no preamble, no markdown.

Content (from: ${item.url}):
${rawText.slice(0, 4000)}

Respond with:
{
  "tldr": "2-3 sentence executive summary",
  "key_points": ["point 1", "point 2", "point 3"],
  "tags": ["tag1", "tag2", "tag3"],
  "relevance_to_ai_agency": 0.0,
  "relevance_reason": "one sentence explaining relevance score (0-1)",
  "action_suggestions": ["suggestion 1", "suggestion 2"]
}`

        const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',  // cheapest model
            max_tokens: 512,
            messages: [{ role: 'user', content: summaryPrompt }],
          }),
        })

        const anthropicData = await anthropicRes.json() as any
        const rawSummary = anthropicData.content?.[0]?.text ?? '{}'

        let summaryJson: any = {}
        try { summaryJson = JSON.parse(rawSummary) } catch { summaryJson = { tldr: rawSummary, tags: [], key_points: [], relevance_to_ai_agency: 0.5, action_suggestions: [] } }

        const relevance = summaryJson.relevance_to_ai_agency ?? 0.5

        // Step 4: Update queue with summary
        await env.DB.prepare(
          `UPDATE research_queue
           SET status = 'summarized', summary_json = ?, relevance_score = ?, processed_at = unixepoch()
           WHERE id = ?`
        ).bind(JSON.stringify(summaryJson), relevance, item.id).run()

        results.push({ id: item.id, title: item.title, status: 'summarized' })
      } catch (err) {
        await env.DB.prepare(
          `UPDATE research_queue SET status = 'failed', error_log = ? WHERE id = ?`
        ).bind(String(err), item.id).run()
        results.push({ id: item.id, title: item.title, status: 'failed', error: String(err) })
      }
    }

    return NextResponse.json({ ok: true, processed: results.length, results })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
