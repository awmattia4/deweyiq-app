---
phase: 10-smart-features-ai
plan: 04
subsystem: api
tags: [ors, vroom, route-optimization, machine-learning, historical-data, schedule]

# Dependency graph
requires:
  - phase: 09-reporting-team-analytics
    provides: started_at capture on route_stops + dosing_amounts on service_visits
  - phase: 04-scheduling-routing
    provides: optimizeRoute server action, OptimizePreview component, ORS VROOM integration
provides:
  - Per-pool historical service durations fed to ORS VROOM as job service times
  - Before/after comparison UI with drive time + total route time
  - AI-Optimized badge when >= 50% of stops use historical data
  - Per-stop service duration indicators in optimization preview
affects:
  - 10-smart-features-ai (plans that read from OptimizationResult)
  - schedule page (optimize preview)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - adminDb for historical cross-session queries to avoid RLS correlated subquery pitfall
    - Two-query pattern for historical data (route_stops separate from service_visits)
    - Median computation in application layer rather than SQL for simplicity

key-files:
  created: []
  modified:
    - src/actions/optimize.ts
    - src/components/schedule/optimize-preview.tsx

key-decisions:
  - "Historical duration query uses adminDb (not withRls) — cross-session queries for historical data don't have a user JWT context; explicit org_id filter enforces isolation"
  - "Two separate queries for route_stops and service_visits — matches two-query pattern from MEMORY.md to avoid RLS correlated subquery pitfall"
  - "Duration indexed by poolId:date composite key — matches route_stop.scheduled_date (text) to service_visit.visited_at date"
  - "50% historical coverage threshold for AI-Optimized badge — meaningful enough data to distinguish from pure defaults"
  - "Service time same in both orders — total time savings = drive savings only; service time displayed for context not as variable in savings"
  - "Sanity range 2min–4hr for historical durations — rejects garbage data (e.g. tech forgot to mark in_progress or completed)"

patterns-established:
  - "Historical ML data: adminDb + explicit org filter for cross-session aggregate queries"
  - "VROOM service field: per-stop dwell time in seconds fed via job.service property"
  - "AI badge pattern: feature flag based on data coverage ratio (>= 50%) with graceful fallback"

requirements-completed:
  - SCHED-07

# Metrics
duration: 8min
completed: 2026-03-16
---

# Phase 10 Plan 04: ML Route Optimization Summary

**ORS VROOM optimizer now feeds per-pool historical service durations as job dwell times, with before/after comparison showing drive + total route time and an AI-Optimized badge when real data covers >= 50% of stops.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-16T17:05:31Z
- **Completed:** 2026-03-16T17:13:52Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added `fetchHistoricalServiceDurations()` using adminDb to query per-pool median service durations from `route_stops.started_at` paired with `service_visits.completed_at`
- Each VROOM job now receives a `service` field (seconds) for more accurate route optimization when dwell time varies significantly between stops
- `OptimizationResult` now includes `currentTotalTimeMinutes`, `optimizedTotalTimeMinutes`, `usedHistoricalDurations`, and `historicalCoverage`
- Enhanced `OptimizePreview` to show drive time AND total route time in both columns, with per-stop service duration indicators (historical in normal text, estimated in muted italic)
- Added AI-Optimized/Standard Optimization badge in dialog header with coverage note

## Task Commits

Each task was committed atomically:

1. **Task 1: Enhance ORS VROOM with historical service durations** - `7d10de1` (feat)
2. **Task 2: Enhanced before/after comparison UI** - `7fb9cbc` (feat)

**Plan metadata:** See final docs commit.

## Files Created/Modified
- `src/actions/optimize.ts` - Added historical duration query, VROOM service field, total time fields, getRouteDirections restoration, orgSettings home base, workOrderId on stops
- `src/components/schedule/optimize-preview.tsx` - RouteTimeDisplay with drive+total, per-stop ClockIcon duration, AI-Optimized badge, percentage improvement badge

## Decisions Made
- Historical duration query uses adminDb (not withRls) — cross-session queries for historical aggregate data don't have a reliable user JWT; explicit org_id filter enforces isolation
- Two separate queries for route_stops and service_visits indexed by `poolId:scheduledDate` composite key — avoids RLS correlated subquery pitfall per MEMORY.md
- 50% historical coverage threshold for the AI-Optimized badge — requires meaningful data before claiming AI enhancement
- Service time is the same regardless of stop order, so total time savings = drive savings only; service time shown for transparency/context
- Sanity duration range 2min–4hr rejects garbage data from unclosed visits or missing stop markers

## Deviations from Plan

None - plan executed exactly as written. The committed version of `optimize.ts` was simpler than the working-tree version at session start (no `getRouteDirections` or `orgSettings`), but the complete feature was implemented as the plan specified.

## Issues Encountered
- The linter/formatter reverted unstaged changes to both files between reads, requiring a full Write of each file instead of incremental Edits. Root cause: both files had unstaged modifications from a prior session that were not committed. Solution: used Write tool after re-reading the committed version.
- Pre-existing build failures in `company-settings.ts`, `invoices.ts`, `work-orders.ts` (missing schema columns / exports from other phases) — out of scope, deferred.

## Next Phase Readiness
- ML-enhanced VROOM optimization ready for use on /schedule page
- Historical data accumulates with each Phase 9 stop completion (started_at + completed_at)
- Coverage will increase organically as techs complete more stops with Phase 9 tracking active

---
*Phase: 10-smart-features-ai*
*Completed: 2026-03-16*
