/**
 * GET /api/design/launch
 * Reads the current user session and redirects to the design Worker
 * with the access token so the user lands directly on Design Build.
 *
 * Optional: ?brief=<briefId> to open a specific brief canvas directly.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

const DESIGN_WORKER = 'https://design.connorpattern.workers.dev'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session?.access_token) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  const url = new URL(req.nextUrl)
  const briefId = url.searchParams.get('brief')

  // Build the design Worker URL
  // ?token= sets the httpOnly cookie on the design Worker and redirects to clean URL
  const destination = new URL(DESIGN_WORKER)
  destination.searchParams.set('token', session.access_token)

  // If a briefId was passed, add it as a redirect target after auth
  if (briefId) {
    destination.searchParams.set('next', `/design/${briefId}`)
  }

  return NextResponse.redirect(destination)
}
