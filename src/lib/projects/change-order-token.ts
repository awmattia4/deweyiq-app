/**
 * change-order-token.ts — JWT signing and verification for public change order approval links.
 *
 * Uses jose (bundled with Next.js) to create signed tokens that allow
 * public (unauthenticated) access to the change order approval page.
 *
 * Mirrors src/lib/projects/proposal-token.ts exactly.
 * Uses CHANGE_ORDER_TOKEN_SECRET — separate from PROPOSAL_TOKEN_SECRET.
 *
 * Token payload: { changeOrderId: string }
 * Algorithm: HS256
 * Expiry: 90 days
 *
 * Secret: CHANGE_ORDER_TOKEN_SECRET env var (must be 32+ character random string)
 * Generate with: openssl rand -hex 32
 *
 * NOTE: This utility is defined in Plan 06 but consumed in Plan 13 (change order approval page).
 */

import { SignJWT, jwtVerify, type JWTPayload } from "jose"

// ---------------------------------------------------------------------------
// Secret key
// ---------------------------------------------------------------------------

function getSecretKey(): Uint8Array {
  const secret = process.env.CHANGE_ORDER_TOKEN_SECRET
  if (!secret) {
    throw new Error(
      "CHANGE_ORDER_TOKEN_SECRET environment variable is not set. " +
        "Set it to a 32+ character random string in .env.local. " +
        "Generate with: openssl rand -hex 32"
    )
  }
  return new TextEncoder().encode(secret)
}

// ---------------------------------------------------------------------------
// Payload type
// ---------------------------------------------------------------------------

interface ChangeOrderTokenPayload extends JWTPayload {
  changeOrderId: string
}

// ---------------------------------------------------------------------------
// signChangeOrderToken
// ---------------------------------------------------------------------------

/**
 * Signs a JWT token for a given change order ID.
 *
 * @param changeOrderId - The change order UUID
 * @returns Signed JWT string (HS256, 90-day expiry)
 */
export async function signChangeOrderToken(changeOrderId: string): Promise<string> {
  const secretKey = getSecretKey()

  const token = await new SignJWT({ changeOrderId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("90d")
    .sign(secretKey)

  return token
}

// ---------------------------------------------------------------------------
// verifyChangeOrderToken
// ---------------------------------------------------------------------------

/**
 * Verifies a signed JWT token and returns the payload.
 *
 * @param token - JWT string to verify
 * @returns { changeOrderId: string } on success, null on any error (expired, invalid, malformed)
 */
export async function verifyChangeOrderToken(
  token: string
): Promise<{ changeOrderId: string } | null> {
  try {
    const secretKey = getSecretKey()
    const { payload } = await jwtVerify(token, secretKey)

    const changeOrderPayload = payload as ChangeOrderTokenPayload

    if (!changeOrderPayload.changeOrderId || typeof changeOrderPayload.changeOrderId !== "string") {
      return null
    }

    return { changeOrderId: changeOrderPayload.changeOrderId }
  } catch {
    // Expired, invalid signature, malformed — return null
    return null
  }
}
