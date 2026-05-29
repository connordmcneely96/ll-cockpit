import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'

export async function GET(req: Request) {
  try {
    const { env } = await getCloudflareContext()
    const dir = new URL(req.url).searchParams.get('direction')
    const base = 'SELECT * FROM finance_transactions'
    const stmt = dir && dir !== 'all'
      ? env.DB.prepare(`${base} WHERE direction=? ORDER BY date DESC LIMIT 200`).bind(dir)
      : env.DB.prepare(`${base} ORDER BY date DESC LIMIT 200`)
    const result = await stmt.all()
    return NextResponse.json({ ok: true, transactions: result.results })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const { env } = await getCloudflareContext()
    const body = await req.json() as { rows: { date: string; description: string; amount: number; direction: string }[] }
    if (!Array.isArray(body.rows) || body.rows.length === 0) {
      return NextResponse.json({ ok: false, error: 'No rows provided' }, { status: 400 })
    }
    let inserted = 0
    for (const r of body.rows) {
      if (!r.date || !r.description || typeof r.amount !== 'number') continue
      await env.DB.prepare(
        `INSERT INTO finance_transactions (id, date, description, amount_usd, direction, source) VALUES (?, ?, ?, ?, ?, 'csv')`
      ).bind(crypto.randomUUID(), r.date, r.description, Math.abs(r.amount), r.direction === 'in' ? 'in' : 'out').run()
      inserted++
    }
    return NextResponse.json({ ok: true, inserted })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
