import { getCloudflareContext } from '@opennextjs/cloudflare'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ key: string[] }> }
) {
  try {
    const { env } = await getCloudflareContext()
    const { key } = await params
    const fullKey = key.join('/')
    const object = await env.R2.get(fullKey)
    if (!object) {
      return new Response('not found', { status: 404 })
    }
    const headers = new Headers()
    headers.set(
      'Content-Type',
      object.httpMetadata?.contentType ?? 'application/octet-stream'
    )
    headers.set('Cache-Control', 'public, max-age=3600')
    return new Response(object.body, { headers })
  } catch {
    return new Response('error', { status: 500 })
  }
}
