import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { env } = await getCloudflareContext()
    const artifact = await env.DB.prepare(`SELECT * FROM artifact_registry WHERE id = ?`).bind(id).first()
    if (!artifact) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 })
    const lineage = await env.DB.prepare(
      `SELECT parent_id, child_id, transform FROM artifact_lineage WHERE parent_id = ? OR child_id = ?`
    ).bind(id, id).all()
    return NextResponse.json({ ok: true, artifact, lineage: lineage.results })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
