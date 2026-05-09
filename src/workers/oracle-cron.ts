import type { CloudflareEnv } from '@/types'

// ── ORACLE Cron Handler ──
// Runs on Cloudflare Cron Triggers (see wrangler.toml [triggers])
// Schedule: 0 13 * * * = 7am CST daily (full pipeline)
//           0 * * * *  = every hour (fetch only)
//
// This file is imported by open-next.config.ts as a scheduled handler.
// It runs the same logic as /api/oracle/pipeline but as a background Worker.

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

async function fetchSources(env: CloudflareEnv, limit = 5) {
  const sources = await env.DB.prepare('SELECT * FROM research_sources WHERE active = 1').all()
  let totalEnqueued = 0
  for (const source of sources.results as any[]) {
    try {
      const res = await fetch(source.source_url, {
        headers: { 'User-Agent': 'Mozilla/5.0 NEXUS-ORACLE/1.0' },
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) continue
      const xml = await res.text()
      const items = parseRSSItems(xml).slice(0, limit)
      for (const item of items) {
        const existing = await env.DB.prepare(
          'SELECT id FROM research_queue WHERE source_id = ? AND external_id = ?'
        ).bind(source.id, item.guid).first()
        if (existing) continue
        await env.DB.prepare(
          `INSERT INTO research_queue (id, source_id, external_id, title, url, status, collected_at)
           VALUES (?, ?, ?, ?, ?, 'pending', unixepoch())`
        ).bind(crypto.randomUUID(), source.id, item.guid, item.title, item.link).run()
        totalEnqueued++
      }
      await env.DB.prepare('UPDATE research_sources SET last_checked = unixepoch() WHERE id = ?').bind(source.id).run()
    } catch { /* continue */ }
  }
  console.log(`[ORACLE cron] Fetched sources, enqueued ${totalEnqueued} new items`)
}

async function summarizePending(env: CloudflareEnv, batchSize = 10) {
  if (!env.AI) return
  const items = await env.DB.prepare(
    "SELECT * FROM research_queue WHERE status = 'pending' ORDER BY collected_at DESC LIMIT ?"
  ).bind(batchSize).all()
  let summarized = 0
  for (const item of items.results as any[]) {
    try {
      await env.DB.prepare("UPDATE research_queue SET status = 'fetching' WHERE id = ?").bind(item.id).run()
      let rawText = `Title: ${item.title}\nURL: ${item.url}`
      try {
        const pageRes = await fetch(item.url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(6000) })
        const html = await pageRes.text()
        const stripped = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 4000)
        if (stripped.length > 100) rawText = stripped
      } catch { /* use title fallback */ }

      const r2Key = `research/raw/${item.id}.txt`
      await env.R2.put(r2Key, rawText, { httpMetadata: { contentType: 'text/plain' } })
      await env.DB.prepare("UPDATE research_queue SET status = 'summarizing', raw_r2_key = ? WHERE id = ?").bind(r2Key, item.id).run()

      const aiResult = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
        messages: [{ role: 'user', content: `Analyze this content. Output ONLY valid JSON:\n{"tldr":"2 sentence summary","key_points":["p1","p2","p3"],"tags":["t1","t2"],"relevance_to_ai_agency":0.7,"relevance_reason":"one sentence","action_suggestions":["action 1"]}\n\nTitle: ${item.title}\nContent: ${rawText.slice(0, 2500)}` }],
        max_tokens: 400,
      }) as { response?: string }

      let summaryJson: any = { tldr: item.title, tags: [], key_points: [], relevance_to_ai_agency: 0.5, action_suggestions: [] }
      try {
        const jsonMatch = (aiResult.response ?? '').match(/\{[\s\S]*\}/)
        if (jsonMatch) summaryJson = JSON.parse(jsonMatch[0])
      } catch { /* use defaults */ }

      await env.DB.prepare(
        `UPDATE research_queue SET status = 'summarized', summary_json = ?, relevance_score = ?, processed_at = unixepoch() WHERE id = ?`
      ).bind(JSON.stringify(summaryJson), summaryJson.relevance_to_ai_agency ?? 0.5, item.id).run()
      summarized++
    } catch (err) {
      await env.DB.prepare(`UPDATE research_queue SET status = 'failed', error_log = ? WHERE id = ?`).bind(String(err), item.id).run()
    }
  }
  console.log(`[ORACLE cron] Summarized ${summarized} items`)
}

async function vectorizeSummarized(env: CloudflareEnv, batchSize = 10) {
  if (!env.AI || !env.KNOWLEDGE_VECTORIZE) return
  const items = await env.DB.prepare(
    "SELECT * FROM research_queue WHERE status = 'summarized' ORDER BY relevance_score DESC LIMIT ?"
  ).bind(batchSize).all()
  let vectorized = 0
  for (const item of items.results as any[]) {
    try {
      const summary = JSON.parse(item.summary_json ?? '{}')
      const text = `Title: ${item.title}\nSummary: ${summary.tldr ?? ''}\nTags: ${(summary.tags ?? []).join(', ')}`
      const embedResult = await env.AI.run('@cf/baai/bge-base-en-v1.5', { text: [text] }) as { data: number[][] }
      const vector = embedResult.data[0]
      if (!vector) continue
      const vectorId = `research-${item.id}`
      await env.KNOWLEDGE_VECTORIZE.upsert([{ id: vectorId, values: vector, metadata: { type: 'research', title: item.title, url: item.url, relevance_score: item.relevance_score } }])
      await env.DB.prepare(`UPDATE research_queue SET status = 'vectorized', vector_id = ? WHERE id = ?`).bind(vectorId, item.id).run()
      vectorized++
    } catch (err) {
      await env.DB.prepare(`UPDATE research_queue SET status = 'failed', error_log = ? WHERE id = ?`).bind(`vectorize: ${String(err)}`, item.id).run()
    }
  }
  console.log(`[ORACLE cron] Vectorized ${vectorized} items`)
}

async function generateDigest(env: CloudflareEnv, apiKey: string) {
  const today = new Date().toISOString().slice(0, 10)
  const existing = await env.DB.prepare('SELECT id FROM research_digests WHERE digest_date = ?').bind(today).first()
  if (existing) { console.log('[ORACLE cron] Digest already exists for today'); return }

  const items = await env.DB.prepare(
    `SELECT rq.*, rs.source_name FROM research_queue rq LEFT JOIN research_sources rs ON rq.source_id = rs.id
     WHERE rq.status IN ('summarized','vectorized') AND rq.collected_at > (unixepoch() - 172800)
     ORDER BY rq.relevance_score DESC LIMIT 10`
  ).all()
  if (!items.results.length) { console.log('[ORACLE cron] No items ready for digest'); return }

  const context = (items.results as any[]).slice(0, 5).map((item: any, i: number) => {
    const s = JSON.parse(item.summary_json ?? '{}')
    return `${i+1}. **${item.title}** (${item.source_name} · ${Math.round((item.relevance_score ?? 0)*100)}% relevance)\n   ${s.tldr ?? ''}\n   Action: ${(s.action_suggestions ?? [])[0] ?? 'n/a'}`
  }).join('\n\n')

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 800, messages: [{ role: 'user', content: `Morning intelligence brief for an AI agency operator.\nDate: ${today}\n\nTop items:\n${context}\n\nClean markdown. Direct. Under 300 words.` }] }),
  })
  const data = await res.json() as any
  const markdown = data.content?.[0]?.text ?? 'Digest generation failed'
  const digestId = crypto.randomUUID()
  const itemIds = (items.results as any[]).slice(0, 5).map((i: any) => i.id)
  await env.DB.prepare(`INSERT INTO research_digests (id, digest_date, item_count, item_ids, digest_markdown, created_at) VALUES (?, ?, ?, ?, ?, unixepoch())`).bind(digestId, today, itemIds.length, JSON.stringify(itemIds), markdown).run()
  await env.R2.put(`research/digests/${today}.md`, markdown, { httpMetadata: { contentType: 'text/plain' } })
  console.log(`[ORACLE cron] Digest generated for ${today} with ${itemIds.length} items`)
}

// ── Scheduled handler — called by Cloudflare Cron Trigger ──
export async function scheduled(event: ScheduledEvent, env: CloudflareEnv, ctx: ExecutionContext) {
  const cron = event.cron
  const isFullRun = cron === '0 13 * * *'  // 7am CST
  const isHourly  = cron === '0 * * * *'   // every hour

  console.log(`[ORACLE cron] Triggered: ${cron} (${isFullRun ? 'full pipeline' : 'fetch only'})`)

  const apiKey = (env as any).ANTHROPIC_API_KEY

  if (isHourly || isFullRun) {
    // Always fetch new items
    await fetchSources(env, 5)
  }

  if (isFullRun) {
    // 7am run: summarize + vectorize + digest
    await summarizePending(env, 15)
    await vectorizeSummarized(env, 15)
    if (apiKey) await generateDigest(env, apiKey)
  }

  console.log('[ORACLE cron] Complete')
}
