---
phase: 03-field-tech-app
plan: "03"
subsystem: ui
tags: [react, dnd-kit, dexie, offline, pwa, next.js, drizzle, supabase, rls]

# Dependency graph
requires:
  - phase: 03-field-tech-app
    provides: route_days table (stop_order JSONB), service_visits (status/skip_reason), Dexie routeCache store, @dnd-kit deps installed

provides:
  - GET /api/routes/today endpoint returning ordered stops as RouteStop[]
  - getTodayStops() SSR server action for /routes page
  - reorderStops() server action (persists for owner/office; client-only for tech per RLS)
  - skipStop() server action inserting service_visit with status=skipped
  - prefetchTodayRoutes() activated — fetches /api/routes/today and bulkPuts to Dexie with 24hr TTL
  - RouteProgress component — X of Y stops with visual fill bar (44px tap target)
  - StopCard component — customer name, address, pool type, last service date, notes strip, map navigation
  - StopList component — @dnd-kit drag-to-reorder with TouchSensor 250ms/5px + MouseSensor 10px
  - /routes page rewritten with SSR stops, progress bar, and stop list
  - /routes/loading.tsx updated to match StopCard shape with 4 skeleton cards

affects:
  - 03-04 (checklist view links from stop cards; may use RouteStop type)
  - 03-05 (photo capture linked from stop flow; uses RouteStop.poolId/customerId)
  - 03-06 (visit completion/sync uses skipStop server action pattern)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "LEFT JOIN approach for aggregate queries on RLS-protected tables (no correlated subqueries)"
    - "openInMaps() reads poolco-maps-pref localStorage key; defaults to Apple on iOS, Google elsewhere"
    - "prefetchTodayRoutes() writes stop-{idx} keyed entries to Dexie routeCache with 24hr TTL"
    - "Drag reorder stores in Dexie only for tech role (route_days UPDATE blocked by RLS); Phase 4 adds server persistence"
    - "@dnd-kit/sortable SortableStopCard pattern: useSortable hook + CSS.Transform + touchAction: none"

key-files:
  created:
    - src/app/api/routes/today/route.ts
    - src/actions/routes.ts
    - src/components/field/route-progress.tsx
    - src/components/field/stop-card.tsx
    - src/components/field/stop-list.tsx
  modified:
    - src/app/(app)/routes/page.tsx
    - src/app/(app)/routes/loading.tsx
    - src/lib/offline/sync.ts

key-decisions:
  - "Tech reorder is client-only (Dexie) — route_days UPDATE policy is owner+office only; Phase 4 adds persistent tech reordering when scheduling system overhauled"
  - "prefetchTodayRoutes clears routeCache on empty response — stale cache from prior day removed on app open"
  - "openInMaps uses https:// URLs not app:// deep links — more reliable in PWA standalone mode"
  - "StopCard showDragHandle only when >1 non-complete stop remaining — avoids showing unused grip icon for single-stop days"
  - "Last service date computed server-side from service_visits desc sort — first entry per pool_id picked in JS (no correlated subquery anti-pattern)"

patterns-established:
  - "fetchStopsForTech helper: reusable across API route and server action, avoiding code duplication"
  - "RouteStop interface in actions/routes.ts is the canonical stop type shared between API, server actions, and UI components"

requirements-completed:
  - FIELD-01
  - FIELD-02
  - FIELD-11

# Metrics
duration: 6min
completed: 2026-03-06
---

# Phase 3 Plan 03: Route View Summary

**SSR stop list on /routes with drag-to-reorder (@dnd-kit), progress bar, map navigation deep links, and offline prefetch via Dexie routeCache**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-06T15:32:57Z
- **Completed:** 2026-03-06T15:39:09Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- Built GET /api/routes/today + getTodayStops() SSR action returning ordered RouteStop[] from route_days JSONB + customer/pool JOIN
- Built RouteProgress (visual fill bar), StopCard (info card + map navigation), and StopList (@dnd-kit drag-to-reorder) components
- Activated prefetchTodayRoutes() stub — now fetches route API and writes stops to Dexie routeCache with 24-hour TTL
- Rewrote /routes page replacing Phase 1 empty state with SSR stop list, progress bar, and map toggle stub
- Full dark-first design system, 44px minimum tap targets throughout (FIELD-11)

## Task Commits

Each task was committed atomically:

1. **Task 1: Build route API endpoint and activate offline prefetch** - `39b8825` (feat)
2. **Task 2: Build stop list UI with drag-to-reorder, progress bar, and map navigation** - `d7da9bf` (feat)

**Plan metadata:** (created after summary)

## Files Created/Modified

- `src/app/api/routes/today/route.ts` — GET endpoint: authenticates, fetches route_day for today's tech, returns RouteStop[] with customer/pool data and last service date
- `src/actions/routes.ts` — Server actions: getTodayStops() SSR, reorderStops() (persists for owner/office, client-only for tech), skipStop() inserts service_visit with status=skipped
- `src/lib/offline/sync.ts` — prefetchTodayRoutes() activated: fetches /api/routes/today, bulkPuts to routeCache, clears stale cache on empty response
- `src/components/field/route-progress.tsx` — X of Y progress bar: visual fill, percentage label, green all-done state, 44px min height
- `src/components/field/stop-card.tsx` — Info card: customer name, address, pool type + icon, last service date, amber notes strip, map navigation button (Apple/Google), status badges, 44px height
- `src/components/field/stop-list.tsx` — Sortable list: DndContext + SortableContext + useSortable, TouchSensor (250ms delay, 5px tolerance), MouseSensor (10px distance), KeyboardSensor, drag end writes to Dexie, empty state
- `src/app/(app)/routes/page.tsx` — Rewritten: SSR getTodayStops(), RouteProgress + StopList, map toggle stub button, date header preserved
- `src/app/(app)/routes/loading.tsx` — Updated skeleton: matches StopCard layout with stop number, name+badge row, address, pool info, navigate button, 4 cards

## Decisions Made

- **Tech reorder client-only:** route_days UPDATE policy is owner+office only per RLS. Techs' drag reorder persists to Dexie only. Phase 4 will add persistent tech reordering when the full scheduling system is built with proper tech-accessible stop rows.
- **prefetchTodayRoutes clears on empty:** If no stops today, routeCache.clear() removes yesterday's stale data — prevents showing stale route on day change.
- **https:// URLs for maps navigation:** `maps.apple.com` and `google.com/maps/search` are more reliable than `maps://` deep links in PWA standalone mode — tested pattern from research.
- **Last service date via JS dedup:** Fetched all service_visits for org ordered desc, picked first per pool_id in JavaScript — avoids correlated subquery anti-pattern on RLS-protected tables (MEMORY.md critical pitfall).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] DraggableAttributes type cast in stop-list.tsx and stop-card.tsx**
- **Found during:** Task 2 (build verification step)
- **Issue:** TypeScript rejected `attributes as Record<string, unknown>` cast — `DraggableAttributes` has no index signature, so the double-cast via `unknown` was needed. Also, the `Record<string, unknown>` prop types on StopCard were incompatible with the actual dnd-kit attribute/listener types
- **Fix:** Updated StopCard to use `DraggableSyntheticListeners` and `DraggableAttributes` from `@dnd-kit/core` as prop types; updated StopList to pass `listeners ?? undefined` and `attributes` directly without cast
- **Files modified:** `src/components/field/stop-card.tsx`, `src/components/field/stop-list.tsx`
- **Verification:** `npm run build` passes with no TypeScript errors
- **Committed in:** `d7da9bf` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — type error caught at build time)
**Impact on plan:** Required fix for build to pass. No scope creep. chemistry-grid.tsx temperatureF key was pre-fixed by linter before our build ran.

## Issues Encountered

- Pre-existing TypeScript errors in `src/lib/chemistry/__tests__/dosing.test.ts` (missing `borate` and `temperatureF` fields on `FullChemistryReadings`) — out of scope for this plan. Logged to deferred items.
- chemistry-grid.tsx had `key: "temperatureF"` where `null` was required — linter had already applied the fix before our build ran, so no action needed.

## User Setup Required

None — all changes are client components and server actions using existing Supabase + Drizzle setup.

## Next Phase Readiness

- Route view fully functional: SSR stop list, progress bar, drag-to-reorder, map navigation, offline cache
- RouteStop interface in `src/actions/routes.ts` is the canonical type for all downstream plans
- 03-04 (checklist UI) can link from stop cards using customerId/poolId from RouteStop
- 03-05 (photo capture) can use the same RouteStop type for context when entering stop flow
- skipStop() server action establishes the service_visit write pattern for 03-06 (visit completion)

---
*Phase: 03-field-tech-app*
*Completed: 2026-03-06*

## Self-Check: PASSED

All created files found on disk. All commits verified in git log. Key artifacts confirmed:
- `openInMaps` in stop-card.tsx
- `DndContext` in stop-list.tsx
- `Progress` in route-progress.tsx
- `StopList` in /routes/page.tsx
