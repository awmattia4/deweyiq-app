---
phase: 10-smart-features-ai
plan: 09
subsystem: notifications
tags: [push-notifications, web-push, schema, dispatch, infrastructure]
dependency_graph:
  requires: []
  provides:
    - user_notifications table (in-app notification storage)
    - push_subscriptions table (Web Push per user per device)
    - notification_preferences table (per-user channel overrides)
    - notifyUser function (unified dispatch entry point)
    - notifyOrgRole function (role-based broadcast)
    - sendPushToUser function (Web Push delivery)
    - NOTIFICATION_TYPE_CONFIG (all 19 NOTIF-05 through NOTIF-23 types)
  affects:
    - Plans 10-10, 10-11, 10-12, 10-14 (event trigger wiring)
tech_stack:
  added:
    - web-push@3.6.7
    - "@types/web-push@3.6.4"
  patterns:
    - adminDb for push sends (no user session in server context)
    - withRls for user-facing subscription management
    - Promise.allSettled for multi-device push delivery
    - Lazy VAPID config initialization (graceful in dev without keys)
    - Non-blocking dispatch (failures logged, never thrown)
key_files:
  created:
    - src/lib/db/schema/user-notifications.ts
    - src/lib/db/schema/push-subscriptions.ts
    - src/lib/db/schema/notification-prefs.ts
    - src/actions/push.ts
    - src/lib/notifications/dispatch.ts
  modified:
    - src/lib/db/schema/index.ts (Phase 10 table exports added)
    - src/lib/db/schema/relations.ts (Phase 10 relations added)
    - package.json (web-push + @types/web-push added)
decisions:
  - "adminDb for sendPushToUser: push sends run without user JWT context (webhook handlers, cron) — RLS would block the read"
  - "notifyUser is non-blocking by design: notification failures must never roll back or block the originating mutation"
  - "in-app INSERT via adminDb only: users insert their own notifications indirectly via server actions, not directly (no INSERT RLS policy)"
  - "VAPID configured lazily: avoids build errors in environments without VAPID keys"
  - "410 Gone auto-cleanup: expired push subscriptions cleaned up on first failed send attempt"
  - "email delivery deferred to callers: dispatch.ts does not queue emails — individual event triggers decide whether to send email"
metrics:
  duration: 8 min
  completed: "2026-03-16"
  tasks: 2
  files_created: 5
  files_modified: 3
---

# Phase 10 Plan 09: Notification Infrastructure Summary

One-liner: Web Push + in-app notification infrastructure with per-user preference overrides and unified dispatch for all 19 company event types (NOTIF-05 through NOTIF-23).

## What Was Built

### Task 1: Notification Schema

Three new database tables with RLS policies and performance indexes:

**user_notifications** (`src/lib/db/schema/user-notifications.ts`)
- Stores in-app notifications: one row per event per recipient
- Fields: notification_type, urgency (needs_action | informational), title, body, link, read_at, dismissed_at, expires_at (30 days), metadata
- RLS: recipient can SELECT and UPDATE their own notifications; INSERT via adminDb only (system creates, users never insert directly)
- Indexes: (recipient_id, read_at) for unread counts; (recipient_id, created_at) for chronological listing

**push_subscriptions** (`src/lib/db/schema/push-subscriptions.ts`)
- Stores Web Push subscriptions: one row per user per browser/device
- Fields: endpoint (unique), p256dh, auth, device_hint (ios/android/desktop), last_used_at
- RLS: user manages their own subscriptions (SELECT/INSERT/DELETE); server push uses adminDb
- Index: (user_id) for fast per-user subscription lookup

**notification_preferences** (`src/lib/db/schema/notification-prefs.ts`)
- Per-user per-org channel overrides: push_enabled, email_enabled, in_app_enabled per notification_type
- UNIQUE(user_id, org_id, notification_type) — one row per type per user per org
- Default (no row): all channels enabled
- RLS: user manages their own preferences (SELECT/INSERT/UPDATE/DELETE)

Migration note: All three tables already existed in migration `0010_tranquil_spencer_smythe.sql` from a prior partial execution. The schema files are authoritative and consistent with the migration.

### Task 2: Web Push Actions and Unified Dispatch

**src/actions/push.ts**
- `subscribeUserPush(subscription: PushSubscriptionJSON)`: Registers a browser push subscription. Uses withRls for RLS enforcement. Upserts on endpoint (handles re-subscriptions). Detects device hint from User-Agent.
- `unsubscribeUserPush(endpoint: string)`: Removes a subscription via withRls.
- `sendPushToUser(userId, payload)`: Internal function using adminDb. Sends to all user devices with Promise.allSettled. Auto-cleans 410 Gone subscriptions. VAPID configured lazily from env vars.

**src/lib/notifications/dispatch.ts**
- `notifyUser(recipientId, orgId, event)`: Single entry point. Checks notification_preferences, creates in-app row, sends push. All non-blocking.
- `notifyOrgRole(orgId, role, event)`: Broadcasts to all users of a role. Supports 'owner+office' shorthand.
- `NOTIFICATION_TYPE_CONFIG`: 24 event types covering all NOTIF-05 through NOTIF-23 requirements with explicit comment annotations.

## NOTIFICATION_TYPE_CONFIG Coverage

| NOTIF ID | Type | Urgency | Roles |
|----------|------|---------|-------|
| NOTIF-05 | stop_completed | informational | owner, office |
| NOTIF-06 | stop_skipped | needs_action | owner, office |
| NOTIF-07 | stop_cant_complete | needs_action | owner, office |
| NOTIF-08 | route_started, route_finished | informational | owner, office |
| NOTIF-09 | chemistry_alert | needs_action | owner, office |
| NOTIF-10 | wo_created, wo_updated, wo_completed | informational | owner, office |
| NOTIF-11 | quote_approved, quote_rejected | mixed | owner, office |
| NOTIF-12 | payment_received | informational | owner, office |
| NOTIF-13 | payment_failed | needs_action | owner, office |
| NOTIF-14 | portal_message | needs_action | owner, office |
| NOTIF-15 | service_request | needs_action | owner, office |
| NOTIF-16 | customer_added, customer_cancelled | mixed | owner, office |
| NOTIF-17 | invoice_overdue | needs_action | owner, office |
| NOTIF-18 | weather_proposal | needs_action | owner, office |
| NOTIF-19 | tech_assigned | informational | tech |
| NOTIF-20 | tech_quote_approved | informational | tech |
| NOTIF-21 | schedule_change | informational | tech |
| NOTIF-22 | tech_weather_alert | needs_action | tech |
| NOTIF-23 | system_event | needs_action | owner |

## Deviations from Plan

None — plan executed exactly as written.

The migration was pre-generated from a prior partial execution (`0010_tranquil_spencer_smythe.sql`). The schema files I created are the authoritative source and match the migration exactly.

## Environment Variables Required (Not Yet Set)

Per plan's `user_setup` section — these must be set before push notifications work:
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`: Generated via `npx web-push generate-vapid-keys`
- `VAPID_PRIVATE_KEY`: Server-only private key (from same command)
- `VAPID_CONTACT_EMAIL` (optional): Defaults to `admin@poolco.app`

The dispatch gracefully skips push in dev environments without VAPID keys.

## Commits

| Task | Hash | Message |
|------|------|---------|
| 1 | 5e59f2a | feat(10-09): notification schema |
| 2 | ae95c5c | feat(10-09): Web Push actions and unified notification dispatch |

## Self-Check: PASSED

Files created:
- src/lib/db/schema/user-notifications.ts: EXISTS
- src/lib/db/schema/push-subscriptions.ts: EXISTS
- src/lib/db/schema/notification-prefs.ts: EXISTS
- src/actions/push.ts: EXISTS
- src/lib/notifications/dispatch.ts: EXISTS

Commits:
- 5e59f2a: EXISTS
- ae95c5c: EXISTS

TypeScript: No errors in new files (82 pre-existing errors in other Phase 10 plans' files)
