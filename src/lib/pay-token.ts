/**
 * pay-token.ts — JWT signing and verification for public payment page links.
 *
 * Uses jose (bundled with Next.js) to create signed tokens that allow
 * public (unauthenticated) access to the invoice payment page.
 *
 * Mirrors src/lib/quotes/quote-token.ts exactly.
 * Uses INVOICE_TOKEN_SECRET — separate from QUOTE_TOKEN_SECRET and REPORT_TOKEN_SECRET.
 *
 * Token payload: { invoiceId: string }
 * Algorithm: HS256
 * Expiry: 365 days (longer than invoice lifecycle — invoice can stay outstanding for months)
 *
 * Secret: INVOICE_TOKEN_SECRET env var (must be 32+ character random string)
 * Generate with: openssl rand -hex 32
 */

import { SignJWT, jwtVerify, type JWTPayload } from "jose"

// ---------------------------------------------------------------------------
// Secret key
// ---------------------------------------------------------------------------

function getSecretKey(): Uint8Array {
  const secret = process.env.INVOICE_TOKEN_SECRET
  if (!secret) {
    throw new Error(
      "INVOICE_TOKEN_SECRET environment variable is not set. " +
        "Set it to a 32+ character random string in .env.local. " +
        "Generate with: openssl rand -hex 32"
    )
  }
  return new TextEncoder().encode(secret)
}

// ---------------------------------------------------------------------------
// Payload type
// ---------------------------------------------------------------------------

interface PayTokenPayload extends JWTPayload {
  invoiceId: string
}

// ---------------------------------------------------------------------------
// signPayToken
// ---------------------------------------------------------------------------

/**
 * Signs a JWT token for a given invoice ID.
 *
 * @param invoiceId - The invoice UUID
 * @returns Signed JWT string (HS256, 365-day expiry)
 */
export async function signPayToken(invoiceId: string): Promise<string> {
  const secretKey = getSecretKey()

  const token = await new SignJWT({ invoiceId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("365d")
    .sign(secretKey)

  return token
}

// ---------------------------------------------------------------------------
// verifyPayToken
// ---------------------------------------------------------------------------

/**
 * Verifies a signed JWT token and returns the payload.
 *
 * @param token - JWT string to verify
 * @returns { invoiceId: string } on success, null on any error (expired, invalid, malformed)
 */
export async function verifyPayToken(
  token: string
): Promise<{ invoiceId: string } | null> {
  try {
    const secretKey = getSecretKey()
    const { payload } = await jwtVerify(token, secretKey)

    const payPayload = payload as PayTokenPayload

    if (!payPayload.invoiceId || typeof payPayload.invoiceId !== "string") {
      return null
    }

    return { invoiceId: payPayload.invoiceId }
  } catch {
    // Expired, invalid signature, malformed — return null
    return null
  }
}
