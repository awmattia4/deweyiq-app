/**
 * quote-token.ts — JWT signing and verification for public quote approval links.
 *
 * Uses jose (bundled with Next.js) to create signed tokens that allow
 * public (unauthenticated) access to the quote approval page.
 *
 * Mirrors src/lib/reports/report-token.ts exactly.
 * Uses QUOTE_TOKEN_SECRET — separate from REPORT_TOKEN_SECRET per 06-RESEARCH.md Pitfall 3.
 *
 * Token payload: { quoteId: string }
 * Algorithm: HS256
 * Expiry: 90 days (actual quote expiry tracked in DB; token just needs to outlive the quote)
 *
 * Secret: QUOTE_TOKEN_SECRET env var (must be 32+ character random string)
 * Generate with: openssl rand -hex 32
 */

import { SignJWT, jwtVerify, type JWTPayload } from "jose"

// ---------------------------------------------------------------------------
// Secret key
// ---------------------------------------------------------------------------

function getSecretKey(): Uint8Array {
  const secret = process.env.QUOTE_TOKEN_SECRET
  if (!secret) {
    throw new Error(
      "QUOTE_TOKEN_SECRET environment variable is not set. " +
        "Set it to a 32+ character random string in .env.local. " +
        "Generate with: openssl rand -hex 32"
    )
  }
  return new TextEncoder().encode(secret)
}

// ---------------------------------------------------------------------------
// Payload type
// ---------------------------------------------------------------------------

interface QuoteTokenPayload extends JWTPayload {
  quoteId: string
}

// ---------------------------------------------------------------------------
// signQuoteToken
// ---------------------------------------------------------------------------

/**
 * Signs a JWT token for a given quote ID.
 *
 * @param quoteId - The quote UUID
 * @returns Signed JWT string (HS256, 90-day expiry)
 */
export async function signQuoteToken(quoteId: string): Promise<string> {
  const secretKey = getSecretKey()

  const token = await new SignJWT({ quoteId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("90d")
    .sign(secretKey)

  return token
}

// ---------------------------------------------------------------------------
// verifyQuoteToken
// ---------------------------------------------------------------------------

/**
 * Verifies a signed JWT token and returns the payload.
 *
 * @param token - JWT string to verify
 * @returns { quoteId: string } on success, null on any error (expired, invalid, malformed)
 */
export async function verifyQuoteToken(
  token: string
): Promise<{ quoteId: string } | null> {
  try {
    const secretKey = getSecretKey()
    const { payload } = await jwtVerify(token, secretKey)

    const quotePayload = payload as QuoteTokenPayload

    if (!quotePayload.quoteId || typeof quotePayload.quoteId !== "string") {
      return null
    }

    return { quoteId: quotePayload.quoteId }
  } catch {
    // Expired, invalid signature, malformed — return null
    return null
  }
}
