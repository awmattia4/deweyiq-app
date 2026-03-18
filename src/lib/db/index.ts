import { drizzle } from "drizzle-orm/postgres-js"
import type { PgTransaction } from "drizzle-orm/pg-core"
import type { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js"
import type { ExtractTablesWithRelations } from "drizzle-orm"
import postgres from "postgres"
import { sql } from "drizzle-orm"
import * as schema from "./schema"
import { createClient } from "@/lib/supabase/server"

// CRITICAL: prepare: false required for Supabase transaction-mode pooler (Supavisor).
// The pooler does not support prepared statements. Direct connection (port 5432)
// supports them, but the app always connects through the pooler for scalability.
const client = postgres(process.env.DATABASE_URL!, {
  prepare: false,
  max: 20,
  idle_timeout: 20,
  connect_timeout: 10,
})

export const adminDb = drizzle({ client, schema })

export type SupabaseToken = {
  sub: string
  role?: string
  user_role?: string
  org_id?: string
  email?: string
  aud?: string
  [key: string]: unknown
}

/**
 * withRls — RLS-aware Drizzle transaction wrapper.
 *
 * Wraps every user query in a PostgreSQL transaction that sets JWT claims
 * before executing. This enables RLS policies to read the authenticated
 * user's org_id and user_role via auth.jwt().
 *
 * USAGE:
 *   const results = await withRls(token, (db) => db.select().from(profiles))
 *
 * The token is typically the decoded Supabase JWT from getClaims():
 *   const { data: claimsData } = await supabase.auth.getClaims()
 *   const results = await withRls(claimsData.claims, (db) => ...)
 *
 * WARNING: Never use adminDb directly for user-facing queries. It runs as
 * the Postgres superuser, bypassing RLS entirely. adminDb is for:
 * - Invite handlers (service role context)
 * - Webhook handlers (system-level operations)
 * - Admin-only Server Actions with explicit service role validation
 */
// Type alias for the Drizzle transaction object — used in withRls callback signature
type DrizzleTx = PgTransaction<
  PostgresJsQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>

/**
 * getRlsToken — reliably gets RLS token from the current session.
 *
 * Tries getClaims() first (local JWT decode), falls back to getUser()
 * which reads app_metadata via API call. Works across local and hosted
 * Supabase environments.
 */
export async function getRlsToken(): Promise<SupabaseToken | null> {
  const supabase = await createClient()

  // Try getClaims first (fast, local decode)
  const { data: claimsData } = await supabase.auth.getClaims()
  if (claimsData?.claims) {
    const c = claimsData.claims
    // Ensure org_id and user_role exist (custom access token hook)
    if (c["org_id"] && c["user_role"]) {
      return c as SupabaseToken
    }
  }

  // Fallback: getUser() and build token from app_metadata
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const meta = user.app_metadata ?? {}
  return {
    sub: user.id,
    org_id: meta.org_id,
    user_role: meta.role ?? meta.user_role,
    role: "authenticated",
    email: user.email,
    aud: "authenticated",
  }
}

export async function withRls<T>(
  token: SupabaseToken,
  fn: (db: DrizzleTx) => Promise<T>
): Promise<T> {
  return adminDb.transaction(async (tx) => {
    // Set JWT claims so auth.jwt() returns the correct values inside this transaction.
    // This is required when using Drizzle directly (bypassing Supabase's own PostgREST
    // layer). The RLS policies read these settings via auth.jwt().
    await tx.execute(sql`
      SELECT
        set_config('request.jwt.claims', ${JSON.stringify(token)}, TRUE),
        set_config('request.jwt.claim.sub', ${token.sub}, TRUE),
        set_config('request.jwt.claim.role', ${token.user_role ?? token.role ?? "authenticated"}, TRUE),
        set_config('request.jwt.claim.org_id', ${token.org_id ?? ""}, TRUE)
    `)
    // Switch to the authenticated role so RLS policies are enforced.
    await tx.execute(sql`SET LOCAL ROLE authenticated`)
    return fn(tx)
  })
}

/**
 * createRlsClient — returns a transaction with RLS context set.
 *
 * Lower-level alternative to withRls for cases where you need to pass the
 * transaction around rather than using a callback pattern.
 *
 * NOTE: Prefer withRls for most use cases. This function returns a transaction
 * that is already in progress — the caller must not try to commit or rollback.
 *
 * @deprecated Use withRls instead for cleaner callback-based API
 */
export async function createRlsClient(token: SupabaseToken) {
  return adminDb.transaction(async (tx) => {
    await tx.execute(sql`
      SELECT
        set_config('request.jwt.claims', ${JSON.stringify(token)}, TRUE),
        set_config('request.jwt.claim.sub', ${token.sub}, TRUE),
        set_config('request.jwt.claim.role', ${token.user_role ?? token.role ?? "authenticated"}, TRUE),
        set_config('request.jwt.claim.org_id', ${token.org_id ?? ""}, TRUE)
    `)
    await tx.execute(sql`SET LOCAL ROLE authenticated`)
    return tx
  })
}
