---
phase: 02-customer-pool-data-model
plan: "01"
subsystem: database
tags: [drizzle, postgres, rls, supabase, tanstack-table, react-hook-form, zod, shadcn]

requires:
  - phase: 01-foundation
    provides: orgs/profiles schema, withRls/adminDb pattern, RLS policy conventions, pgPolicy import pattern

provides:
  - customers table with RLS and customerStatusEnum (4 policies, 3 indexes)
  - pools table with RLS and poolTypeEnum/poolSurfaceEnum/sanitizerTypeEnum (4 policies, 2 indexes)
  - equipment table with RLS, open-ended text type column (4 policies, 2 indexes)
  - service_visits stub table with RLS — Phase 3 populates (4 policies, 3 indexes)
  - Drizzle v1 relational query graph (customers -> pools -> equipment chain)
  - @tanstack/react-table v8.21.3 for customer list UI
  - react-hook-form + @hookform/resolvers + zod for modal forms
  - shadcn Tabs, Table, Form components

affects:
  - 02-02-PLAN.md (customer list page uses TanStack Table + customers query)
  - 02-03-PLAN.md (customer profile uses pools/equipment queries + Tabs + Form)
  - 02-04-PLAN.md (service history stub reads service_visits)
  - 03-service-management (service_visits table stub defined here)

tech-stack:
  added:
    - "@tanstack/react-table@8.21.3"
    - "react-hook-form@7.71.2"
    - "@hookform/resolvers@5.2.2"
    - "zod@4.3.6"
    - "shadcn/ui: tabs, table, form"
  patterns:
    - "relations.ts dedicated file: all Drizzle v1 relations in one place to avoid circular import issues between customers <-> pools <-> equipment"
    - "Table-only files: schema files export table + enum only; no relation imports to eliminate circular deps"
    - "4 RLS policies per table: select (all org members), insert/update/delete (owner+office only)"
    - "(select auth.jwt() ->> 'org_id')::uuid subquery wrapping for all org_id comparisons"

key-files:
  created:
    - src/lib/db/schema/customers.ts
    - src/lib/db/schema/pools.ts
    - src/lib/db/schema/equipment.ts
    - src/lib/db/schema/service-visits.ts
    - src/lib/db/schema/relations.ts
    - src/lib/db/migrations/0001_even_yellow_claw.sql
    - src/components/ui/tabs.tsx
    - src/components/ui/table.tsx
    - src/components/ui/form.tsx
  modified:
    - src/lib/db/schema/index.ts

key-decisions:
  - "relations.ts dedicated file: Drizzle v1 relations defined in a single file (relations.ts) rather than in each schema file to eliminate circular import issues between customers<->pools<->equipment; all relations re-exported from barrel"
  - "service_visits insert/update policy includes tech role: Phase 3 techs will write service records; added now so Phase 3 doesn't need a policy migration when customers already have data"
  - "equipment type as text not pgEnum: equipment categories grow over time; enum requires migration per new category; text with future check constraint is more flexible"
  - "route_name as free-text on customers: Phase 4 will add route_id FK and a routes table; free-text string match works for Phase 2 filter; avoids premature schema complexity"

patterns-established:
  - "Pattern: Dedicated relations.ts for circular relation definitions — prevents ESM circular import issues in Next.js"
  - "Pattern: RLS select policy allows all org members (owner/office/tech/customer); write policies restrict to owner+office"
  - "Pattern: service_visits write policy includes tech role from the start — anticipates Phase 3 tech writes without requiring policy migration"

requirements-completed:
  - CUST-01
  - CUST-02
  - CUST-03
  - CUST-04
  - CUST-06

duration: 11min
completed: 2026-03-05
---

# Phase 2 Plan 01: Customer & Pool Schema Foundation Summary

**Four multi-tenant Postgres tables (customers, pools, equipment, service_visits) with RLS via Drizzle, four pgEnums, full relational query graph, and TanStack Table / react-hook-form / zod / shadcn Form+Tabs+Table installed**

## Performance

- **Duration:** 11 min
- **Started:** 2026-03-05T20:53:04Z
- **Completed:** 2026-03-05T21:04:00Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments

- Database schema foundation for Phase 2 CRM: customers, pools, equipment, service_visits tables with 16 RLS policies total applied to the Supabase database
- Full Drizzle v1 relational query graph: customers -> pools -> equipment chain enables `db.query.customers.findMany({ with: { pools: { with: { equipment: true } } } })`
- Frontend toolkit complete: TanStack Table v8 for sortable/filterable customer list, react-hook-form + zod for modal forms (Add Pool, Add Equipment), shadcn Tabs/Table/Form components ready

## Task Commits

1. **Task 1: Create Drizzle schema files** - `d670d66` (feat)
2. **Task 2: Install frontend dependencies and shadcn components** - `96e124b` (feat)

## Files Created/Modified

- `src/lib/db/schema/customers.ts` - customers table, customerStatusEnum, RLS policies (4), indexes (3)
- `src/lib/db/schema/pools.ts` - pools table, poolTypeEnum/poolSurfaceEnum/sanitizerTypeEnum, RLS policies (4), indexes (2)
- `src/lib/db/schema/equipment.ts` - equipment table with open-ended text type, RLS policies (4), indexes (2)
- `src/lib/db/schema/service-visits.ts` - service_visits stub table, RLS policies (4 — techs can write for Phase 3), indexes (3)
- `src/lib/db/schema/relations.ts` - all Drizzle v1 relational definitions in one file (avoids circular imports)
- `src/lib/db/schema/index.ts` - barrel updated with 5 new export lines
- `src/lib/db/migrations/0001_even_yellow_claw.sql` - CREATE TYPE x4, CREATE TABLE x4, RLS, FKs, indexes
- `src/components/ui/tabs.tsx` - shadcn Tabs component (Radix-based, keyboard nav, ARIA)
- `src/components/ui/table.tsx` - shadcn Table primitives for TanStack Table scaffolding
- `src/components/ui/form.tsx` - shadcn Form with FormField/FormItem/FormLabel/FormMessage pattern

## Decisions Made

- **relations.ts dedicated file:** The plan specified `xyzRelations` exports in each schema file, but `customers` and `pools` have circular dependency (`customers` many `pools`, `pools` one `customer`). Resolved by placing all Drizzle v1 `relations()` calls in a single `relations.ts` file imported after all table definitions — eliminates circular import entirely while satisfying the plan's requirement that all relations are exported from the schema barrel.

- **service_visits write policy includes tech:** Added `tech` to the insert/update policy now so Phase 3 techs can log service records without requiring a policy migration when customer data already exists in the table.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Moved all relations() to dedicated relations.ts to resolve circular imports**
- **Found during:** Task 1 (Create schema files)
- **Issue:** Plan specified `customersRelations` in `customers.ts` and `poolsRelations` in `pools.ts`, but both files need to import from each other (`customers` references `pools` for the many relation; `pools` references `customers` for the FK and one relation). This creates a circular ESM import that would cause `undefined` values at module load time.
- **Fix:** Created `src/lib/db/schema/relations.ts` with all four `relations()` definitions. Each table file now only imports what it needs for FK `.references()` (no circular deps). The barrel re-exports `./relations` so all `customersRelations`, `poolsRelations`, etc. are available.
- **Files modified:** relations.ts (new), customers.ts (removed relations import), pools.ts (removed relations import), index.ts (added relations export)
- **Verification:** `npx tsc --noEmit` passes; Drizzle generates correct migration; `db.query.customers` resolves with `with: { pools: true }` in RQB
- **Committed in:** d670d66 (Task 1 commit)

**2. [Rule 3 - Blocking] Used local `node_modules/.bin/shadcn` for component install**
- **Found during:** Task 2 (Install shadcn components)
- **Issue:** `npx shadcn@latest add` failed with EACCES error — npm cache had root-owned files requiring `sudo chown` which isn't available in this context
- **Fix:** Used `node_modules/.bin/shadcn` (already installed as project dep) to run the add command directly
- **Files modified:** src/components/ui/tabs.tsx, table.tsx, form.tsx (created)
- **Verification:** All three files exist; `npx tsc --noEmit` passes
- **Committed in:** 96e124b (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking — Rule 3)
**Impact on plan:** Both deviations necessary to unblock task completion. No scope creep. All plan requirements met.

## Issues Encountered

- Circular ESM import between customers.ts and pools.ts (relations) — resolved by dedicated relations.ts file
- npm cache permission error with `npx shadcn@latest` — resolved by using local binary

## User Setup Required

None — no external service configuration required. Database migration applied automatically via `drizzle-kit push`.

## Next Phase Readiness

- Schema foundation complete — Plans 02-02, 02-03, 02-04 can proceed in any order within the wave
- `db.query.customers.findMany({ with: { pools: { with: { equipment: true } } } })` works for plan 02-03 customer profile fetches
- TanStack Table ready for plan 02-02 customer list column definitions
- shadcn Form + react-hook-form + zod ready for plan 02-03 Add Pool and Add Equipment modals

---
*Phase: 02-customer-pool-data-model*
*Completed: 2026-03-05*

## Self-Check: PASSED

All files verified present. All commits verified in git log.
