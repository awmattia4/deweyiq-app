---
phase: 10-smart-features-ai
plan: 17
subsystem: ui
tags: [pwa, push-notifications, service-worker, vapid, web-push]

# Dependency graph
requires:
  - phase: 10-09
    provides: subscribeUserPush / unsubscribeUserPush server actions and push_subscriptions table

provides:
  - Push event handler in service worker — receives VAPID push, shows native notification
  - notificationclick handler — focuses existing app window or opens new window on notification tap
  - src/lib/push/subscribe.ts — urlBase64ToUint8Array, subscribeToPush, unsubscribeFromPush, isPushSubscribed
  - PwaInstallPrompt — fixed bottom banner with 7-day snooze, iOS step-by-step instructions
  - PushPermissionPrompt — permission banner with 24-hour snooze, subscribeToPush on user consent

affects:
  - Any future plan adding notification types (can now call subscribeToPush client-side)
  - Settings page (can surface push subscription status and blocked-permission message)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - iOS PWA push guard: check display-mode: standalone before attempting push subscribe on iOS
    - Self-managing prompt components: visibility via localStorage snooze keys and browser API checks
    - beforeinstallprompt capture: standard pattern for non-iOS A2HS native browser prompt

key-files:
  created:
    - src/lib/push/subscribe.ts
    - src/components/notifications/pwa-install-prompt.tsx
    - src/components/notifications/push-permission-prompt.tsx
  modified:
    - src/app/sw.ts
    - src/components/shell/app-shell.tsx

key-decisions:
  - "urlBase64ToUint8Array returns ArrayBuffer (not Uint8Array) — TypeScript PushManager.subscribe applicationServerKey requires ArrayBuffer-compatible type"
  - "vibrate cast to 'any' in sw.ts showNotification call — TypeScript lib definition omits vibrate from NotificationOptions despite it being valid in modern browsers"
  - "PushPermissionPrompt bottom-20 to stack above PwaInstallPrompt bottom-4 — both prompts can coexist and are visually distinct"
  - "Both prompts integrated in AppShell (client component) not layout.tsx (server) — client-side browser API access required"

patterns-established:
  - "localStorage snooze pattern: write Date.now() as string, read back as parseInt, compare elapsed ms to duration constant"

requirements-completed:
  - NOTIF-33

# Metrics
duration: 6min
completed: 2026-03-16
---

# Phase 10 Plan 17: PWA Install Prompt and Push Notifications Summary

**VAPID push event handler in service worker, iOS-aware install banner with 7-day snooze, and push permission prompt with 24-hour snooze wired into AppShell**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-16T17:32:39Z
- **Completed:** 2026-03-16T17:38:24Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Service worker now handles `push` events: parses JSON payload, shows native notification with title/body/icon/vibration
- Service worker handles `notificationclick`: closes notification, focuses existing app window or opens new window to deep link URL
- Client subscription helper (`subscribe.ts`) manages full VAPID subscription lifecycle with iOS guard, env var check, existing subscription reuse, and server persistence
- PWA install prompt renders a fixed bottom card with iOS step-by-step instructions (share → Add to Home Screen) or native `beforeinstallprompt` trigger on Chrome/Edge — snoozes 7 days on dismiss
- Push permission prompt requests `Notification` permission and calls `subscribeToPush()` — skips if granted/denied/snoozed, snoozes 24 hours on dismiss, shows success toast on subscription

## Task Commits

Each task was committed atomically:

1. **Task 1: Service worker push handler and client subscription** - `a28301b` (feat)
2. **Task 2: PWA install prompt and push permission prompt** - `a7dec4b` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `src/app/sw.ts` — Extended with push event handler and notificationclick handler
- `src/lib/push/subscribe.ts` — Created: urlBase64ToUint8Array, subscribeToPush, unsubscribeFromPush, isPushSubscribed
- `src/components/notifications/pwa-install-prompt.tsx` — Created: install banner with iOS instructions and 7-day snooze
- `src/components/notifications/push-permission-prompt.tsx` — Created: push permission banner with 24-hour snooze
- `src/components/shell/app-shell.tsx` — Added PwaInstallPrompt and PushPermissionPrompt imports and renders

## Decisions Made

- `urlBase64ToUint8Array` returns `ArrayBuffer` instead of `Uint8Array` — TypeScript's `PushSubscriptionOptionsInit.applicationServerKey` type requires `BufferSource` which maps to `ArrayBuffer` in strict mode; returning `ArrayBuffer` directly avoids the `Uint8Array<ArrayBufferLike>` assignability error.
- `vibrate` option cast to `as any` in `sw.ts` — the property is valid in all modern browsers (included in the Notifications API spec) but TypeScript's older lib definitions don't include it in `NotificationOptions`. Comment explains the reasoning inline.
- Both prompts placed in `AppShell` (already a `"use client"` component) rather than `layout.tsx` (server component) — both components need browser APIs (`localStorage`, `window.matchMedia`, `Notification`) which are unavailable server-side.
- `PushPermissionPrompt` positioned `bottom-20` and `PwaInstallPrompt` positioned `bottom-4` so both can coexist visually — in practice they rarely show simultaneously (push prompt checks if already installed, install prompt shows first).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript type error: Uint8Array not assignable to applicationServerKey**
- **Found during:** Task 1 (subscribe.ts)
- **Issue:** `urlBase64ToUint8Array` originally returned `Uint8Array` but `PushManager.subscribe()` requires `applicationServerKey` as `BufferSource` which TypeScript resolves to `ArrayBuffer` only
- **Fix:** Changed function to create an `ArrayBuffer`, wrap with `Uint8Array` view for byte writes, return the `ArrayBuffer`
- **Files modified:** `src/lib/push/subscribe.ts`
- **Verification:** `npx tsc --noEmit` shows no errors in subscribe.ts
- **Committed in:** a28301b (Task 1 commit)

**2. [Rule 1 - Bug] TypeScript type error: vibrate not in NotificationOptions**
- **Found during:** Task 1 (sw.ts)
- **Issue:** `vibrate: [100, 50, 100]` in `showNotification` options caused TS2769 — older TypeScript lib omits `vibrate`
- **Fix:** Cast the options object to `as any` with inline comment explaining the reasoning
- **Files modified:** `src/app/sw.ts`
- **Verification:** `npx tsc --noEmit` shows no errors in sw.ts
- **Committed in:** a28301b (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 - TypeScript type bugs)
**Impact on plan:** Both fixes necessary for TypeScript compilation. Behavior is identical to original intent. No scope creep.

## Issues Encountered
- Pre-existing build errors in unrelated files (`company-settings.ts`, `invoices.ts`, `quotes.ts`, etc.) — out of scope per deviation rules. My files have zero TypeScript errors. These are tracked in the existing project backlog.

## User Setup Required
None — VAPID keys were already configured in Phase 10-09. Push notifications require `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` environment variables (already documented in Phase 10-09 setup).

## Next Phase Readiness
- Service worker push handler is live — any phase calling `sendPushToUser()` will now deliver visible notifications to users
- Install prompt and push permission prompt are live in the app shell — users will see them on first login after deploying
- iOS users receive step-by-step install instructions before being asked for push permission
- Push subscription lifecycle is complete: subscribe → persist to server → receive push → display notification → click to deep link

---
*Phase: 10-smart-features-ai*
*Completed: 2026-03-16*
