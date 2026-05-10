import { NextRequest, NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { CloudflareEnv } from '@/types'

// Toggle a pipeline kill switch
export async function POST(req: NextRequest) {
  try {
    const env = (await getCloudflareContext()).env as unknown as CloudflareEnv
    const body = await req.json() as { key: string; value: boolean }
    await env.DB.prepare(
      `UPDATE pipeline_config SET value = ?, updated_at = unixepoch() WHERE key = ?`
    ).bind(body.value ? '1' : '0', body.key).run()
    return NextResponse.json({ ok: true, key: body.key, value: body.value })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}

export async function GET() {
  try {
    const env = (await getCloudflareContext()).env as unknown as CloudflareEnv
    const result = await env.DB.prepare('SELECT * FROM pipeline_config ORDER BY key').all()
    return NextResponse.json({ ok: true, config: result.results })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
