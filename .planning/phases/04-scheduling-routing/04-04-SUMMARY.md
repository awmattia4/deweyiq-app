---
phase: 04-scheduling-routing
plan: "04"
subsystem: ui
tags: [dnd-kit, multi-container-dnd, route-builder, unassigned-panel, copy-route, schedule, server-actions]

requires:
  - phase: 04-01
    provides: "route_stops schema, assignStopToRoute/updateStopOrder/removeStopFromRoute server actions, getStopsForDay"
  - phase: 04-03
    provides: "RouteBuilder, RouteStopList, RouteMap, TechDaySelector, StopLockToggle base components"

provides:
  - "UnassignedPanel: sidebar listing customers without route stops; search, checkbox multi-select, single + bulk assign"
  - "CopyRouteDialog: copy all stops from one tech+day to another tech+day"
  - "RouteBuilder rewritten with multi-container DnD: drag from unassigned panel directly onto stop list"
  - "getUnassignedCustomers: fetches org customers not assigned to tech+date (LEFT JOIN, RLS-safe)"
  - "bulkAssignStops: creates route_stop rows for multiple customer/pool pairs with auto-incrementing sort_index"
  - "copyRoute: copies all stops from sourceTech+sourceDate to targetTech+targetDate via onConflictDoNothing"
  - "toggleStopLock: persists position_locked on route_stop"
  - "Schedule page updated to fetch and pass initialUnassigned for SSR hydration"

affects: [04-05-dispatch, 04-06-optimize, 04-07-integration]

tech-stack:
  added: []
  patterns:
    - "Multi-container DnD: single DndContext wraps SortableContext for unassigned list and stop list; handleDragOver moves temp stop for visual feedback; handleDragEnd persists to server"
    - "DragOverlay with container detection: getContainer() checks which array (unassigned vs stops) the active.id belongs to"
    - "LEFT JOIN pattern (no correlated subquery): fetch all customers, fetch assigned IDs separately, filter in JS — avoids RLS pitfall on correlated subqueries"
    - "bulkAssignStops increments sort_index after max existing — appends new stops to end"
    - "CopyRouteDialog week-relative day picker: getDateForWeekday() computes ISO date from reference week + target weekday"

key-files:
  created:
    - src/components/schedule/unassigned-panel.tsx
    - src/components/schedule/copy-route-dialog.tsx
  modified:
    - src/components/schedule/route-builder.tsx
    - src/app/(app)/schedule/page.tsx
    - src/actions/schedule.ts

key-decisions:
  - "LEFT JOIN for unassigned customers: getUnassignedCustomers fetches all org customers and all assigned customer_ids separately, then filters in JS — avoids correlated subquery RLS pitfall documented in MEMORY.md"
  - "Multi-pool assignment: when a customer has multiple pools, each pool becomes a separate stop; bulkAssignStops accepts Array<{customerId, poolId}> rather than customerId[] to support this"
  - "DragOverlay ghost rendering: DragGhost checks stops array first, then unassigned, to render the correct ghost card type during cross-container drag"
  - "CopyRouteDialog onConflictDoNothing: when copying to a day that already has some stops, duplicates are silently skipped — preserves existing manual assignments"
  - "initialUnassigned SSR: schedule page fetches unassigned customers for first tech+today alongside initial stops, eliminating loading flash on first render"
  - "handleDragOver temporary state: cross-container drag inserts a temp ScheduleStop (with id = customer.id) into stops array for visual feedback during drag; handleDragEnd persists and then refreshes from server"

requirements-completed:
  - SCHED-01

duration: 8min
completed: 2026-03-08
---

# Phase 4 Plan 04: Unassigned Panel and Route Assignment Summary

**Unassigned customer panel with search and multi-select, multi-container drag-and-drop from unassigned to stop list, and copy-route dialog for duplicating an entire day's route across techs and days**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-08T23:48:25Z
- **Completed:** 2026-03-08T23:56:42Z
- **Tasks:** 2
- **Files modified:** 4 modified, 2 created

## Accomplishments

- UnassignedPanel with client-side search, checkbox multi-select, single "Assign" button per row, and "Assign Selected (N)" bulk footer — all customers without a route_stop for the selected tech+day
- Multi-container DnD: dragging a customer card from the unassigned panel onto the stop list creates a route_stop at the drop position; visual feedback via temporary stop insertion in handleDragOver, persisted via assignStopToRoute in handleDragEnd
- CopyRouteDialog: source info display, target tech dropdown, Mon-Fri day picker with ISO date calculation, calls copyRoute server action, shows toast with copied count
- Four new server actions: toggleStopLock, getUnassignedCustomers (LEFT JOIN pattern), bulkAssignStops, copyRoute

## Task Commits

1. **Task 1: Build unassigned panel with multi-select and click-to-assign** - `d397c41` (feat)
2. **Task 2: Wire multi-container DnD and add copy-route dialog to route builder** - `414de64` (feat)

**Plan metadata:** (docs commit to follow)

## Files Created/Modified

- `src/components/schedule/unassigned-panel.tsx` — Scrollable sidebar panel with search input, checkbox selection, single assign button, and bulk assign footer; renders pool count badge per customer
- `src/components/schedule/copy-route-dialog.tsx` — Dialog with source info, target tech select, Mon-Fri day buttons, calls copyRoute action, success/error toasts
- `src/components/schedule/route-builder.tsx` — Rewritten with multi-container DnD (DndContext + two SortableContext providers), DragOverlay ghost rendering, UnassignedPanel integration with toggle button, CopyRouteDialog trigger; initialUnassigned prop
- `src/app/(app)/schedule/page.tsx` — Updated to fetch getUnassignedCustomers in parallel with getStopsForDay for SSR; passes initialUnassigned to RouteBuilder
- `src/actions/schedule.ts` — Added toggleStopLock, getUnassignedCustomers, bulkAssignStops, copyRoute server actions

## Decisions Made

- **LEFT JOIN for unassigned**: getUnassignedCustomers fetches all active org customers and all assigned customer_ids separately, then filters in JS — avoids correlated subquery RLS pitfall. Per MEMORY.md: "NEVER use correlated SQL subqueries on RLS-protected tables inside withRls transactions."
- **Multi-pool customers**: bulkAssignStops accepts Array<{customerId, poolId}> so when a customer has multiple pools, each pool becomes a separate stop. UnassignedPanel.getPairsForCustomer() generates one pair per pool (or one null-pool pair if no pools).
- **DragOverlay ghost**: DragGhost checks stops array first, then unassigned array, to render a stop ghost vs a customer ghost correctly during cross-container drags.
- **Temp state during drag**: handleDragOver inserts a temporary ScheduleStop (id = customer.id) into the stops array for visual feedback without persisting. handleDragEnd calls assignStopToRoute to persist, then refreshes both lists from server.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Plan 04-03 was not executed — route-builder.tsx, route-stop-list.tsx, route-map.tsx etc. were missing**
- **Found during:** Task 1 pre-check (git log showed 04-03 had no SUMMARY.md)
- **Issue:** 04-04 plan references route-builder.tsx and assumes 04-03 is complete. Git log showed a prior agent had already committed these files (commits a29ebf2 and cb37828) as part of 04-03 execution, just without a SUMMARY.md
- **Fix:** Verified all 04-03 artifacts exist in git (route-builder.tsx, route-stop-list.tsx, tech-day-selector.tsx, stop-lock-toggle.tsx, route-map.tsx, map-client.tsx, schedule-tabs.tsx, schedule.ts with address/lat/lng) — proceeded with 04-04 only
- **Impact:** None — 04-03 work was already done; just needed disambiguation

**2. [Rule 2 - Missing Critical] toggleStopLock server action missing from 04-03**
- **Found during:** Task 1 discovery (stop-lock-toggle.tsx imported toggleStopLock but it wasn't in schedule.ts)
- **Issue:** stop-lock-toggle.tsx imported `toggleStopLock` from @/actions/schedule but the 04-03 implementation had not added it
- **Fix:** Added toggleStopLock server action to schedule.ts as part of Task 1's server action additions
- **Files modified:** src/actions/schedule.ts
- **Verification:** Build passes; import resolves correctly

---

**Total deviations:** 2 (1 Rule 3 disambiguation, 1 Rule 2 missing critical action)
**Impact on plan:** Disambiguation confirmed prior work existed; toggleStopLock was essential for stop-lock-toggle.tsx to function.

## Issues Encountered

None beyond the deviations documented above.

## User Setup Required

None — all functionality uses existing Supabase infrastructure.

## Next Phase Readiness

- UnassignedPanel, CopyRouteDialog, multi-container DnD all built and building cleanly
- getUnassignedCustomers, bulkAssignStops, copyRoute server actions ready for use
- Route builder now has the full "project management tool" feel per user's CONTEXT.md vision
- Ready for Phase 4 Plan 05 (live dispatch map) and Plan 06 (route optimization)

---
## Self-Check: PASSED

All 2 created files exist:
- src/components/schedule/unassigned-panel.tsx: FOUND
- src/components/schedule/copy-route-dialog.tsx: FOUND

Task commits verified: d397c41 and 414de64 present in git log.

*Phase: 04-scheduling-routing*
*Completed: 2026-03-08*
