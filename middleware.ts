import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const { pathname } = request.nextUrl

  const isAuthPath = pathname.startsWith('/login') || pathname.startsWith('/auth')

  // Public API routes — no auth required
  // PaaS note: replace with API key validation (x-api-key header) before multi-tenant launch
  //
  // Sprint 18Z bugfix: the feedback POST endpoint is intentionally public —
  // anyone with a brief's preview URL submits notes from the runtime Tweaks
  // Panel without authenticating. Without this exception, the middleware
  // returned a 307 redirect to /login on the OPTIONS preflight (or the POST
  // itself), which the browser surfaced as "Network error" in the panel UI.
  // Pattern: /api/design/briefs/{uuid}/feedback — regex anchors to exactly
  // that shape so adjacent routes still require auth.
  const isPublicApi =
    pathname === '/api/health' ||
    pathname === '/api/knowledge' ||
    /^\/api\/design\/briefs\/[^/]+\/feedback$/.test(pathname)

  if (!user && !isAuthPath && !isPublicApi) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  if (user && pathname === '/login') {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico).*)'],
}
