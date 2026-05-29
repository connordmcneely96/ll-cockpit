import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'

export async function GET() {
  try {
    const { env } = await getCloudflareContext()
    const monthStart = new Date()
    monthStart.setDate(1); monthStart.setHours(0,0,0,0)
    const ms = monthStart.toISOString().slice(0,19).replace('T',' ')

    const spend = await env.DB.prepare(
      `SELECT COALESCE(SUM(cost_usd),0) AS spend, COALESCE(SUM(input_tokens+output_tokens),0) AS tokens FROM ai_completions WHERE created_at >= ?`
    ).bind(ms).first<{ spend: number; tokens: number }>()

    const rev = await env.DB.prepare(
      `SELECT COALESCE(SUM(amount_usd),0) AS mrr FROM revenue WHERE status='paid' AND created_at >= ?`
    ).bind(ms).first<{ mrr: number }>()

    const tx = await env.DB.prepare(
      `SELECT COALESCE(SUM(CASE WHEN direction='in' THEN amount_usd ELSE -amount_usd END),0) AS net FROM finance_transactions WHERE date >= ?`
    ).bind(ms.slice(0,10)).first<{ net: number }>()

    const aiSpend = spend?.spend ?? 0
    const netCashflow = (rev?.mrr ?? 0) + (tx?.net ?? 0) - aiSpend

    return NextResponse.json({
      ok: true,
      aiSpendMtd: aiSpend,
      tokensMtd: spend?.tokens ?? 0,
      mrr: rev?.mrr ?? 0,
      netCashflow,
    })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
