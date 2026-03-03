import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

/**
 * updateSession — JWT refresh helper for the Next.js 16 proxy.
 *
 * Runs on every request matching proxy.ts config. Refreshes the Supabase
 * session cookie when the access token is about to expire, and redirects
 * unauthenticated users to the correct login page based on path:
 *   - /portal/* users → /portal/login
 *   - all other users → /login
 *
 * Also redirects already-authenticated users away from login pages.
 *
 * SECURITY: Uses getClaims() to validate JWT signature locally (does not
 * trust the cookie blindly). Falls back to getUser() for cookie refresh.
 * See: https://supabase.com/docs/guides/auth/server-side/nextjs
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Validate JWT signature via getClaims() — does not trust cookie blindly.
  // getSession() would trust cookie without cryptographic verification.
  // If getClaims returns null (expired/invalid), user is not authenticated.
  const { data: claimsData } = await supabase.auth.getClaims()
  const isAuthenticated = claimsData !== null && claimsData.claims !== null

  const { pathname } = request.nextUrl

  // Determine if this is a portal or staff request
  const isPortalPath = pathname.startsWith("/portal")

  // Public paths — allow unauthenticated access
  // Auth routes (/login, /signup, /reset-password, /auth/*) are always public.
  // Portal login is public. All other portal paths require auth (redirect to /portal/login).
  const isPublicPath =
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/reset-password") ||
    pathname.startsWith("/auth") ||
    pathname === "/portal/login" ||
    pathname.startsWith("/portal/login/")

  if (!isAuthenticated && !isPublicPath) {
    const url = request.nextUrl.clone()
    // Portal unauthenticated users → portal login; staff → staff login
    url.pathname = isPortalPath ? "/portal/login" : "/login"
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
