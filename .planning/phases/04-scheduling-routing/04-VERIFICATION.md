---
phase: 04-scheduling-routing
verified: 2026-03-09T12:00:00Z
status: passed
score: 4/4 must-haves verified
re_verification: false
human_verification:
  - test: "Visual appearance of route builder split-view and dispatch map"
    expected: "Split-view renders cleanly on desktop and mobile, map tiles load with MapTiler key, markers are numbered and color-coded"
    why_human: "Visual rendering quality, layout responsiveness, and MapTiler tile loading cannot be verified programmatically"
  - test: "Real-time GPS broadcast from tech to dispatch map"
    expected: "Tech's position appears as a pulsing pin on dispatch map within seconds of opening /routes; position updates as tech moves"
    why_human: "Requires two browser sessions (tech + office) and actual GPS hardware or spoofing"
  - test: "ORS optimization produces meaningful time savings"
    expected: "Clicking Optimize Route returns a different order with positive time saved for routes that are suboptimally ordered"
    why_human: "Requires ORS_API_KEY configured and real geocoded customer data to produce meaningful results"
---

# Phase 4: Scheduling & Routing Verification Report

**Phase Goal:** Office staff can build routes, set recurring service schedules, and optimize route order in one click -- while seeing real-time tech progress on a live map

**Verified:** 2026-03-09

**Status:** passed

**Re-verification:** No -- initial verification

**Note:** This phase was human-verified and approved by the user during plan 04-07 execution. Several fixes were applied during human verification (999 sort_index bug, skip/unskip/move stop flows, delete schedule rule UI, map CSS fix, route optimization drive time comparison fix, real ORS directions for drive time and road geometry, drive time overlay on map). This automated verification confirms all fixes are present in the codebase.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Office staff can assign customer stops to a tech's route and set a service frequency (weekly, bi-weekly, monthly, or custom); the system auto-generates future stops without further manual entry | VERIFIED | `schedule.ts` has `createScheduleRule` (line 322), `generateStopsForRule` (line 148) with `generateDatesForRule` (line 72) covering weekly/biweekly/monthly/custom frequencies. `bulkAssignStops` (line 1064) and `assignStopToRoute` (line 858) for manual assignment. Schedule rule dialog at `schedule-rule-dialog.tsx` (428 lines) with customer/pool/tech/frequency selectors. Edge Function at `supabase/functions/generate-schedule/index.ts` for rolling 4-week auto-generation. Sequential sort_index assignment (maxIdx + 1, line 220) replaces the original 999 bug. |
| 2 | Office staff can drag and drop stops to reorder a route and the map updates instantly to reflect the new order | VERIFIED | `route-stop-list.tsx` (369 lines) uses @dnd-kit/sortable with DndContext, SortableContext, verticalListSortingStrategy. `route-builder.tsx` (818 lines) assembles multi-container DnD with DragOverlay. `updateStopOrder` server action (line 820 in schedule.ts) persists sort_index changes. `route-map.tsx` (343 lines) renders numbered markers and route line via MapLibre, updating on stops prop changes. Real ORS road geometry via `getRouteDirections` call (line 151 in route-map.tsx). |
| 3 | Office staff can click "Optimize Route" and the system reorders stops to minimize drive time using rule-based geographic optimization | VERIFIED | `optimize.ts` (579 lines) contains `optimizeRoute` server action that calls ORS optimization API (`https://api.openrouteservice.org/optimization`, line 333). Locked stops excluded from ORS request and re-inserted at original positions (lines 263-401). `getRouteDirections` (line 527) provides real road-routed drive times for both current and optimized orders (apples-to-apples comparison, lines 293-304 and 403-415). `optimize-preview.tsx` (282 lines) shows before/after side-by-side with drive time comparison and Apply/Cancel buttons. `applyOptimizedOrder` (line 456) persists accepted order. Wand2Icon button wired in route-builder.tsx (line 29 import, line 589 handler). |
| 4 | Office staff can see a live map showing each tech's current position, which stops are complete, and which are upcoming -- updating without page refresh | VERIFIED | `dispatch-map.tsx` (361 lines) renders MapLibre map with tech position markers and stop markers. `use-tech-positions.ts` (69 lines) subscribes to Supabase Broadcast channel `dispatch:{orgId}` for `tech_location` events (line 41). `use-gps-broadcast.ts` (73 lines) broadcasts GPS via `navigator.geolocation.watchPosition` (line 40) on the same channel. `gps-broadcaster.tsx` render-null component wired into `/routes/page.tsx` (lines 8, 99) for tech role. `tech-position-marker.tsx` renders colored pulsing pins. `stop-marker.tsx` renders numbered stop pins. `stop-popup.tsx` renders clickable popup cards. `tech-filter.tsx` toggles all-tech/single-tech views. `getDispatchData` in `dispatch.ts` (205 lines) fetches today's stops across all techs with OKLCH color assignment. Completed stops filtered as grayed out in `updateRouteLine` (line 38 in dispatch-map.tsx). |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/db/schema/route-stops.ts` | route_stops table with RLS | VERIFIED | 109 lines, pgTable with 4 RLS policies, indexes, unique constraint, enableRLS() |
| `src/lib/db/schema/schedule-rules.ts` | schedule_rules table with RLS | VERIFIED | 92 lines, pgTable with frequency/anchor_date/preferred_day_of_week, 4 RLS policies |
| `src/lib/db/schema/holidays.ts` | holidays table with RLS | VERIFIED | 76 lines, pgTable with org-scoped holidays, RLS policies |
| `src/lib/db/schema/customers.ts` | lat/lng geocoding columns | VERIFIED | doublePrecision lat/lng columns at lines 42-43 |
| `src/actions/schedule.ts` | Schedule CRUD + generation | VERIFIED | 1434 lines with createScheduleRule, deleteScheduleRule, generateStopsForRule, generateDatesForRule, getStopsForDay, updateStopOrder, assignStopToRoute, removeStopFromRoute, bulkAssignStops, copyRoute, skipStop, unskipStop, toggleStopLock, getUnassignedCustomers, getScheduleRules, getHolidays, createHoliday, deleteHoliday, generateAllScheduleStops |
| `src/actions/optimize.ts` | ORS optimization | VERIFIED | 579 lines with optimizeRoute, applyOptimizedOrder, getRouteDirections, haversineDistance helper |
| `src/actions/dispatch.ts` | Dispatch data | VERIFIED | 205 lines with getDispatchData returning techs + stops + colors |
| `src/components/schedule/route-builder.tsx` | Split-view route builder | VERIFIED | 818 lines, multi-container DnD, TechDaySelector, RouteStopList, RouteMap, UnassignedPanel, CopyRouteDialog, OptimizePreview, MoveStopDialog all wired |
| `src/components/schedule/route-stop-list.tsx` | Sortable stop list | VERIFIED | 369 lines, @dnd-kit/sortable with drag handles, lock toggles, skip/unskip |
| `src/components/schedule/route-map.tsx` | MapLibre route map | VERIFIED | 343 lines, numbered markers, ORS road geometry, drive time overlay |
| `src/components/schedule/optimize-preview.tsx` | Before/after preview | VERIFIED | 282 lines, side-by-side comparison, drive time display, Apply/Cancel |
| `src/components/schedule/unassigned-panel.tsx` | Unassigned customer panel | VERIFIED | 197 lines, search, multi-select, bulk assign |
| `src/components/schedule/schedule-rule-dialog.tsx` | Schedule rule dialog | VERIFIED | 428 lines, create/edit/delete rule UI |
| `src/components/schedule/holiday-calendar.tsx` | Holiday management | VERIFIED | 396 lines, add/remove holidays, US suggestions |
| `src/components/schedule/tech-day-selector.tsx` | Tech tabs + day picker | VERIFIED | 193 lines, horizontal tech tabs, Mon-Fri buttons |
| `src/components/schedule/copy-route-dialog.tsx` | Copy route dialog | VERIFIED | 221 lines, target tech/day selectors |
| `src/components/schedule/move-stop-dialog.tsx` | Move stop dialog | VERIFIED | 246 lines (user-requested fix) |
| `src/components/schedule/stop-lock-toggle.tsx` | Lock toggle button | VERIFIED | 69 lines, amber/muted lock icon |
| `src/components/schedule/schedule-tabs.tsx` | Routes/Rules/Holidays tabs | VERIFIED | Present and imported in schedule page |
| `src/components/map/map-client.tsx` | MapLibre wrapper | VERIFIED | 138 lines, SSR-safe with dynamic import, forwardRef, maplibre-gl CSS imported |
| `src/components/dispatch/dispatch-map.tsx` | Live dispatch map | VERIFIED | 361 lines, tech markers, route lines, stop markers |
| `src/components/dispatch/tech-position-marker.tsx` | Tech GPS pin | VERIFIED | Present, renders colored pulsing markers |
| `src/components/dispatch/stop-marker.tsx` | Stop pin | VERIFIED | Present, numbered color-coded markers |
| `src/components/dispatch/stop-popup.tsx` | Stop popup card | VERIFIED | Present, React overlay with customer info |
| `src/components/dispatch/tech-filter.tsx` | Tech filter bar | VERIFIED | Present, all-tech/single-tech toggle |
| `src/hooks/use-gps-broadcast.ts` | GPS broadcast hook | VERIFIED | 73 lines, watchPosition + Supabase channel send with cleanup |
| `src/hooks/use-tech-positions.ts` | Position subscription hook | VERIFIED | 69 lines, Supabase Broadcast channel subscription |
| `src/components/field/gps-broadcaster.tsx` | Render-null GPS component | VERIFIED | Wired into routes/page.tsx for tech role |
| `supabase/functions/generate-schedule/index.ts` | Edge Function | VERIFIED | Deno Edge Function, jsr:@supabase/supabase-js@2 import, generateDatesForRule, idempotent upsert |
| `src/app/(app)/schedule/page.tsx` | Schedule page | VERIFIED | Server component, role guard, fetches techs + stops + rules + holidays, renders RouteBuilder + ScheduleTabs |
| `src/app/(app)/dispatch/page.tsx` | Dispatch page | VERIFIED | Server component, role guard, fetches dispatch data, renders DispatchClientShell with full-bleed map |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| route-builder.tsx | route-stop-list.tsx | renders RouteStopList | WIRED | Import at line 33, rendered in component |
| route-builder.tsx | route-map.tsx | renders RouteMap | WIRED | Import at line 34 |
| route-builder.tsx | optimize-preview.tsx | renders OptimizePreview | WIRED | Import at line 37, rendered at line 786 |
| route-builder.tsx | unassigned-panel.tsx | renders UnassignedPanel | WIRED | Import at line 35 |
| route-builder.tsx | actions/schedule.ts | calls server actions | WIRED | Imports getStopsForDay, getUnassignedCustomers, removeStopFromRoute, assignStopToRoute, bulkAssignStops, skipStop, unskipStop at lines 38-47 |
| route-builder.tsx | actions/optimize.ts | calls optimizeRoute | WIRED | Import at line 49 |
| route-stop-list.tsx | schedule.ts | calls updateStopOrder | WIRED | Confirmed in route-builder handler chain |
| route-map.tsx | optimize.ts | calls getRouteDirections | WIRED | Import at line 7, called at line 151 |
| dispatch-map.tsx | use-tech-positions.ts | subscribes to positions | WIRED | Import at line 7, called at line 119 |
| gps-broadcaster.tsx | use-gps-broadcast.ts | calls useGpsBroadcast | WIRED | Import at line 3, called at line 22 |
| routes/page.tsx | gps-broadcaster.tsx | renders GpsBroadcaster | WIRED | Import at line 8, rendered at line 99 for tech role |
| schedule-rule-dialog.tsx | schedule.ts | calls createScheduleRule/deleteScheduleRule | WIRED | Import at line 20, called at line 204 |
| optimize.ts | ORS API | fetch to openrouteservice.org | WIRED | fetch at line 333 to optimization endpoint, line 542 to directions endpoint |
| schedule.ts | route-stops schema | imports routeStops | WIRED | Import at line 7 |
| dispatch page | dispatch.ts | calls getDispatchData | WIRED | Import at line 5, called at line 36 |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| SCHED-01 | 04-01, 04-03, 04-04 | Office can build routes and assign stops to techs | SATISFIED | Route builder with unassigned panel, drag-to-assign, click-to-assign, bulk assign, copy route |
| SCHED-02 | 04-02 | Office can set recurring service schedules | SATISFIED | Schedule rule dialog with weekly/bi-weekly/monthly/custom frequency, anchor date, preferred day |
| SCHED-03 | 04-02 | System auto-generates recurring stops | SATISFIED | generateStopsForRule with generateDatesForRule algorithm; Edge Function for rolling 4-week generation; holiday skipping |
| SCHED-04 | 04-01, 04-03 | Office can drag-and-drop to reorder stops | SATISFIED | @dnd-kit/sortable in route-stop-list.tsx, updateStopOrder server action, map updates on reorder |
| SCHED-05 | 04-06 | System provides one-click route optimization | SATISFIED | ORS optimization API call, locked-stop support, before/after preview with real road drive time comparison |
| SCHED-06 | 04-05 | Office can view real-time route progress on live map | SATISFIED | Dispatch map with GPS broadcast via Supabase Realtime, tech position markers, stop markers, route lines, tech filter |

No orphaned requirements -- SCHED-07 and SCHED-08 are mapped to Phase 10 (Smart Features & AI), not Phase 4.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | - | - | - | - |

No TODOs, FIXMEs, placeholders, or stub implementations found in any Phase 4 files. All components are fully implemented.

### Human Verification Required

Human verification was already completed during plan 04-07 execution. The user tested all 6 SCHED requirements and approved the phase after the following fixes were applied:

1. **999 sort_index bug** -- Fixed: `generateStopsForRule` now uses `maxIdx + 1` (sequential assignment)
2. **Skip/unskip/move stop flows** -- Added: `skipStop`, `unskipStop` actions and `MoveStopDialog` component
3. **Delete schedule rule UI** -- Added: delete button and confirmation in `ScheduleRuleDialog`
4. **Map infinite scroll (missing maplibre-gl CSS)** -- Fixed: CSS import `maplibre-gl/dist/maplibre-gl.css` in map-client.tsx
5. **Route optimization drive time comparison** -- Fixed: apples-to-apples comparison using `getRouteDirections` for both current and optimized orders
6. **Real ORS directions** -- Added: `getRouteDirections` function for real road geometry and drive time
7. **Drive time overlay on map** -- Added: overlay in route-map.tsx showing ORS drive time with Haversine fallback

Remaining items that need human spot-checking (visual/UX quality):

### 1. Visual Appearance of Route Builder and Dispatch Map

**Test:** Open /schedule and /dispatch on desktop and mobile
**Expected:** Split-view renders cleanly, map tiles load, markers are numbered and color-coded, drive time overlay is visible
**Why human:** Visual rendering quality and layout responsiveness cannot be verified programmatically

### 2. Real-time GPS Broadcast

**Test:** Open /dispatch as office, open /routes as tech in separate browser
**Expected:** Tech's position appears as pulsing pin on dispatch map within seconds
**Why human:** Requires two browser sessions and actual GPS hardware

### 3. ORS Optimization Quality

**Test:** Create a suboptimally ordered route with geocoded stops, click Optimize Route
**Expected:** Optimizer returns a different order with positive time saved
**Why human:** Requires ORS_API_KEY and real geocoded customer data

### Build Verification

**TypeScript compilation:** PASSED (0 errors)
**All pages present:** /schedule, /dispatch confirmed in build output

---

_Verified: 2026-03-09_
_Verifier: Claude (gsd-verifier)_
