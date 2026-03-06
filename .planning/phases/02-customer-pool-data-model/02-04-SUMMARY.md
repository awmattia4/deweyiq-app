---
phase: 02-customer-pool-data-model
plan: "04"
subsystem: ui
tags: [react, tailwind, timeline, service-history, customer-crm]

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

affects: [03-field-tech-app, phase-3-service-visits]

# Tech tracking
tech-stack:
  added: []
  patterns: [vertical-timeline-with-date-markers, filter-chip-toggle, phase-ready-placeholder-areas]

key-files:
  created:
    - src/components/customers/service-history-timeline.tsx
  modified:
    - src/app/(app)/customers/[id]/page.tsx

key-decisions:
  - "tech field set to null in allVisits flatMap — service_visits Drizzle query does not include tech relation; Phase 3 can add withTech: true to the relational query when populating"
  - "visited_at instanceof Date check — Drizzle can return Date objects or strings depending on mode; defensive coercion to ISO string for component prop"

patterns-established:
  - "Phase-ready placeholder areas: chemistry readings and photo strip use layout-only divs/sections so Phase 3 passes data without structural changes"
  - "Filter chip toggle: plain button elements with cn() conditional classes — no external library, matches codebase pattern avoiding zod/hookform"

requirements-completed:
  - CUST-06

# Metrics
duration: 8min
completed: 2026-03-06
---

# Phase 2 Plan 04: Service History Timeline Summary

**Vertical timeline component with date markers, filter chips, and Phase 3-ready chemistry/photo areas wired into the customer profile History tab**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-03-06T01:32:49Z
- **Completed:** 2026-03-06T01:40:00Z (stopped at human-verify checkpoint)
- **Tasks:** 1/2 complete (Task 2 awaiting human verification)
- **Files modified:** 2

## Accomplishments

- Built `ServiceHistoryTimeline` "use client" component with vertical left-side timeline line and cards
- Filter chips (All, Routine, Repair, One-off) with `useState` client-side filtering
- Date section headers that appear when the visit date changes between entries
- Visit type badges color-coded: Routine=blue, Repair=orange, One-off=purple
- Inline chemistry readings row (pH, Cl, Alk) with placeholder "--" values ready for Phase 3 data
- Photo strip area structured in component but empty in Phase 2 — no layout changes needed in Phase 3
- Empty state with `ClipboardList` icon and full contextual messaging per spec
- Replaced placeholder `<div>` in History tab with `<ServiceHistoryTimeline visits={allVisits} />`
- `allVisits` computed by flattening pool `serviceVisits` arrays with pool context attached

## Task Commits

1. **Task 1: Build service history timeline component** - `9c54376` (feat)

## Files Created/Modified

- `src/components/customers/service-history-timeline.tsx` - New "use client" vertical timeline component with filter chips, date markers, chemistry area, photo strip area, empty state
- `src/app/(app)/customers/[id]/page.tsx` - Replaced placeholder History tab div with ServiceHistoryTimeline; added allVisits flatMap computation

## Decisions Made

- `tech` field set to `null` in `allVisits` flatMap — the Drizzle relational query for customer does not currently include the tech relation on service visits; Phase 3 can add `with: { tech: true }` to the `serviceVisits` sub-query when visits have real data
- Defensive `instanceof Date` check on `visited_at` — Drizzle returns timestamps as Date objects in node-postgres mode; coerced to ISO string to match the component prop type
- Used plain `<button>` elements with `cn()` conditionals for filter chips — consistent with codebase pattern of avoiding zod/hookform resolvers (established in 02-02)

## Deviations from Plan

None - plan executed exactly as written. TypeScript passed with no errors on first attempt.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- History tab renders correctly with empty state for new customers
- Filter chips are visible and toggleable even with no data
- Timeline is ready for Phase 3 to populate: pass enriched `ServiceVisit[]` with chemistry readings and photos
- Human verification of complete Phase 2 CRM flow is pending (Task 2 checkpoint)

---
*Phase: 02-customer-pool-data-model*
*Completed: 2026-03-06*
