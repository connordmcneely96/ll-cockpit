import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'

export async function GET() {
  try {
    const { env } = await getCloudflareContext()
    const result = await env.DB.prepare(
      `SELECT substr(created_at,1,10) AS day, SUM(cost_usd) AS cost, SUM(input_tokens+output_tokens) AS tokens
       FROM ai_completions WHERE created_at >= date('now','-30 days')
       GROUP BY day ORDER BY day ASC`
    ).all<{ day: string; cost: number; tokens: number }>()
    return NextResponse.json({ ok: true, series: result.results })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
