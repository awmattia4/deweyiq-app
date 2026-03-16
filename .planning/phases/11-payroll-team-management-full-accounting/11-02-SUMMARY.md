---
phase: 11-payroll-team-management-full-accounting
plan: 02
subsystem: ui
tags: [time-tracking, clock-in, gps, server-actions, drizzle, rls, react, nextjs]

# Dependency graph
requires:
  - phase: 11-01
    provides: "time_entries, break_events, time_entry_stops tables + org_settings.time_tracking_enabled"

provides:
  - "clockIn/clockOut server actions with GPS capture and local date string"
  - "startBreak/endBreak server actions with time_entry status toggle"
  - "getActiveShift — returns open shift + break state for ClockInBanner"
  - "getTimeTrackingEnabled — org-level feature flag check"
  - "checkBreakCompliance — fires break_compliance alert via adminDb"
  - "recordStopArrival/recordStopDeparture — geofence-triggered stop timing"
  - "ClockInBanner — persistent clock-in/out strip on /routes page"
  - "BreakButton — inline break start/end toggle within ClockInBanner"

affects:
  - 11-03  # auto-break detection reads time_entries + calls checkBreakCompliance
  - 11-04  # QBO time push reads time_entries written by clockIn/clockOut

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "GPS is non-blocking: getCurrentPosition with try/catch, null coords on failure"
    - "Live elapsed time via setInterval in useEffect, cleared on unmount"
    - "BreakTimerDisplay as isolated sub-component to avoid full-banner re-renders"
    - "adminDb used only for compliance alerts (bypasses RLS for background jobs)"
    - "recordStopArrival uses onConflictDoNothing to prevent duplicate arrivals"

key-files:
  created:
    - src/actions/time-tracking.ts
    - src/components/field/clock-in-banner.tsx
    - src/components/field/break-button.tsx
  modified:
    - src/app/(app)/routes/page.tsx

key-decisions:
  - "ClockInBanner is additive to routes page — does not modify Start Route or stop list behavior"
  - "GPS failure never blocks clock-in (try/catch resolves to null coords)"
  - "recordStopArrival/recordStopDeparture added (not in original plan) to fix use-gps-broadcast.ts import"
  - "checkBreakCompliance uses adminDb for alert INSERT (RLS restricts to owner/office)"
  - "Time tracking banner only shown for tech + owner roles; office excluded"

patterns-established:
  - "Live timer pattern: setInterval in useEffect, cleaned up on unmount, calculated from epoch ms"
  - "State refresh after mutation: call getActiveShift() after clockIn() to get fresh entryId"

requirements-completed:
  - TEAM-02
  - TEAM-11
  - TEAM-14

# Metrics
duration: 6min
completed: 2026-03-16
---

# Phase 11 Plan 02: Clock-In / Clock-Out System Summary

**One-tap clock-in/out with GPS capture, live shift timer, and break handling built as a persistent banner above the routes page**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-16T20:03:26Z
- **Completed:** 2026-03-16T20:09:Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- 7 server actions covering the full clock-in/out/break lifecycle (plus 2 stop-timing actions added as deviation)
- ClockInBanner with 3 visual states (not clocked in, active, on break) + live elapsed time display
- BreakButton as an inline sub-component within ClockInBanner
- Routes page updated to conditionally render ClockInBanner based on org-level time_tracking_enabled flag
- GPS coordinates captured on clock-in and clock-out; failure never blocks the action

## Task Commits

Each task was committed atomically:

1. **Task 1: Create time tracking server actions** - `b4edfc2` (feat)
2. **Task 2: Build ClockInBanner and BreakButton, integrate into routes page** - `e8c401c` (feat)

**Plan metadata:** `[tbd after final commit]` (docs: complete plan)

## Files Created/Modified

- `src/actions/time-tracking.ts` — 9 server actions: clockIn, clockOut, startBreak, endBreak, getActiveShift, getTimeTrackingEnabled, checkBreakCompliance, recordStopArrival, recordStopDeparture
- `src/components/field/clock-in-banner.tsx` — Client component with 3 states, live timer, GPS helper, clock-in/out handlers
- `src/components/field/break-button.tsx` — Simple break toggle rendered inline in ClockInBanner
- `src/app/(app)/routes/page.tsx` — Added ClockInBanner import, isFieldUser guard, getTimeTrackingEnabled() server-side fetch

## Decisions Made

- ClockInBanner is additive — does not modify or displace Start Route button or stop list
- GPS failure is non-fatal; null coordinates are passed to clockIn/clockOut
- Visually distinct: ClockInBanner uses emerald/amber/violet colors; Start Route uses primary (blue)
- clockOut auto-ends an open break before recording the clock-out time
- checkBreakCompliance uses adminDb (not withRls) because alert INSERT requires owner/office role

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added recordStopArrival and recordStopDeparture to time-tracking.ts**
- **Found during:** Task 1 (after creating time-tracking.ts, build revealed broken imports)
- **Issue:** `src/hooks/use-gps-broadcast.ts` imported `recordStopArrival` and `recordStopDeparture` from `@/actions/time-tracking`. These functions did not exist yet — build failed with TypeScript error.
- **Fix:** Implemented both functions in time-tracking.ts. recordStopArrival inserts a time_entry_stops row with arrived_at; recordStopDeparture finds the open row and sets departed_at + onsite_minutes. Both use withRls.
- **Files modified:** `src/actions/time-tracking.ts`
- **Verification:** `npx tsc --noEmit` on time-tracking.ts shows no errors; `use-gps-broadcast.ts` import errors resolved.
- **Committed in:** `b4edfc2` (part of Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Auto-fix was necessary to unblock the build. recordStopArrival/recordStopDeparture are directly related to time tracking and were already referenced by existing code — adding them is correct scope.

## Issues Encountered

- Pre-existing TypeScript errors in unrelated files (plaid-connect.tsx, company-settings.ts, getPredictiveAlertsForPools in alerts.ts) cause build to fail. These are out of scope for this plan and were not introduced by our changes. Logged to deferred-items.
- Stale `.next/lock` file blocked second build attempt — removed with `rm -f .next/lock`.

## User Setup Required

None — no external service configuration required. Time tracking is controlled via the org settings toggle (`time_tracking_enabled`).

## Next Phase Readiness

- Plan 03 (auto-break detection) can call `checkBreakCompliance(timeEntryId)` directly
- Plan 04 (QBO time push) reads `time_entries` rows written by `clockIn()/clockOut()`; the TODO comment in `clockOut()` marks the integration point
- geofence-based stop timing (`recordStopArrival/recordStopDeparture`) is wired up via `useGpsBroadcast` — no additional integration needed

---
*Phase: 11-payroll-team-management-full-accounting*
*Completed: 2026-03-16*
