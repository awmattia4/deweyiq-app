import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/actions/auth"
import { adminDb } from "@/lib/db"
import { orgSettings } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import OAuthClient from "intuit-oauth"
import { cookies } from "next/headers"

/**
 * GET /api/connect/qbo/callback
 *
 * OAuth2 callback handler for QuickBooks Online authorization.
 * Exchanges the authorization code for access + refresh tokens,
 * stores them in org_settings, and redirects to settings page.
 *
 * CRITICAL: Always store the refresh token from the token response.
 * Intuit invalidates old refresh tokens on each exchange.
 */
export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"

  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.redirect(`${appUrl}/settings?qbo=error&reason=auth`)
    }
    if (user.role !== "owner") {
      return NextResponse.redirect(
        `${appUrl}/settings?qbo=error&reason=permission`
      )
    }

    // Validate CSRF state token
    const url = request.nextUrl
    const state = url.searchParams.get("state")
    const cookieStore = await cookies()
    const savedState = cookieStore.get("qbo_oauth_state")?.value

    if (!state || !savedState || state !== savedState) {
      console.error("[qbo/callback] CSRF state mismatch")
      return NextResponse.redirect(
        `${appUrl}/settings?qbo=error&reason=state`
      )
    }

    // Clear the state cookie
    cookieStore.delete("qbo_oauth_state")

    // Check for error response from Intuit
    const error = url.searchParams.get("error")
    if (error) {
      console.error("[qbo/callback] Intuit returned error:", error)
      return NextResponse.redirect(
        `${appUrl}/settings?qbo=error&reason=denied`
      )
    }

    const realmId = url.searchParams.get("realmId")
    if (!realmId) {
      return NextResponse.redirect(
        `${appUrl}/settings?qbo=error&reason=no_realm`
      )
    }

    // Exchange authorization code for tokens
    const oauthClient = new OAuthClient({
      clientId: process.env.INTUIT_CLIENT_ID!,
      clientSecret: process.env.INTUIT_CLIENT_SECRET!,
      environment:
        process.env.QBO_SANDBOX === "true" ? "sandbox" : "production",
      redirectUri: process.env.INTUIT_REDIRECT_URI!,
    })

    const authResponse = await oauthClient.createToken(request.url)
    const token = authResponse.token

    const expiresAt = new Date(Date.now() + token.expires_in * 1000)
    const now = new Date()

    // Store tokens in org_settings
    // Also update payment_provider if needed
    const settingsRows = await adminDb
      .select({
        payment_provider: orgSettings.payment_provider,
      })
      .from(orgSettings)
      .where(eq(orgSettings.org_id, user.org_id))
      .limit(1)

    const currentProvider = settingsRows[0]?.payment_provider ?? "none"
    let newProvider = currentProvider
    if (currentProvider === "none") {
      newProvider = "qbo"
    } else if (currentProvider === "stripe") {
      newProvider = "both"
    }
    // If already 'qbo' or 'both', keep as-is

    await adminDb
      .update(orgSettings)
      .set({
        qbo_realm_id: realmId,
        qbo_access_token: token.access_token,
        qbo_refresh_token: token.refresh_token,
        qbo_token_expires_at: expiresAt,
        qbo_connected: true,
        qbo_last_sync_at: now,
        payment_provider: newProvider,
        updated_at: now,
      })
      .where(eq(orgSettings.org_id, user.org_id))

    return NextResponse.redirect(`${appUrl}/settings?qbo=success`)
  } catch (err) {
    console.error("[qbo/callback] Error:", err)
    return NextResponse.redirect(
      `${appUrl}/settings?qbo=error&reason=exchange`
    )
  }
}
