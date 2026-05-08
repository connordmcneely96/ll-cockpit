import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    ok: true,
    configured: !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
    oauth: {
      client_id: !!process.env.GITHUB_CLIENT_ID,
      client_secret: !!process.env.GITHUB_CLIENT_SECRET,
    },
    app: {
      app_id: !!process.env.GITHUB_APP_ID,
      private_key: !!process.env.GITHUB_PRIVATE_KEY,
    },
  })
}
