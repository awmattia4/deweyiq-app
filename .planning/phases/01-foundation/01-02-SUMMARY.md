---
phase: 01-foundation
plan: 02
subsystem: database
tags: [drizzle, postgres, rls, multi-tenant, supabase, jwt, schema]

# Dependency graph
requires:
  - 01-01 (Next.js project with drizzle-orm, postgres, drizzle-kit installed)
provides:
  - Drizzle schema: orgs and profiles tables with RLS policies
  - Generated migration: 0000_bizarre_gambit.sql (ENABLE RLS + 6 CREATE POLICY)
  - Drizzle RLS client: withRls() and createRlsClient() wrappers with set_config + SET LOCAL ROLE
  - adminDb: service-role Drizzle client (bypasses RLS for system operations)
  - supabase/custom-access-token-hook.sql: promotes org_id and user_role into JWT top-level claims
  - supabase/org-creation-trigger.sql: auto-creates org + owner profile on fresh signup
affects:
  - 01-03 (auth pages use profiles table and RLS-aware Drizzle client)
  - 01-04 (shell uses Drizzle schema types)
  - all subsequent phases (every domain table will FK to orgs.id, inherit RLS pattern)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "pgPolicy() + .enableRLS(): Drizzle v0.45 API for table-level RLS — policies attach in table() second argument array"
    - "authenticatedRole from drizzle-orm/supabase: PgRole object targeting 'authenticated' Postgres role"
    - "(select auth.jwt() ->> 'org_id')::uuid: subquery wrapping prevents repeated function evaluation per row"
    - "withRls() callback pattern: caller passes (db) => query, wrapper sets claims and returns result — no transaction leakage"
    - "DrizzleTx type alias: PgTransaction<PostgresJsQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>> for typed tx in callbacks"
    - "org-creation trigger guard: IF raw_app_meta_data ->> 'org_id' IS NULL ensures invited users are skipped"

key-files:
  created:
    - src/lib/db/schema/orgs.ts (orgs table with SELECT/UPDATE RLS policies)
    - src/lib/db/schema/profiles.ts (profiles table with SELECT/INSERT/UPDATE/DELETE RLS policies; org_id idx)
    - src/lib/db/migrations/0000_bizarre_gambit.sql (generated migration: tables + RLS)
    - src/lib/db/migrations/meta/0000_snapshot.json (Drizzle Kit snapshot)
    - src/lib/db/migrations/meta/_journal.json (migration journal)
    - supabase/custom-access-token-hook.sql (JWT claim promotion function)
    - supabase/org-creation-trigger.sql (handle_new_user trigger)
  modified:
    - src/lib/db/schema/index.ts (barrel exports orgs and profiles)
    - src/lib/db/index.ts (updated: schema import, withRls, createRlsClient, DrizzleTx type)

key-decisions:
  - "pgPolicy to and for fields: 'to' takes authenticatedRole (PgRole object), 'for' takes 'select'|'insert'|'update'|'delete' — both required for correct migration generation"
  - "(select auth.jwt() ->> 'org_id') subquery wrapping: prevents Postgres re-evaluating auth.jwt() per row; required for performance with large orgs"
  - "user_role vs role in JWT: custom hook promotes app_metadata.role as user_role (not role) to avoid collision with Supabase reserved 'role' claim that is always 'authenticated'"
  - "SECURITY DEFINER on trigger function: required so handle_new_user can UPDATE auth.users.raw_app_meta_data without elevated user permissions"
  - "DrizzleTx type alias instead of typeof adminDb cast: PgTransaction != PostgresJsDatabase — must use proper transaction type in withRls callback"

requirements-completed:
  - AUTH-06 (multi-tenant RLS isolation)

# Metrics
duration: 3min
completed: 2026-03-03
---

# Phase 01 Plan 02: Database Schema and RLS Summary

**Drizzle schema for orgs and profiles tables with full multi-tenant RLS isolation using pgPolicy + authenticatedRole, withRls() transaction wrapper setting JWT claims via set_config, and Supabase SQL scripts for Custom Access Token Hook (promotes org_id/user_role to JWT top-level) and org-creation trigger (auto-creates org + owner profile on signup)**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-03T22:56:18Z
- **Completed:** 2026-03-03T22:59:48Z
- **Tasks:** 2/2
- **Files created/modified:** 9

## Accomplishments

- orgs table defined with RLS: SELECT restricted to own org, UPDATE restricted to owner role
- profiles table defined with RLS: SELECT by org, INSERT into own org, UPDATE own profile or owner/office any in org, DELETE by owner only
- Index on profiles.org_id ensuring RLS filter performance at scale
- Generated migration `0000_bizarre_gambit.sql` with `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` and 6 `CREATE POLICY` statements — ready to apply
- `withRls()` wrapper: callback-based API that sets 4 JWT claims via `set_config` + `SET LOCAL ROLE authenticated` in a single transaction before executing caller's query
- `adminDb` exported for service-role operations (bypasses RLS intentionally)
- `custom-access-token-hook.sql`: PL/pgSQL function reads org_id and role from app_metadata, promotes them to top-level JWT claims as org_id and user_role
- `org-creation-trigger.sql`: `handle_new_user` AFTER INSERT trigger creates org row, profile row (role=owner), and updates auth.users.raw_app_meta_data — guard skips invited users

## Task Commits

1. **Task 1: Create Drizzle schema with multi-tenant RLS policies** - `2d1c5cf` (feat)
2. **Task 2: Create Drizzle RLS client wrapper and Supabase SQL setup scripts** - `cedb0aa` (feat)

## Files Created/Modified

- `src/lib/db/schema/orgs.ts` — orgs table; SELECT policy (own org id), UPDATE policy (owner only); .enableRLS()
- `src/lib/db/schema/profiles.ts` — profiles table; org_id FK to orgs CASCADE; 4 RLS policies; index on org_id; UserRole type
- `src/lib/db/schema/index.ts` — barrel: `export * from "./orgs"` + `export * from "./profiles"`
- `src/lib/db/migrations/0000_bizarre_gambit.sql` — generated migration; ENABLE ROW LEVEL SECURITY on both tables; 6 CREATE POLICY statements
- `src/lib/db/index.ts` — adminDb + withRls() + createRlsClient() + DrizzleTx type alias; schema import
- `supabase/custom-access-token-hook.sql` — `public.custom_access_token_hook(event jsonb)` promotes org_id and user_role into JWT; GRANT to supabase_auth_admin; REVOKE from authenticated/anon/public
- `supabase/org-creation-trigger.sql` — `public.handle_new_user()` SECURITY DEFINER function + `on_auth_user_created` AFTER INSERT trigger; org_id guard for invited users; fallback to email for missing company_name

## Decisions Made

- **pgPolicy API**: `to` parameter takes `authenticatedRole` (a `PgRole` object from `drizzle-orm/supabase`), not a string. `for` takes literal strings `'select'|'insert'|'update'|'delete'`. Both `using` and `withCheck` needed for UPDATE policies.
- **Subquery wrapping**: Used `(select auth.jwt() ->> 'org_id')` rather than `auth.jwt() ->> 'org_id'` directly — the subquery wrapper prevents Postgres from re-evaluating the function per row, which is a significant performance optimization for large datasets.
- **user_role claim name**: The custom hook promotes `app_metadata.role` as `user_role` (not `role`) to avoid collision with Supabase's built-in `role` JWT claim which is always `'authenticated'` for logged-in users.
- **DrizzleTx type alias**: The `withRls()` callback parameter must be typed as `PgTransaction<...>` not `typeof adminDb` — casting `tx as typeof adminDb` fails because `PgTransaction` lacks `$client` property that `PostgresJsDatabase` requires.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed withRls() transaction callback type**
- **Found during:** Task 2, TypeScript compilation
- **Issue:** `fn(tx as typeof adminDb)` produced TS2352 error — `PgTransaction` is not assignable to `PostgresJsDatabase & { $client: Sql<{}> }` because `PgTransaction` lacks the `$client` property
- **Fix:** Introduced `DrizzleTx` type alias (`PgTransaction<PostgresJsQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>`) and typed the `fn` callback parameter as `(db: DrizzleTx) => Promise<T>`. Removed the invalid cast.
- **Files modified:** `src/lib/db/index.ts`
- **Commit:** `cedb0aa`

---

**Total deviations:** 1 auto-fixed (bug in type cast)
**Impact on plan:** Zero scope impact — the fix is strictly in the TypeScript types, not in behavior. The runtime code works identically.

## User Setup Required

To activate RLS and the multi-tenant flow in Supabase:

1. **Run Drizzle migrations:** `npx drizzle-kit migrate` (requires DATABASE_URL in .env.local pointing to Supabase direct connection, not pooler, for migrations)
2. **Run Custom Access Token Hook SQL:** Copy `supabase/custom-access-token-hook.sql` → Supabase Dashboard > SQL Editor > Run
3. **Enable the hook:** Supabase Dashboard > Authentication > Hooks > Custom Access Token > select `public.custom_access_token_hook`
4. **Run org-creation trigger SQL:** Copy `supabase/org-creation-trigger.sql` → SQL Editor > Run (AFTER migrations)
5. **Test:** `signUp()` with `options.data.company_name` → verify org row created, profile row created, JWT contains org_id and user_role

## Next Phase Readiness

- **Ready:** Plan 01-03 (auth pages) — profiles table exists; RLS client ready; proxy.ts guards routes
- **Ready:** Plan 01-04 (shell) — Drizzle schema types available for offline Dexie sync schema
- **Note:** Migrations must be applied to Supabase before any server-side data operations work

---
*Phase: 01-foundation*
*Completed: 2026-03-03*

## Self-Check: PASSED

All 8 key files verified present. Both task commits (2d1c5cf, cedb0aa) confirmed in git history.
