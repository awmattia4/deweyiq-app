---
phase: 04-scheduling-routing
plan: "06"
subsystem: ui
tags: [openrouteservice, vroom, route-optimization, server-action, dialog, dnd-kit]

requires:
  - phase: 04-03
    provides: route-builder component (route-builder.tsx), ScheduleStop type, getStopsForDay with lat/lng

provides:
  - ORS optimization server action (optimizeRoute, applyOptimizedOrder) in src/actions/optimize.ts
  - OptimizePreview before/after comparison modal
  - "Optimize Route" button wired into route builder toolbar

affects:
  - 04-07 (any further route builder enhancements will see the optimize button)
  - Phase 10 AI optimization (can replace ORS call in optimize.ts without touching UI)

tech-stack:
  added: []
  patterns:
    - "ORS optimization from server action only — API key never on client"
    - "Locked-stop workaround: exclude from ORS request, re-insert at original sort_index post-optimization"
    - "Haversine estimateDriveTimeMinutes for current order; ORS summary.duration for optimized order"
    - "OptimizationResult interface: currentOrder/optimizedOrder as OptimizedStop arrays + drive time metrics"

key-files:
  created:
    - src/actions/optimize.ts
    - src/components/schedule/optimize-preview.tsx
  modified:
    - src/components/schedule/route-builder.tsx

key-decisions:
  - "ORS API called from server action (not client) — ORS_API_KEY environment variable must be set server-side"
  - "Locked stop workaround confirmed: remove locked stops from ORS request, re-insert at original 1-based sortIndex positions after optimization — simplification matches free tier capability"
  - "Haversine at 30mph (48 km/h) for current-order drive time estimate; ORS summary.duration used when available for optimized order"
  - "applyOptimizedOrder separated from optimizeRoute — user must confirm in preview before any DB writes"
  - "Apply Changes button disabled when no stops actually moved (optimizer returned same order)"
  - "ORS_API_KEY not yet configured — feature will show 'Route optimization is not configured' until env var is set"

requirements-completed:
  - SCHED-05

duration: 5min
completed: 2026-03-09
---

# Phase 4 Plan 06: Route Optimization Summary

**One-click ORS (VROOM-backed) route optimization with locked-stop support and before/after drive time preview modal, wired into the route builder toolbar**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-09T00:04:12Z
- **Completed:** 2026-03-09T00:09:12Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- `optimizeRoute` server action fetches tech's stops, splits locked/unlocked, calls ORS optimization API, re-inserts locked stops at original positions, and returns a before/after comparison with drive time estimates
- `applyOptimizedOrder` server action persists the user-accepted optimized order by updating sort_index on each route_stop row
- `OptimizePreview` Dialog shows current vs. optimized stop order side-by-side; moved stops highlighted; locked stops shown with lock icon and amber label in both columns; drive time displayed per column; time-saved banner with percentage reduction
- "Optimize Route" button (Wand2 icon) added to route builder toolbar — disabled when no stops or all stops locked; shows spinner while calling ORS

## Task Commits

1. **Task 1: Build ORS optimization server action with locked-stop support** - `25e0383` (feat)
2. **Task 2: Build optimization preview modal and wire into route builder** - `2bbe0a0` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `src/actions/optimize.ts` — `optimizeRoute` and `applyOptimizedOrder` server actions; `OptimizationResult` and `OptimizedStop` types; `haversineDistance`, `estimateDriveTimeMinutes`, `timeToSeconds` helpers
- `src/components/schedule/optimize-preview.tsx` — `OptimizePreview` Dialog with `StopRow` (moved highlighting + lock icon) and `DriveTimeDisplay` sub-components
- `src/components/schedule/route-builder.tsx` — added `Wand2Icon` import, optimization state vars (`isOptimizing`, `optimizationResult`, `showOptimizePreview`, `isApplyingOptimization`), `handleOptimize` and `handleOptimizationApplied` callbacks, "Optimize Route" button in toolbar, `OptimizePreview` dialog at bottom

## Decisions Made

- **ORS API key is server-side only.** `optimizeRoute` is a `"use server"` action. The `ORS_API_KEY` env var is never referenced in client code, satisfying the plan's critical note.
- **Locked stop re-insertion strategy.** Locked stops are excluded from the ORS `jobs` array entirely. After ORS returns the optimized unlocked sequence, locked stops are placed at their original `sortIndex - 1` (0-based) positions in a merged array; unlocked stops fill remaining slots. This is the documented free-tier workaround — true sequence constraints require VROOM premium.
- **Drive time comparison method.** Current order uses Haversine at 30 mph (48 km/h) since we don't call ORS for the current order (it would double the API call). Optimized order uses `route.summary.duration` from ORS when available, falling back to Haversine if the summary is missing.
- **`applyOptimizedOrder` is separate from `optimizeRoute`.** The user sees the preview first and must click "Apply Changes" to trigger any DB writes — matching the plan's explicit requirement.
- **"Apply Changes" disabled when no stops moved.** If ORS returns the same order (already optimal), the button is disabled and a "route is already optimally ordered" notice is shown. This avoids a no-op DB write.
- **User setup required.** `ORS_API_KEY` must be set as an environment variable for the feature to work. Until it's set, clicking "Optimize Route" will show an error toast: "Route optimization is not configured."

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

**ORS API key required for route optimization to function.**

1. Sign up at https://openrouteservice.org/dev/#/signup (free tier: 40 req/min, 500/day)
2. Copy your API token from the dashboard
3. Add to your `.env.local` (and Vercel/hosting env vars):
   ```
   ORS_API_KEY=your_token_here
   ```
4. Restart the dev server
5. Test: go to Schedule → select a tech and day with stops → click "Optimize Route"

**Note:** Stops must have geocoded coordinates (`lat`/`lng` on the `customers` table) for the optimizer to include them. Stops without coordinates are warned in the preview but don't crash optimization.

## Next Phase Readiness

- Route optimization feature is fully wired and ready — only `ORS_API_KEY` setup needed to activate
- `OptimizationResult` type is exported from `optimize.ts` for potential future use (e.g., analytics, logging)
- The ORS call in `optimizeRoute` can be replaced with any other optimization API (Mapbox v2, self-hosted VROOM) without touching the UI — the `optimizedOrder: OptimizedStop[]` interface is stable

---
*Phase: 04-scheduling-routing*
*Completed: 2026-03-09*
