---
phase: 04-scheduling-routing
plan: "05"
subsystem: ui
tags: [maplibre, supabase-realtime, gps, dispatch, real-time, react-map-gl]

# Dependency graph
requires:
  - phase: 04-01
    provides: route_stops relational schema and getDispatchData server action data shape
provides:
  - Live dispatch map at /dispatch with real-time tech GPS positions
  - useGpsBroadcast hook for tech GPS position broadcasting
  - useTechPositions hook for office dispatch map position subscription
  - getDispatchData server action returning all org stops and tech colors for today
  - GpsBroadcaster render-null component activating GPS on /routes page for tech role
affects:
  - 04-06 route optimization (reads same dispatch data shape)
  - future phases using tech position real-time data

# Tech tracking
tech-stack:
  added: []
  patterns:
    - MapLibre imperative marker management inside React render cycle (markers created in useEffect, removed in cleanup)
    - DispatchClientShell pattern: server page fetches SSR data, passes to client shell that owns filter state
    - Supabase Broadcast GPS pattern: tech sends via useGpsBroadcast, office receives via useTechPositions
    - GeoJSON LineString route lines updated via map.getSource().setData() without recreating layers
    - OKLCH color palette for tech assignment (10 visually distinct colors cycle if >10 techs)

key-files:
  created:
    - src/hooks/use-gps-broadcast.ts
    - src/hooks/use-tech-positions.ts
    - src/actions/dispatch.ts
    - src/components/field/gps-broadcaster.tsx
    - src/components/dispatch/dispatch-map.tsx
    - src/components/dispatch/tech-position-marker.tsx
    - src/components/dispatch/stop-marker.tsx
    - src/components/dispatch/stop-popup.tsx
    - src/components/dispatch/tech-filter.tsx
    - src/app/(app)/dispatch/dispatch-client-shell.tsx
  modified:
    - src/app/(app)/routes/page.tsx (added GpsBroadcaster for tech role)
    - src/app/(app)/dispatch/page.tsx (full rewrite from placeholder to real map page)

key-decisions:
  - "StopPopup rendered as React overlay div (not MapLibre Popup API) — allows full React components including Next.js Link"
  - "DispatchClientShell pattern: server page SSRs data, client shell owns TechFilter selectedTechId state"
  - "ETA calculation deferred — dispatch map shows scheduled time from window_start only; ETA would require routing API call per update"
  - "OKLCH color palette pre-assigned to techs by index in getDispatchData — consistent colors across markers, route lines, and filter chips"
  - "TechPositionMarker updates position without recreating marker on lat/lng change — useEffect split: create on mount, update on position change"
  - "GpsBroadcaster activates only on /routes page — tech broadcasts only while route page is open, matching user decision of no background tracking"
  - "Route line visibility controlled by removing/adding map layers when filter changes — avoids maintaining hidden layer state"

patterns-established:
  - "Render-null client component pattern for GPS broadcast (GpsBroadcaster): same as SyncInitializer pattern"
  - "DispatchClientShell: server page handles auth + SSR data, client shell owns filter/selection state"
  - "MapLibre marker + React: markers created imperatively in useEffect; React renders null; cleanup in useEffect return"

requirements-completed:
  - SCHED-06

# Metrics
duration: 5min
completed: 2026-03-08
---

# Phase 4 Plan 05: Live Dispatch Map Summary

**MapLibre dispatch map at /dispatch with real-time tech GPS positions via Supabase Broadcast, numbered color-coded stop markers, dashed route lines per tech, and clickable stop popup cards**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-08T06:48:21Z
- **Completed:** 2026-03-08T06:53:30Z
- **Tasks:** 2
- **Files modified:** 12 (10 created, 2 modified)

## Accomplishments

- GPS broadcasting: `useGpsBroadcast` activates `navigator.geolocation.watchPosition` on the dispatch Supabase channel while tech's /routes page is open; cleans up on unmount (no battery drain)
- Live position reception: `useTechPositions` subscribes to the same channel and returns a `Record<string, TechPosition>` map updated in real-time as broadcasts arrive
- Dispatch map: full-bleed MapLibre map with tech pins (pulsing for live, dimmed for stale >2min), numbered stop markers per tech, dashed route lines through remaining stops, completed stops grayed out
- Stop popup: click any stop marker → React overlay card with customer name, pool name, address, status badge, scheduled time, tech name (color-coded), and a Next.js Link to the customer profile
- Tech filter: "All Techs" button + per-tech color chips; selecting a tech hides other techs' markers and route lines
- `getDispatchData` server action: fetches today's route stops across all org techs with LEFT JOINs (no correlated subqueries per MEMORY.md), assigns OKLCH colors per tech index

## Task Commits

Each task was committed atomically:

1. **Task 1: GPS broadcast hook, tech positions hook, dispatch server action** - `fcd279c` (feat)
2. **Task 2: Dispatch map page with tech markers, stop markers, route lines, and popup cards** - `5f14721` (feat)

## Files Created/Modified

- `src/hooks/use-gps-broadcast.ts` - Broadcasts tech GPS position via Supabase Realtime Broadcast channel
- `src/hooks/use-tech-positions.ts` - Subscribes to dispatch channel, returns live tech position map
- `src/actions/dispatch.ts` - Server action: fetches all org stops + tech profiles for today with OKLCH colors
- `src/components/field/gps-broadcaster.tsx` - Render-null client component activating GPS for tech role
- `src/components/dispatch/dispatch-map.tsx` - Main MapLibre map with tech markers, route lines, stop markers
- `src/components/dispatch/tech-position-marker.tsx` - Colored pulsing pin per tech (dims when stale >2min)
- `src/components/dispatch/stop-marker.tsx` - Numbered stop pins, status-colored, click-to-popup
- `src/components/dispatch/stop-popup.tsx` - React overlay card with customer info and profile link
- `src/components/dispatch/tech-filter.tsx` - All-techs toggle + per-tech color chip filter bar
- `src/app/(app)/dispatch/dispatch-client-shell.tsx` - Client wrapper owning TechFilter state + dynamic DispatchMap import
- `src/app/(app)/dispatch/page.tsx` - Rewritten server page: role guard, SSR dispatch data, full-bleed layout
- `src/app/(app)/routes/page.tsx` - Added GpsBroadcaster component for tech role

## Decisions Made

- **StopPopup as React overlay** (not MapLibre Popup API): MapLibre Popup requires `setHTML()` with a plain HTML string, which can't render Next.js Link or React components. React overlay positioned above the map allows full React rendering. Simpler and avoids ReactDOM.createPortal complexity.
- **DispatchClientShell pattern**: Server page handles auth + SSR data fetch; client shell owns `selectedTechId` filter state so TechFilter and DispatchMap can communicate without prop-drilling through a server component.
- **ETA deferred**: Showing estimated arrival times per stop would require calling a routing API (Mapbox Directions or ORS) on every position update. This is deferred — the popup shows `window_start` scheduled time only. A dedicated Phase 4 plan could add ETA via ORS matrix API.
- **OKLCH color palette**: 10 pre-defined OKLCH colors assigned by tech index in `getDispatchData`. Consistent across all map elements (marker, route line, filter chip).
- **TechPositionMarker split useEffect**: Marker creation in a one-time `useEffect` (stable deps); position update in a separate `useEffect` watching `lat`/`lng`/`updatedAt`. Avoids recreating the DOM element and MapLibre Marker on every position update.

## Deviations from Plan

None — plan executed exactly as written. The StopPopup "React overlay" approach was listed as an explicit alternative in the plan ("Alternative (simpler): Use a React state for selectedStop and render a positioned overlay div") — choosing it is not a deviation.

## Issues Encountered

None — build passed cleanly on first attempt for both tasks.

## User Setup Required

None beyond what was already documented in Phase 4 Plan 03 (MapTiler key). The dispatch map requires `NEXT_PUBLIC_MAPTILER_KEY` (same key used by the route builder map). If not set, the map renders a placeholder with setup instructions.

## Next Phase Readiness

- Dispatch map is fully functional for SCHED-06
- GPS broadcasting and position subscription infrastructure is in place for any future real-time location features
- Phase 4 Plan 06 (route optimization) can read the same `initialData` shape from `getDispatchData`; customer lat/lng coordinates on stops are available for ORS API requests

---
*Phase: 04-scheduling-routing*
*Completed: 2026-03-08*
