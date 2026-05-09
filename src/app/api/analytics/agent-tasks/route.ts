import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'

export async function GET() {
  try {
    const { env } = await getCloudflareContext()
    const result = await env.DB.prepare(
      'SELECT * FROM agent_tasks ORDER BY created_at DESC LIMIT 200'
    ).all()
    return NextResponse.json({ ok: true, tasks: result.results })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
