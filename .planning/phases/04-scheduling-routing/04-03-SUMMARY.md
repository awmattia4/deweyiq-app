---
phase: 04-scheduling-routing
plan: "03"
subsystem: ui
tags: [maplibre-gl, dnd-kit, react, split-view, route-builder, schedule, sortable]

requires:
  - phase: 04-scheduling-routing
    provides: route_stops table with RLS; getStopsForDay/updateStopOrder/removeStopFromRoute server actions; maplibre-gl installed

provides:
  - MapClient: SSR-safe MapLibre GL JS wrapper component (src/components/map/map-client.tsx)
  - RouteMap: numbered stop markers + dashed route line that updates on reorder (src/components/schedule/route-map.tsx)
  - TechDaySelector: tech tabs + Mon-Fri day picker (src/components/schedule/tech-day-selector.tsx)
  - RouteStopList: sortable stop list with drag handles, lock toggles, remove buttons (src/components/schedule/route-stop-list.tsx)
  - StopLockToggle: amber lock icon button that calls toggleStopLock server action (src/components/schedule/stop-lock-toggle.tsx)
  - RouteBuilder: split-view assembler wiring all sub-components (src/components/schedule/route-builder.tsx)
  - ScheduleTabs: client tab bar for Routes/Rules/Holidays sections (src/components/schedule/schedule-tabs.tsx)
  - toggleStopLock server action in schedule.ts
  - /schedule page: hub with route builder, schedule rules, and holiday calendar tabs

affects: [04-04-route-optimizer, 04-05-dispatch-map, all Phase 4 plans referencing /schedule]

tech-stack:
  added: []
  patterns:
    - MapLibre SSR-safe: component loaded via next/dynamic { ssr: false } to avoid window access on import; consuming components never import MapClient directly
    - forwardRef + useImperativeHandle for MapClientHandle: exposes getMap() so parent can call imperative MapLibre methods (add sources, layers, fly to)
    - Dynamic marker creation: SVG circles created in DOM with style.cssText; re-created on every stops change to reflect updated index/status/lock state
    - DnD locked-stop protection: locked stops excluded from SortableContext items array; drag handles hidden; drag end rejects moves targeting a locked position
    - useTransition for server action calls: stop fetching on tech/day change wrapped in startTransition for non-blocking UI updates
    - dayIndexToDate helper: maps Mon-indexed day (0=Mon...4=Fri) to real YYYY-MM-DD for current ISO week; same logic on client and server to avoid hydration mismatch

key-files:
  created:
    - src/components/map/map-client.tsx
    - src/components/schedule/route-map.tsx
    - src/components/schedule/tech-day-selector.tsx
    - src/components/schedule/route-stop-list.tsx
    - src/components/schedule/stop-lock-toggle.tsx
    - src/components/schedule/route-builder.tsx
    - src/components/schedule/schedule-tabs.tsx
  modified:
    - src/actions/schedule.ts
    - src/app/(app)/schedule/page.tsx

key-decisions:
  - "MapClient uses dynamic import inside useEffect (not at module level) for maplibre-gl — avoids window access during SSR even when component file is imported server-side"
  - "Locked stops excluded from SortableContext.items array (not just visually disabled) — dnd-kit requires items to be in the context to participate; excluding them prevents any drag interaction with locked positions"
  - "getStopsForDay extended with address/lat/lng fields — required for route map markers and stop list address display; Rule 2 auto-fix during Task 2"
  - "ScheduleTabs renders all three panels in DOM, toggling hidden attr — avoids full remount when switching tabs; RouteBuilder state (selected tech/day/stops) preserved when switching to Rules or Holidays and back"
  - "dayIndexToDate uses local timezone (not UTC) — route stops are date-keyed by local business date, not UTC"

requirements-completed:
  - SCHED-01
  - SCHED-04

duration: 6min
completed: 2026-03-08
---

# Phase 4 Plan 03: Route Builder UI Summary

**Split-view route builder with MapLibre markers + route line, sortable stop list with drag-and-drop, lock-stop toggles, tech tabs, and Mon-Fri day picker assembled at /schedule**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-08T23:48:12Z
- **Completed:** 2026-03-08T23:54:12Z
- **Tasks:** 2
- **Files modified:** 9 (7 created, 2 modified)

## Accomplishments

- MapLibre GL JS wrapper with SSR-safe dynamic import, dark MapTiler tile source, forwardRef handle for imperative control, and placeholder when API key is missing
- RouteMap with numbered color-coded markers (amber=locked, gray=complete, blue=normal) and dashed route line that updates instantly on stop reorder; fits map bounds to show all stops
- RouteStopList with @dnd-kit/sortable following Phase 3 sensor pattern (250ms touch delay, 10px mouse distance); locked stops protected from drag; persists via updateStopOrder server action
- RouteBuilder split-view (50/50 desktop, stacked mobile) wiring TechDaySelector → stop fetch → list + map; optimistic lock/remove handlers; useTransition for non-blocking data fetches
- /schedule page rebuilt as hub with Routes/Rules/Holidays tabs, preserving all Phase 02 schedule rules and holiday calendar functionality

## Task Commits

1. **Task 1: Build MapLibre wrapper, route map, tech-day selector, and sortable stop list** - `cb37828` (feat)
2. **Task 2: Assemble route builder split-view and wire to schedule page** - `a29ebf2` (feat)

## Files Created/Modified

- `src/components/map/map-client.tsx` - SSR-safe MapLibre wrapper with forwardRef handle and placeholder fallback
- `src/components/schedule/route-map.tsx` - Route map with numbered markers, route line, bounds fitting, selected-stop highlight
- `src/components/schedule/tech-day-selector.tsx` - Tech tabs (horizontal scrollable) + Mon-Fri day picker with accent highlight
- `src/components/schedule/route-stop-list.tsx` - Sortable stop list: drag handles, stop numbers, lock toggles, remove buttons, status icons
- `src/components/schedule/stop-lock-toggle.tsx` - Amber/muted lock icon button with optimistic toggle and server action persistence
- `src/components/schedule/route-builder.tsx` - Split-view assembler: state management, tech/day change handlers, stop fetch on selection change
- `src/components/schedule/schedule-tabs.tsx` - Client tab bar: Routes/Rules/Holidays with aria roles; preserves panel state between tab switches
- `src/actions/schedule.ts` - Added toggleStopLock action; extended getStopsForDay with address/lat/lng fields
- `src/app/(app)/schedule/page.tsx` - Rewritten as scheduling hub: fetches techs + initial stops, renders RouteBuilder + ScheduleTabs wrapping rules/holidays views

## Decisions Made

- **MapClient dynamic import inside useEffect:** Rather than relying solely on `next/dynamic`, the useEffect does a secondary `import("maplibre-gl")` for the actual Map constructor. This double-guard ensures no window access during SSR or initial client paint.
- **Locked stops excluded from SortableContext.items:** dnd-kit requires a stop's ID to be in the items array to allow dropping onto that position. By removing locked stop IDs from items, we prevent any drag interaction with them — both dragging them and dragging other stops to their positions.
- **getStopsForDay extended with address/lat/lng (Rule 2):** The original return type omitted address and geocoding fields. Without these, stop list addresses would always be empty and map markers would never render (no coordinates). Added as critical missing functionality.
- **ScheduleTabs keeps all panels in DOM:** All three tab panels are rendered but toggled with `hidden` — this preserves RouteBuilder's React state (selected tech, day, stops) when switching to Rules/Holidays and back, avoiding unnecessary refetches.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] getStopsForDay lacked address/lat/lng fields**
- **Found during:** Task 2 (RouteBuilder implementation)
- **Issue:** getStopsForDay returned customerName and poolName but not address, lat, or lng. The route map needs lat/lng for marker placement; the stop list needs address for display. Without these, the route map would show no markers and stop rows would have no address.
- **Fix:** Updated getStopsForDay to select address/lat/lng from customers table alongside full_name; updated return type; updated customerMap to store full customer row; updated RouteBuilder to pass fields through to ScheduleStop
- **Files modified:** src/actions/schedule.ts, src/components/schedule/route-builder.tsx
- **Verification:** Build passes; ScheduleStop interface receives address/lat/lng from server
- **Committed in:** `a29ebf2` (Task 2 commit)

---

**Total deviations:** 1 (1 Rule 2 missing critical functionality)
**Impact on plan:** Auto-fix essential for route map markers to work. No scope creep.

## Issues Encountered

None — both tasks executed cleanly with zero TypeScript errors.

## User Setup Required

To enable the route map, set `NEXT_PUBLIC_MAPTILER_KEY` in your `.env.local` file. Without this key, the map panel shows a placeholder message. Get a free key at https://cloud.maptiler.com.

## Next Phase Readiness

- Route builder split-view is fully functional at /schedule (Routes tab)
- MapClient and RouteMap components ready for reuse in Plan 04-05 dispatch map
- toggleStopLock server action ready for use from dispatch or any other context
- Stop geocoding (lat/lng) can be added to customers table and will immediately appear as map markers — no component changes needed
- Ready for Plan 04-04: route optimizer (will add "Optimize Route" button to RouteBuilder)

## Self-Check: PASSED

All 7 component files created, SUMMARY.md created, commits cb37828 and a29ebf2 verified present.

---
*Phase: 04-scheduling-routing*
*Completed: 2026-03-08*
