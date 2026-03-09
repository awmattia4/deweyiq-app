/**
 * report-token.ts — JWT signing and verification for public report links.
 *
 * Uses jose (bundled with Next.js) to create time-limited signed tokens
 * that allow public access to service report HTML without requiring login.
 *
 * Token payload: { visitId: string }
 * Algorithm: HS256
 * Expiry: 30 days
 *
 * Secret: REPORT_TOKEN_SECRET env var (must be 32+ character random string)
 */

import { SignJWT, jwtVerify, type JWTPayload } from "jose"

// ---------------------------------------------------------------------------
// Secret key
// ---------------------------------------------------------------------------

function getSecretKey(): Uint8Array {
  const secret = process.env.REPORT_TOKEN_SECRET
  if (!secret) {
    throw new Error(
      "REPORT_TOKEN_SECRET environment variable is not set. " +
        "Set it to a 32+ character random string in .env.local."
    )
  }
  return new TextEncoder().encode(secret)
}

// ---------------------------------------------------------------------------
// Payload type
// ---------------------------------------------------------------------------

interface ReportTokenPayload extends JWTPayload {
  visitId: string
}

// ---------------------------------------------------------------------------
// signReportToken
// ---------------------------------------------------------------------------

/**
 * Signs a JWT token for a given visit ID.
 *
 * @param visitId - The service visit UUID
 * @returns Signed JWT string (HS256, 30-day expiry)
 */
export async function signReportToken(visitId: string): Promise<string> {
  const secretKey = getSecretKey()

  const token = await new SignJWT({ visitId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secretKey)

  return token
}

// ---------------------------------------------------------------------------
// verifyReportToken
// ---------------------------------------------------------------------------

/**
 * Verifies a signed JWT token and returns the payload.
 *
 * @param token - JWT string to verify
 * @returns { visitId: string } on success, null on any error (expired, invalid, malformed)
 */
export async function verifyReportToken(
  token: string
): Promise<{ visitId: string } | null> {
  try {
    const secretKey = getSecretKey()
    const { payload } = await jwtVerify(token, secretKey)

    const reportPayload = payload as ReportTokenPayload

    if (!reportPayload.visitId || typeof reportPayload.visitId !== "string") {
      return null
    }

    return { visitId: reportPayload.visitId }
  } catch {
    // Expired, invalid signature, malformed — return null
    return null
  }
}
