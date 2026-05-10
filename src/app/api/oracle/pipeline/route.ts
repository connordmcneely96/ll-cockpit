import { NextRequest, NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { CloudflareEnv } from '@/types'

// Resolve YouTube @handle to channel RSS feed URL
// YouTube embeds the channel ID in page HTML as {"externalId":"UC..."}
async function resolveYouTubeRSS(handleUrl: string): Promise<string | null> {
  try {
    const res = await fetch(handleUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NEXUS-ORACLE/1.0)' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const html = await res.text()
    // Extract channel ID from page HTML
    const match = html.match(/"externalId":"(UC[a-zA-Z0-9_-]{22})"/) ||
                  html.match(/channel_id=(UC[a-zA-Z0-9_-]{22})/) ||
                  html.match(/\?channel_id=(UC[a-zA-Z0-9_-]{22})/)
    if (match) {
      return `https://www.youtube.com/feeds/videos.xml?channel_id=${match[1]}`
    }
    return null
  } catch {
    return null
  }
}

function parseRSSItems(xml: string): { guid: string; title: string; link: string }[] {
  const items: { guid: string; title: string; link: string }[] = []
  const itemRegex = /<(?:item|entry)[^>]*>([\s\S]*?)<\/(?:item|entry)>/gi
  let match
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1]
    const get = (tag: string) => {
      const m = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\/${tag}>|<${tag}[^>]*>([^<]*)<\/${tag}>`, 'i').exec(block)
      return m ? (m[1] || m[2] || '').trim() : ''
    }
    const link = (() => {
      const a = /<link[^>]*href=["']([^"']+)["']/i.exec(block)
      if (a) return a[1].trim()
      const b = /<link>([^<]+)<\/link>/i.exec(block)
      if (b) return b[1].trim()
      return get('id') || get('guid')
    })()
    const title = get('title')
    const guid = get('guid') || get('id') || link
    if (title && link) items.push({ guid, title, link })
  }
  return items
}

async function getConfig(env: CloudflareEnv): Promise<Record<string, boolean>> {
  const rows = await env.DB.prepare('SELECT key, value FROM pipeline_config').all()
  const config: Record<string, boolean> = {}
  for (const row of rows.results as any[]) {
    config[row.key] = row.value === '1'
  }
  return config
}

async function runFetch(env: CloudflareEnv, limit = 5) {
  const sources = await env.DB.prepare('SELECT * FROM research_sources WHERE active = 1').all()
  const results: { source: string; enqueued: number; rssUrl?: string; error?: string }[] = []

  for (const source of sources.results as any[]) {
    try {
      let feedUrl = source.source_url

      // Resolve YouTube @handle to actual RSS URL
      if (source.source_type === 'youtube_channel' && feedUrl.includes('@')) {
        // Check if we have a cached RSS URL in KV
        const cacheKey = `yt_rss:${source.id}`
        const cached = await env.KV.get(cacheKey)
        if (cached) {
          feedUrl = cached
        } else {
          const resolved = await resolveYouTubeRSS(feedUrl)
          if (resolved) {
            feedUrl = resolved
            // Cache for 7 days — channel IDs never change
            await env.KV.put(cacheKey, resolved, { expirationTtl: 604800 })
          } else {
            results.push({ source: source.source_name, enqueued: 0, error: 'Could not resolve YouTube channel ID' })
            continue
          }
        }
      }

      const res = await fetch(feedUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 NEXUS-ORACLE/1.0' },
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const xml = await res.text()
      const items = parseRSSItems(xml).slice(0, limit)
      let enqueued = 0
      for (const item of items) {
        const existing = await env.DB.prepare(
          'SELECT id FROM research_queue WHERE source_id = ? AND external_id = ?'
        ).bind(source.id, item.guid).first()
        if (existing) continue
        await env.DB.prepare(
          `INSERT INTO research_queue (id, source_id, external_id, title, url, status, collected_at)
           VALUES (?, ?, ?, ?, ?, 'pending', unixepoch())`
        ).bind(crypto.randomUUID(), source.id, item.guid, item.title, item.link).run()
        enqueued++
      }
      await env.DB.prepare('UPDATE research_sources SET last_checked = unixepoch() WHERE id = ?').bind(source.id).run()
      results.push({ source: source.source_name, enqueued, rssUrl: feedUrl })
    } catch (err) {
      results.push({ source: source.source_name, enqueued: 0, error: String(err) })
    }
  }
  return results
}

async function runSummarize(env: CloudflareEnv, batchSize = 10) {
  if (!env.AI) return []
  const items = await env.DB.prepare(
    "SELECT rq.*, rs.source_name, rs.source_type FROM research_queue rq LEFT JOIN research_sources rs ON rq.source_id = rs.id WHERE rq.status = 'pending' ORDER BY rq.collected_at DESC LIMIT ?"
  ).bind(batchSize).all()
  const results: { id: string; title: string; status: string; error?: string }[] = []

  for (const item of items.results as any[]) {
    try {
      await env.DB.prepare("UPDATE research_queue SET status = 'fetching' WHERE id = ?").bind(item.id).run()
      let rawText = `Title: ${item.title}\nURL: ${item.url}\nSource: ${item.source_name ?? 'Unknown'}`
      try {
        const pageRes = await fetch(item.url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(6000) })
        const html = await pageRes.text()
        const stripped = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 4000)
        if (stripped.length > 100) rawText = stripped
      } catch { /* use title fallback */ }

      const r2Key = `research/raw/${item.id}.txt`
      await env.R2.put(r2Key, rawText, { httpMetadata: { contentType: 'text/plain' } })
      await env.DB.prepare("UPDATE research_queue SET status = 'summarizing', raw_r2_key = ? WHERE id = ?").bind(r2Key, item.id).run()

      // Source-specific prompt for better value extraction
      const sourceContext = item.source_type === 'youtube_channel'
        ? `This is from a YouTube channel (${item.source_name}). Focus on actionable frameworks, tools, and strategies for AI agency builders.`
        : `This is from ${item.source_name}. Extract key insights relevant to building AI systems and agencies.`

      const aiResult = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
        messages: [{ role: 'user', content: `${sourceContext}\n\nAnalyze this content. Output ONLY valid JSON, no other text:\n{"tldr":"2-3 sentence executive summary with the core value proposition","key_points":["specific actionable point 1","specific actionable point 2","specific actionable point 3"],"frameworks":["framework or model mentioned"],"tools":["specific tool or technology mentioned"],"tags":["tag1","tag2","tag3"],"relevance_to_ai_agency":0.7,"relevance_reason":"one sentence on why this matters for an AI consulting agency","action_suggestions":["concrete action an AI agency operator could take today","second action suggestion"]}\n\nTitle: ${item.title}\nContent: ${rawText.slice(0, 2500)}` }],
        max_tokens: 512,
      }) as { response?: string }

      let summaryJson: any = { tldr: item.title, tags: [], key_points: [], frameworks: [], tools: [], relevance_to_ai_agency: 0.5, action_suggestions: [] }
      try {
        const jsonMatch = (aiResult.response ?? '').match(/\{[\s\S]*\}/)
        if (jsonMatch) summaryJson = JSON.parse(jsonMatch[0])
      } catch { /* use defaults */ }

      await env.DB.prepare(
        `UPDATE research_queue SET status = 'summarized', summary_json = ?, relevance_score = ?, processed_at = unixepoch() WHERE id = ?`
      ).bind(JSON.stringify(summaryJson), summaryJson.relevance_to_ai_agency ?? 0.5, item.id).run()
      results.push({ id: item.id, title: item.title, status: 'summarized' })
    } catch (err) {
      await env.DB.prepare(`UPDATE research_queue SET status = 'failed', error_log = ? WHERE id = ?`).bind(String(err), item.id).run()
      results.push({ id: item.id, title: item.title, status: 'failed', error: String(err) })
    }
  }
  return results
}

async function runVectorize(env: CloudflareEnv, batchSize = 10) {
  if (!env.AI || !env.KNOWLEDGE_VECTORIZE) return { vectorized: 0, results: [] }
  const items = await env.DB.prepare(
    "SELECT * FROM research_queue WHERE status = 'summarized' ORDER BY relevance_score DESC LIMIT ?"
  ).bind(batchSize).all()
  const results: { id: string; vectorId: string }[] = []
  for (const item of items.results as any[]) {
    try {
      const summary = JSON.parse(item.summary_json ?? '{}')
      const text = [
        `Title: ${item.title}`,
        `Summary: ${summary.tldr ?? ''}`,
        `Key points: ${(summary.key_points ?? []).join('. ')}`,
        `Frameworks: ${(summary.frameworks ?? []).join(', ')}`,
        `Tools: ${(summary.tools ?? []).join(', ')}`,
        `Tags: ${(summary.tags ?? []).join(', ')}`,
      ].join('\n')
      const embedResult = await env.AI.run('@cf/baai/bge-base-en-v1.5', { text: [text] }) as { data: number[][] }
      const vector = embedResult.data[0]
      if (!vector) throw new Error('empty embedding')
      const vectorId = `research-${item.id}`
      await env.KNOWLEDGE_VECTORIZE.upsert([{
        id: vectorId, values: vector,
        metadata: { type: 'research', title: item.title, url: item.url, relevance_score: item.relevance_score, tags: (summary.tags ?? []).join(',') },
      }])
      await env.DB.prepare(`UPDATE research_queue SET status = 'vectorized', vector_id = ? WHERE id = ?`).bind(vectorId, item.id).run()
      results.push({ id: item.id, vectorId })
    } catch (err) {
      await env.DB.prepare(`UPDATE research_queue SET status = 'failed', error_log = ? WHERE id = ?`).bind(`vectorize: ${String(err)}`, item.id).run()
    }
  }
  return { vectorized: results.length, results }
}

async function runDigest(env: CloudflareEnv) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return { message: 'ANTHROPIC_API_KEY not set' }
  const today = new Date().toISOString().slice(0, 10)
  const existing = await env.DB.prepare('SELECT id FROM research_digests WHERE digest_date = ?').bind(today).first()
  if (existing) return { message: 'Digest already exists for today', date: today }

  const items = await env.DB.prepare(
    `SELECT rq.*, rs.source_name, rs.source_type FROM research_queue rq
     LEFT JOIN research_sources rs ON rq.source_id = rs.id
     WHERE rq.status IN ('summarized','vectorized') AND rq.collected_at > (unixepoch() - 172800)
     ORDER BY rq.relevance_score DESC LIMIT 15`
  ).all()
  if (!items.results.length) return { message: 'No items ready for digest', date: today }

  // Rich context with frameworks + tools + actions
  const context = (items.results as any[]).slice(0, 8).map((item: any, i: number) => {
    const s = JSON.parse(item.summary_json ?? '{}')
    const frameworks = (s.frameworks ?? []).length ? `\n   Frameworks: ${s.frameworks.join(', ')}` : ''
    const tools = (s.tools ?? []).length ? `\n   Tools: ${s.tools.join(', ')}` : ''
    const action = (s.action_suggestions ?? [])[0] ? `\n   → Action: ${s.action_suggestions[0]}` : ''
    return `${i+1}. **${item.title}** *(${item.source_name} · ${Math.round((item.relevance_score ?? 0)*100)}% relevance)*\n   ${s.tldr ?? ''}${frameworks}${tools}${action}`
  }).join('\n\n')

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001', max_tokens: 1200,
      messages: [{ role: 'user', content: `You are ORACLE delivering a morning intelligence brief to Connor, an AI agency operator building NEXUS PRIME.\n\nDate: ${today}\n\nTop research items from the last 48 hours:\n${context}\n\nWrite a structured morning brief with:\n## 🧠 Today's Intelligence Theme\nOne sentence on the dominant theme across today's content.\n\n## 📌 Top Picks\nFor each of the top 5 items:\n**[Title]** · Source · Relevance%\n> Core takeaway in 1-2 sentences\n- Key insight or framework\n- Concrete action for an AI agency operator\n\n## ⚡ Sprint Relevance\nWhich item is most relevant to building NEXUS PRIME right now and why?\n\n## 🎯 This Week's Opportunity\nOne specific opportunity or gap Connor should act on based on today's intelligence.\n\nBe direct. Be specific. No fluff. Use markdown formatting.` }],
    }),
  })
  const data = await res.json() as any
  const markdown = data.content?.[0]?.text ?? 'Digest generation failed'

  const digestId = crypto.randomUUID()
  const itemIds = (items.results as any[]).slice(0, 8).map((i: any) => i.id)
  await env.DB.prepare(
    `INSERT INTO research_digests (id, digest_date, item_count, item_ids, digest_markdown, created_at) VALUES (?, ?, ?, ?, ?, unixepoch())`
  ).bind(digestId, today, itemIds.length, JSON.stringify(itemIds), markdown).run()
  await env.R2.put(`research/digests/${today}.md`, markdown, { httpMetadata: { contentType: 'text/plain' } })
  return { digestId, date: today, itemCount: itemIds.length, digest: markdown }
}

export async function GET() {
  try {
    const env = (await getCloudflareContext()).env as unknown as CloudflareEnv
    const [sources, queueStats, latestDigest, config] = await Promise.all([
      env.DB.prepare('SELECT * FROM research_sources ORDER BY source_type, source_name').all(),
      env.DB.prepare('SELECT status, COUNT(*) as count FROM research_queue GROUP BY status').all(),
      env.DB.prepare('SELECT digest_date, item_count, created_at FROM research_digests ORDER BY digest_date DESC LIMIT 1').first(),
      env.DB.prepare('SELECT key, value, label, description FROM pipeline_config').all(),
    ])
    return NextResponse.json({ ok: true, sources: sources.results, queue: queueStats.results, latest_digest: latestDigest, config: config.results })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const env = (await getCloudflareContext()).env as unknown as CloudflareEnv
    const body = await req.json().catch(() => ({})) as { skip_fetch?: boolean; batch_size?: number; force?: boolean }

    // Check master kill switch unless forced
    const config = await getConfig(env)
    if (!config.cron_enabled && !body.force) {
      return NextResponse.json({ ok: false, error: 'Pipeline is paused — cron_enabled is OFF. Use force:true to override.' }, { status: 503 })
    }

    const pipeline: { step: string; result: any; skipped?: boolean }[] = []

    if (body.skip_fetch !== true && config.fetch_enabled) {
      const fetchResult = await runFetch(env, 5)
      pipeline.push({ step: 'fetch', result: { ok: true, results: fetchResult } })
    } else if (!config.fetch_enabled) {
      pipeline.push({ step: 'fetch', result: { ok: true, message: 'SKIPPED — fetch disabled' }, skipped: true })
    }

    if (config.summarize_enabled) {
      const summarizeResult = await runSummarize(env, body.batch_size ?? 10)
      pipeline.push({ step: 'summarize (Workers AI Llama 3.1 8B — FREE)', result: { ok: true, processed: summarizeResult.length, results: summarizeResult } })
    } else {
      pipeline.push({ step: 'summarize', result: { ok: true, message: 'SKIPPED — summarize disabled' }, skipped: true })
    }

    if (config.vectorize_enabled) {
      const vectorizeResult = await runVectorize(env, 10)
      pipeline.push({ step: 'vectorize (BGE — FREE)', result: { ok: true, ...vectorizeResult } })
    } else {
      pipeline.push({ step: 'vectorize', result: { ok: true, message: 'SKIPPED — vectorize disabled' }, skipped: true })
    }

    if (config.digest_enabled) {
      const digestResult = await runDigest(env)
      pipeline.push({ step: 'digest (Claude Haiku — 1 call/day)', result: { ok: true, ...digestResult } })
    } else {
      pipeline.push({ step: 'digest', result: { ok: true, message: 'SKIPPED — digest disabled' }, skipped: true })
    }

    return NextResponse.json({ ok: true, pipeline })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
