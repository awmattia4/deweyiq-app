import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { sql } from "drizzle-orm"

// CRITICAL: prepare: false required for Supabase transaction-mode pooler (Supavisor).
// The pooler does not support prepared statements. Direct connection (port 5432)
// supports them, but the app always connects through the pooler for scalability.
const client = postgres(process.env.DATABASE_URL!, { prepare: false })
const baseDb = drizzle({ client })

export type SupabaseToken = {
  sub: string
  role?: string
  org_id?: string
  user_role?: string
  email?: string
  aud?: string
  [key: string]: unknown
}

/**
 * createDrizzleClient — RLS-aware Drizzle transaction wrapper.
 *
 * Wraps every query in a PostgreSQL transaction that sets JWT claims
 * before executing. This enables RLS policies to see the authenticated
 * user's role and org_id via auth.jwt().
 *
 * USAGE:
 *   const supabase = await createClient()
 *   const { data: { user } } = await supabase.auth.getClaims()
 *   const db = await createDrizzleClient(user.app_metadata)
 *   const results = await db.select().from(stops).where(...)
 *
 * WARNING: Never use baseDb directly for user-facing queries. It runs as
 * the Postgres superuser, bypassing RLS entirely.
 */
export async function createDrizzleClient(token: SupabaseToken) {
  return baseDb.transaction(async (tx) => {
    await tx.execute(sql`
      select
        set_config('request.jwt.claims', ${JSON.stringify(token)}, TRUE),
        set_config('request.jwt.claim.sub', ${token.sub}, TRUE),
        set_config('request.jwt.claim.role', ${token.user_role ?? token.role ?? "anon"}, TRUE)
    `)
    await tx.execute(sql`set local role authenticated`)
    return tx
  })
}

/**
 * adminDb — Bypasses RLS. Use ONLY in:
 * - Invite handlers (service role context)
 * - Webhook handlers (system-level operations)
 * - Admin-only Server Actions with explicit service role validation
 */
export const adminDb = baseDb
