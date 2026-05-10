import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { CloudflareEnv } from '@/types'

// GET all stored digests for history browser
export async function GET() {
  try {
    const env = (await getCloudflareContext()).env as unknown as CloudflareEnv
    const digests = await env.DB.prepare(
      'SELECT * FROM research_digests ORDER BY digest_date DESC LIMIT 30'
    ).all()
    return NextResponse.json({ ok: true, digests: digests.results })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
