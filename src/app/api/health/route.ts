import { NextResponse } from 'next/server'
import { getBindings } from '@/lib/cloudflare'

export const runtime = 'edge'

export async function GET() {
  const checks: Record<string, boolean | string> = {
    status: 'ok',
    d1: false,
    kv: false,
    supabase: false,
  }

  try {
    const { DB, KV } = await getBindings()

    // D1 check
    try {
      await DB.prepare('SELECT 1').run()
      checks.d1 = true
    } catch (e) {
      checks.d1_error = e instanceof Error ? e.message : 'unknown'
    }

    // KV check
    try {
      await KV.put('health_check', Date.now().toString(), { expirationTtl: 60 })
      checks.kv = true
    } catch (e) {
      checks.kv_error = e instanceof Error ? e.message : 'unknown'
    }

    // Supabase check (just validate env vars exist)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    checks.supabase = !!supabaseUrl && supabaseUrl.startsWith('https://')
  } catch (e) {
    checks.bindings_error = e instanceof Error ? e.message : 'unknown'
  }

  const allOk = checks.d1 === true && checks.kv === true && checks.supabase === true
  return NextResponse.json(
    { ...checks, timestamp: new Date().toISOString() },
    { status: allOk ? 200 : 503 }
  )
}
