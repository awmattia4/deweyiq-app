---
phase: 08-customer-portal
plan: "05"
subsystem: ui
tags: [supabase-realtime, messaging, chat, notifications, resend, browser-image-compression]

# Dependency graph
requires:
  - phase: 08-01
    provides: portal auth, portal_messages schema, PortalShell, resolveCustomerId, adminDb pattern
provides:
  - Real-time customer ↔ office chat via Supabase Realtime Broadcast
  - Customer portal /portal/messages page with MessageThread
  - Office inbox /(app)/inbox with two-panel layout
  - Customer profile Messages tab
  - Unread message badge in sidebar and portal nav
  - Email notifications both directions (Resend)
  - Photo attachment upload via signed URLs
affects:
  - 08-06-requests (portal navigation already wired)
  - Future: any feature that needs to check unread message count

# Tech tracking
tech-stack:
  added:
    - browser-image-compression (already installed, now used for portal photo uploads)
    - Supabase Realtime Broadcast (channel `portal-thread-${customerId}`)
  patterns:
    - Realtime broadcast for chat: subscribe to channel on mount, deduplicate by id, remove on unmount
    - adminDb for all portal message ops (portal customers + office notification sends)
    - UnreadBadge/UnreadDot client components poll getUnreadCount every 30s for nav badges
    - Two-panel inbox: InboxClientShell manages active thread state; server page SSRs thread list
    - Portal photos: browser-image-compression → createMessagePhotoUploadUrl (signed PUT URL) → storage bucket

key-files:
  created:
    - src/actions/portal-messages.ts
    - src/lib/emails/portal-message-email.tsx
    - src/app/portal/(portal)/messages/page.tsx
    - src/components/portal/message-bubble.tsx
    - src/components/portal/message-input.tsx
    - src/components/portal/message-thread.tsx
    - src/app/(app)/inbox/page.tsx
    - src/app/(app)/inbox/inbox-client-shell.tsx
    - src/components/inbox/inbox-list.tsx
    - src/components/inbox/inbox-thread.tsx
    - src/components/inbox/unread-badge.tsx
  modified:
    - src/app/(app)/customers/[id]/page.tsx (added Messages tab)
    - src/components/shell/app-sidebar.tsx (Messages nav item + UnreadBadge)
    - src/components/shell/app-header.tsx (/inbox PAGE_TITLES entry)
    - src/components/shell/app-shell.tsx (orgId prop propagation)
    - src/components/shell/portal-shell.tsx (UnreadDot on Messages nav links)
    - src/app/(app)/layout.tsx (orgId passed to AppShell)

key-decisions:
  - "adminDb throughout portal-messages.ts — portal customers don't have staff JWT claims; office notification sends run in webhook/cron-like contexts without user sessions"
  - "Realtime Broadcast (not Postgres Changes) for message delivery — broadcast is fire-and-forget, lower latency, no RLS filtering needed for private chat channels"
  - "Optimistic send + deduplication — sendMessage adds to local state immediately; broadcast echo deduplicated by message ID to prevent double-display"
  - "getInboxThreads uses raw SQL aggregates (MAX, COUNT CASE WHEN) with GROUP BY — avoids correlated subquery pitfall per MEMORY.md"
  - "UnreadBadge polls every 30s (no Realtime subscription for badge) — simpler, avoids channel proliferation; acceptable latency for badge updates"
  - "Photo upload: browser-image-compression (maxSizeMB 0.5) → createSignedUploadUrl → PUT to signed URL — same storage pattern as work-order photos"
  - "Email notification uses PortalMessageEmail React Email template (hex colors only, no oklch) — consistent with all other email templates in the project"
  - "InboxClientShell two-panel layout: server page SSRs thread list, client shell manages active thread state — avoids full-page reloads on thread switch"
  - "Customer profile Messages tab uses InboxThread directly — DRY reuse of office-side message component; no separate implementation needed"

patterns-established:
  - "Realtime chat pattern: createClient() browser client, channel.on('broadcast'), dedup by id, removeChannel on cleanup"
  - "Message send: server action insert → Realtime broadcast (non-fatal) → email notification (fire-and-forget)"
  - "UnreadBadge/UnreadDot: small polling client components, initialCount=0, 30s interval, returns null when count=0"

requirements-completed:
  - PORT-05

# Metrics
duration: 12min
completed: 2026-03-13
---

# Phase 8 Plan 05: Customer Messaging Summary

**Real-time customer ↔ office chat via Supabase Realtime Broadcast, with office inbox, customer profile thread tab, unread badges in both navs, photo attachments, and Resend email notifications both ways**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-13T17:34:56Z
- **Completed:** 2026-03-13T17:47:00Z
- **Tasks:** 2
- **Files modified:** 22

## Accomplishments

- Customer portal `/portal/messages` page with real-time MessageThread (Supabase Realtime Broadcast)
- Office inbox `/(app)/inbox` with two-panel layout — thread list + active conversation
- Customer profile page now has a Messages tab showing the full thread
- Unread message badges in office sidebar nav and customer portal nav (desktop + mobile)
- Photo attachments: browser-image-compression + signed upload URLs + signed display URLs
- Email notifications via Resend in both directions (customer → office, office → customer)

## Task Commits

1. **Task 1: Message server actions** - `9e19e53` (feat)
2. **Task 2: Customer message thread UI, office inbox, unread badges** - `e927f36` (feat)

## Files Created/Modified

- `src/actions/portal-messages.ts` - Server actions: sendMessage, getMessages, getInboxThreads, markAsRead, getUnreadCount, createMessagePhotoUploadUrl
- `src/lib/emails/portal-message-email.tsx` - React Email template for message notifications (both directions)
- `src/app/portal/(portal)/messages/page.tsx` - Customer-facing chat page (server + MessageThread)
- `src/components/portal/message-bubble.tsx` - Chat bubble (own=right/primary, other=left/muted, photo thumbnails)
- `src/components/portal/message-input.tsx` - Auto-growing textarea, photo attach, Enter-to-send
- `src/components/portal/message-thread.tsx` - Real-time client component with Realtime subscription
- `src/app/(app)/inbox/page.tsx` - Office inbox server page (loads thread list)
- `src/app/(app)/inbox/inbox-client-shell.tsx` - Two-panel client shell with mobile stacking
- `src/components/inbox/inbox-list.tsx` - Thread sidebar with unread badges and relative timestamps
- `src/components/inbox/inbox-thread.tsx` - Office message thread with Realtime + auto mark-as-read
- `src/components/inbox/unread-badge.tsx` - Polling UnreadBadge (sidebar) and UnreadDot (portal nav)
- `src/app/(app)/customers/[id]/page.tsx` - Added Messages tab (6 tabs now)
- `src/components/shell/app-sidebar.tsx` - Messages nav item with UnreadBadge
- `src/components/shell/app-header.tsx` - Added /inbox to PAGE_TITLES
- `src/components/shell/app-shell.tsx` - Added orgId prop for badge
- `src/components/shell/portal-shell.tsx` - UnreadDot on Messages nav (desktop + mobile)
- `src/app/(app)/layout.tsx` - Pass orgId to AppShell

## Decisions Made

- `adminDb` used throughout portal-messages.ts — portal customers have role='customer' JWT claims but the server actions need to work in both customer (portal) and office (inbox) contexts without user session
- Supabase Realtime Broadcast chosen over Postgres Changes — no RLS filtering needed, lower latency, simpler subscription model
- `getInboxThreads` uses raw SQL GROUP BY with COUNT CASE WHEN aggregates — avoids correlated subquery pitfall (MEMORY.md critical rule)
- UnreadBadge polls every 30s rather than subscribing to Realtime — simpler, avoids channel proliferation, acceptable badge latency
- InboxClientShell manages active thread selection client-side — SSR thread list avoids loading state on initial open

## Deviations from Plan

None — plan executed exactly as written. All 5 functions in portal-messages.ts exported as specified. All UI components created. All navigation items updated.

## Issues Encountered

- Next.js 16 build trace ENOENT on `.nft.json` files — flaky race condition in Turbopack trace collection, non-deterministic across builds; TypeScript compilation and page generation both succeed. Not a code issue.
- Linter (ESLint auto-fix) reverted files multiple times when intermediate states had unused imports — resolved by writing complete final files in single passes.

## Next Phase Readiness

- Portal messaging is fully functional end-to-end
- Service request flow (Phase 8 Plan 06) can reuse MessageBubble, MessageInput, and the portal navigation structure
- Unread badge infrastructure is in place for any future notification types

---
*Phase: 08-customer-portal*
*Completed: 2026-03-13*
