---
phase: 05-office-operations-dispatch
plan: 04
subsystem: alerts
tags: [alerts, dashboard, sidebar, notifications, chemistry]
dependency_graph:
  requires: [05-01]
  provides: [alerts-dashboard, alert-generation, dismiss-snooze-lifecycle, sidebar-badge]
  affects: [dashboard, app-sidebar, app-layout]
tech_stack:
  added: [src/lib/alerts/constants.ts]
  patterns: [adminDb-for-generation, withRls-for-reads, ON-CONFLICT-DO-NOTHING-deduplication, LEFT-JOIN-no-correlated-subqueries]
key_files:
  created:
    - src/actions/alerts.ts
    - src/app/(app)/alerts/page.tsx
    - src/components/alerts/alert-feed.tsx
    - src/components/alerts/alert-card.tsx
    - src/lib/alerts/constants.ts
  modified:
    - src/components/shell/app-sidebar.tsx
    - src/components/shell/app-shell.tsx
    - src/app/(app)/layout.tsx
    - src/app/(app)/dashboard/page.tsx
decisions:
  - "SNOOZE_OPTIONS extracted to src/lib/alerts/constants.ts — Next.js use server files can only export async functions; const/types must live in non-server files and be imported by both server actions and client components"
  - "adminDb for alert generation (not withRls) — generation scans all org data without RLS filtering complexities; caller validates org membership before calling"
  - "alertCount fetched in layout.tsx (server component) and passed as prop through AppShell to AppSidebar — sidebar is a client component so the count must be injected from the server layer above"
  - "ON CONFLICT DO NOTHING on (org_id, alert_type, reference_id) unique constraint — idempotent generation; page reloads do not create duplicate alerts"
metrics:
  duration: 7 min
  completed_date: 2026-03-09
  tasks_completed: 2
  files_created: 5
  files_modified: 4
---

# Phase 05 Plan 04: Alerts Dashboard Summary

Alerts dashboard with auto-detection of missed stops, declining chemistry, and incomplete data — dismiss/snooze lifecycle, sidebar badge, and dashboard summary card for office staff.

## What Was Built

### Task 1: Alert Generation and Server Actions (`src/actions/alerts.ts`)

Five exported async functions:

- **generateAlerts(orgId)** — Detects and inserts three alert types:
  - **Missed stops**: route_stops before today with status not in (complete, skipped, holiday) → severity "critical"
  - **Incomplete data**: completed service_visits in last 7 days with fewer than 2 chemistry readings → severity "warning"
  - **Declining chemistry**: pools with 3+ visits in last 30 days, slope analysis on freeChlorine/pH/totalAlkalinity/salt → severity "warning"
  - All use `ON CONFLICT DO NOTHING` for idempotent deduplication
  - Uses `adminDb` (not `withRls`) — scans all org data; caller validates membership
  - LEFT JOIN pattern throughout — no correlated subqueries (per MEMORY.md)

- **getActiveAlerts()** — Returns active alerts (dismissed_at IS NULL, snoozed_until expired), ordered by severity DESC then generated_at DESC using CASE expression for priority mapping (critical=3, warning=2, info=1)

- **getAlertCount()** — Count of active alerts for sidebar badge; returns 0 for tech role

- **getAlertCountByType()** — Per-type breakdown (missed_stop, declining_chemistry, incomplete_data, total) for dashboard card

- **dismissAlert(alertId)** — Sets dismissed_at, revalidates /alerts and /dashboard

- **snoozeAlert(alertId, durationMs)** — Sets snoozed_until, revalidates /alerts

### Task 2: UI — Alerts Dashboard, Sidebar Badge, Dashboard Summary Card

**`src/lib/alerts/constants.ts`** — Shared types and SNOOZE_OPTIONS. Extracted from the "use server" file because Next.js only allows async functions to be exported from server action files.

**`src/app/(app)/alerts/page.tsx`** — Server component. Calls `generateAlerts` on each load (idempotent), then `getActiveAlerts`. Passes alerts to `AlertFeed`. Role guard redirects tech → /routes.

**`src/components/alerts/alert-feed.tsx`** — Client component with filter chips (All / Missed Stops / Declining Chemistry / Incomplete Data). Active chip gets primary background. Chip badges show count per type. Empty state with checkmark icon.

**`src/components/alerts/alert-card.tsx`** — Client component per alert. Layout: severity dot (red/amber/blue) + type label + title + relative timestamp + action buttons (snooze dropdown, dismiss X). Loading spinners during transitions. `useTransition` for dismiss, local state for snooze. Uses `router.refresh()` after each action. Custom `formatRelativeTime` helper (no date-fns dependency needed).

**`src/components/shell/app-sidebar.tsx`** — Added Alerts nav item with `roles: ["owner", "office"]`. Badge renders as red circle next to "Alerts" label when count > 0, hidden in icon-collapsed state.

**`src/components/shell/app-shell.tsx`** — Added `alertCount?: number` prop, passed to AppSidebar.

**`src/app/(app)/layout.tsx`** — Added `getAlertCount()` call for badge. Non-fatal (defaults to 0).

**`src/app/(app)/dashboard/page.tsx`** — Added alerts summary card. Shows total count + per-type breakdown (missed, chemistry, incomplete) or green checkmark + "All clear" when 0. Card links to /alerts.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] SNOOZE_OPTIONS moved out of "use server" file**

- **Found during:** Task 1 implementation, confirmed during build
- **Issue:** Next.js "use server" files can only export async functions. Exporting `SNOOZE_OPTIONS` (a const array) and `Alert`/`AlertCounts` (types) from `alerts.ts` caused: `A "use server" file can only export async functions, found object`
- **Fix:** Created `src/lib/alerts/constants.ts` as a non-server shared module. Types and SNOOZE_OPTIONS live there. Server action file imports types only (no re-export). Client components import from constants file directly.
- **Files modified:** `src/actions/alerts.ts`, `src/lib/alerts/constants.ts` (new), `src/components/alerts/alert-card.tsx`, `src/components/alerts/alert-feed.tsx`
- **Commits:** e4c85cb (initial), be982e2 (fixed)

**2. [Rule 3 - Blocking] `date-fns` not installed**

- **Found during:** Task 2 implementation
- **Issue:** `formatDistanceToNow` from `date-fns` used in initial alert-card.tsx — package not in dependencies
- **Fix:** Replaced with inline `formatRelativeTime` helper function (covers: "just now", "N minutes ago", "N hours ago", "N days ago", "Month Day")
- **Files modified:** `src/components/alerts/alert-card.tsx`

## Self-Check

### Files Created

- FOUND: `src/actions/alerts.ts`
- FOUND: `src/app/(app)/alerts/page.tsx`
- FOUND: `src/components/alerts/alert-feed.tsx`
- FOUND: `src/components/alerts/alert-card.tsx`
- FOUND: `src/lib/alerts/constants.ts`

### Commits

- FOUND: e4c85cb — feat(05-04): build alert generation and server actions
- FOUND: be982e2 — feat(05-04): build alerts dashboard, sidebar badge, and dashboard summary card

### Build

`npm run build` succeeded — 21 pages generated, /alerts route included.

## Self-Check: PASSED
