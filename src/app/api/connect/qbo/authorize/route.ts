import { NextResponse } from "next/server"
import { getCurrentUser } from "@/actions/auth"
import OAuthClient from "intuit-oauth"
import { randomBytes } from "crypto"
import { cookies } from "next/headers"

/**
 * GET /api/connect/qbo/authorize
 *
 * Initiates the QuickBooks Online OAuth2 authorization flow.
 * Owner-only. Generates the Intuit authorization URL with CSRF state token
 * and redirects the user to Intuit for consent.
 */
export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }
    if (user.role !== "owner") {
      return NextResponse.json(
        { error: "Only owners can connect QuickBooks" },
        { status: 403 }
      )
    }

    const clientId = process.env.INTUIT_CLIENT_ID
    const clientSecret = process.env.INTUIT_CLIENT_SECRET
    const redirectUri = process.env.INTUIT_REDIRECT_URI

    if (!clientId || !clientSecret || !redirectUri) {
      return NextResponse.json(
        { error: "QuickBooks integration is not configured. Missing environment variables." },
        { status: 500 }
      )
    }

    const oauthClient = new OAuthClient({
      clientId,
      clientSecret,
      environment:
        process.env.QBO_SANDBOX === "true" ? "sandbox" : "production",
      redirectUri,
    })

    // Generate CSRF state token
    const state = randomBytes(16).toString("hex")

    // Store state in an httpOnly cookie for validation in callback
    const cookieStore = await cookies()
    cookieStore.set("qbo_oauth_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600, // 10 minutes
      path: "/",
    })

    const authUrl = oauthClient.authorizeUri({
      scope: [OAuthClient.scopes.Accounting],
      state,
    })

    return NextResponse.redirect(authUrl)
  } catch (err) {
    console.error("[qbo/authorize] Error:", err)
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to initiate QBO authorization",
      },
      { status: 500 }
    )
  }
}
