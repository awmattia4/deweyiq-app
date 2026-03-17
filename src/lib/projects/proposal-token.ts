/**
 * proposal-token.ts — JWT signing and verification for public proposal approval links.
 *
 * Uses jose (bundled with Next.js) to create signed tokens that allow
 * public (unauthenticated) access to the proposal approval page.
 *
 * Mirrors src/lib/quotes/quote-token.ts exactly.
 * Uses PROPOSAL_TOKEN_SECRET — separate from QUOTE_TOKEN_SECRET per Phase 06 pitfall.
 *
 * Token payload: { proposalId: string }
 * Algorithm: HS256
 * Expiry: 90 days (proposals can take time to approve; token just needs to outlive the proposal)
 *
 * Secret: PROPOSAL_TOKEN_SECRET env var (must be 32+ character random string)
 * Generate with: openssl rand -hex 32
 */

import { SignJWT, jwtVerify, type JWTPayload } from "jose"

// ---------------------------------------------------------------------------
// Secret key
// ---------------------------------------------------------------------------

function getSecretKey(): Uint8Array {
  const secret = process.env.PROPOSAL_TOKEN_SECRET
  if (!secret) {
    throw new Error(
      "PROPOSAL_TOKEN_SECRET environment variable is not set. " +
        "Set it to a 32+ character random string in .env.local. " +
        "Generate with: openssl rand -hex 32"
    )
  }
  return new TextEncoder().encode(secret)
}

// ---------------------------------------------------------------------------
// Payload type
// ---------------------------------------------------------------------------

interface ProposalTokenPayload extends JWTPayload {
  proposalId: string
}

// ---------------------------------------------------------------------------
// signProposalToken
// ---------------------------------------------------------------------------

/**
 * Signs a JWT token for a given proposal ID.
 *
 * @param proposalId - The proposal UUID
 * @returns Signed JWT string (HS256, 90-day expiry)
 */
export async function signProposalToken(proposalId: string): Promise<string> {
  const secretKey = getSecretKey()

  const token = await new SignJWT({ proposalId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("90d")
    .sign(secretKey)

  return token
}

// ---------------------------------------------------------------------------
// verifyProposalToken
// ---------------------------------------------------------------------------

/**
 * Verifies a signed JWT token and returns the payload.
 *
 * @param token - JWT string to verify
 * @returns { proposalId: string } on success, null on any error (expired, invalid, malformed)
 */
export async function verifyProposalToken(
  token: string
): Promise<{ proposalId: string } | null> {
  try {
    const secretKey = getSecretKey()
    const { payload } = await jwtVerify(token, secretKey)

    const proposalPayload = payload as ProposalTokenPayload

    if (!proposalPayload.proposalId || typeof proposalPayload.proposalId !== "string") {
      return null
    }

    return { proposalId: proposalPayload.proposalId }
  } catch {
    // Expired, invalid signature, malformed — return null
    return null
  }
}
