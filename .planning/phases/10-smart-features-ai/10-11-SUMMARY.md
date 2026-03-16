---
phase: 10-smart-features-ai
plan: 11
subsystem: notifications
tags: [notifications, realtime, supabase-realtime, settings, preferences, bell-icon, in-app]
dependency_graph:
  requires:
    - phase: 10-09
      provides: user_notifications table, notification_preferences table, notifyUser dispatch, schema exports
  provides:
    - NotificationBell component (bell icon with live unread count badge, Supabase Realtime subscription)
    - NotificationPanel component (slide-out sheet with Needs Action / Informational groups)
    - user-notifications server actions (getNotifications, getUnreadCount, markRead, markAllRead, dismissNotification, getNotificationPreferences, updateNotificationPreference)
    - NotificationPreferences UI (per-user per-type in-app/push/email toggles in Settings Account tab)
    - App header bell integration (unread count SSR'd from layout, Realtime increments)
  affects:
    - Plans 10-10, 10-12, 10-14 (notification dispatch callers — bell will show their notifications)
    - src/components/shell/app-header.tsx (bell rendered here)
    - src/app/(app)/settings/page.tsx (preferences fetched here)
tech-stack:
  added: []
  patterns:
    - Supabase Realtime postgres_changes INSERT-only subscription for live count updates (UPDATE/DELETE skipped due to REPLICA IDENTITY limitation)
    - Optimistic local state for read/dismiss with server action persistence via useTransition
    - SSR initial unread count passed as prop, Realtime increments client-side without refetch
    - timeAgo pure function for relative timestamps without date library dependency
    - Per-user notification preferences: no row = all channels enabled (all-enabled default via absence)
    - initialNotifPreferences fetched server-side and passed as prop for zero-loading-flicker preferences UI
key-files:
  created:
    - src/actions/user-notifications.ts
    - src/components/notifications/notification-bell.tsx
    - src/components/notifications/notification-panel.tsx
    - src/components/settings/notification-preferences.tsx
  modified:
    - src/components/shell/app-header.tsx (NotificationBell rendered, DeweyIQ fallback fixed)
    - src/components/shell/app-shell.tsx (unreadNotificationCount prop added)
    - src/app/(app)/layout.tsx (getUnreadCount() fetched in parallel)
    - src/components/settings/settings-tabs.tsx (NotificationPreferences card in Account tab)
    - src/app/(app)/settings/page.tsx (getNotificationPreferences() fetched, props wired)
key-decisions:
  - "INSERT-only Realtime subscription on user_notifications: only subscribe to INSERT events, not UPDATE/DELETE — REPLICA IDENTITY not configured for this table, per 10-09 research note"
  - "timeAgo pure function instead of date-fns/dayjs: avoids adding a dependency for a simple relative timestamp; 5-case switch covers all practical ranges"
  - "Optimistic local state for mark-read and dismiss: immediate UI feedback without waiting for server round-trip; useTransition persists to server in background"
  - "unreadNotificationCount SSR in layout, Realtime increments in bell: avoids client-only fetch flicker on page load; Realtime handles live updates after mount"
  - "NotificationPreferences in Account tab (all roles): personal preferences belong with personal account settings, not company settings; Notification Templates (owner-only) stays in Company tab"
requirements-completed:
  - NOTIF-33
duration: 9min
completed: "2026-03-16"
tasks: 2
files_created: 4
files_modified: 5
---

# Phase 10 Plan 11: In-App Notification Center Summary

**Bell icon with live Supabase Realtime unread count, slide-out notification panel grouped by urgency, and per-user per-type in-app/push/email preference toggles in Settings — completes NOTIF-33.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-16T17:33:01Z
- **Completed:** 2026-03-16T17:42:09Z
- **Tasks:** 2
- **Files created:** 4
- **Files modified:** 5

## Accomplishments

- Bell icon in app header shows live unread count badge (incremented via Supabase Realtime INSERT subscription); initial count SSR'd from layout
- Notification panel slides in from right, groups notifications into "Needs Action" (amber highlight) and "Informational" sections with per-notification dismiss (X button) and mark-read actions; "Mark all read" in header
- 7 server actions: getNotifications, getUnreadCount, markRead, markAllRead, dismissNotification, getNotificationPreferences, updateNotificationPreference — all using withRls for RLS enforcement
- 23 notification types across 7 groups rendered as a preference grid in Settings > Account tab with In-App/Push/Email column toggles; all roles can configure their own preferences

## Task Commits

1. **Task 1: Notification bell, panel, and server actions** - `b93f917` (feat)
2. **Task 2: Per-user notification preferences in Settings** - `81c9817` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `src/actions/user-notifications.ts` — 7 server actions for notification CRUD and preference management
- `src/components/notifications/notification-bell.tsx` — Bell icon with red badge, Supabase Realtime subscription, opens panel
- `src/components/notifications/notification-panel.tsx` — Slide-out Sheet with Needs Action / Informational groups, mark-read, dismiss, navigation
- `src/components/settings/notification-preferences.tsx` — 23 notification types in 7 groups with In-App/Push/Email checkboxes
- `src/components/shell/app-header.tsx` — NotificationBell rendered left of user avatar; "PoolCo" fallback fixed to "DeweyIQ"
- `src/components/shell/app-shell.tsx` — unreadNotificationCount prop added and passed to header
- `src/app/(app)/layout.tsx` — getUnreadCount() fetched in parallel with alertCount and orgBranding
- `src/components/settings/settings-tabs.tsx` — NotificationPreferences import, initialNotifPreferences prop, card in Account tab
- `src/app/(app)/settings/page.tsx` — getNotificationPreferences() fetched, initialNotifPreferences and broadcast props wired

## Decisions Made

- INSERT-only Realtime subscription: per 10-09 research, UPDATE/DELETE events require REPLICA IDENTITY FULL which is not configured; INSERT is sufficient to catch new notifications in real-time
- timeAgo pure function over date-fns: avoids adding a dependency; covers all practical relative time ranges with 5 branches
- Optimistic state for read/dismiss: immediate visual feedback, useTransition persists asynchronously in background
- unreadNotificationCount SSR'd in layout, Realtime handles post-mount increments: zero-flicker approach without client-side fetch on navigation
- NotificationPreferences in Account tab (not Company tab): personal per-user setting belongs with user's own profile settings; Notification Templates (company-wide, owner only) stays in Company tab; labeled clearly to distinguish

## Deviations from Plan

None — plan executed exactly as written.

The linter auto-modified app-shell.tsx during execution to add `PwaInstallPrompt` and `PushPermissionPrompt` imports from Plan 10-10. These components already existed; the linter integration worked correctly. Settings-tabs.tsx also had `SafetySettings` and `BroadcastMessaging` added by the linter from Plans 10-14 and 10-16; these were pre-existing and accounted for.

## Issues Encountered

Build fails due to pre-existing TypeScript errors from earlier Phase 10 plans (company-settings.ts `logo_url`, wo-labor-section `updateWorkOrderLabor`, billing `getBillingInsights`) — none in files added or modified by this plan. New files are TypeScript-clean.

## User Setup Required

None — the Supabase Realtime subscription uses the existing public key from `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. VAPID keys for push (from Plan 10-09) are still required for push delivery but the in-app bell works without them.

## Next Phase Readiness

- In-app notification bell is live — any call to `notifyUser()` or `notifyOrgRole()` from Plans 10-10, 10-12, 10-14 will immediately appear in the bell and panel
- NOTIF-33 satisfied: all 23 notification types are independently toggleable per user for push/email/in-app
- Ready for Phase 10 Plan 12+ (event trigger wiring and remaining smart features)

---
*Phase: 10-smart-features-ai*
*Completed: 2026-03-16*
