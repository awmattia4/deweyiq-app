import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

/**
 * Auth callback route — handles three flows:
 *
 * 1. OAuth (Google): Supabase redirects here with ?code= after Google auth
 * 2. Invite acceptance: User clicks email invite link (one-time token, not PKCE)
 * 3. Password recovery: User clicks reset email link (?type=recovery)
 *
 * NOTE: inviteUserByEmail does NOT support PKCE. The invite email contains
 * a direct one-time token rather than a PKCE code. exchangeCodeForSession
 * handles this transparently.
 *
 * Role-based redirect after successful auth:
 * - tech       → /routes
 * - customer   → /portal
 * - owner/office → /dashboard
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const type = searchParams.get("type")

  // No code means something went wrong upstream
  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=no_code`)
  }

  const supabase = await createClient()

  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    console.error("[auth/callback] exchangeCodeForSession error:", error.message)
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`
    )
  }

  // Recovery flow — redirect to set-new-password UI
  if (type === "recovery") {
    return NextResponse.redirect(`${origin}/reset-password?type=recovery`)
  }

  // Read role from the newly-set session claims
  const { data: claimsData } = await supabase.auth.getClaims()
  const role = claimsData?.claims?.["user_role"] as string | undefined

  // Route by role
  if (role === "tech") {
    return NextResponse.redirect(`${origin}/routes`)
  } else if (role === "customer") {
    return NextResponse.redirect(`${origin}/portal`)
  } else {
    // owner, office, or freshly-signed-up user (role set by trigger)
    return NextResponse.redirect(`${origin}/dashboard`)
  }
}
