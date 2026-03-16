---
phase: 09-reporting-team-analytics
plan: "06"
subsystem: field-tech-app
tags: [gap-closure, reporting, dosing, route-stops, analytics]
dependency_graph:
  requires: [09-01, 09-03, 09-04, 09-05]
  provides: [started_at-capture, dosing_amounts-capture]
  affects: [operations-dashboard, team-dashboard, profitability-dashboard]
tech_stack:
  added: []
  patterns: [fire-and-forget-useEffect, useRef-for-callback-data]
key_files:
  created: []
  modified:
    - src/actions/visits.ts
    - src/components/field/stop-workflow.tsx
    - src/components/field/chemistry-dosing.tsx
decisions:
  - "routeStopId added to StopContext so client can identify which route_stop row to mark started without a second query"
  - "useRef over useState for dosingAmountsRef — avoids re-renders on every chemistry keystroke and eliminates stale closure risk in executeComplete"
  - "onDosingChange is optional prop — existing ChemistryDosing usages outside stop-workflow are unaffected"
  - "markStopStarted useEffect uses empty dep array intentionally — fires exactly once on mount, not on re-renders"
metrics:
  duration_minutes: 3
  completed_date: "2026-03-16"
  tasks_completed: 2
  files_modified: 3
---

# Phase 9 Plan 06: Gap Closure — started_at and dosing_amounts Capture Summary

Wire two data capture points in the field stop workflow that were built server-side but never connected client-side, closing the verification gaps for REPT-02/03/04 (avg stop time null) and REPT-05 (dosing_amounts null).

## What Was Built

**Task 1 — started_at capture:**
- Added `routeStopId: string | null` to `StopContext` interface in `visits.ts`
- Added `id: routeStops.id` to the route_stop select in `getStopContext`, exposed as `routeStopId` in the return object
- Imported `markStopStarted` in `stop-workflow.tsx`
- Added a fire-and-forget `useEffect` (empty dep array) that calls `markStopStarted(context.routeStopId)` on mount for non-completed stops — writes `started_at = now()` to the `route_stops` row

**Task 2 — dosing_amounts capture:**
- Added `useEffect` import and optional `onDosingChange` callback prop to `ChemistryDosing`
- `useEffect` in `ChemistryDosing` fires whenever `recommendations` changes, mapping recs to `{ chemical, productId, amount, unit }` and calling `onDosingChange`
- Added `useRef` import and `dosingAmountsRef` to `stop-workflow` to hold the latest dosing amounts without causing re-renders
- `handleDosingChange` stable `useCallback` stores amounts into the ref
- `onDosingChange={handleDosingChange}` passed to `<ChemistryDosing>` component
- `dosingAmounts: dosingAmountsRef.current.length > 0 ? dosingAmountsRef.current : undefined` added to `completionData` in `executeComplete`

## Deviations from Plan

None — plan executed exactly as written.

## Verification

All 6 checks passed:

1. `grep -n "routeStopId" src/actions/visits.ts` — hits in interface (line 58) AND return object (line 409)
2. `grep -n "markStopStarted" src/components/field/stop-workflow.tsx` — import (line 40) AND useEffect call (line 136)
3. `grep -rn "dosingAmounts" src/components/field/stop-workflow.tsx` — ref (line 182), callback store (line 185), completionData (line 253)
4. `grep -rn "onDosingChange" src/components/field/chemistry-dosing.tsx` — prop interface, destructure, useEffect guard, useEffect call
5. `grep -n "useRef" src/components/field/stop-workflow.tsx` — imported and used
6. `npx tsc --noEmit` — no errors in source files (only pre-existing `.next/` generated type artifacts)

## Commits

- `5b37143` — feat(09-06): wire started_at capture — routeStopId in StopContext, markStopStarted on mount
- `5ee8dcf` — feat(09-06): wire dosing_amounts capture — onDosingChange callback and completionData inclusion

## Self-Check: PASSED

Files modified exist and contain expected content — verified by grep checks above. Both commits confirmed via `git log`.
