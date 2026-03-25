/**
 * agreement-token.ts — JWT signing and verification for public agreement approval links.
 *
 * Uses jose (bundled with Next.js) to create signed tokens that allow
 * public (unauthenticated) access to the agreement approval page.
 *
 * Mirrors src/lib/quotes/quote-token.ts exactly.
 * Uses AGREEMENT_TOKEN_SECRET — separate from QUOTE_TOKEN_SECRET per the
 * one-secret-per-feature pattern documented in the codebase.
 *
 * Token payload: { agreementId: string }
 * Algorithm: HS256
 * Expiry: 180 days (longer than quote's 90d to cover 12-month agreement terms)
 *
 * Secret: AGREEMENT_TOKEN_SECRET env var (must be 32+ character random string)
 * Generate with: openssl rand -hex 32
 */

import { SignJWT, jwtVerify, type JWTPayload } from "jose"

// ---------------------------------------------------------------------------
// Secret key
// ---------------------------------------------------------------------------

function getSecretKey(): Uint8Array {
  const secret = process.env.AGREEMENT_TOKEN_SECRET
  if (!secret) {
    throw new Error(
      "AGREEMENT_TOKEN_SECRET environment variable is not set. " +
        "Set it to a 32+ character random string in .env.local. " +
        "Generate with: openssl rand -hex 32"
    )
  }
  return new TextEncoder().encode(secret)
}

// ---------------------------------------------------------------------------
// Payload type
// ---------------------------------------------------------------------------

interface AgreementTokenPayload extends JWTPayload {
  agreementId: string
}

// ---------------------------------------------------------------------------
// signAgreementToken
// ---------------------------------------------------------------------------

/**
 * Signs a JWT token for a given agreement ID.
 *
 * @param agreementId - The agreement UUID
 * @returns Signed JWT string (HS256, 180-day expiry)
 */
export async function signAgreementToken(agreementId: string): Promise<string> {
  const secretKey = getSecretKey()

  const token = await new SignJWT({ agreementId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("180d")
    .sign(secretKey)

  return token
}

// ---------------------------------------------------------------------------
// verifyAgreementToken
// ---------------------------------------------------------------------------

/**
 * Verifies a signed JWT token and returns the payload.
 *
 * @param token - JWT string to verify
 * @returns { agreementId: string } on success, null on any error (expired, invalid, malformed)
 */
export async function verifyAgreementToken(
  token: string
): Promise<{ agreementId: string } | null> {
  try {
    const secretKey = getSecretKey()
    const { payload } = await jwtVerify(token, secretKey)

    const agreementPayload = payload as AgreementTokenPayload

    if (
      !agreementPayload.agreementId ||
      typeof agreementPayload.agreementId !== "string"
    ) {
      return null
    }

    return { agreementId: agreementPayload.agreementId }
  } catch {
    // Expired, invalid signature, malformed — return null
    return null
  }
}
