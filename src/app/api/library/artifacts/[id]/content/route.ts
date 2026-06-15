import { getCloudflareContext } from '@opennextjs/cloudflare'

// Streams an artifact's stored document from R2 for inline preview / download.
// Middleware gates /api/library/* (not a public path), matching the sibling
// list route — no explicit auth check here.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { env } = await getCloudflareContext()

    const row = await env.DB.prepare(
      `SELECT artifact_name, storage_type, storage_ref, format FROM artifact_registry WHERE id = ?`,
    )
      .bind(id)
      .first<{ artifact_name: string | null; storage_type: string | null; storage_ref: string | null; format: string | null }>()

    if (!row) return new Response('Artifact not found', { status: 404 })
    if (row.storage_type !== 'r2' || !row.storage_ref) {
      return new Response('Artifact has no previewable R2 content', { status: 415 })
    }

    const obj = await env.R2.get(row.storage_ref)
    if (!obj) return new Response('Stored object missing in R2', { status: 404 })

    const fmt = row.format ?? 'md'
    // md served as text/plain so it renders inline in a tab instead of downloading.
    const ctype =
      fmt === 'html' ? 'text/html; charset=utf-8'
      : fmt === 'json' ? 'application/json; charset=utf-8'
      : 'text/plain; charset=utf-8'

    const headers: Record<string, string> = {
      'Content-Type': ctype,
      'Cache-Control': 'private, no-store',
      // Render generated HTML faithfully (scripts run) but in an isolated origin —
      // a sandboxed document cannot touch our cookies / same-origin context.
      'Content-Security-Policy': 'sandbox allow-scripts allow-popups allow-forms',
    }

    if (new URL(req.url).searchParams.get('download') === '1') {
      const ext = fmt === 'html' ? 'html' : fmt === 'json' ? 'json' : 'md'
      const safe = (row.artifact_name || 'artifact').replace(/[^a-z0-9._-]+/gi, '_')
      headers['Content-Disposition'] = `attachment; filename="${safe}.${ext}"`
    }

    return new Response(obj.body, { headers })
  } catch (err) {
    return new Response(String(err), { status: 500 })
  }
}
