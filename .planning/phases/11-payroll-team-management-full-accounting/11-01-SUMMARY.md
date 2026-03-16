---
phase: 11-payroll-team-management-full-accounting
plan: 01
subsystem: database
tags: [drizzle, postgres, rls, supabase, schema, accounting, time-tracking, payroll]

# Dependency graph
requires:
  - phase: 10-smart-features-ai
    provides: completed Phase 10 schema (equipment readings, user notifications, push subscriptions, weather proposals)
  - phase: 04-scheduling-routing
    provides: route_stops table — time_entry_stops FKs to route_stops.id
  - phase: 01-foundation
    provides: orgs, profiles tables — all Phase 11 FKs reference these
provides:
  - "time_entries, break_events, time_entry_stops — shift-level time tracking with GPS and QBO sync"
  - "chart_of_accounts, journal_entries, journal_entry_lines, accounting_periods — double-entry bookkeeping foundation"
  - "bank_accounts, bank_transactions — Plaid bank feed integration schema"
  - "pto_balances, pto_requests, employee_availability, employee_blocked_dates, employee_documents, mileage_logs, vendors — team management"
  - "org_settings extended with 7 Phase 11 columns (time_tracking_enabled, geofence_radius_meters, break_auto_detect_minutes, pay_period_type, overtime_threshold_hours, accountant_mode_enabled, accounting_start_date)"
  - "profiles extended with qbo_employee_id for QBO time push integration"
  - "POOL_COMPANY_ACCOUNTS seed data (25 accounts) + seedChartOfAccounts(), getChartOfAccounts(), getAccountByNumber() helpers"
affects:
  - "11-02 through 11-14 — all subsequent Phase 11 plans depend on these tables"
  - "12+ — accounting tables support all future financial features"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "RLS NULL policy workaround: drizzle-kit push creates NULL USING/WITH CHECK — always run manual SQL DROP+CREATE after push"
    - "Break events use correlated subquery on time_entries — acceptable for RLS (owner/office bypass handles it; tech access is single-row context)"
    - "Plaid access token security: bank_accounts RLS is owner-only for ALL operations to prevent token exposure"
    - "Journal entry immutability: enforced at app layer (not RLS) — RLS allows owner/office write, app validates is_posted=false before update"
    - "Chart of accounts onConflictDoNothing keyed on (org_id, account_number) for idempotent seeding"

key-files:
  created:
    - src/lib/db/schema/time-entries.ts
    - src/lib/db/schema/accounting.ts
    - src/lib/db/schema/bank-accounts.ts
    - src/lib/db/schema/team-management.ts
    - src/lib/accounting/chart-of-accounts.ts
    - src/lib/db/migrations/0012_unusual_black_tom.sql
  modified:
    - src/lib/db/schema/org-settings.ts
    - src/lib/db/schema/profiles.ts
    - src/lib/db/schema/index.ts
    - src/lib/db/schema/relations.ts

key-decisions:
  - "Separate schema files per domain (time-entries, accounting, bank-accounts, team-management) — matches existing pattern and keeps files manageable"
  - "bank_accounts is owner-only RLS for ALL operations (SELECT/INSERT/UPDATE/DELETE) — plaid_access_token must never reach client via API"
  - "Journal entry immutability enforced at app layer, not RLS — RLS allows owner/office writes; app validates is_posted=false before any update"
  - "break_events RLS uses correlated subquery on time_entries — acceptable trade-off (single-row context for tech, owner/office bypass RLS implicitly)"
  - "Chart of accounts seeding uses adminDb (service role) — called during org setup before owner RLS context is established"
  - "mileage rate defaults to 0.7250 (2026 IRS standard rate $0.725/mile)"

patterns-established:
  - "Phase 11 RLS pattern: tech reads/writes own rows, owner/office reads/writes all in org"
  - "Accounting RLS pattern: owner/office read, owner write for most tables; owner-only for bank_accounts and accounting_periods"

requirements-completed: [TEAM-01, TEAM-02, TEAM-03, TEAM-05, TEAM-06, TEAM-09, TEAM-13, ACCT-01, ACCT-02, ACCT-06, ACCT-08, ACCT-14, ACCT-15]

# Metrics
duration: 9min
completed: 2026-03-16
---

# Phase 11 Plan 01: Database Schema Foundation Summary

**15 new tables across 4 schema files with correct RLS policies, org_settings + profiles extended, and 25-account pool company chart of accounts seeded**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-03-16T21:12:07Z
- **Completed:** 2026-03-16T21:20:16Z
- **Tasks:** 2
- **Files modified:** 11 files (4 new schemas, 4 updated schemas, 1 new accounting lib, 1 migration SQL, 1 migration meta)

## Accomplishments

- Created 15 new database tables (time_entries, break_events, time_entry_stops, chart_of_accounts, journal_entries, journal_entry_lines, accounting_periods, bank_accounts, bank_transactions, pto_balances, pto_requests, employee_availability, employee_blocked_dates, employee_documents, mileage_logs, vendors) — all with RLS enabled
- Extended org_settings with 7 Phase 11 columns and profiles with qbo_employee_id — no data loss, backward compatible
- Seeded 25 pool-company-specific chart of accounts with idempotent seed function and withRls query helpers
- Fixed drizzle-kit push NULL RLS policy pitfall via manual SQL DROP+CREATE for all 64 policies

## Task Commits

Each task was committed atomically:

1. **Task 1: Create all Phase 11 schema files and extend existing tables** - `bf78faa` (feat)
2. **Task 2: Seed chart of accounts for pool service companies** - `59abc36` (feat)

## Files Created/Modified

- `src/lib/db/schema/time-entries.ts` — time_entries (shift clock-in/out + GPS + QBO sync), break_events, time_entry_stops (per-stop timing)
- `src/lib/db/schema/accounting.ts` — chart_of_accounts (self-referencing parent_id), journal_entries (immutable pattern), journal_entry_lines (debit/credit lines), accounting_periods (open/closed periods)
- `src/lib/db/schema/bank-accounts.ts` — bank_accounts (Plaid access token, owner-only RLS), bank_transactions (reconciliation status, matched_entry_id)
- `src/lib/db/schema/team-management.ts` — pto_balances, pto_requests, employee_availability, employee_blocked_dates, employee_documents, mileage_logs (IRS rate default), vendors
- `src/lib/db/schema/org-settings.ts` — added time_tracking_enabled, geofence_radius_meters, break_auto_detect_minutes, pay_period_type, overtime_threshold_hours, accountant_mode_enabled, accounting_start_date
- `src/lib/db/schema/profiles.ts` — added qbo_employee_id (nullable, QBO Employee entity ID for time push)
- `src/lib/db/schema/index.ts` — added Phase 11 exports for all 4 new schema files
- `src/lib/db/schema/relations.ts` — added 16 new relational definitions for all Phase 11 tables
- `src/lib/accounting/chart-of-accounts.ts` — POOL_COMPANY_ACCOUNTS (25 accounts), seedChartOfAccounts(), getChartOfAccounts(), getAccountByNumber(), getActiveAccounts()
- `src/lib/db/migrations/0012_unusual_black_tom.sql` — generated migration for all Phase 11 schema changes

## Decisions Made

- **bank_accounts owner-only RLS**: plaid_access_token security requires strict restriction — bank transactions (read) open to owner+office, but bank_accounts (which contains the token) is owner-only for all 4 operations
- **Journal entry immutability at app layer**: RLS allows owner/office writes; app validates is_posted=false before allowing updates. This is intentional — overly strict RLS would block legitimate corrections on draft entries
- **Chart of accounts seeding via adminDb**: Called during org onboarding before owner's RLS context is established (JWT not yet set up in the DB transaction), so service role is the correct choice

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed NULL RLS policies after drizzle-kit push**
- **Found during:** Task 1 (schema migration)
- **Issue:** drizzle-kit push applies policies with NULL USING/WITH CHECK conditions — a known Drizzle + Supabase RLS pitfall documented in MEMORY.md
- **Fix:** Ran manual SQL to DROP and recreate all 64 Phase 11 RLS policies with proper conditions
- **Files modified:** Database (SQL executed via psql)
- **Verification:** pg_policies query confirmed qual/with_check are correctly NULL only for INSERT (no USING) and SELECT/DELETE (no WITH CHECK) — all semantic conditions present
- **Committed in:** bf78faa (Task 1 commit — schema files contain correct Drizzle definitions; SQL fix applied to DB directly)

---

**Total deviations:** 1 auto-fixed (Rule 1 — known drizzle-kit push RLS pitfall)
**Impact on plan:** Essential fix — NULL RLS conditions would have made tables publicly accessible. No scope creep.

## Issues Encountered

- drizzle-kit push NULL RLS policy issue (see Deviations) — expected and handled per MEMORY.md drizzle-rls-pitfalls protocol
- psql not in PATH — found at /opt/homebrew/Cellar/libpq/18.2/bin/psql

## User Setup Required

None — no external service configuration required for schema creation.

## Next Phase Readiness

- All Phase 11 tables exist in the database with correct RLS policies and indexes
- Chart of accounts seed data ready to call from org onboarding flow
- org_settings and profiles extended — all Phase 11 plans can immediately use new columns
- Relations file fully updated — db.query.* relational queries will work for all new tables
- Phase 11 Plan 02 (time tracking UI) can proceed immediately

---
*Phase: 11-payroll-team-management-full-accounting*
*Completed: 2026-03-16*
