import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'

export async function GET(req: Request) {
  try {
    const { env } = await getCloudflareContext()
    const p = new URL(req.url).searchParams
    const type = p.get('type'), status = p.get('status'), source = p.get('source')

    const where: string[] = []
    const binds: string[] = []
    if (type && type !== 'all')   { where.push('artifact_type = ?');   binds.push(type) }
    if (status && status !== 'all') { where.push('status = ?');         binds.push(status) }
    if (source && source !== 'all') { where.push('producing_agent = ?'); binds.push(source) }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''

    const list = await env.DB.prepare(
      `SELECT id, producing_agent, artifact_type, artifact_name, storage_type, storage_ref, r2_bucket, format, size_bytes, quality_score, sentinel_pass, status, created_at, pipeline_run_id FROM artifact_registry ${clause} ORDER BY created_at DESC LIMIT 200`
    ).bind(...binds).all()

    const kpi = await env.DB.prepare(
      `SELECT COUNT(*) AS total,
        SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN status='delivered' THEN 1 ELSE 0 END) AS delivered,
        SUM(CASE WHEN sentinel_pass=1 THEN 1 ELSE 0 END) AS validated,
        SUM(CASE WHEN sentinel_pass=0 OR sentinel_pass IS NULL THEN 1 ELSE 0 END) AS unvalidated
       FROM artifact_registry`
    ).first()

    // Distinct values for filter dropdowns
    const types = await env.DB.prepare(`SELECT DISTINCT artifact_type FROM artifact_registry WHERE artifact_type IS NOT NULL`).all<{ artifact_type: string }>()
    const sources = await env.DB.prepare(`SELECT DISTINCT producing_agent FROM artifact_registry WHERE producing_agent IS NOT NULL`).all<{ producing_agent: string }>()

    return NextResponse.json({
      ok: true,
      artifacts: list.results,
      kpi,
      filters: {
        types: types.results.map(t => t.artifact_type),
        sources: sources.results.map(s => s.producing_agent),
      },
    })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
