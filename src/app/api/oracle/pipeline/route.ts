import { NextRequest, NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'

// ORACLE pipeline status + manual trigger
export async function GET() {
  try {
    const { env } = await getCloudflareContext()
    const [sources, queueStats, latestDigest] = await Promise.all([
      env.DB.prepare('SELECT * FROM research_sources ORDER BY source_type, source_name').all(),
      env.DB.prepare('SELECT status, COUNT(*) as count FROM research_queue GROUP BY status').all(),
      env.DB.prepare('SELECT digest_date, item_count, created_at FROM research_digests ORDER BY digest_date DESC LIMIT 1').first(),
    ])
    return NextResponse.json({
      ok: true,
      sources: sources.results,
      queue: queueStats.results,
      latest_digest: latestDigest,
    })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}

// POST — run full pipeline manually
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://ll-cockpit.connorpattern.workers.dev'

    const steps: { step: string; result: any }[] = []

    // Step 1: Fetch RSS sources
    if (body.skip_fetch !== true) {
      const r = await fetch(`${baseUrl}/api/oracle/fetch`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ limit: 5 }) })
      steps.push({ step: 'fetch', result: await r.json() })
    }

    // Step 2+3: Summarize pending items
    const r2 = await fetch(`${baseUrl}/api/oracle/summarize`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ batch_size: 3 }) })
    steps.push({ step: 'summarize', result: await r2.json() })

    // Step 4: Vectorize
    const r3 = await fetch(`${baseUrl}/api/oracle/vectorize`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ batch_size: 5 }) })
    steps.push({ step: 'vectorize', result: await r3.json() })

    // Step 5: Generate digest
    const r4 = await fetch(`${baseUrl}/api/oracle/digest`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    steps.push({ step: 'digest', result: await r4.json() })

    return NextResponse.json({ ok: true, pipeline: steps })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
