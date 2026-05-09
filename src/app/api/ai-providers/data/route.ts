import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'

export async function GET() {
  try {
    const { env } = await getCloudflareContext()
    const [providers, models, policy] = await Promise.all([
      env.DB.prepare('SELECT * FROM cms_ai_providers ORDER BY provider_key').all(),
      env.DB.prepare('SELECT * FROM cms_ai_models ORDER BY provider_key, lane').all(),
      env.DB.prepare('SELECT * FROM cms_ai_routing_policy WHERE policy_key = ?').bind('default').first(),
    ])
    return NextResponse.json({
      ok: true,
      providers: providers.results,
      models: models.results,
      policy,
    })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
