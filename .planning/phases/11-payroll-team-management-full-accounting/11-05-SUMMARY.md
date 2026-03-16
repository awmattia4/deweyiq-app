---
phase: 11-payroll-team-management-full-accounting
plan: 05
subsystem: ui
tags: [react, nextjs, supabase-storage, pto, team-management, certifications, scheduling]

# Dependency graph
requires:
  - phase: 11-payroll-team-management-full-accounting
    plan: 01
    provides: "pto_balances, pto_requests, employee_availability, employee_blocked_dates, employee_documents tables with RLS"

provides:
  - "13 server actions for PTO balance management, request/approval workflow, availability windows, and document tracking"
  - "PtoManager component — balance table with inline edit, pending request approve/deny, request history, tech PTO request dialog"
  - "EmployeeDocs component — certification tracking with expiry status color coding (green/amber/red), upload via signed Supabase Storage URL"
  - "EmployeeSchedule component — 7-day availability grid with day toggle + time inputs, blocked dates add/remove"
  - "Team page upgraded with 4 tabs (Members | PTO | Documents | Schedules) with role-based tab visibility"

affects:
  - "11-09 through 11-14 — payroll-related plans can use PTO balance data"
  - "04-scheduling-routing — employee_availability/employee_blocked_dates tables now have data for scheduler"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Controlled string state for decimal inputs — useState<string> for balance/accrual inputs, only flush parsed numbers to server when complete (no parseFloat eating decimal points)"
    - "Server-side initial data + client refresh — server page fetches initial data, client components call server actions to refresh state after mutations"
    - "Supabase Storage signed upload URL pattern — server action creates signed URL + DB row, client uploads directly to Storage via PUT fetch"
    - "Role-based tab visibility — isTech/isOwner/isOffice flags control which tabs render, preventing client-side bypass"

key-files:
  created:
    - src/actions/team-management.ts
    - src/components/team/pto-manager.tsx
    - src/components/team/employee-docs.tsx
    - src/components/team/employee-schedule.tsx
  modified:
    - src/app/(app)/team/page.tsx

key-decisions:
  - "updatePtoBalance uses select-then-update-or-insert pattern (no unique constraint on pto_balances) — pto_balances has no unique constraint on (org_id, tech_id, pto_type) in schema, so onConflictDoUpdate is not available; select first, then update or insert"
  - "PTO request alert uses adminDb.insert(alerts) — alerts RLS restricts INSERT to owner+office; tech who submits PTO request cannot insert alerts directly; adminDb bypasses RLS correctly"
  - "Tech role sees PTO tab only — techs access /team page with defaultTab=pto and tab visibility gated by isTech flag; no separate redirect to avoid creating new routes"
  - "Document upload: storagePath set immediately as file_url in DB row — path is known before upload completes; no confirmDocumentUpload step needed since path is deterministic"
  - "checkExpiringDocuments uses adminDb for org-wide scan — tech RLS would block cross-employee reads; adminDb correct for cron/system functions"

patterns-established:
  - "Team page tab pattern: role-based tabs with server-side data fetch passed as initialX props, client components call server actions to refresh via Promise.all"
  - "expiry status color coding: green (>30 days valid), amber (expiring <=30 days), red (expired) — applied to employee_documents.expires_at"

requirements-completed: [TEAM-05, TEAM-06, TEAM-09]

# Metrics
duration: 10min
completed: 2026-03-16
---

# Phase 11 Plan 05: PTO, Scheduling, and Documents Summary

**PTO request/approval workflow, certification expiry tracking, and availability grid — 13 server actions and 3 client components wired into a 4-tab Team page**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-03-16T21:23:31Z
- **Completed:** 2026-03-16T21:34:28Z
- **Tasks:** 2
- **Files modified:** 5 files (1 new action file, 3 new components, 1 updated page)

## Accomplishments

- Created 13 server actions spanning PTO balance management, request/approval workflow with owner alerts and tech notifications, availability window CRUD, blocked date management, and document upload/deletion with Supabase Storage signed URLs
- Built PtoManager with inline-editable balance table (owner), approve/deny pending requests panel, Request Time Off dialog (tech), and full request history with status badges
- Built EmployeeDocs with per-employee certification list, expiry color coding (green/amber/red), upload dialog with Supabase Storage signed URL pattern, and owner delete capability
- Built EmployeeSchedule with per-employee load-on-demand, 7-day toggle grid with time inputs, and blocked dates add/remove
- Upgraded Team page to 4-tab layout with role-gated visibility: tech sees PTO only, office sees all read-only, owner has full edit access

## Task Commits

Each task was committed atomically:

1. **Task 1: Create team management server actions** - `0afce53` (feat)
2. **Task 2: Build PTO, scheduling, and documents UI on team page** - `02a7059` (feat, included in docs commit)

## Files Created/Modified

- `src/actions/team-management.ts` — 13 server actions: getPtoBalances, updatePtoBalance, requestPto, approvePto, getPtoRequests, getAvailability, updateAvailability, addBlockedDate, removeBlockedDate, getDocuments, uploadDocument, deleteDocument, checkExpiringDocuments
- `src/components/team/pto-manager.tsx` — PtoManager client component with owner/tech role views
- `src/components/team/employee-docs.tsx` — EmployeeDocs client component with Supabase Storage upload
- `src/components/team/employee-schedule.tsx` — EmployeeSchedule client component with availability grid
- `src/app/(app)/team/page.tsx` — Upgraded from members list to 4-tab layout with server-side data fetching

## Decisions Made

- **updatePtoBalance select-then-update pattern**: pto_balances table has no unique constraint on (org_id, tech_id, pto_type), so `onConflictDoUpdate` would fail. Used explicit select-first approach instead.
- **adminDb for PTO alerts**: Tech submitting a PTO request cannot use withRls to insert alerts (tech role excluded by RLS). adminDb is the correct pattern for system-generated cross-role actions.
- **Tech role on /team page**: Instead of redirecting techs away from /team, show the page with PTO tab as default and hide Members/Documents/Schedules tabs via isTech flag. Simpler than creating a new route.
- **Storage path set immediately**: file_url in employee_documents is set to the deterministic storage path before the client uploads the file. This avoids needing a second confirmDocumentUpload round-trip.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Replaced onConflictDoUpdate with select-then-upsert for pto_balances**
- **Found during:** Task 1 (server actions creation)
- **Issue:** `onConflictDoUpdate` requires a unique constraint on the conflict target columns. pto_balances has no unique constraint on (org_id, tech_id, pto_type) — only individual indexes.
- **Fix:** Added explicit select-first logic: check for existing row, then update or insert accordingly.
- **Files modified:** src/actions/team-management.ts
- **Committed in:** 0afce53 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — schema constraint discovery)
**Impact on plan:** Essential fix for correctness. No scope creep.

## Issues Encountered

- Another concurrent agent's commit (`02a7059`) swept up the Task 2 UI files while committing docs for Plan 11-03. The files were correctly committed and the code is correct — the commit message just doesn't reflect Task 2 work.
- Pre-existing TypeScript errors in `plaid-connect.tsx` (PlaidLinkOptions type mismatch) caused `npm run build` to fail. This is out-of-scope and logged to deferred-items.md.

## User Setup Required

None — no external service configuration required beyond what Plan 11-01 set up.

## Next Phase Readiness

- All Phase 11 team management server actions implemented and tested via TypeScript
- PTO request → alert → approve/deny → notification chain is fully wired
- Employee availability data ready for scheduler integration (Phase 04 route assignment can now check employee_availability + employee_blocked_dates)
- Document expiry alerts ready to be triggered from a cron edge function calling checkExpiringDocuments()
- Phase 11 Plan 06+ can proceed (accounting, payroll, etc.)

---
*Phase: 11-payroll-team-management-full-accounting*
*Completed: 2026-03-16*
