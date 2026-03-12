/**
 * QBO Client Factory — creates QuickBooks Online API client with automatic token refresh.
 *
 * Key patterns:
 * - getQboClient: returns a configured QuickBooks instance for the given org
 * - Token refresh uses Postgres advisory lock to prevent concurrent refresh races
 * - qboPromise: wraps callback-based QuickBooks methods for async/await usage
 * - isQboConnected: quick check for QBO connection status
 *
 * CRITICAL: Always store the NEW refresh token returned from a refresh —
 * the old one is immediately invalidated by Intuit (Research Pitfall 2).
 */

import QuickBooks from "node-quickbooks"
import OAuthClient from "intuit-oauth"
import { adminDb } from "@/lib/db"
import { orgSettings } from "@/lib/db/schema"
import { eq, sql } from "drizzle-orm"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QboConnection {
  realmId: string
  accessToken: string
  refreshToken: string
  tokenExpiresAt: Date
}

// ---------------------------------------------------------------------------
// qboPromise — wraps callback-based QuickBooks methods for async/await
// ---------------------------------------------------------------------------

export function qboPromise<T>(
  fn: (cb: (err: any, result: T) => void) => void
): Promise<T> {
  return new Promise((resolve, reject) =>
    fn((err, result) => (err ? reject(err) : resolve(result)))
  )
}

// ---------------------------------------------------------------------------
// isQboConnected — quick check
// ---------------------------------------------------------------------------

export async function isQboConnected(orgId: string): Promise<boolean> {
  const rows = await adminDb
    .select({ qbo_connected: orgSettings.qbo_connected })
    .from(orgSettings)
    .where(eq(orgSettings.org_id, orgId))
    .limit(1)

  return rows[0]?.qbo_connected ?? false
}

// ---------------------------------------------------------------------------
// getQboClient — creates a configured QuickBooks client
// ---------------------------------------------------------------------------

/**
 * Creates a QuickBooks client for the given org. Automatically refreshes
 * the access token if it's expired or about to expire.
 *
 * Uses a Postgres advisory lock to prevent concurrent token refresh
 * from multiple requests (e.g. parallel webhook + user request).
 *
 * @throws Error if QBO is not connected
 */
export async function getQboClient(orgId: string): Promise<QuickBooks> {
  // 1. Load current QBO connection from org_settings
  const rows = await adminDb
    .select({
      qbo_realm_id: orgSettings.qbo_realm_id,
      qbo_access_token: orgSettings.qbo_access_token,
      qbo_refresh_token: orgSettings.qbo_refresh_token,
      qbo_token_expires_at: orgSettings.qbo_token_expires_at,
      qbo_connected: orgSettings.qbo_connected,
    })
    .from(orgSettings)
    .where(eq(orgSettings.org_id, orgId))
    .limit(1)

  const settings = rows[0]
  if (!settings || !settings.qbo_connected || !settings.qbo_realm_id) {
    throw new Error("QBO not connected")
  }

  let accessToken = settings.qbo_access_token!
  const refreshToken = settings.qbo_refresh_token!
  const expiresAt = settings.qbo_token_expires_at!

  // 2. Check if token needs refresh (within 60 seconds of expiry)
  const now = new Date()
  const bufferMs = 60_000
  if (expiresAt.getTime() - now.getTime() < bufferMs) {
    // Token is expired or about to expire — refresh with advisory lock
    accessToken = await refreshTokenWithLock(orgId, refreshToken)
  }

  // 3. Build QuickBooks client instance
  const useSandbox = process.env.QBO_SANDBOX === "true"

  return new QuickBooks(
    process.env.INTUIT_CLIENT_ID!,
    process.env.INTUIT_CLIENT_SECRET!,
    accessToken,
    false, // no token secret for OAuth2
    settings.qbo_realm_id,
    useSandbox,
    false, // debug mode
    65, // minor version
    "2.0",
    refreshToken
  )
}

// ---------------------------------------------------------------------------
// refreshTokenWithLock — advisory-lock-protected token refresh
// ---------------------------------------------------------------------------

async function refreshTokenWithLock(
  orgId: string,
  currentRefreshToken: string
): Promise<string> {
  // Use advisory lock to prevent concurrent refresh.
  // hashtext('qbo_refresh_' || orgId) creates a deterministic int lock key.
  return adminDb.transaction(async (tx) => {
    // Acquire advisory lock (released when transaction ends)
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${"qbo_refresh_" + orgId}))`
    )

    // Re-read settings inside the lock — another request may have already refreshed
    const freshRows = await tx
      .select({
        qbo_access_token: orgSettings.qbo_access_token,
        qbo_refresh_token: orgSettings.qbo_refresh_token,
        qbo_token_expires_at: orgSettings.qbo_token_expires_at,
      })
      .from(orgSettings)
      .where(eq(orgSettings.org_id, orgId))
      .limit(1)

    const fresh = freshRows[0]
    if (!fresh) throw new Error("QBO settings not found during refresh")

    // Check if another request already refreshed the token
    const now = new Date()
    if (
      fresh.qbo_token_expires_at &&
      fresh.qbo_token_expires_at.getTime() - now.getTime() > 60_000
    ) {
      // Token was already refreshed by another request
      return fresh.qbo_access_token!
    }

    // Actually refresh the token
    const oauthClient = new OAuthClient({
      clientId: process.env.INTUIT_CLIENT_ID!,
      clientSecret: process.env.INTUIT_CLIENT_SECRET!,
      environment:
        process.env.QBO_SANDBOX === "true" ? "sandbox" : "production",
      redirectUri: process.env.INTUIT_REDIRECT_URI!,
    })

    const authResponse = await oauthClient.refreshUsingToken(
      fresh.qbo_refresh_token ?? currentRefreshToken
    )
    const newToken = authResponse.token

    // CRITICAL: Store the new refresh token — the old one is immediately invalid
    const newExpiresAt = new Date(
      Date.now() + newToken.expires_in * 1000
    )

    await tx
      .update(orgSettings)
      .set({
        qbo_access_token: newToken.access_token,
        qbo_refresh_token: newToken.refresh_token,
        qbo_token_expires_at: newExpiresAt,
        updated_at: now,
      })
      .where(eq(orgSettings.org_id, orgId))

    return newToken.access_token
  })
}
