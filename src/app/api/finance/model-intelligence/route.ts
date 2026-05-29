import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'

export async function GET() {
  try {
    const { env } = await getCloudflareContext()
    const result = await env.DB.prepare(
      `SELECT model_key, COUNT(*) AS calls, SUM(cost_usd) AS cost, AVG(latency_ms) AS avg_latency,
       SUM(input_tokens+output_tokens) AS tokens
       FROM ai_completions GROUP BY model_key ORDER BY cost DESC`
    ).all<{ model_key: string; calls: number; cost: number; avg_latency: number; tokens: number }>()
    return NextResponse.json({ ok: true, models: result.results })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
