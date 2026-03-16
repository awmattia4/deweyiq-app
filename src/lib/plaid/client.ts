import { Configuration, PlaidApi, PlaidEnvironments } from "plaid"

/**
 * Plaid API client.
 *
 * Initialized with environment-appropriate base path (sandbox vs production).
 * Guard: if PLAID_CLIENT_ID is not set, exports null — callers must check before using.
 *
 * SECURITY: This module is server-only. Never import from client components directly.
 * All Plaid API calls go through server actions in src/actions/bank-feeds.ts.
 */

function createPlaidClient(): PlaidApi | null {
  const clientId = process.env.PLAID_CLIENT_ID
  const secret = process.env.PLAID_SECRET

  if (!clientId || !secret) {
    // Plaid not configured — return null, callers will handle gracefully
    return null
  }

  const env = process.env.PLAID_ENV === "production"
    ? PlaidEnvironments.production
    : PlaidEnvironments.sandbox

  const config = new Configuration({
    basePath: env,
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": clientId,
        "PLAID-SECRET": secret,
      },
    },
  })

  return new PlaidApi(config)
}

export const plaidClient = createPlaidClient()
