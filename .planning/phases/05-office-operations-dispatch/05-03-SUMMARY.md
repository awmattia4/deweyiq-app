---
phase: 05-office-operations-dispatch
plan: 03
subsystem: notifications
tags: [server-actions, pre-arrival, sms, email, twilio, edge-function, idempotency, tech-ux]

# Dependency graph
requires:
  - phase: 05-01
    provides: send-pre-arrival Edge Function, pre_arrival_sent_at column on route_stops, notifications_enabled on customers
  - phase: 04-scheduling-routing
    provides: route_stops table
  - phase: 01-foundation
    provides: withRls pattern, Supabase client

provides:
  - sendPreArrivalNotifications server action (src/actions/notifications.ts)
  - startRoute server action (src/actions/notifications.ts)
  - getRouteStartedStatus server action (src/actions/routes.ts)
  - StartRouteButton client component (src/components/field/start-route-button.tsx)

affects: [tech route view at /routes]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Two-step withRls query (stops then customers) to avoid correlated subquery RLS pitfall
    - LEFT JOIN replaced with separate queries + JS merge for multi-table RLS-safe data
    - getRouteStartedStatus pre-fetched in parallel with getTodayStops via Promise.all
    - StartRouteButton uses local useState for loading/done, derives disabled state from alreadyStarted prop

key-files:
  created:
    - src/actions/notifications.ts
    - src/components/field/start-route-button.tsx
  modified:
    - src/actions/routes.ts
    - src/app/(app)/routes/page.tsx

key-decisions:
  - "Two separate withRls queries (stops then customers) instead of a single LEFT JOIN — Drizzle's leftJoin across two RLS-protected tables inside withRls can cause visibility issues; separate queries with JS merge is the safe pattern per MEMORY.md"
  - "getRouteStartedStatus fetched in parallel with getTodayStops via Promise.all — zero-flicker SSR, button renders in correct initial state without a client-side effect"
  - "StartRouteButton disabled state driven by alreadyStarted prop (from SSR) and local isDone state (from click) — covers both the 'already started before page load' and 'just started' cases"
  - "startRoute uses token.sub as techId — tech always starts their own route, no impersonation"

requirements-completed: [NOTIF-01]

# Metrics
duration: 7min
completed: 2026-03-09
---

# Phase 05 Plan 03: Pre-Arrival Notification Server Action and Start Route UI Summary

**sendPreArrivalNotifications server action with idempotency and opt-out filtering, plus one-tap Start Route button for techs**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-03-09T18:31:04Z
- **Completed:** 2026-03-09T18:38:16Z
- **Tasks:** 2
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments

- `sendPreArrivalNotifications(techId)` server action that queries today's route stops for the tech using two-step withRls pattern (stops then customers via separate queries + JS merge — avoids RLS correlated subquery pitfall)
- Idempotency via `pre_arrival_sent_at IS NULL` filter — re-starting route does not send duplicate notifications
- Opt-out filtering: only stops where `notifications_enabled=true` AND (phone OR email present) are included
- Tech name fetched from profiles table via withRls for personalized SMS message
- `startRoute()` action wraps `sendPreArrivalNotifications` using authenticated user's sub as techId
- `getRouteStartedStatus()` action checks if any stop has `pre_arrival_sent_at` set for today — used for SSR button initial state
- `StartRouteButton` client component with three visual states: active (Play icon), loading (spinner + "Notifying..."), and done (checkmark + "Route Started" disabled)
- Routes page fetches started status in parallel with stops for instant SSR render
- Button shows disabled "Route Started" state after click AND when pre-fetched SSR state shows already started

## Task Commits

Each task was committed atomically:

1. **Task 1: Create sendPreArrivalNotifications server action** - `e0634dc` (feat)
2. **Task 2: Add Start Route button to tech's route view** - `5fef851` (feat)

**Plan metadata:** _(docs commit follows)_

## Files Created/Modified

- `src/actions/notifications.ts` — sendPreArrivalNotifications (eligibility filter + Edge Function invoke) and startRoute (auth wrapper)
- `src/components/field/start-route-button.tsx` — Client component with loading/success/already-started states, calls startRoute action
- `src/actions/routes.ts` — Added getRouteStartedStatus function and isNotNull import
- `src/app/(app)/routes/page.tsx` — Added StartRouteButton (tech-only, stops.length > 0 guard), parallel data fetching with Promise.all

## Decisions Made

- **Two-step withRls pattern:** Two separate Drizzle queries (route_stops, then customers by ID array) with JavaScript merge, rather than a single leftJoin across both tables. This is the safe pattern per MEMORY.md RLS pitfall guidance — avoids any correlated subquery risks inside RLS transactions.
- **Parallel SSR data fetching:** `getRouteStartedStatus` runs in `Promise.all` with `getTodayStops` — the button renders in its correct initial state from the server response, with no client-side loading flicker.
- **Local `isDone` state + `alreadyStarted` prop:** The button tracks both cases: (1) route was already started before page load (from SSR prop), and (2) route was just started in this session (from local state after click). Either case renders the disabled "Route Started" state.

## Deviations from Plan

None — plan executed exactly as written.

The pre-existing build errors in the working tree (`renderAsync` replaced with `render as renderEmail` in visits.ts, and Next.js `.next` cache stale errors for alert-card.tsx) were pre-existing from other in-progress phase 05 work in the working tree. The clean build (`rm -rf .next`) resolved the cache issues; the linter had already fixed the `renderAsync` rename. No manual fixes required from this plan's scope.

## Self-Check: PASSED

- FOUND: src/actions/notifications.ts
- FOUND: src/components/field/start-route-button.tsx
- FOUND: commit e0634dc (Task 1)
- FOUND: commit 5fef851 (Task 2)
