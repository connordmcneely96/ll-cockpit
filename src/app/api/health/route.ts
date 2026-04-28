import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

export async function GET() {
  const checks: Record<string, 'ok' | 'error' | 'missing'> = {};
  let allHealthy = true;

  // D1 check
  try {
    const { env } = await getCloudflareContext();
    const result = await env.DB.prepare('SELECT 1 AS ok').first<{ ok: number }>();
    checks.d1 = result?.ok === 1 ? 'ok' : 'error';
  } catch {
    checks.d1 = 'error';
    allHealthy = false;
  }

  // KV check
  try {
    const { env } = await getCloudflareContext();
    await env.KV.get('__health__'); // null return is fine — just confirms binding works
    checks.kv = 'ok';
  } catch {
    checks.kv = 'error';
    allHealthy = false;
  }

  // Supabase env check
  try {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_ANON_KEY;
    if (!url || !key) {
      checks.supabase = 'missing';
      allHealthy = false;
    } else {
      checks.supabase = 'ok';
    }
  } catch {
    checks.supabase = 'error';
    allHealthy = false;
  }

  return NextResponse.json(
    {
      status: allHealthy ? 'ok' : 'degraded',
      checks,
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    },
    { status: allHealthy ? 200 : 503 }
  );
}
