import { NextRequest, NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'

export async function GET(req: NextRequest) {
  try {
    const { env } = await getCloudflareContext()
    const prefix = req.nextUrl.searchParams.get('prefix') ?? ''
    const listed = await env.R2.list({ prefix, limit: 100 })
    const objects = listed.objects.map(o => ({
      key: o.key,
      size: o.size,
      uploaded: o.uploaded,
      etag: o.etag,
    }))
    return NextResponse.json({ ok: true, objects })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
