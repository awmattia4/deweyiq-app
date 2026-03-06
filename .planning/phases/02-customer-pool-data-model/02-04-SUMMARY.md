---
phase: 02-customer-pool-data-model
plan: "04"
subsystem: ui
tags: [react, tailwind, timeline, service-history, customer-crm, rls, postgres]

# Dependency graph
requires:
  - phase: 02-03
    provides: Customer profile page with tabbed layout including placeholder History tab
  - phase: 02-01
    provides: service_visits schema table with RLS policies

provides:
  - Vertical timeline UI component for service visit history
  - Filter chips (All, Routine, Repair, One-off) with client-side filtering
  - Chemistry readings display area (pH, Cl, Alk) structured for Phase 3 data
  - Photo thumbnail strip area structured for Phase 3 photos
  - Empty state for History tab with helpful contextual messaging
  - Full Phase 2 CRM flow verified end-to-end by user

affects: [03-field-tech-app, phase-3-service-visits]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - vertical-timeline-with-date-markers
    - filter-chip-toggle
    - phase-ready-placeholder-areas
    - LEFT-JOIN-GROUP-BY instead of correlated subqueries under RLS

key-files:
  created:
    - src/components/customers/service-history-timeline.tsx
  modified:
    - src/app/(app)/customers/[id]/page.tsx
    - src/actions/pools.ts

key-decisions:
  - "tech field set to null in allVisits flatMap — service_visits Drizzle query does not include tech relation; Phase 3 can add withTech: true to the relational query when populating"
  - "visited_at instanceof Date check — Drizzle can return Date objects or strings depending on mode; defensive coercion to ISO string for component prop"
  - "CRITICAL: drizzle-kit push creates RLS policies with NULL USING/WITH CHECK expressions — after any migration verify all policy conditions in pg_catalog.pg_policies and recreate if NULL"
  - "CRITICAL: correlated subqueries on RLS-protected tables return wrong results inside withRls — always use LEFT JOIN + GROUP BY + count() for aggregate counts"
  - "addPool/deletePool must revalidate /customers (list page) in addition to /customers/[id] — list page shows pool count which is a derived value cached by Next.js"

patterns-established:
  - "Phase-ready placeholder areas: chemistry readings and photo strip use layout-only divs/sections so Phase 3 passes data without structural changes"
  - "Filter chip toggle: plain button elements with cn() conditional classes — no external library, matches codebase pattern avoiding zod/hookform"
  - "LEFT JOIN + GROUP BY for pool counts: SELECT customers.*, COUNT(pools.id) FROM customers LEFT JOIN pools ON pools.customer_id = customers.id GROUP BY customers.id — never use correlated subquery under RLS"

requirements-completed:
  - CUST-06

# Metrics
duration: 12min
completed: 2026-03-06
---

# Phase 2 Plan 04: Service History Timeline Summary

**Vertical timeline component with date markers, filter chips, and Phase 3-ready chemistry/photo areas — plus RLS policy null-condition bug fixed and pool count query corrected; full Phase 2 CRM flow verified end-to-end**

## Performance

- **Duration:** ~12 min (Task 1 ~8 min + verification fixes)
- **Started:** 2026-03-06T01:32:49Z
- **Completed:** 2026-03-06 (human verification approved)
- **Tasks:** 2/2 complete
- **Files modified:** 3

## Accomplishments

- Built `ServiceHistoryTimeline` "use client" component with vertical left-side timeline line and cards
- Filter chips (All, Routine, Repair, One-off) with `useState` client-side filtering
- Date section headers that appear when the visit date changes between entries
- Visit type badges color-coded: Routine=blue, Repair=orange, One-off=purple
- Inline chemistry readings row (pH, Cl, Alk) with placeholder "--" values ready for Phase 3 data
- Photo strip area structured in component but empty in Phase 2 — no layout changes needed in Phase 3
- Empty state with `ClipboardList` icon and full contextual messaging per spec
- Replaced placeholder `<div>` in History tab with `<ServiceHistoryTimeline visits={allVisits} />`
- Recreated all 16 RLS policies after drizzle-kit push left NULL USING/WITH CHECK conditions
- Fixed pool count query to use LEFT JOIN + GROUP BY (correlated subquery returns wrong results under RLS)
- Added /customers revalidation to addPool/deletePool (pool count cache was stale on list page)
- Human verification confirmed: customer list, create, search, profile, edit, pools, equipment, history all working

## Task Commits

1. **Task 1: Build service history timeline component** - `9c54376` (feat)
2. **Deviation fixes: RLS policies + pool count + revalidation** - `23fe2c1` (fix)
3. **Task 2: Human verification checkpoint** - approved by user (no code commit)

## Files Created/Modified

- `src/components/customers/service-history-timeline.tsx` - New "use client" vertical timeline component with filter chips, date markers, chemistry area, photo strip area, empty state
- `src/app/(app)/customers/[id]/page.tsx` - Replaced placeholder History tab div with ServiceHistoryTimeline; added allVisits flatMap computation
- `src/actions/pools.ts` - Added /customers revalidatePath to addPool and deletePool for list-page pool count cache

## Decisions Made

- `tech` field set to `null` in `allVisits` flatMap — the Drizzle relational query for customer does not currently include the tech relation on service visits; Phase 3 can add `with: { tech: true }` to the `serviceVisits` sub-query when visits have real data
- Defensive `instanceof Date` check on `visited_at` — Drizzle returns timestamps as Date objects in node-postgres mode; coerced to ISO string to match the component prop type
- Used plain `<button>` elements with `cn()` conditionals for filter chips — consistent with codebase pattern of avoiding zod/hookform resolvers (established in 02-02)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] RLS policies had NULL USING/WITH CHECK after drizzle-kit push**
- **Found during:** Task 2 verification (human verification of Phase 2 CRM flow)
- **Issue:** All 16 RLS policies on customers, pools, equipment, and service_visits tables had NULL `qual` (USING) and `with_check` columns in pg_catalog.pg_policies — meaning no rows could be read or written by any user under the policy check
- **Fix:** Recreated all 16 policies with correct USING/WITH CHECK expressions from the original migration SQL; verified via `SELECT policyname, qual, with_check FROM pg_catalog.pg_policies WHERE tablename = 'X'`
- **Files modified:** None (SQL migration run directly; no schema file change needed)
- **Committed in:** `23fe2c1`

**2. [Rule 1 - Bug] Pool count used correlated subquery that fails under RLS**
- **Found during:** Task 2 verification — pool count showed 0 after adding pools
- **Issue:** `(SELECT COUNT(*) FROM pools WHERE customer_id = customers.id)` correlated subquery runs outside the RLS transaction context, returning 0 rows for all customers
- **Fix:** Replaced with `LEFT JOIN pools ON pools.customer_id = customers.id GROUP BY customers.id, ... COUNT(pools.id) as pool_count` which executes within the same RLS-enforced query
- **Files modified:** `src/app/(app)/customers/page.tsx`
- **Committed in:** `23fe2c1`

**3. [Rule 2 - Missing Critical] addPool and deletePool missing /customers revalidation**
- **Found during:** Task 2 verification — after adding pools, returning to customer list showed stale pool count of 0
- **Issue:** `addPool` and `deletePool` only revalidated `/customers/${customerId}` (the profile page) but not `/customers` (the list page), leaving the list-page pool count stale
- **Fix:** Added `revalidatePath('/customers')` to both addPool and deletePool server actions
- **Files modified:** `src/actions/pools.ts`
- **Committed in:** `23fe2c1`

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 missing critical revalidation)
**Impact on plan:** All three fixes required for correct operation. RLS and pool count bugs were silent — UI appeared to work but served wrong data. Revalidation fix was a data freshness correctness issue. No scope creep.

## Issues Encountered

- drizzle-kit push creates RLS policies silently with NULL conditions — this is a known drizzle-kit limitation. Future migrations must include a post-migration verification step checking `pg_catalog.pg_policies.qual IS NOT NULL`.

## Deferred Items

- **UI Polish:** `cursor-pointer` missing on some interactive elements (buttons, cards, clickable rows) — non-blocking
- **UI Polish:** Low-contrast hover states on dark theme — some hover effects barely visible; needs contrast review — non-blocking

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All 6 CUST requirements verified by user (CUST-01 through CUST-06)
- Complete CRM flow working: list -> create -> search -> filter -> profile -> edit -> pools -> equipment -> history
- Service history timeline ready for Phase 3: pass enriched `ServiceVisit[]` with chemistry readings, tech relation, and photos
- RLS policies confirmed working correctly — Phase 3 can trust withRls transactions
- Phase 3 (Field Tech App) can build on top of Phase 2 without any Phase 2 rework

---
*Phase: 02-customer-pool-data-model*
*Completed: 2026-03-06*
