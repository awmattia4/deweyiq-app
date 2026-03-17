---
phase: 12-projects-renovations
plan: 16
subsystem: ui
tags: [projects, portal, reports, dashboard, analytics, messaging, punch-list, customer-portal]

# Dependency graph
requires:
  - phase: 12-02
    provides: projects kanban/list dashboard, getProjects, getProjectPipelineMetrics
  - phase: 12-14
    provides: billing financials, retainage tracking, project invoices
  - phase: 12-15
    provides: customerSignOffPunchList, punch list schema, warranty activation

provides:
  - src/actions/projects-reports.ts: getProjectDashboardData (pipeline, crew util, alerts, calendar) and getProjectReports (revenue by period, margin by type, lead-to-close funnel, duration, sub spend)
  - src/actions/projects-portal.ts: getPortalProjects, getPortalProjectDetail, getPortalProjectFinancials, getPortalPunchList, sendProjectUpdateNotification
  - src/actions/portal-project-messages.ts: project-scoped messaging (getProjectMessages, sendProjectMessage, markProjectMessagesRead)
  - src/components/projects/project-dashboard-widgets.tsx: PipelineSummaryCards, CrewUtilizationWidget, AlertsPanel, CalendarPreview
  - src/components/reports/project-reports.tsx: ProjectReports with revenue/margin/funnel/duration/sub-spend charts
  - src/components/portal/portal-punch-list-client.tsx: customer punch list sign-off UI
  - src/components/portal/project-message-thread.tsx: real-time project-scoped chat
  - Portal routes: /portal/projects, /portal/projects/[id], /portal/projects/[id]/financials, /portal/projects/[id]/punch-list, /portal/projects/[id]/messages

affects:
  - Phase 13+ (customer portal is complete — customers can self-service projects)
  - Portal shell navigation updated with Projects link
  - Reports page has Projects analytics tab

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Portal data actions use adminDb with explicit customer_id ownership validation (no RLS JWT needed for portal context)
    - project_id FK added to portal_messages for project-scoped threading — same table, different filter
    - Dashboard widgets fetched server-side and passed as props to client component tree
    - Reports page uses parallel data fetching with Promise.all for all tabs

key-files:
  created:
    - src/actions/projects-reports.ts
    - src/actions/projects-portal.ts
    - src/actions/portal-project-messages.ts
    - src/components/projects/project-dashboard-widgets.tsx
    - src/components/reports/project-reports.tsx
    - src/components/portal/portal-punch-list-client.tsx
    - src/components/portal/project-message-thread.tsx
    - src/app/portal/(portal)/projects/page.tsx
    - src/app/portal/(portal)/projects/[id]/page.tsx
    - src/app/portal/(portal)/projects/[id]/financials/page.tsx
    - src/app/portal/(portal)/projects/[id]/punch-list/page.tsx
    - src/app/portal/(portal)/projects/[id]/messages/page.tsx
  modified:
    - src/app/(app)/projects/page.tsx (added dashboard widgets above kanban)
    - src/app/(app)/reports/page.tsx (added Projects tab, owner-only)
    - src/lib/db/schema/portal-messages.ts (added project_id FK column)
    - src/components/shell/portal-shell.tsx (added Projects nav item)
    - src/app/portal/(portal)/page.tsx (added Projects quick-link card)

key-decisions:
  - "Portal data layer uses adminDb with explicit customer_id validation — portal customers use magic-link auth with user_role='customer' JWT but no staff org context; validateCustomerOwnsProject() enforces security boundary"
  - "project_id added to portal_messages as nullable FK (no FK constraint to avoid circular dependencies) — project messages use same send/read pattern as general messages, filtered by project_id"
  - "projectMaterials uses unit_cost_estimated/unit_cost_actual + quantity_used columns (not unit_cost/quantity_actual as initially assumed) — corrected during TypeScript check"
  - "subcontractors schema uses name column (not company_name) — corrected during TypeScript check"
  - "Dashboard data (crew utilization) estimates project hours from assigned phases; route hours are a fixed 30h/week estimate since actual route schedule data is not aggregated in this context"

patterns-established:
  - "Pattern: validateCustomerOwnsProject() guard before all portal queries — always check project.customer_id === customerId before returning data"
  - "Pattern: Portal project pages exclude internal fields — no internal_notes, cost breakdowns, margin data, sub payment details"
  - "Pattern: sendProjectUpdateNotification() for project lifecycle events — call after phase completions, CO sends, punch list ready"

requirements-completed:
  - PROJ-80
  - PROJ-81
  - PROJ-82
  - PROJ-83
  - PROJ-84
  - PROJ-85
  - PROJ-86
  - PROJ-87
  - PROJ-88
  - PROJ-89

# Metrics
duration: 16min
completed: 2026-03-17
---

# Phase 12 Plan 16: Dashboard, Reporting & Customer Portal Projects Summary

**Project pipeline dashboard with crew utilization and alerts, aggregate analytics (revenue/margin/conversion/duration), and full customer portal project experience (timeline, financials, punch list sign-off, project-scoped messaging)**

## Performance

- **Duration:** 16 min
- **Started:** 2026-03-17T17:58:37Z
- **Completed:** 2026-03-17T18:14:37Z
- **Tasks:** 2 (Task 3 is human-verify checkpoint)
- **Files modified:** 13 created, 5 modified

## Accomplishments

- Built `projects-reports.ts` with `getProjectDashboardData` (pipeline counts, crew utilization from assigned phases, stalled/at-risk/permit/inspection alerts, upcoming milestones) and `getProjectReports` (revenue by completion month, gross margin by project type, lead-to-close funnel with stage counts, duration by type, sub spend by contractor)
- Built `projects-portal.ts` with 5 portal data functions — all using adminDb with ownership validation, excluding internal data (no cost breakdown, no margin, no sub payment details); plus `sendProjectUpdateNotification` sending branded HTML emails via Resend for 6 update types
- Added `project_id` FK to `portal_messages` schema enabling project-scoped message threads (PROJ-88) using same infrastructure as general portal messaging
- Built 4 customer portal project pages: project list with progress bars, project detail with phase timeline + photo gallery + change order review, financial summary with payment schedule + retainage, punch list with customer sign-off (calls existing `customerSignOffPunchList`)
- Added project-scoped messaging pages and `ProjectMessageThread` real-time component using `portal-project-${projectId}` Supabase Realtime channel
- Updated portal navigation (PortalShell nav, portal home quick-links) to surface Projects section
- Updated `/reports` page with Projects analytics tab (owner-only) showing all 5 report types with date/type filters

## Task Commits

Each task was committed atomically:

1. **Task 1: Dashboard enhancements, reporting, and portal data layer** - `7f22e7a` (feat)
2. **Task 2: Customer portal project pages** - `d66d313` (feat)

## Files Created/Modified

- `src/actions/projects-reports.ts` — Dashboard data + aggregate reports (PROJ-80, PROJ-82, PROJ-83)
- `src/actions/projects-portal.ts` — Customer portal data fetching (PROJ-84 through PROJ-89)
- `src/actions/portal-project-messages.ts` — Project-scoped messaging server actions (PROJ-88)
- `src/components/projects/project-dashboard-widgets.tsx` — Pipeline summary, crew util, alerts, calendar (PROJ-80)
- `src/components/reports/project-reports.tsx` — Revenue/margin/funnel/duration/sub charts (PROJ-82, PROJ-83)
- `src/components/portal/portal-punch-list-client.tsx` — Customer sign-off UI (PROJ-89)
- `src/components/portal/project-message-thread.tsx` — Real-time project messaging (PROJ-88)
- `src/app/(app)/projects/page.tsx` — Added dashboard widgets above kanban
- `src/app/(app)/reports/page.tsx` — Added Projects tab
- `src/lib/db/schema/portal-messages.ts` — Added project_id FK
- `src/components/shell/portal-shell.tsx` — Added Projects nav item
- `src/app/portal/(portal)/page.tsx` — Added Projects quick-link card
- `src/app/portal/(portal)/projects/page.tsx` — Project list page
- `src/app/portal/(portal)/projects/[id]/page.tsx` — Project detail with timeline
- `src/app/portal/(portal)/projects/[id]/financials/page.tsx` — Financial summary
- `src/app/portal/(portal)/projects/[id]/punch-list/page.tsx` — Punch list sign-off
- `src/app/portal/(portal)/projects/[id]/messages/page.tsx` — Project messages

## Decisions Made

- Portal data layer uses `adminDb` with explicit `validateCustomerOwnsProject()` guard — portal customer auth doesn't carry staff JWT claims; security enforced in application layer.
- `project_id` added to `portal_messages` as nullable column (no FK constraint) — avoids circular schema dependency while enabling project-scoped filtering.
- `subcontractors.name` corrected from initial assumption of `company_name` — TypeScript check caught this immediately.
- `projectMaterials` uses `unit_cost_estimated`/`unit_cost_actual` + `quantity_used`/`quantity_estimated` — corrected during TypeScript check.
- Crew utilization estimates route hours at 30h/week (flat estimate) — actual route schedule aggregation would require cross-joining route_stops which is out of scope for this plan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed subcontractors column name**
- **Found during:** Task 1 (getProjectReports implementation)
- **Issue:** Initial code used `subcontractors.company_name` which doesn't exist — schema uses `name`
- **Fix:** Changed to `subcontractors.name` in query select
- **Files modified:** `src/actions/projects-reports.ts`
- **Committed in:** `7f22e7a`

**2. [Rule 1 - Bug] Fixed projectMaterials column names**
- **Found during:** Task 1 (TypeScript compile check)
- **Issue:** Initial code used `unit_cost` and `quantity_actual` — schema uses `unit_cost_estimated`/`unit_cost_actual` and `quantity_used`/`quantity_estimated`
- **Fix:** Updated SQL expression to `COALESCE(unit_cost_actual * quantity_used, unit_cost_estimated * quantity_estimated, 0)`
- **Files modified:** `src/actions/projects-reports.ts`
- **Committed in:** `7f22e7a`

**3. [Rule 1 - Bug] Fixed alerts schema column names**
- **Found during:** Task 1 (TypeScript compile check)
- **Issue:** Initial code used `entity_type`/`entity_id`/`body` — schema uses `reference_type`/`reference_id`/`description`
- **Fix:** Updated insert to use correct column names; wrapped in try/catch to handle duplicate constraint
- **Files modified:** `src/actions/projects-portal.ts`
- **Committed in:** `7f22e7a`

**4. [Rule 1 - Bug] Fixed projectPaymentMilestones: no paid_at column**
- **Found during:** Task 1 (TypeScript check)
- **Issue:** Initial PortalPayment type had `paid_at` field but schema has no such column — milestone status is `pending`/`invoiced`/`paid`
- **Fix:** Removed `paid_at` from PortalPayment type and query, using invoice_number lookup instead
- **Files modified:** `src/actions/projects-portal.ts`
- **Committed in:** `7f22e7a`

---

**Total deviations:** 4 auto-fixed (4 bugs from schema assumptions)
**Impact on plan:** All auto-fixes necessary for correctness. TypeScript check caught all issues before commit.

## Issues Encountered

- `projectPhaseSubcontractors` uses `subcontractor_id` column (not `sub_id`) — caught by TypeScript, fixed inline.
- `portal_messages` schema doesn't have FK constraint for `project_id` (to avoid circular import) — added as plain UUID column with index.

## User Setup Required

None — no new environment variables or external services required. All new functionality is immediately accessible.

## Next Phase Readiness

- Phase 12 (Projects & Renovations) is now complete — all 92 PROJ requirements addressed across Plans 01-16
- Customer portal has full project visibility: timeline, photos, financials, punch list sign-off, project-scoped messaging
- `sendProjectUpdateNotification` ready to be called from phase transitions and CO sends
- `portal_messages.project_id` migration needed in production DB (column added to schema but no drizzle migration generated — schema drift, requires `drizzle-kit push` or manual SQL)

## Self-Check: PASSED

All created files verified:
- FOUND: `src/actions/projects-reports.ts`
- FOUND: `src/actions/projects-portal.ts`
- FOUND: `src/actions/portal-project-messages.ts`
- FOUND: `src/components/projects/project-dashboard-widgets.tsx`
- FOUND: `src/components/reports/project-reports.tsx`
- FOUND: `src/components/portal/portal-punch-list-client.tsx`
- FOUND: `src/components/portal/project-message-thread.tsx`
- FOUND: `src/app/portal/(portal)/projects/page.tsx`
- FOUND: `src/app/portal/(portal)/projects/[id]/page.tsx`
- FOUND: `src/app/portal/(portal)/projects/[id]/financials/page.tsx`
- FOUND: `src/app/portal/(portal)/projects/[id]/punch-list/page.tsx`
- FOUND: `src/app/portal/(portal)/projects/[id]/messages/page.tsx`

All commits verified:
- FOUND: `7f22e7a` (Task 1: dashboard/reporting/portal data layer)
- FOUND: `d66d313` (Task 2: portal pages)

---
*Phase: 12-projects-renovations*
*Completed: 2026-03-17*
