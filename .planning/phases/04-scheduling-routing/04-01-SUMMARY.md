---
phase: 04-scheduling-routing
plan: "01"
subsystem: database
tags: [drizzle, postgres, rls, maplibre, react-map-gl, route-stops, schedule-rules, holidays]

requires:
  - phase: 03-field-tech-app
    provides: route_days JSONB table that route_stops replaces; RouteStop interface consumed by tech app

provides:
  - route_stops relational table with RLS (replaces route_days JSONB for stop management)
  - schedule_rules table with RLS (recurring service schedule configuration)
  - holidays table with RLS (org-scoped holiday dates)
  - customers.lat and customers.lng columns for geocoding
  - fetchStopsForTech reads route_stops with backward-compat fallback to route_days
  - RouteStop interface extended with Phase 4 fields (routeStopId, positionLocked, windowStart, windowEnd, scheduleRuleId)
  - /api/routes/today simplified to delegate to shared fetchStopsForTech helper
  - Schedule and Dispatch sidebar nav items activated for owner/office roles
  - maplibre-gl and react-map-gl installed

affects: [04-02-schedule-ui, 04-03-dispatch-map, 04-04-route-optimizer, all Phase 4 plans]

tech-stack:
  added: [maplibre-gl, react-map-gl]
  patterns:
    - drizzle-kit push creates NULL RLS policies — always manually recreate via psql after push
    - fetchStopsForTech exported for shared use between server actions and API routes
    - Phase 3→4 migration path via route_stops primary with route_days fallback

key-files:
  created:
    - src/lib/db/schema/route-stops.ts
    - src/lib/db/schema/schedule-rules.ts
    - src/lib/db/schema/holidays.ts
  modified:
    - src/lib/db/schema/customers.ts
    - src/lib/db/schema/index.ts
    - src/lib/db/schema/relations.ts
    - src/actions/routes.ts
    - src/app/api/routes/today/route.ts
    - src/components/shell/app-sidebar.tsx
    - src/components/shell/app-header.tsx
    - package.json

key-decisions:
  - "route_stops UPDATE policy allows tech role — app layer enforces which fields techs can write (not RLS column-level)"
  - "fetchStopsForTech exported from routes.ts — shared between server action and API route; eliminates ~80 lines of duplicated query code"
  - "Phase 3 fallback in fetchStopsForTech — route_days JSONB path used when no route_stops exist for the day; logs warning to prompt migration"
  - "reorderStops overloaded — detects Phase 4 {id, sortIndex} vs Phase 3 {customer_id, pool_id, sort_index} by shape of first item in newOrder array"
  - "drizzle-kit push (confirmed again in Phase 4) creates NULL RLS policies — all 12 policies manually recreated via docker exec psql"

requirements-completed:
  - SCHED-01
  - SCHED-04

duration: 12min
completed: 2026-03-08
---

# Phase 4 Plan 01: Database Foundation Summary

**route_stops/schedule_rules/holidays tables with RLS, geocoding columns on customers, maplibre-gl installed, and tech app API migrated to route_stops with route_days fallback**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-08T23:31:57Z
- **Completed:** 2026-03-08T23:43:57Z
- **Tasks:** 2
- **Files modified:** 10 (plus 3 created)

## Accomplishments

- Three new Drizzle schema tables (route_stops, schedule_rules, holidays) in Postgres with 12 RLS policies, all verified non-NULL
- Tech app API migrated from route_days JSONB to route_stops with backward-compatible fallback; API route deduplicated (~80 lines removed)
- RouteStop interface extended with Phase 4 fields; fetchStopsForTech exported for shared use
- maplibre-gl and react-map-gl installed; Schedule and Dispatch nav items activated for owner/office

## Task Commits

1. **Task 1: Schema tables, geocoding columns, dependencies, sidebar** - `1da6d08` (feat) [prior agent]
2. **Task 2: Migrate tech app API to route_stops** - `6d12283` (feat)

## Files Created/Modified

- `src/lib/db/schema/route-stops.ts` - route_stops table with RLS (SELECT all org, INSERT/DELETE owner+office, UPDATE owner+office+tech)
- `src/lib/db/schema/schedule-rules.ts` - schedule_rules table with RLS (SELECT all org, INSERT/UPDATE/DELETE owner+office)
- `src/lib/db/schema/holidays.ts` - holidays table with RLS (SELECT all org, INSERT/UPDATE/DELETE owner+office)
- `src/lib/db/schema/customers.ts` - Added lat/lng doublePrecision columns for geocoding
- `src/lib/db/schema/index.ts` - Added Phase 4 table exports
- `src/lib/db/schema/relations.ts` - Added routeStopsRelations, scheduleRulesRelations, holidaysRelations; extended customers/pools with routeStops/scheduleRules many-relations
- `src/actions/routes.ts` - Migrated fetchStopsForTech to route_stops primary path; exported fetchStopsForTech; updated RouteStop interface; overloaded reorderStops for Phase 3/4 compat
- `src/app/api/routes/today/route.ts` - Simplified to delegate to fetchStopsForTech (80+ lines removed)
- `src/components/shell/app-sidebar.tsx` - Activated Schedule + Dispatch nav items for owner/office
- `src/components/shell/app-header.tsx` - Added /dispatch breadcrumb mapping

## Decisions Made

- **route_stops UPDATE policy allows tech role:** RLS is row-level not column-level; UPDATE policy grants tech access to route_stop rows so techs can update status in the field. Application layer (server actions) enforces which fields techs can change (only status/sort_index, not org_id/customer_id).
- **fetchStopsForTech exported:** Previously unexported internal function. Exported so `/api/routes/today` can call it directly, eliminating ~80 lines of duplicated query logic.
- **Phase 3 fallback warning:** When no route_stops rows exist for a tech+date, falls back to route_days JSONB and logs a console.warn. This allows gradual migration without breaking the tech app.
- **reorderStops overloaded:** Detects Phase 4 `{id, sortIndex}` array shape vs Phase 3 `{customer_id, pool_id, sort_index}` array shape from the first item, branching to route_stops update vs route_days update accordingly.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Committed Phase 3-08 bug fixes that were in working tree but uncommitted**
- **Found during:** Task 1 discovery (git status showed modified files from prior Phase 3 work)
- **Issue:** 10 Phase 3-08 files (routes.ts, visits.ts, stop-workflow.tsx, etc.) were modified but not committed; they were Phase 3 verification bug fixes that needed to land before Phase 4 work
- **Fix:** Committed Phase 3-08 bug fixes in a separate commit before Phase 4 task commits
- **Files modified:** src/actions/routes.ts, src/actions/visits.ts, src/app/api/routes/today/route.ts, src/components/field/*.tsx, src/hooks/use-visit-draft.ts, src/lib/offline/db.ts
- **Committed in:** `9e4cce1` (fix(03-08): apply Phase 3 bug fixes verified during UX testing)

**2. [Rule 3 - Blocking] Prior agent had already executed Task 1 and part of Task 2 in commit 1da6d08**
- **Found during:** Task 1 execution (schema files already existed in git HEAD)
- **Issue:** A prior agent ran and committed schema files, schedule.ts, and schedule components as `feat(04-02)` before Task 1 had a proper `feat(04-01)` commit. The migrateRouteDaysToRouteStops and CRUD helpers from Task 2 were also already in schedule.ts.
- **Fix:** Recognized prior work as Task 1 completion; focused Task 2 on the remaining items: fetchStopsForTech migration to route_stops, API route deduplication, and RouteStop interface extension
- **Files modified:** src/actions/routes.ts, src/app/api/routes/today/route.ts
- **Committed in:** `6d12283` (feat(04-01))

---

**Total deviations:** 2 (1 Rule 1 bug fix commit, 1 Rule 3 blocking disambiguation)
**Impact on plan:** Phase 3 bug fixes necessary for correctness. Prior agent work required careful disambiguation to avoid re-executing completed tasks.

## Issues Encountered

- **drizzle-kit push NULL RLS policies (confirmed again):** All 12 policies created with NULL qual/with_check. Manually recreated all via `docker exec supabase_db_Pool_Company_management psql` with individual `-c` flags (heredoc approach failed in docker exec context). Verified non-NULL via pg_policy catalog query using pg_get_expr(polqual, polrelid).

## User Setup Required

None - all schema changes applied to local Supabase dev instance via drizzle-kit push + manual RLS policy recreation.

## Next Phase Readiness

- route_stops, schedule_rules, holidays tables exist with correct RLS
- fetchStopsForTech reads from route_stops with route_days fallback
- schedule.ts has full CRUD and migration helper
- maplibre-gl and react-map-gl ready for dispatch map
- Schedule and Dispatch pages exist (placeholder) and appear in sidebar
- Ready for Phase 4 Plan 02: Schedule UI (schedule rules management, holiday calendar)

---
*Phase: 04-scheduling-routing*
*Completed: 2026-03-08*
