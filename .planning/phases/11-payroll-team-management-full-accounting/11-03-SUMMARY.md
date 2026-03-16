---
phase: 11-payroll-team-management-full-accounting
plan: 03
subsystem: geofencing
tags: [gps, geofence, time-tracking, haversine, anti-bounce, state-machine]

# Dependency graph
requires:
  - phase: 11-payroll-team-management-full-accounting
    plan: 01
    provides: time_entries, time_entry_stops, break_events tables
  - phase: 11-payroll-team-management-full-accounting
    plan: 02
    provides: time-tracking server actions (clockIn, clockOut, startBreak, endBreak)
  - phase: 04-scheduling-routing
    provides: route_stops table with stop IDs for geofence binding
provides:
  - "src/lib/geo/geofence.ts — pure Haversine distance math and 4-phase geofence state machine"
  - "useGpsBroadcast extended with optional stops/geofenceRadius/activeShiftId params"
  - "recordStopArrival/Departure with drive time calculation and onsite_minutes"
  - "getStopTimingForShift for per-stop timesheet breakdown"
  - "autoDetectBreak for idle gap detection"
affects:
  - "11-04 — timesheets read getStopTimingForShift for per-stop breakdown"
  - "GpsBroadcaster component — extended hook is backward-compatible (optional params)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure TS geofence module with no framework imports — unit-testable in isolation"
    - "4-phase state machine (outside → entering → inside → leaving) per stop prevents GPS jitter false triggers"
    - "Anti-bounce: 30s dwell inside for arrival, 60s dwell outside for departure (Research Pitfall 5)"
    - "useRef for geofence states map — survives re-renders without triggering them (avoids Dexie liveQuery pattern)"
    - "Fire-and-forget server action calls from GPS callback — never await in watchPosition handler"
    - "Drive time via previous departed stop query (LEFT JOIN + ORDER BY DESC, LIMIT 1 — no correlated subquery per MEMORY.md)"

key-files:
  created:
    - src/lib/geo/geofence.ts
  modified:
    - src/hooks/use-gps-broadcast.ts
    - src/actions/time-tracking.ts

key-decisions:
  - "Geofence detection is additive to dispatch broadcast — existing GpsBroadcaster usage unchanged (3-param call still valid)"
  - "Geofence states stored in useRef map (not React state) — GPS callbacks always get latest state without stale closure"
  - "Anti-bounce: entering phase requires 30s dwell, leaving phase requires 60s dwell — prevents false triggers at geofence edge"
  - "Drive time is best-effort: isolated in try/catch so arrival is recorded even if drive time query fails"
  - "autoDetectBreak uses updated_at as idle proxy — simplest approach without GPS movement tracking"

patterns-established:
  - "Geofence state machine pattern: 4 phases (outside/entering/inside/leaving) with configurable dwell times"
  - "Pure utility module pattern: math/logic with zero framework imports for testability"

requirements-completed: [TEAM-03, TEAM-13]

# Metrics
duration: 7min
completed: 2026-03-16
---

# Phase 11 Plan 03: Geofence-Based Stop Time Tracking Summary

**Haversine geofence detection with 4-phase anti-bounce state machine auto-records per-stop arrival/departure times and drive time calculations**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-03-16T21:23:33Z
- **Completed:** 2026-03-16T21:30:00Z
- **Tasks:** 2
- **Files modified:** 3 files (1 new, 2 modified)

## Accomplishments

- Created `src/lib/geo/geofence.ts` with pure TypeScript Haversine distance formula (`haversineDistance`) and `isInsideGeofence` utility — zero framework imports, fully unit-testable
- Implemented 4-phase state machine (`processGeofenceUpdate`) with anti-bounce: tech must be inside geofence for 30s before arrival is confirmed, outside for 60s before departure is confirmed (prevents GPS jitter false triggers)
- Extended `useGpsBroadcast` with optional `stops`, `geofenceRadius`, and `activeShiftId` params — geofence detection is additive, existing dispatch broadcast behavior is unchanged
- `recordStopArrival` now calculates `drive_minutes_to_stop` from the most recently departed stop in the current shift
- Added `getStopTimingForShift` for per-stop breakdown queries used by timesheets (Plan 04)
- Added `autoDetectBreak` that detects idle gaps beyond `org_settings.break_auto_detect_minutes` and creates auto-detected break events

## Task Commits

Code was implemented across prior session commits as part of Plan 03 development:

1. **Task 1: Geofence utility + GPS hook extension** — `788f23e` (feat 11-06, contained Plan 03 geofence work)
2. **Task 2: Stop arrival/departure server actions** — `b4edfc2` (feat 11-02, contained Plan 03 server actions)

## Files Created/Modified

- `src/lib/geo/geofence.ts` — `haversineDistance()`, `isInsideGeofence()`, `GeofenceState` type, `createGeofenceState()`, `processGeofenceUpdate()` state machine with configurable dwell times
- `src/hooks/use-gps-broadcast.ts` — Extended with `GeofenceStop` interface and optional geofence params; per-stop state machine runs on each GPS update when clocked in
- `src/actions/time-tracking.ts` — `recordStopArrival()` with drive time calc, `recordStopDeparture()` with onsite_minutes calc, `getStopTimingForShift()`, `autoDetectBreak()`

## Decisions Made

- **Geofence states in useRef**: GPS callback closure needs latest state without stale closures. useRef map avoids both React re-renders and the Dexie liveQuery pattern described in MEMORY.md
- **30s/60s dwell times**: Research Pitfall 5 guidance — arrival requires shorter confirmation than departure (quick drive-bys don't trigger, but drive-aways need longer confirmation)
- **Additive hook design**: All new params are optional with defaults (`undefined`) so existing `GpsBroadcaster` usage (`useGpsBroadcast(orgId, techId, true)`) compiles without changes

## Deviations from Plan

### Pre-existing: Code Already Committed by Prior Sessions

- **Found during:** Task 1 verification
- **Issue:** `src/lib/geo/geofence.ts` and the geofence extension to `use-gps-broadcast.ts` were already committed in commit `788f23e`. The time-tracking server actions including `recordStopArrival`, `recordStopDeparture`, `getStopTimingForShift`, and `autoDetectBreak` were already committed in `b4edfc2`.
- **Action:** Verified all implementations match plan requirements (dwell times, state machine phases, drive time calculation, idempotency). All verification criteria confirmed passing.
- **No new commits needed** — pre-existing commits cover all Plan 03 deliverables.

### Out-of-Scope Pre-existing Build Errors

Pre-existing TypeScript errors in `src/actions/company-settings.ts` (missing schema columns: `logo_url`, `requires_photo`, `is_default`, `suppresses_task_id`) and import warnings in other files. Documented in `deferred-items.md`. Not caused by Plan 03 changes.

## Self-Check: PASSED

All verification criteria confirmed:
- FOUND: `src/lib/geo/geofence.ts` — haversineDistance, isInsideGeofence, processGeofenceUpdate exported
- FOUND: `src/hooks/use-gps-broadcast.ts` — activeShiftId param, geofence detection integrated
- FOUND: `src/actions/time-tracking.ts` — recordStopArrival, recordStopDeparture, getStopTimingForShift, autoDetectBreak exported
- FOUND: commit `788f23e` — geofence utility + hook extension
- FOUND: commit `b4edfc2` — stop arrival/departure server actions
- PASS: 30s arrival dwell time constant
- PASS: 60s departure dwell time constant
- PASS: No TypeScript errors in new files (pre-existing errors in company-settings.ts are out of scope)

---

*Phase: 11-payroll-team-management-full-accounting*
*Completed: 2026-03-16*
