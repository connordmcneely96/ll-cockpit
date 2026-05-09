import { NextRequest, NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'

// ORACLE Step 1 — Fetch RSS feed and enqueue items
export async function POST(req: NextRequest) {
  try {
    const { env } = await getCloudflareContext()
    const body = await req.json() as { source_id?: string; limit?: number }
    const limit = body.limit ?? 10

    // Get active RSS sources
    const sources = body.source_id
      ? await env.DB.prepare('SELECT * FROM research_sources WHERE id = ? AND active = 1').bind(body.source_id).all()
      : await env.DB.prepare("SELECT * FROM research_sources WHERE active = 1 AND source_type = 'rss'").all()

    const results: { source: string; enqueued: number; errors: string[] }[] = []

    for (const source of sources.results as any[]) {
      const enqueued: string[] = []
      const errors: string[] = []

      try {
        // Fetch RSS
        const res = await fetch(source.source_url, {
          headers: { 'User-Agent': 'NEXUS-ORACLE/1.0 Research Pipeline' },
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const xml = await res.text()

        // Parse items from XML
        const items = parseRSSItems(xml).slice(0, limit)

        for (const item of items) {
          // Skip if already in queue
          const existing = await env.DB.prepare(
            'SELECT id FROM research_queue WHERE source_id = ? AND external_id = ?'
          ).bind(source.id, item.guid).first()
          if (existing) continue

          const id = crypto.randomUUID()
          await env.DB.prepare(
            `INSERT INTO research_queue (id, source_id, external_id, title, url, status, collected_at)
             VALUES (?, ?, ?, ?, ?, 'pending', unixepoch())`
          ).bind(id, source.id, item.guid, item.title, item.link).run()
          enqueued.push(id)
        }

        // Update last_checked
        await env.DB.prepare(
          'UPDATE research_sources SET last_checked = unixepoch() WHERE id = ?'
        ).bind(source.id).run()

        results.push({ source: source.source_name, enqueued: enqueued.length, errors })
      } catch (err) {
        results.push({ source: source.source_name, enqueued: 0, errors: [String(err)] })
      }
    }

    return NextResponse.json({ ok: true, results })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}

export async function GET() {
  try {
    const { env } = await getCloudflareContext()
    const sources = await env.DB.prepare('SELECT * FROM research_sources ORDER BY source_type, source_name').all()
    const queue = await env.DB.prepare(
      `SELECT status, COUNT(*) as count FROM research_queue GROUP BY status`
    ).all()
    return NextResponse.json({ ok: true, sources: sources.results, queue: queue.results })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}

// Minimal RSS XML parser — no dependencies
function parseRSSItems(xml: string): { guid: string; title: string; link: string; pubDate: string }[] {
  const items: { guid: string; title: string; link: string; pubDate: string }[] = []
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi
  let match

  while ((match = itemRegex.exec(xml)) !== null) {
    const item = match[1]
    const get = (tag: string) => {
      const m = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\/${tag}>|<${tag}[^>]*>([^<]*)<\/${tag}>`, 'i').exec(item)
      return m ? (m[1] || m[2] || '').trim() : ''
    }
    const getLink = () => {
      // Try <link> first, then <guid isPermaLink="true">
      const linkTag = /<link>([^<]+)<\/link>/i.exec(item)
      if (linkTag) return linkTag[1].trim()
      const guid = /<guid[^>]*isPermaLink="true"[^>]*>([^<]+)<\/guid>/i.exec(item)
      if (guid) return guid[1].trim()
      return get('guid')
    }
    const title = get('title')
    const link = getLink()
    const guid = get('guid') || link
    if (title && link) {
      items.push({ guid, title, link, pubDate: get('pubDate') })
    }
  }
  return items
}
