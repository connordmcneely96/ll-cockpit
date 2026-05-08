import { NextRequest, NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'

const TEXT_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.json', '.css', '.html', '.md', '.sql',
  '.yml', '.yaml', '.txt', '.sh', '.toml', '.env', '.gitignore', '.csv',
  '.xml', '.svg',
])

function getExtension(key: string): string {
  const lastDot = key.lastIndexOf('.')
  if (lastDot === -1) return ''
  const base = key.split('/').pop() ?? key
  const dotIdx = base.lastIndexOf('.')
  if (dotIdx === -1) return ''
  return base.slice(dotIdx).toLowerCase()
}

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key')
  if (!key) {
    return NextResponse.json({ ok: false, error: 'key required' }, { status: 400 })
  }

  const ext = getExtension(key)
  if (!TEXT_EXTENSIONS.has(ext)) {
    return NextResponse.json({ ok: false, error: 'binary file — cannot preview' }, { status: 415 })
  }

  try {
    const { env } = await getCloudflareContext()
    const object = await env.R2.get(key)
    if (!object) {
      return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
    }
    const text = await object.text()
    return NextResponse.json({ ok: true, text, key })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
