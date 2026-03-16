---
phase: 10-smart-features-ai
plan: 12
subsystem: eta-engine
tags: [eta, real-time, gps, customer-portal, dispatch, notifications]
dependency_graph:
  requires: ["10-09"]
  provides: ["eta-calculator", "eta-notifications", "portal-live-tracking", "dispatch-eta-overlay"]
  affects: ["dispatch-page", "customer-portal", "route-stops-schema"]
tech_stack:
  added: []
  patterns:
    - "haversine-eta-approximation"
    - "supabase-broadcast-consumer"
    - "portal-safe-admindb-helper"
    - "eta-notification-cap-enforcement"
key_files:
  created:
    - src/lib/eta/calculator.ts
    - src/actions/eta.ts
    - src/actions/portal-eta.ts
    - src/components/dispatch/eta-overlay.tsx
    - src/components/portal/eta-tracker.tsx
    - src/app/portal/(portal)/eta/page.tsx
  modified:
    - src/app/(app)/dispatch/dispatch-client-shell.tsx
    - src/components/shell/portal-shell.tsx
    - src/app/portal/(portal)/page.tsx
    - src/lib/db/schema/route-stops.ts
decisions:
  - "haversine not ORS for portal ETA: portal ETA tracker uses haversine (not ORS) on every GPS ping — ORS would be too expensive at sub-minute frequency; close approximation is acceptable for customer countdown"
  - "adminDb for portal-eta.ts: portal customers lack org_id JWT claim; explicit org_id + customer_id filter provides equivalent data isolation"
  - "eta_sms_count as smallint: 2-update cap stored directly on route_stop row — avoids extra table, max value is 2 so smallint is sufficient"
  - "dispatch EtaOverlay as absolute overlay: positioned top-right over map using absolute positioning so map interaction is not blocked"
  - "task-1 committed in 10-11: the eta engine files (calculator.ts, eta.ts, eta-overlay.tsx, dispatch-client-shell.tsx) were committed by the plan-10-11 executor — this plan committed the portal-facing components"
metrics:
  duration_minutes: 13
  completed_date: "2026-03-16"
  tasks_completed: 2
  files_created: 6
  files_modified: 4
---

# Phase 10 Plan 12: Dynamic ETA Engine Summary

Dynamic ETA engine delivering two-touch SMS notifications at route start + refined when 2-3 stops away, auto-update capped at 2 per visit with 15-minute shift threshold, live countdown portal page with Supabase Broadcast GPS subscription, and per-stop ETA overlay on the dispatch map.

## What Was Built

### Task 1: ETA calculator, notification actions, and dispatch overlay

**`src/lib/eta/calculator.ts`** — Pure function ETA engine.
- `computeEta(techPosition, remainingStops, avgServiceMinutes?)` using haversine distance at 30 mph average speed.
- Returns `Map<stopId, { etaMinutes, etaTime }>` for all remaining stops in order.
- Fast enough for every GPS ping (pure math, no API calls).

**`src/actions/eta.ts`** — ETA notification dispatch.
- `computeRouteEtas(orgId, techId, date, techPosition)` — queries uncompleted stops via adminDb, builds EtaStop array, runs calculator, returns EtaStopResult[].
- `sendEtaNotification(stopId, orgId, etaMinutes, etaTime, type)` — enforces 2-update cap, 15-minute shift threshold, resolves SMS template (org-customized or default), sends via Edge Function, increments eta_sms_count on route_stop.
- `triggerEtaNotifications(orgId, techId, date, position, trigger)` — called at route start ('initial' to all) and stop completion ('refined' for stops 0-1, 'update' for farther).

**`src/components/dispatch/eta-overlay.tsx`** — EtaOverlay panel on dispatch page.
- Subscribes to `dispatch:{orgId}` Realtime broadcast channel (read-only, hook unchanged).
- Recalculates ETA on each GPS ping using `computeRouteEtas` server action.
- Auto-refreshes every 60 seconds even without GPS updates.
- Shows stop number, customer name, pool name, minutes-away, and ETA time.
- Displays "Waiting for tech GPS" when no position yet.

**`src/app/(app)/dispatch/dispatch-client-shell.tsx`** — Updated.
- Shows EtaOverlay absolutely positioned top-right over the map when a tech is selected.

**`src/lib/db/schema/route-stops.ts`** — Schema extended.
- Added `eta_sms_count smallint DEFAULT 0` for 2-update cap tracking.
- Added `eta_previous_minutes integer` for 15-minute shift threshold checking.

### Task 2: Customer portal live ETA tracker

**`src/actions/portal-eta.ts`** — Portal-safe data helper.
- `getCustomerTechForToday(customerId, orgId, date)` — uses adminDb to find the tech assigned to a customer's stop today; returns null if stop is complete/skipped.

**`src/components/portal/eta-tracker.tsx`** — EtaTracker client component.
- Subscribes to `dispatch:{orgId}` Broadcast channel for live GPS (read-only consumer).
- Countdown ticker using setInterval, ticks down from last computed ETA.
- Stale GPS detection: amber warning banner if last update >5 minutes ago.
- Status states: loading, active (countdown shown), no_route, complete.
- "Stops before yours" section showing up to 3 upcoming stops for context.
- Tech position map area shown when GPS is available.

**`src/app/portal/(portal)/eta/page.tsx`** — /portal/eta route.
- Server component resolving customer + org from portal auth.
- Renders EtaTracker with customerId + orgId props.

**`src/components/shell/portal-shell.tsx`** — Updated.
- Added "Track Service" nav item (MapPinIcon, /portal/eta) to both desktop header and mobile bottom tab bar.

**`src/app/portal/(portal)/page.tsx`** — Updated.
- Added "Track Service" quick-link card on portal home page.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Task 1 files already committed by plan 10-11 executor**
- **Found during:** Task 1 commit attempt
- **Issue:** Previous plan executor (10-11) committed `calculator.ts`, `eta.ts`, `eta-overlay.tsx`, and `dispatch-client-shell.tsx` as part of its own changes. git status showed them as clean after my writes.
- **Fix:** Verified the committed versions match the required implementation; proceeded directly to Task 2 without re-committing Task 1 files.
- **Files affected:** src/lib/eta/calculator.ts, src/actions/eta.ts, src/components/dispatch/eta-overlay.tsx, src/app/(app)/dispatch/dispatch-client-shell.tsx

### Out-of-Scope Discoveries Deferred

None discovered during this plan.

## Self-Check: PASSED

- FOUND: src/lib/eta/calculator.ts
- FOUND: src/actions/eta.ts
- FOUND: src/components/dispatch/eta-overlay.tsx
- FOUND: src/actions/portal-eta.ts
- FOUND: src/components/portal/eta-tracker.tsx
- FOUND: src/app/portal/(portal)/eta/page.tsx
- FOUND commit: b93f917 (eta engine — committed in 10-11)
- FOUND commit: 7914515 (portal eta tracker — committed in 10-12)
