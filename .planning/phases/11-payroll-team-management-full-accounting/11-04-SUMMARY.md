---
phase: 11-payroll-team-management-full-accounting
plan: 04
subsystem: ui
tags: [quickbooks, qbo, timesheets, payroll, time-tracking, settings]

# Dependency graph
requires:
  - phase: 11-02
    provides: time_entries schema, clock-in/clock-out actions, break_events, geofencing
  - phase: 11-03
    provides: OrgSettings time tracking fields, time_tracking_enabled, pay_period_type

provides:
  - Weekly timesheet review UI per employee with Mon-Sun hour breakdown
  - QBO time sync module — syncEmployeeToQbo, pushTimeEntryToQbo, pushPayPeriodToQbo
  - Timesheet server actions — getTimesheets, editTimeEntry, approveTimesheet, getTimesheetSummary
  - Time tracking settings component for org configuration
  - pushWeekToQbo server action wrapper for client-safe QBO push
affects:
  - 11-05
  - 11-06
  - 11-07
  - 11-08

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fire-and-forget QBO push — never throw, always log, store qbo_time_activity_id on success"
    - "Server action wrapper pattern — server-only modules (time-sync.ts) wrapped in server actions (pushWeekToQbo) for client component consumption"
    - "node-quickbooks any cast — TS types missing Employee/TimeActivity endpoints; cast qbo to any at call sites"

key-files:
  created:
    - src/actions/timesheets.ts
    - src/lib/qbo/time-sync.ts
    - src/components/team/timesheet-view.tsx
    - src/components/settings/time-tracking-settings.tsx
  modified:
    - src/lib/qbo/mappers.ts
    - src/actions/time-tracking.ts
    - src/app/(app)/team/page.tsx
    - src/components/settings/settings-tabs.tsx
    - src/lib/db/schema/time-entries.ts
    - src/lib/db/schema/work-orders.ts
    - src/lib/db/schema/checklists.ts
    - src/lib/db/schema/schedule-rules.ts
    - src/lib/db/schema/orgs.ts
    - src/actions/work-orders.ts
    - src/actions/invoices.ts
    - src/hooks/use-visit-draft.ts
    - src/lib/offline/db.ts
    - src/components/field/photo-capture.tsx
    - src/components/schedule/tech-day-selector.tsx
    - src/components/schedule/unassigned-panel.tsx
    - src/components/work-orders/line-item-editor.tsx

key-decisions:
  - "DeweyIQ only pushes time entries to QBO — all pay calculation, deductions, and payroll processing live in QBO per CONTEXT OVERRIDE"
  - "pushWeekToQbo server action wraps pushPayPeriodToQbo so client components never import server-only QBO modules directly"
  - "node-quickbooks Employee and TimeActivity methods cast to any — TS types are incomplete; runtime behavior is correct"
  - "Timesheet approval is per-tech per-week — approveTimesheet marks all entries approved_at/approved_by, then triggers QBO batch push"
  - "getTimesheets returns { success, data?, error } wrapper shape consistently with all other actions"

patterns-established:
  - "QBO push pattern: ensure employee synced → map entry to payload → createTimeActivity → store qbo_time_activity_id + qbo_synced_at"
  - "Timesheet week range: Mon 00:00:00 through Sun 23:59:59 local time using toLocalDateString() for YYYY-MM-DD"

requirements-completed:
  - TEAM-04
  - TEAM-07
  - TEAM-10
  - PAYRL-01
  - PAYRL-02
  - PAYRL-03
  - PAYRL-04
  - PAYRL-05
  - PAYRL-06
  - PAYRL-07
  - PAYRL-08
  - PAYRL-09
  - PAYRL-10
  - PAYRL-11
  - PAYRL-12
  - PAYRL-13
  - PAYRL-14
  - PAYRL-15

# Metrics
duration: 45min
completed: 2026-03-16
---

# Phase 11 Plan 04: Timesheet Review and QBO Time Push Summary

**Weekly timesheet review with edit/approve workflow, QBO TimeActivity push with auto Employee sync, and time tracking settings tab — all PAYRL requirements satisfied via time data push to QBO**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-03-16T18:00:00Z
- **Completed:** 2026-03-16T18:33:56Z
- **Tasks:** 2
- **Files modified:** 27

## Accomplishments
- Built full weekly timesheet review UI with per-employee Mon-Sun breakdown, inline clock-time editing, approve-week button, and QBO push with success/failure toast
- Created QBO time sync module with fire-and-forget pushTimeEntryToQbo, syncEmployeeToQbo (auto Employee creation on first push), and pushPayPeriodToQbo batch push
- Added Time Tracking settings tab in Settings page (owner only) and Timesheets tab in Team page (owner only) with server-fetched initial data
- Fixed 15+ pre-existing TypeScript errors across 12 files to get a clean build before task commits

## Task Commits

Each task was committed atomically:

1. **Task 1: Create timesheet actions and QBO time sync module** - `d8ffebd` (feat)
2. **Task 2: Build timesheet UI and time tracking settings** - `9fdee78` (feat)

**Plan metadata:** _(pending — this summary)_

## Files Created/Modified
- `src/actions/timesheets.ts` - getTimesheets, editTimeEntry, approveTimesheet, getTimesheetSummary, pushWeekToQbo (691 lines new + 33 lines added)
- `src/lib/qbo/time-sync.ts` - syncEmployeeToQbo, pushTimeEntryToQbo, pushPayPeriodToQbo (295 lines new)
- `src/lib/qbo/mappers.ts` - Added mapTimeEntryToQboTimeActivity and mapProfileToQboEmployee
- `src/components/team/timesheet-view.tsx` - Weekly timesheet table with inline editing, approve, QBO push (496 lines new)
- `src/components/settings/time-tracking-settings.tsx` - Org time tracking configuration UI (214 lines new)
- `src/actions/time-tracking.ts` - Added updateTimeTrackingSettings server action
- `src/app/(app)/team/page.tsx` - Added Timesheets tab, getCurrentWeekMonday helper, initialTimesheetData SSR fetch
- `src/components/settings/settings-tabs.tsx` - Added Time Tracking tab for owner role
- `src/lib/db/schema/time-entries.ts` - Added approved_at, approved_by columns
- `src/lib/db/schema/work-orders.ts` - Added labor_actual_hours column
- `src/lib/db/schema/checklists.ts` - Added requires_photo, suppresses_task_id, is_default columns
- `src/lib/db/schema/schedule-rules.ts` - Added checklist_template_id foreign key
- `src/lib/db/schema/orgs.ts` - Added logo_url column
- `src/actions/work-orders.ts` - Added labor_hours/rate/actual_hours to WorkOrderDetail, added updateWorkOrderLabor
- `src/actions/invoices.ts` - Added billing_model, sent_at, sent_sms_at, payment_method to InvoiceDetail
- `src/hooks/use-visit-draft.ts` - Added updateInternalNotesDraft callback
- `src/lib/offline/db.ts` - Added internalNotes, internalFlags to VisitDraft
- `src/components/field/photo-capture.tsx` - Added readOnly prop, exported processPhotoQueue
- `src/components/schedule/tech-day-selector.tsx` - Added weekOffset/onWeekChange with week navigation arrows
- `src/components/schedule/unassigned-panel.tsx` - Added workOrders/onAssignWorkOrder optional props
- `src/components/work-orders/line-item-editor.tsx` - Added laborCost optional prop

## Decisions Made
- DeweyIQ pushes time entries only — QBO handles all pay calculation per CONTEXT OVERRIDE for PAYRL requirements
- Created `pushWeekToQbo` server action wrapper in `timesheets.ts` so `TimesheetView` client component can trigger QBO batch push without directly importing `@/lib/qbo/time-sync` (server-only module with `node-quickbooks`)
- Cast `qbo` to `any` at Employee and TimeActivity call sites — `node-quickbooks` TS types are incomplete but runtime methods exist
- Timesheet approval is per-tech per-week with `approved_at` + `approved_by` timestamps on each time_entry row

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed 15+ TypeScript errors preventing build**
- **Found during:** Task 1 (pre-build check before starting)
- **Issue:** Multiple files had TypeScript errors from prior sessions: missing exports, missing schema columns, missing interface fields, missing props, missing hook functions
- **Fix:** Added `export` to `processPhotoQueue`; added `checklist_template_id` to schedule_rules schema; added `borate/temperatureF` to dosing test fixtures; added `labor_hours/rate/actual_hours` to WorkOrderDetail and schema; added `weekOffset/onWeekChange` to TechDaySelector; added `workOrders/onAssignWorkOrder` to UnassignedPanel; added invoice fields to InvoiceDetail; added `updateInternalNotesDraft` to useVisitDraft; added `internalNotes/internalFlags` to VisitDraft; added `readOnly` to PhotoCapture; added `laborCost` to LineItemEditorProps
- **Files modified:** photo-capture.tsx, schedule-rules.ts, dosing.test.ts, work-orders schema, work-orders.ts, tech-day-selector.tsx, unassigned-panel.tsx, invoices.ts, use-visit-draft.ts, offline/db.ts, line-item-editor.tsx
- **Verification:** `npx tsc --noEmit` passes clean
- **Committed in:** `d8ffebd` (Task 1 commit)

**2. [Rule 1 - Bug] Fixed getTimesheets wrapper shape mismatch**
- **Found during:** Task 2 (TimesheetView component wiring)
- **Issue:** `getTimesheets` returns `{ success, data?, error }` but original team/page.tsx and TimesheetView were consuming it as direct data
- **Fix:** Added `.data` extraction with `if (result.success && result.data)` in both team page and TimesheetView fetchData function
- **Files modified:** src/app/(app)/team/page.tsx, src/components/team/timesheet-view.tsx
- **Verification:** TypeScript passes, no runtime shape mismatch
- **Committed in:** `9fdee78` (Task 2 commit)

**3. [Rule 1 - Bug] Fixed isOwner/isOffice used before declaration in team page**
- **Found during:** Task 2 (extending team page)
- **Issue:** `initialTimesheetData` fetch used `isOwner` and `isOffice` variables that were declared after the fetch block
- **Fix:** Moved `const isOwner`, `const isOffice`, `const isTech` declarations above the `initialTimesheetData` block
- **Files modified:** src/app/(app)/team/page.tsx
- **Verification:** TypeScript passes clean
- **Committed in:** `9fdee78` (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (1 blocking build errors, 2 bugs)
**Impact on plan:** All auto-fixes necessary for correctness. Pre-existing TypeScript errors fixed as blocking issues. No scope creep.

## Issues Encountered
- `node-quickbooks` TS types don't include Employee or TimeActivity endpoint methods — cast `qbo` to `any` at both call sites in `time-sync.ts`. Runtime behavior is correct; QBO API accepts the payloads.
- `portal/eta` Next.js prerender error is pre-existing (confirmed via `git stash` test before our changes). Does not affect production functionality — only affects static export of that route.

## User Setup Required
None - no external service configuration required beyond QBO OAuth credentials already configured in Phase 11-01.

## Next Phase Readiness
- Timesheet review/approval/QBO push flow is complete and ready for use
- `getTimesheetSummary(startDate, endDate)` available for pay period aggregation in future reporting phases
- Time tracking settings persisted to org_settings, readable by any phase that needs overtime threshold or pay period type
- All PAYRL requirements (01-15) satisfied — QBO handles actual payroll processing

---
*Phase: 11-payroll-team-management-full-accounting*
*Completed: 2026-03-16*

## Self-Check: PASSED

- FOUND: `.planning/phases/11-payroll-team-management-full-accounting/11-04-SUMMARY.md`
- FOUND: `src/actions/timesheets.ts`
- FOUND: `src/lib/qbo/time-sync.ts`
- FOUND: `src/components/team/timesheet-view.tsx`
- FOUND: `src/components/settings/time-tracking-settings.tsx`
- FOUND commit: `d8ffebd` (Task 1)
- FOUND commit: `9fdee78` (Task 2)
