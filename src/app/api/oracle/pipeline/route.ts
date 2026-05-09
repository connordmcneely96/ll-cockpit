import { NextRequest, NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { CloudflareEnv } from '@/types'

// ── Shared helpers ──

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

async function runFetch(env: CloudflareEnv, limit = 5) {
  const sources = await env.DB.prepare(
    "SELECT * FROM research_sources WHERE active = 1 AND source_type = 'rss' OR active = 1 AND source_type = 'youtube_channel'"
  ).all()

  const results: { source: string; enqueued: number; error?: string }[] = []

  for (const source of sources.results as any[]) {
    try {
      const res = await fetch(source.source_url, {
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
        const id = crypto.randomUUID()
        await env.DB.prepare(
          `INSERT INTO research_queue (id, source_id, external_id, title, url, status, collected_at)
           VALUES (?, ?, ?, ?, ?, 'pending', unixepoch())`
        ).bind(id, source.id, item.guid, item.title, item.link).run()
        enqueued++
      }
      await env.DB.prepare('UPDATE research_sources SET last_checked = unixepoch() WHERE id = ?').bind(source.id).run()
      results.push({ source: source.source_name, enqueued })
    } catch (err) {
      results.push({ source: source.source_name, enqueued: 0, error: String(err) })
    }
  }
  return results
}

async function runSummarize(env: CloudflareEnv, apiKey: string, batchSize = 3) {
  const items = await env.DB.prepare(
    "SELECT * FROM research_queue WHERE status = 'pending' ORDER BY collected_at DESC LIMIT ?"
  ).bind(batchSize).all()

  const results: { id: string; title: string; status: string; error?: string }[] = []

  for (const item of items.results as any[]) {
    try {
      await env.DB.prepare("UPDATE research_queue SET status = 'fetching' WHERE id = ?").bind(item.id).run()

      let rawText = ''
      try {
        const pageRes = await fetch(item.url, { headers: { 'User-Agent': 'Mozilla/5.0 NEXUS-ORACLE/1.0' }, signal: AbortSignal.timeout(8000) })
        const html = await pageRes.text()
        rawText = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 6000)
      } catch {
        rawText = `Title: ${item.title}\nURL: ${item.url}`
      }

      const r2Key = `research/raw/${item.id}.txt`
      await env.R2.put(r2Key, rawText, { httpMetadata: { contentType: 'text/plain' } })
      await env.DB.prepare("UPDATE research_queue SET status = 'summarizing', raw_r2_key = ? WHERE id = ?").bind(r2Key, item.id).run()

      const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 512,
          messages: [{ role: 'user', content: `Analyze this content and respond ONLY with JSON, no preamble:\n\nTitle: ${item.title}\nURL: ${item.url}\n\nContent: ${rawText.slice(0, 3000)}\n\nJSON format:\n{"tldr":"2-3 sentence summary","key_points":["point1","point2"],"tags":["tag1","tag2"],"relevance_to_ai_agency":0.0,"relevance_reason":"one sentence","action_suggestions":["suggestion"]}` }],
        }),
      })
      const anthropicData = await anthropicRes.json() as any
      const rawSummary = anthropicData.content?.[0]?.text ?? '{}'
      let summaryJson: any = {}
      try { summaryJson = JSON.parse(rawSummary) } catch { summaryJson = { tldr: rawSummary, tags: [], key_points: [], relevance_to_ai_agency: 0.5, action_suggestions: [] } }

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

async function runVectorize(env: CloudflareEnv, batchSize = 5) {
  if (!env.AI || !env.KNOWLEDGE_VECTORIZE) return { vectorized: 0, results: [] }
  const items = await env.DB.prepare(
    "SELECT * FROM research_queue WHERE status = 'summarized' ORDER BY relevance_score DESC LIMIT ?"
  ).bind(batchSize).all()
  const results: { id: string; vectorId: string }[] = []
  for (const item of items.results as any[]) {
    try {
      const summary = JSON.parse(item.summary_json ?? '{}')
      const text = [`Title: ${item.title}`, `Summary: ${summary.tldr ?? ''}`, `Tags: ${(summary.tags ?? []).join(', ')}`].join('\n')
      const embedResult = await env.AI.run('@cf/baai/bge-base-en-v1.5', { text: [text] }) as { data: number[][] }
      const vector = embedResult.data[0]
      if (!vector) throw new Error('empty embedding')
      const vectorId = `research-${item.id}`
      await env.KNOWLEDGE_VECTORIZE.upsert([{ id: vectorId, values: vector, metadata: { type: 'research', title: item.title, url: item.url, relevance_score: item.relevance_score } }])
      await env.DB.prepare(`UPDATE research_queue SET status = 'vectorized', vector_id = ? WHERE id = ?`).bind(vectorId, item.id).run()
      results.push({ id: item.id, vectorId })
    } catch (err) {
      await env.DB.prepare(`UPDATE research_queue SET status = 'failed', error_log = ? WHERE id = ?`).bind(`vectorize: ${String(err)}`, item.id).run()
    }
  }
  return { vectorized: results.length, results }
}

async function runDigest(env: CloudflareEnv, apiKey: string) {
  const today = new Date().toISOString().slice(0, 10)
  const existing = await env.DB.prepare('SELECT id FROM research_digests WHERE digest_date = ?').bind(today).first()
  if (existing) return { message: 'Digest already exists for today', date: today }

  const items = await env.DB.prepare(
    `SELECT rq.*, rs.source_name FROM research_queue rq LEFT JOIN research_sources rs ON rq.source_id = rs.id
     WHERE rq.status IN ('summarized','vectorized') AND rq.collected_at > (unixepoch() - 172800)
     ORDER BY rq.relevance_score DESC LIMIT 10`
  ).all()

  if (!items.results.length) return { message: 'No items ready for digest', date: today }

  const context = (items.results as any[]).slice(0, 5).map((item, i) => {
    const s = JSON.parse(item.summary_json ?? '{}')
    return `${i+1}. ${item.title} (${item.source_name} · ${Math.round((item.relevance_score ?? 0)*100)}% relevance)\n   ${s.tldr ?? ''}\n   Action: ${(s.action_suggestions ?? [])[0] ?? 'n/a'}`
  }).join('\n\n')

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      messages: [{ role: 'user', content: `Write a morning intelligence brief for an AI agency operator. Date: ${today}\n\nTop research items:\n${context}\n\nFormat as clean markdown. Direct and actionable. Under 300 words.` }],
    }),
  })
  const data = await res.json() as any
  const markdown = data.content?.[0]?.text ?? 'Digest generation failed'

  const digestId = crypto.randomUUID()
  const itemIds = (items.results as any[]).slice(0, 5).map((i: any) => i.id)
  await env.DB.prepare(
    `INSERT INTO research_digests (id, digest_date, item_count, item_ids, digest_markdown, created_at) VALUES (?, ?, ?, ?, ?, unixepoch())`
  ).bind(digestId, today, itemIds.length, JSON.stringify(itemIds), markdown).run()
  await env.R2.put(`research/digests/${today}.md`, markdown, { httpMetadata: { contentType: 'text/plain' } })
  return { digestId, date: today, itemCount: itemIds.length, digest: markdown }
}

// ── GET: status ──
export async function GET() {
  try {
    const env = (await getCloudflareContext()).env as unknown as CloudflareEnv
    const [sources, queueStats, latestDigest] = await Promise.all([
      env.DB.prepare('SELECT * FROM research_sources ORDER BY source_type, source_name').all(),
      env.DB.prepare('SELECT status, COUNT(*) as count FROM research_queue GROUP BY status').all(),
      env.DB.prepare('SELECT digest_date, item_count, created_at FROM research_digests ORDER BY digest_date DESC LIMIT 1').first(),
    ])
    return NextResponse.json({ ok: true, sources: sources.results, queue: queueStats.results, latest_digest: latestDigest })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}

// ── POST: run full pipeline inline (no self-fetch) ──
export async function POST(req: NextRequest) {
  try {
    const env = (await getCloudflareContext()).env as unknown as CloudflareEnv
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return NextResponse.json({ ok: false, error: 'ANTHROPIC_API_KEY not set' }, { status: 503 })

    const body = await req.json().catch(() => ({})) as { skip_fetch?: boolean; batch_size?: number }
    const pipeline: { step: string; result: any }[] = []

    // Step 1: Fetch RSS
    if (body.skip_fetch !== true) {
      const fetchResult = await runFetch(env, 5)
      pipeline.push({ step: 'fetch', result: { ok: true, results: fetchResult } })
    }

    // Step 2+3: Summarize
    const summarizeResult = await runSummarize(env, apiKey, body.batch_size ?? 3)
    pipeline.push({ step: 'summarize', result: { ok: true, processed: summarizeResult.length, results: summarizeResult } })

    // Step 4: Vectorize
    const vectorizeResult = await runVectorize(env, 5)
    pipeline.push({ step: 'vectorize', result: { ok: true, ...vectorizeResult } })

    // Step 5: Digest
    const digestResult = await runDigest(env, apiKey)
    pipeline.push({ step: 'digest', result: { ok: true, ...digestResult } })

    return NextResponse.json({ ok: true, pipeline })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
