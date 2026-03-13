import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

/**
 * updateSession — JWT refresh helper with full role-based routing.
 *
 * Runs on every request matching proxy.ts config. Refreshes the Supabase
 * session cookie when the access token is about to expire, and enforces
 * role-based routing:
 *
 * AUTH-05 route guard logic:
 *
 *   Unauthenticated:
 *   - /portal/* (except /portal/login)  → redirect to /portal/login
 *   - Any other protected path          → redirect to /login
 *
 *   Authenticated — landing redirects (already-authed users hitting login):
 *   - owner/office hitting /login or /signup → redirect to /dashboard
 *   - tech hitting /login or /signup         → redirect to /routes
 *   - customer hitting /login or /signup     → redirect to /portal
 *
 *   Authenticated — role-based access enforcement:
 *   - customer hitting /(app)/* (staff routes) → redirect to /portal
 *   - (Further staff role restrictions — e.g. tech hitting /dashboard — are
 *     handled at the layout/page level for fine-grained control.)
 *
 * SECURITY: Uses getClaims() to validate JWT signature locally (does not
 * trust the cookie blindly). See: https://supabase.com/docs/guides/auth/server-side/nextjs
 */

/**
 * Reserved subdomains that are NOT company portal subdomains.
 * Requests from these hosts will not have x-portal-slug set.
 */
const RESERVED_SUBDOMAINS = new Set(["www", "app", "api", "portal", "admin"])

/**
 * extractPortalSubdomain — parses a company slug from the request host.
 *
 * Examples:
 * - "bluewavepools.poolco.app" → "bluewavepools"
 * - "app.poolco.app"           → null (reserved)
 * - "localhost:3000"           → null (dev)
 * - "poolco.app"               → null (root domain, no subdomain)
 *
 * The portal layout reads the x-portal-slug header injected here to
 * resolve the org without requiring auth (for the login page branding).
 */
export function extractPortalSubdomain(host: string): string | null {
  // Strip port if present
  const hostname = host.split(":")[0]

  // Must be at least a.b.c to have a subdomain
  const parts = hostname.split(".")
  if (parts.length < 3) return null

  const subdomain = parts[0]

  // Skip reserved subdomains
  if (RESERVED_SUBDOMAINS.has(subdomain)) return null

  return subdomain
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  // Extract portal subdomain from host and pass as header for portal pages
  const host = request.headers.get("host") ?? ""
  const portalSlug = extractPortalSubdomain(host)

  if (portalSlug) {
    // Clone headers to add our custom header
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set("x-portal-slug", portalSlug)
    supabaseResponse = NextResponse.next({
      request: { headers: requestHeaders },
    })
  }

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
  const { data: claimsData } = await supabase.auth.getClaims()
  const isAuthenticated = claimsData !== null && claimsData.claims !== null

  const { pathname } = request.nextUrl

  // ─── Path classification ───────────────────────────────────────────────────

  const isPortalPath = pathname.startsWith("/portal")
  const isPortalLoginPath =
    pathname === "/portal/login" || pathname.startsWith("/portal/login/")
  const isAuthCallbackPath = pathname.startsWith("/auth/portal-callback")
  const isStaffLoginPath =
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/reset-password") ||
    pathname.startsWith("/auth")

  // ─── Unauthenticated users ─────────────────────────────────────────────────

  if (!isAuthenticated) {
    // Portal callback is public (it's how you log in)
    if (isAuthCallbackPath) {
      return supabaseResponse
    }

    // Portal paths (except portal login) require portal auth
    if (isPortalPath && !isPortalLoginPath) {
      const url = request.nextUrl.clone()
      url.pathname = "/portal/login"
      return NextResponse.redirect(url)
    }

    // All other protected paths (staff app) require staff auth
    if (!isPortalPath && !isStaffLoginPath) {
      const url = request.nextUrl.clone()
      url.pathname = "/login"
      return NextResponse.redirect(url)
    }

    // Auth pages — allow through
    return supabaseResponse
  }

  // ─── Authenticated users ───────────────────────────────────────────────────

  const user_role = claimsData?.claims?.["user_role"] as
    | "owner"
    | "office"
    | "tech"
    | "customer"
    | undefined

  // Redirect authenticated users away from login/signup (already authed)
  if (isStaffLoginPath) {
    const url = request.nextUrl.clone()
    if (user_role === "tech") {
      url.pathname = "/routes"
    } else if (user_role === "customer") {
      url.pathname = "/portal"
    } else {
      // owner, office
      url.pathname = "/dashboard"
    }
    return NextResponse.redirect(url)
  }

  // Redirect authenticated customers away from portal login
  if (isPortalLoginPath && user_role === "customer") {
    const url = request.nextUrl.clone()
    url.pathname = "/portal"
    return NextResponse.redirect(url)
  }

  // Customers should not access staff routes
  if (!isPortalPath && user_role === "customer") {
    const url = request.nextUrl.clone()
    url.pathname = "/portal"
    return NextResponse.redirect(url)
  }

  // Staff (non-customers) should not access portal routes (except portal login)
  // Exception: staff CAN visit portal as a support/admin action — omit this redirect
  // to keep the proxy simple. Page-level auth handles further restrictions.

  return supabaseResponse
}
