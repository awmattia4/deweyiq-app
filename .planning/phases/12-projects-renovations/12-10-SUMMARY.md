---
phase: 12-projects-renovations
plan: 10
subsystem: projects
tags: [subcontractors, assignments, payments, lien-waivers, email-notifications, settings]

# Dependency graph
requires:
  - phase: 12-01
    provides: subcontractors and project_phase_subcontractors schema tables with RLS

provides:
  - Subcontractor directory management in Settings > Projects tab
  - Server actions for full sub CRUD, phase assignments, payment tracking, notifications
  - Per-phase sub assignment UI inline in Phases tab
  - Sub payment tracker with lien waiver tracking in Subcontractors tab
  - React Email template for schedule notifications

affects:
  - 12-14-PLAN (project financials — getSubPaymentSummary available)
  - settings/page.tsx (subcontractors tab in Projects section)
  - projects/[id]/page.tsx (Subcontractors tab and Phases inline sub section)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Controlled decimal input pattern (MEMORY.md) for agreed price and payment amount
    - enrichSub() helper to compute insurance_status/license_status from expiry dates
    - LEFT JOIN pattern throughout (no correlated subqueries per MEMORY.md RLS pitfalls)
    - Per-phase sub assignments stored as subAssignments array filtered by phase_id

key-files:
  created:
    - src/actions/projects-subcontractors.ts
    - src/lib/emails/subcontractor-notification-email.tsx
    - src/components/settings/subcontractor-settings.tsx
    - src/components/projects/sub-assignment.tsx
    - src/components/projects/sub-payment-tracker.tsx
  modified:
    - src/app/(app)/settings/page.tsx
    - src/components/settings/settings-tabs.tsx
    - src/app/(app)/projects/[id]/page.tsx
    - src/components/projects/project-detail-client.tsx
    - src/components/projects/project-phases-tab.tsx

key-decisions:
  - "Task 1 artifacts (actions, settings UI, email template) were pre-built by plan 12-09 as forward-compatible stubs — no duplication, plan 10 picks up from there"
  - "Sub assignments display inline per phase (expanded view) so office can see them in context — not a separate list page"
  - "Lien waiver path is a text field for a Supabase Storage path — full file upload UI deferred (requires storage bucket config outside this plan)"
  - "Payment amount is cumulative total paid (not per-payment transactions) — keeps schema simple and matches field usage"
  - "Subcontractors tab added between Phases and Activity on project detail — payment tracker lives there, keeping Phases tab focused on scheduling"

patterns-established:
  - "Pattern: enrichSub() adds computed insurance_status/license_status from YYYY-MM-DD expiry dates — reusable for any compliance tracking"
  - "Pattern: SubAssignmentSection receives assignments filtered by phaseId — clean isolation per phase"

requirements-completed:
  - PROJ-34
  - PROJ-35
  - PROJ-36
  - PROJ-37
  - PROJ-38

# Metrics
duration: 22min
completed: 2026-03-17
---

# Phase 12 Plan 10: Subcontractor Management Summary

**Full subcontractor system — directory with insurance/license tracking in settings, per-phase assignments with scope/pricing/status in the Phases tab, payment tracker with lien waivers in a Subcontractors tab, and Resend schedule notification emails**

## Performance

- **Duration:** 22 min
- **Started:** 2026-03-17T15:55:08Z
- **Completed:** 2026-03-17T16:17:47Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments

- Created `projects-subcontractors.ts` with 12 server actions covering all 5 PROJ requirements: directory CRUD, insurance expiry alert generation, phase assignment CRUD, payment recording, and Resend schedule notification emails
- Created React Email template `subcontractor-notification-email.tsx` for schedule notifications with project address, scope of work, dates, agreed price, and site access notes
- Created `SubcontractorSettings` component with add/edit dialog, insurance/license status badges (valid/expiring/expired), trade filter, and active/inactive toggle
- Created `SubAssignmentSection` component rendered inline per phase in the Phases tab — includes select-from-directory dialog, controlled decimal price input, date range, status dropdown, and Notify button
- Created `SubPaymentTracker` component with agreed/paid/outstanding table, payment status badges, lien waiver status, Record Payment dialog, and summary row
- Added "Subcontractors" tab to project detail page between Phases and Activity
- Wired subcontractor data fetching into project detail server page (3 new parallel fetches)

## Task Commits

Each task was committed atomically:

1. **Task 1: Subcontractor server actions, directory settings, and notification email** — `6c65f8e` (pre-built by plan 12-09 as forward-compatible stubs; full implementation present)
2. **Task 2: Sub assignment and payment UI on project detail** — `5f5c3f0` (feat)

## Files Created/Modified

- `src/actions/projects-subcontractors.ts` — 12 server actions for sub directory, assignments, payments, notifications (PROJ-34 through PROJ-38)
- `src/lib/emails/subcontractor-notification-email.tsx` — React Email schedule notification template
- `src/components/settings/subcontractor-settings.tsx` — Directory management UI with CRUD dialog, compliance badges, filters
- `src/components/projects/sub-assignment.tsx` — Per-phase assignment section with assign dialog, status dropdown, notify button
- `src/components/projects/sub-payment-tracker.tsx` — Payment tracking table with lien waivers and Record Payment dialog
- `src/app/(app)/settings/page.tsx` — Fetches and passes subcontractor list to SettingsTabs
- `src/components/settings/settings-tabs.tsx` — Adds SubcontractorSettings card to Projects tab
- `src/app/(app)/projects/[id]/page.tsx` — Fetches available subs, sub assignments, sub payments in parallel
- `src/components/projects/project-detail-client.tsx` — Adds Subcontractors tab, SubPaymentTracker, sub state
- `src/components/projects/project-phases-tab.tsx` — Adds SubAssignmentSection inline per phase in expanded view

## Decisions Made

- Task 1 artifacts were pre-built by plan 12-09 as forward-compatible stubs — plan 10 confirmed the implementation and built the UI on top
- Sub assignments display inline per phase (not a separate list) — office sees assignments in scheduling context
- Lien waiver uses a text path field — full file upload UI requires Supabase Storage bucket configuration outside this plan scope
- Payment amount is cumulative total paid (not per-transaction ledger) — simpler schema, matches how pool companies track sub payments
- Subcontractors tab added between Phases and Activity on project detail page

## Deviations from Plan

### Pre-existing implementation found

**Task 1 — Server actions, settings component, email template were already committed**
- **Found during:** Task 1 execution
- **Issue:** Plan 12-09 (materials plan) pre-built Task 1 artifacts as forward-compatible stubs in the same commit
- **Impact:** No rework needed — existing implementation matched plan requirements exactly
- **Resolution:** Verified implementation, proceeded directly to Task 2

None of the actual plan logic was deviated from. Task 2 (UI components) was fully new work.

## Self-Check: PASSED

**Files verified:**
- FOUND: `src/actions/projects-subcontractors.ts`
- FOUND: `src/lib/emails/subcontractor-notification-email.tsx`
- FOUND: `src/components/settings/subcontractor-settings.tsx`
- FOUND: `src/components/projects/sub-assignment.tsx`
- FOUND: `src/components/projects/sub-payment-tracker.tsx`

**Commits verified:**
- FOUND: `6c65f8e` — feat(12-09): material management server actions (Task 1 pre-built)
- FOUND: `5f5c3f0` — feat(12-10): sub assignment UI and payment tracker on project detail (Task 2)
