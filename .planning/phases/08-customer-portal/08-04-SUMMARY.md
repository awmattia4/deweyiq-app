---
phase: 08-customer-portal
plan: "04"
subsystem: ui
tags: [nextjs, react, supabase-realtime, service-requests, portal, chat]

# Dependency graph
requires:
  - phase: 08-01
    provides: portal foundation (magic link auth, subdomain routing, portal shell, service_requests schema)
  - phase: 08-02
    provides: portal page patterns (server components, portal layout, adminDb patterns)
provides:
  - Customer-facing service request form (6-step guided) with pool selection, category, urgency, photos, date/time
  - Customer request list with status tracker (Submitted → Reviewed → Scheduled → Complete)
  - Per-request chat threads (customer + office) with Supabase Realtime
  - Office-side service request queue with filter tabs and review panel
  - Work order creation from service requests
  - Decline workflow with reason (visible to customer)
  - Sidebar Requests nav item for owner/office
affects:
  - 08-05 (messaging patterns similar to request thread)
  - phase-09-reports (requests data feeds reporting)
  - work-orders (WO creation from requests)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Per-request Realtime channel pattern (portal-request-{id}) for scoped real-time updates
    - adminDb for portal read/write operations (customers don't have org_id in RLS JWT)
    - withRls two-query pattern for getOfficeRequests (customers + pools queried separately)
    - Lazy message loading (messages loaded only when card expands)
    - Optimistic send with optimistic ID replacement on server response

key-files:
  created:
    - src/actions/service-requests.ts
    - src/actions/portal-data.ts (getCustomerPools added)
    - src/components/portal/request-form.tsx
    - src/components/portal/request-list.tsx
    - src/components/portal/request-status-tracker.tsx
    - src/components/portal/request-thread.tsx
    - src/app/portal/(portal)/requests/page.tsx
    - src/app/portal/(portal)/requests/new/page.tsx
    - src/app/(app)/requests/page.tsx
    - src/components/requests/office-request-list.tsx
    - src/components/requests/request-review-panel.tsx
  modified:
    - src/components/shell/app-sidebar.tsx
    - src/components/shell/app-header.tsx

key-decisions:
  - "Per-request Realtime channel scoped to portal-request-{requestId} — avoids leaking messages between requests"
  - "adminDb for portal operations (customers lack org_id in JWT for RLS)"
  - "withRls two-query pattern for getOfficeRequests — avoids correlated subquery pitfall (MEMORY.md)"
  - "Lazy message loading in RequestList — messages only fetched when card expanded"
  - "RequestThread reused in both portal (customer) and office review panel — single source of truth"
  - "6-step form auto-skips pool selection when customer has only 1 pool"
  - "Photo upload via createRequestPhotoUploadUrl to company-assets bucket (same pattern as branding)"
  - "toLocalDateString() from date-utils for all date strings — never toISOString().split(T)[0]"

patterns-established:
  - "Per-request Realtime: subscribe to portal-request-{id} channel for scoped updates"
  - "Lazy expand: load messages on card expand, show spinner, cache in component state"
  - "Optimistic send: add local msg, replace with server result on success, remove on failure"

requirements-completed:
  - PORT-04

# Metrics
duration: 45min
completed: 2026-03-13
---

# Phase 8 Plan 04: Service Request System Summary

**Full service request lifecycle — 6-step guided customer form, office review queue with WO creation, and per-request chat threads with Supabase Realtime**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-03-13T17:35:00Z
- **Completed:** 2026-03-13T18:20:00Z
- **Tasks:** 2
- **Files modified:** 13

## Accomplishments

- Customer portal gets a 6-step guided service request form: pool selection (auto-skipped if 1 pool), category picker (6 categories as card grid), describe + urgency toggle, photo upload (up to 5 photos), preferred date + time window, review + submit
- Per-request chat threads using `RequestThread` component — subscribed to `portal-request-{requestId}` Realtime channel, shown in both the customer's expanded request card and the office review panel
- Office request queue at `/(app)/requests` with filter tabs (All/New/In Progress/Completed), amber left border for urgent requests, and side panel review UI
- Review panel supports: Create Work Order (creates WO + links back to request), Mark Reviewed, and Decline with reason visible to customer
- Status tracker with horizontal (desktop) / vertical (mobile) step indicator showing Submitted → Reviewed → Scheduled → Complete

## Task Commits

1. **Task 1: Service request server actions** — `9e19e53` (feat, committed in earlier session as part of portal message actions)
2. **Task 2: Customer/office UI** — `e3418ef` (committed via stash pop)

## Files Created/Modified

- `src/actions/service-requests.ts` — Full CRUD: submit, list (customer+office), review, createWoFromRequest, getRequestMessages, sendRequestMessage, createRequestPhotoUploadUrl
- `src/actions/portal-data.ts` — Added `getCustomerPools` for form pool selection
- `src/components/portal/request-form.tsx` — 6-step guided form with photo upload, urgency toggle, date/time picker
- `src/components/portal/request-list.tsx` — Expandable cards with lazy message loading
- `src/components/portal/request-status-tracker.tsx` — Step indicator, declined state, horizontal/vertical responsive
- `src/components/portal/request-thread.tsx` — Realtime chat thread (reused in portal + office)
- `src/app/portal/(portal)/requests/page.tsx` — Customer request list page with success banner
- `src/app/portal/(portal)/requests/new/page.tsx` — New request form page
- `src/app/(app)/requests/page.tsx` — Office request queue (owner+office only)
- `src/components/requests/office-request-list.tsx` — Filter tabs + request cards + opens review panel
- `src/components/requests/request-review-panel.tsx` — Full review with actions and thread
- `src/components/shell/app-sidebar.tsx` — Added Requests nav item for owner+office
- `src/components/shell/app-header.tsx` — Added /requests to PAGE_TITLES map

## Decisions Made

- **Per-request Realtime scoped to `portal-request-{requestId}`** — avoids cross-request message leakage; each request is its own channel
- **adminDb for portal operations** — portal customers have `user_role='customer'` in JWT but the RLS policies on service_requests use email-based correlated subquery which doesn't work reliably in withRls; adminDb with explicit org+customer check is the established pattern
- **withRls two-query pattern for `getOfficeRequests`** — customers and pools queried in separate steps per MEMORY.md pitfall (no correlated subqueries inside withRls)
- **Lazy message loading** — messages fetched on card expand, not on page load; prevents N+1 DB calls when the list has many requests
- **`toLocalDateString()` enforced** — never `toISOString().split("T")[0]` for preferred_date; form default is tomorrow computed with local timezone

## Deviations from Plan

None — plan executed exactly as specified. The service-requests.ts server actions were already committed in a prior session (as part of feat(08-05) which ran ahead of schedule).

## Issues Encountered

- The `nft.json` ENOENT error during `npm run build --webpack` is a pre-existing Next.js 16 build infrastructure issue unrelated to this plan's changes. TypeScript compilation succeeds cleanly. The error existed before this plan executed (confirmed by testing on HEAD before changes).

## Next Phase Readiness

- Service request system complete — customers can submit, track, and chat about requests
- Office can review, create work orders from requests, or decline
- Per-request Realtime chat pattern established — can be reused for future real-time features
- Ready for Phase 08-05 (customer messaging) which uses the same MessageBubble/MessageInput patterns

---
*Phase: 08-customer-portal*
*Completed: 2026-03-13*
