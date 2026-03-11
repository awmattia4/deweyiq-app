---
phase: 06-work-orders-quoting
plan: 03
subsystem: ui
tags: [work-orders, field-tech, photo-capture, bottom-sheet, notifications, alerts]

# Dependency graph
requires:
  - phase: 06-work-orders-quoting
    plan: 01
    provides: work_orders table, work_order_line_items, org_settings WO columns, createWorkOrder/updateWorkOrderStatus server actions
  - phase: 03-field-tech-app
    provides: PhotoCapture pattern (browser-image-compression, Dexie blob-first), NotesField voice dictation pattern, StopWorkflow bottom bar

provides:
  - FlagIssueSheet component: 7-category + 3-severity pill pickers, note field, photo capture (max 3), ~10-second completion flow
  - WoTechCompletion component: Mark Arrived (scheduled→in_progress), completion form (photos/notes/actual-hours/ad-hoc-parts, in_progress→complete)
  - createWoPhotoUploadUrl server action: work-order-photos bucket signed upload URLs
  - updateLineItemActualHours server action: blur-to-flush actual hours on hourly labor items
  - getAssignedWorkOrders server action: tech's scheduled/in_progress WOs
  - _notifyOfficeWoFlagged helper: adminDb alert insertion with wo_notify_office_on_flag check
  - _notifyOfficeWoCompleted helper: adminDb alert insertion with wo_notify_customer_on_complete check
  - flagFromCurrentUser input flag: server-side JWT sub auto-fill for flaggedByTechId
  - work_order_flagged AlertType added to constants.ts

affects:
  - 06-02 (WO detail page can embed WoTechCompletion for assigned techs)
  - 06-04 (invoice generation after WO completion)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "flagFromCurrentUser flag: client passes boolean, server action auto-fills flaggedByTechId from JWT sub — avoids client-side auth reads"
    - "Notification outside withRls transaction: adminDb alert helpers called after withRls returns to prevent alert failure rolling back WO mutation"
    - "Blur-to-flush decimal input: local string state for actual hours, only flush complete numbers on blur (prevents parseFloat eating decimal point)"
    - "LocalPhoto object URL lifecycle: created on capture, tracked in state, revoked on remove + unmount — no memory leaks"

key-files:
  created:
    - src/components/work-orders/flag-issue-sheet.tsx
    - src/components/work-orders/wo-tech-completion.tsx
  modified:
    - src/lib/alerts/constants.ts
    - src/actions/storage.ts
    - src/actions/work-orders.ts
    - src/components/field/stop-workflow.tsx

key-decisions:
  - "flagFromCurrentUser boolean flag: server action resolves flaggedByTechId from JWT token.sub — cleaner than passing userId from client"
  - "adminDb for WO alerts: alerts INSERT RLS only allows owner+office; tech-triggered alerts use adminDb (same pattern as generateAlerts)"
  - "_notifyOfficeWoCompleted uses work_order_flagged alert_type: repurposed for WO lifecycle events until a dedicated wo_lifecycle type is added"
  - "Alert helpers are void-async (fire-and-forget): failure never rolls back the WO mutation"
  - "updateWorkOrderStatus restructured from return-await to const-result pattern: needed to run notification after withRls completes"

requirements-completed:
  - WORK-01
  - WORK-02

# Metrics
duration: 15min
completed: 2026-03-11
---

# Phase 6 Plan 03: Tech Work Order Interactions Summary

**FlagIssueSheet (10-second issue flagging during stops) and WoTechCompletion (arrival + full completion flow with photos, actual hours, and ad-hoc parts) wired into the stop workflow**

## Performance

- **Duration:** 15 min
- **Started:** 2026-03-11T18:54:10Z
- **Completed:** 2026-03-11T19:09:24Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Built FlagIssueSheet: 7 category pills, 3 severity pills, note with dictation hint, photo capture (max 3, browser-image-compression WebP), submits draft WO + fires office alert
- Built WoTechCompletion: scheduled→in_progress "Mark Arrived" button, in_progress→complete form with photo capture, completion notes, actual hours (blur-to-flush), and ad-hoc parts
- Extended createWorkOrder with flagFromCurrentUser flag and _notifyOfficeWoFlagged (adminDb, checks org_settings.wo_notify_office_on_flag)
- Added updateWorkOrderStatus completion notification (_notifyOfficeWoCompleted, checks wo_notify_customer_on_complete)
- Added createWoPhotoUploadUrl, updateLineItemActualHours, and getAssignedWorkOrders server actions

## Task Commits

Each task was committed atomically:

1. **Task 1: Flag Issue sheet in stop workflow** - `f1c37fb` (feat)
2. **Task 2: Tech WO arrival and completion flow** - `b5ce047` (feat)

**Plan metadata:** (see below)

## Files Created/Modified
- `src/components/work-orders/flag-issue-sheet.tsx` - Quick issue flag bottom sheet (7 categories, 3 severities, photo capture, ~10s completion)
- `src/components/work-orders/wo-tech-completion.tsx` - Tech arrival + completion flow with photos, actual hours, ad-hoc parts
- `src/lib/alerts/constants.ts` - Added work_order_flagged to AlertType union
- `src/actions/storage.ts` - Added createWoPhotoUploadUrl for work-order-photos bucket
- `src/actions/work-orders.ts` - flagFromCurrentUser flag, _notifyOfficeWoFlagged, _notifyOfficeWoCompleted, updateLineItemActualHours, getAssignedWorkOrders; restructured updateWorkOrderStatus
- `src/components/field/stop-workflow.tsx` - Flag Issue button (amber, always visible) + FlagIssueSheet mount

## Decisions Made
- `flagFromCurrentUser` boolean flag on CreateWorkOrderInput: avoids requiring client to read auth context; server resolves from JWT sub claim on every request
- Alert insertion via `adminDb` (not withRls): alerts INSERT RLS is owner+office only; tech cannot insert directly — matches `generateAlerts` pattern from Phase 5
- `_notifyOfficeWoCompleted` reuses `work_order_flagged` alert_type: a dedicated `wo_lifecycle` type could be added later but is unnecessary for Phase 6 scope
- Alert helpers are fire-and-forget (`void` async call): alert failure must never roll back WO creation or status update
- `updateWorkOrderStatus` restructured from `return await withRls(...)` to `const result = await withRls(...)` then `return result`: necessary to run completion notification AFTER the transaction completes

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Restructured createWorkOrder to capture woId before return**
- **Found during:** Task 1 (createWorkOrder notification logic)
- **Issue:** Original code used `return await withRls(...)` which made the post-transaction notification code unreachable
- **Fix:** Changed to `const woId = await withRls(...)` then notification call then `return woId`
- **Files modified:** src/actions/work-orders.ts
- **Verification:** TypeScript compiled clean, notification fires after WO creation
- **Committed in:** `f1c37fb` (Task 1 commit)

**2. [Rule 2 - Missing Critical] Added flagFromCurrentUser to avoid client-side auth reads**
- **Found during:** Task 1 (FlagIssueSheet submit handler)
- **Issue:** Plan said "flaggedByTechId: current user id (from auth)" — client components cannot call auth server actions directly
- **Fix:** Added flagFromCurrentUser?: boolean to CreateWorkOrderInput; server auto-resolves from token.sub
- **Files modified:** src/actions/work-orders.ts, src/components/work-orders/flag-issue-sheet.tsx
- **Verification:** TypeScript clean; server action uses JWT sub claim
- **Committed in:** `f1c37fb` (Task 1 commit)

**3. [Rule 1 - Bug] Restructured updateWorkOrderStatus similarly**
- **Found during:** Task 2 (completion notification)
- **Issue:** Same `return await withRls(...)` pattern blocked post-completion notification
- **Fix:** Changed to `const result = await withRls(...)` + notification call + `return result`; added orgId from token
- **Files modified:** src/actions/work-orders.ts
- **Committed in:** `b5ce047` (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (2 Rule 1 - Bug, 1 Rule 2 - Missing Critical)
**Impact on plan:** All fixes required for notifications to work correctly. No scope creep.

## Issues Encountered
- None beyond the auto-fixed deviations above.

## User Setup Required
The `work-order-photos` Supabase Storage bucket must be created manually with an RLS policy similar to `visit-photos`:
```sql
-- Allow org members to upload to their org's folder
-- storage.foldername(name)[1] = auth.jwt()->>'org_id'
```
This is a one-time setup step. Without the bucket, photo uploads will fail silently (non-fatal per the blob-first architecture).

## Next Phase Readiness
- FlagIssueSheet ready for use in any stop workflow — attach to any stop context
- WoTechCompletion ready to be embedded in a tech WO detail page (plan 06-02 integration)
- getAssignedWorkOrders ready for a "My Work Orders" list in the tech's routes view
- All photo upload patterns established for work-order-photos bucket

---
*Phase: 06-work-orders-quoting*
*Completed: 2026-03-11*
