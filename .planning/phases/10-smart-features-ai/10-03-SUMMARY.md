---
phase: 10-smart-features-ai
plan: 03
subsystem: ui
tags: [schedule, auto-schedule, workload-balance, geographic-clustering, server-actions, next-js, drizzle]

# Dependency graph
requires:
  - phase: 04-scheduling-routing
    provides: schedule_rules schema, route_stops schema, generateDatesForRule logic, withRls patterns
  - phase: 09-reporting-team-analytics
    provides: workload context for balancing decisions
provides:
  - Auto-schedule engine that generates balanced weekly route proposals using geographic clustering
  - Workload balance UI showing per-tech stop distribution with imbalance highlighting
  - Preview-before-apply pattern for auto-scheduling (no surprise overwrites)
affects: [10-smart-features-ai, future-scheduling, route-builder]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Two-query pattern for tech+stops aggregation (avoids correlated subquery RLS pitfall)
    - Greedy geographic clustering with haversine centroid scoring + load factor normalization
    - Preview-before-persist proposal pattern (same as optimizeRoute/applyOptimizedOrder)
    - Client wrapper trigger pattern for server-component page + client dialog

key-files:
  created:
    - src/components/schedule/workload-balancer.tsx
    - src/components/schedule/workload-balancer-trigger.tsx
  modified:
    - src/actions/schedule.ts
    - src/app/(app)/schedule/page.tsx

key-decisions:
  - "Heuristic 25 min/stop drive-time estimate in getWorkloadBalance — avoids ORS API call for balance query; fast, sufficient for imbalance detection"
  - "Greedy geographic centroid scoring: haversine(stop, techDayCentroid) + loadFactor*5km — load factor in km-equivalent units for uniform scoring"
  - "generateDatesForRule reused for proposal firings — single source of truth for schedule rule date expansion"
  - "WorkloadBalancerTrigger client component wraps button+dialog — keeps schedule page as pure server component"
  - "applyAutoSchedule uses onConflictDoNothing on route_stops unique constraint — idempotent, safe to re-apply"
  - "Preferred day respects rule.preferred_day_of_week mapped to Mon=0...Fri=4 (0-indexed into weekDates array)"

patterns-established:
  - "Preview-before-apply: autoScheduleWeek returns proposal, applyAutoSchedule persists it — office must approve before any writes"
  - "WorkloadMetrics interface exported for reuse in UI components"

requirements-completed:
  - SMART-03
  - SCHED-08

# Metrics
duration: 8min
completed: 2026-03-16
---

# Phase 10 Plan 03: Auto-Schedule Engine and Workload Balancer Summary

**Greedy geographic clustering auto-scheduler with haversine centroid scoring, imbalance-highlighted workload preview, and preview-before-apply proposal flow for weekly route planning.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-16T17:05:39Z
- **Completed:** 2026-03-16T17:13:39Z
- **Tasks:** 2
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments
- `getWorkloadBalance` server action queries per-tech stop counts and estimates drive time for any ISO week
- `autoScheduleWeek` engine respects existing assignments (DB stops with tech_id), applies preferred_day_of_week from schedule rules, and assigns remaining stops via greedy geographic clustering
- `applyAutoSchedule` persists an approved proposal atomically via update (existing stops) + insert with onConflictDoNothing (new stops)
- `WorkloadBalancer` dialog shows current distribution with imbalance highlighting (>30% above avg = red), then auto-schedule proposal before/after comparison
- "Balance Workload" button added to Schedule page header, visible to owner/office roles

## Task Commits

Each task was committed atomically:

1. **Task 1: Auto-schedule engine and workload balancing server actions** - `81a960d` (feat)
2. **Task 2: Workload balancer preview UI on Schedule page** - `d2a6a94` (feat)

## Files Created/Modified
- `src/actions/schedule.ts` — Added `getWorkloadBalance`, `autoScheduleWeek`, `applyAutoSchedule` + exported types `WorkloadMetrics`, `AutoScheduleAssignment`, `AutoScheduleProposal`
- `src/components/schedule/workload-balancer.tsx` — Dialog with 3-phase flow: balance view → proposal view → applying state
- `src/components/schedule/workload-balancer-trigger.tsx` — Client wrapper that owns open state, calls router.refresh() on apply
- `src/app/(app)/schedule/page.tsx` — Added weekStartDate computation, imported WorkloadBalancerTrigger, added button to page header

## Decisions Made
- **Heuristic drive time**: 25 min/stop average in `getWorkloadBalance` — avoids ORS API call overhead for balance query; accurate enough for imbalance detection
- **Geographic scoring**: haversine distance to centroid + load penalty (5km/stop above average) — keeps units uniform for scoring comparison
- **Centroid for clustering**: average lat/lng of all geocoded stops assigned to a tech-day — simple, fast, no API dependency
- **reuse generateDatesForRule**: the existing rule date expander handles all frequency types correctly; no separate implementation needed
- **preview-before-persist**: same pattern as optimizeRoute — office sees full proposal before any writes
- **weekDates array**: getWeekDatesFromStart builds Mon-Fri array; `preferred_day_of_week` mapped with `Sunday=0 → index 0` edge case handled

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed UnassignedFiring type missing `firedDate` field**
- **Found during:** Task 1 (schedule.ts TypeScript check)
- **Issue:** `UnassignedFiring extends RuleFiring` requires `firedDate` but push only included `rule` and `day`
- **Fix:** Added `firedDate` to the push call: `{ rule, firedDate, day: firedDate }`
- **Files modified:** `src/actions/schedule.ts`
- **Verification:** `tsc --noEmit` passes with no errors in schedule.ts
- **Committed in:** `81a960d`

---

**Total deviations:** 1 auto-fixed (1 type bug)
**Impact on plan:** Minor type-only fix. No scope creep.

## Issues Encountered
- Linter (ESLint/Prettier auto-save) reverted first edit attempt that included `checklistTemplates` in imports alongside the new functions. Re-applied additions to the clean linter-processed file on second attempt. All functions added successfully on retry.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Auto-schedule engine ready for Phase 10 further smart-feature plans
- `WorkloadMetrics` and `AutoScheduleProposal` types exported for any downstream consumers
- Pattern established: preview-before-apply applies to all AI-powered scheduling actions

---
*Phase: 10-smart-features-ai*
*Completed: 2026-03-16*
