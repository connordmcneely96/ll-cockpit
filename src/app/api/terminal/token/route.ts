import { NextResponse } from 'next/server'

// Server-side only — returns a short-lived token for the terminal WebSocket
// TERMINAL_SECRET never touches the browser bundle
export async function GET() {
  const secret = process.env.TERMINAL_SECRET
  if (!secret) {
    return NextResponse.json({ ok: false, error: 'TERMINAL_SECRET not configured' }, { status: 503 })
  }
  return NextResponse.json({
    ok: true,
    token: secret,
    wsUrl: 'wss://terminal.leadershiplegacydigital.com',
  })
}
