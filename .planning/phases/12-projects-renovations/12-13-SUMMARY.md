---
phase: 12-projects-renovations
plan: 13
subsystem: ui
tags: [nextjs, react, projects, change-orders, approvals, jwt, email, resend, drizzle]

# Dependency graph
requires:
  - phase: 12-projects-renovations
    plan: 01
    provides: project_change_orders, project_issue_flags, project_payment_milestones, project_materials, project_phases tables
  - phase: 12-projects-renovations
    plan: 03
    provides: ProjectDetail type, getProjectDetail, project detail page with tabs
  - phase: 12-projects-renovations
    plan: 06
    provides: change-order-token.ts (signChangeOrderToken/verifyChangeOrderToken), CHANGE_ORDER_TOKEN_SECRET env var

provides:
  - createChangeOrder: sequential CO-XXX numbering, line items JSONB, draft status, activity log
  - sendChangeOrder: JWT token generation, Resend email, pending_approval status
  - getChangeOrderPublicData: adminDb fetch for public approval page (no auth required)
  - approveChangeOrder: adminDb — updates contract_amount, inserts materials, shifts phase dates, adjusts milestones per cost_allocation
  - declineChangeOrder: adminDb — sets declined status, creates office alert
  - getChangeOrders: list COs for project detail Change Orders tab
  - getChangeOrderImpact: cumulative CO impact (originalContract, totalApprovedImpact, currentContract)
  - convertIssueFlagToChangeOrder: pre-populates CO from flag, updates flag status to converted_to_co (PROJ-61)
  - deleteChangeOrder: soft-archive draft COs (PROJ-91)
  - ChangeOrderEmail: React Email template (hex colors, cost impact red/green, approval CTA)
  - ChangeOrderBuilder: office-facing form (line items, cost allocation, preview card)
  - ChangeOrderBuilderDialog: Dialog wrapper for builder
  - ChangeOrderApprovalPage: customer-facing public page (inline styles, no Tailwind, dark-themed)
  - /change-order/[id] public page: JWT verification → public data fetch → approval component
  - ProjectChangeOrdersTab: Change Orders tab on project detail with cumulative impact + CO list
  - Project detail page: Change Orders tab added between Phases and Subcontractors

affects:
  - /projects/[id] page (added Change Orders tab)
  - project_change_orders table (CRUD + approval lifecycle)
  - project_issue_flags table (status updated to converted_to_co on conversion)
  - projects.contract_amount (incremented on CO approval)
  - projects.estimated_completion_date (shifted on CO approval with schedule_impact_days)
  - project_payment_milestones (amounts updated per cost_allocation strategy)
  - project_materials (new rows added from CO material line items on approval)
  - project_phases.estimated_start_date / estimated_end_date (shifted for not_started phases)
  - alerts table (new alert on CO decline)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - adminDb for public approval page actions (no auth context) — mirrors proposal approval pattern
    - JWT token flow: signChangeOrderToken (office sends) → verifyChangeOrderToken (customer visits link)
    - Public page uses [id] param name per MEMORY.md slug conflict rule — token extracted as const token = (await params).id
    - ChangeOrderApprovalPage uses inline styles (not Tailwind) — public page outside app layout, no CSS vars
    - Controlled string inputs for numeric fields — avoid parseFloat("7.") eating decimal points per MEMORY.md pitfall
    - Cost allocation strategies: add_to_final (last milestone), spread_remaining (even distribution), collect_immediately (new milestone)
    - Three-step approval auto-update: contract_amount + materials + phase dates + milestones in single adminDb transaction sequence

key-files:
  created:
    - src/actions/projects-change-orders.ts
    - src/lib/emails/change-order-email.tsx
    - src/components/projects/change-order-builder.tsx
    - src/components/projects/change-order-approval-page.tsx
    - src/components/projects/project-change-orders-tab.tsx
    - src/app/change-order/[id]/page.tsx
  modified:
    - src/components/projects/project-detail-client.tsx (added Change Orders tab + types)
    - src/app/(app)/projects/[id]/page.tsx (fetch change orders + impact in parallel)
    - src/components/shell/app-header.tsx (added /change-order to PAGE_TITLES)

key-decisions:
  - "approveChangeOrder and declineChangeOrder use adminDb (not withRls) — no auth context on the public approval page; customer has no JWT"
  - "getChangeOrderPublicData uses adminDb for the same reason — public page fetches data server-side before rendering"
  - "ChangeOrderApprovalPage uses inline styles throughout — public page lives outside the (app) layout and has no access to CSS custom properties or Tailwind class resolution"
  - "Cost allocation chosen per change order per user decision — three strategies cover all common billing scenarios"
  - "Line item quantity_estimated stored as String() before insert to match Drizzle numeric type expectations"
  - "company_name sourced from orgs.name (not orgSettings) — orgSettings has no company_name column"

patterns-established:
  - "Pattern: Public approval page uses [id] route param as JWT token carrier — consistent with proposal approval pattern"
  - "Pattern: Change order auto-update is a multi-step adminDb sequence — no transaction wrapper needed since each step is independent and partial failure is recoverable"
  - "Pattern: Cumulative impact computed in TypeScript (not SQL sum) — avoids correlated subquery pitfall, returns typed result"

requirements-completed:
  - PROJ-57
  - PROJ-58
  - PROJ-59
  - PROJ-60
  - PROJ-61

# Metrics
duration: 10min
completed: 2026-03-17
---

# Phase 12 Plan 13: Change Order System Summary

**Full change order lifecycle — office creates COs with line items and cost allocation, customers approve via JWT-secured public link with clear before/after impact display, approved COs auto-update project budget/materials/schedule/payments, cumulative impact tracked on project detail**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-17T17:10:36Z
- **Completed:** 2026-03-17T17:20:36Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- Built complete change order action suite in `projects-change-orders.ts` covering all 5 PROJ requirements (PROJ-57 to 61): create, send, public fetch, approve (with full project auto-update), decline, cumulative impact, and issue flag conversion
- `approveChangeOrder` auto-updates: project.contract_amount += cost_impact, adds material line items to project_materials, shifts not_started phase dates by schedule_impact_days, adjusts payment milestones per cost_allocation strategy
- React Email template (`change-order-email.tsx`) shows cost impact in red (increase) or green (savings) with approval CTA, all hex colors per email client compatibility rule
- `ChangeOrderBuilder` form with line items grid (description/category/qty/unit_price/auto-total), cost allocation radio selector with descriptions, live preview card showing new contract total and schedule change
- `ChangeOrderApprovalPage` customer-facing public page with: company header, project reference, line item table, financial impact (before/after), schedule impact amber callout, payment schedule preview, typed-name signature, agree checkbox, decline flow with reason textarea
- Public `/change-order/[id]` page verifies JWT → fetches adminDb data → renders ChangeOrderApprovalPage with no auth
- `ProjectChangeOrdersTab` shows cumulative impact summary (original/adjustments/current), CO list with status badges, cost/schedule delta, send/resend/archive actions
- Project detail page gains "Change Orders" tab; server page fetches CO data in parallel with all other project data

## Task Commits

Each task was committed atomically:

1. **Task 1: Change order server actions with approval and auto-update logic** - `9ec50c1` (feat)
2. **Task 2: Change order builder UI and public approval page** - `8a6caa2` (feat)

## Files Created/Modified

- `src/actions/projects-change-orders.ts` - Full lifecycle: createChangeOrder, sendChangeOrder, getChangeOrderPublicData, approveChangeOrder, declineChangeOrder, getChangeOrders, getChangeOrderImpact, convertIssueFlagToChangeOrder, deleteChangeOrder
- `src/lib/emails/change-order-email.tsx` - React Email template with cost impact coloring and approval CTA
- `src/components/projects/change-order-builder.tsx` - Office-facing CO creation form with ChangeOrderBuilderDialog wrapper
- `src/components/projects/change-order-approval-page.tsx` - Customer-facing approval page (inline styles, dark-themed)
- `src/components/projects/project-change-orders-tab.tsx` - Change Orders tab for project detail with cumulative impact
- `src/app/change-order/[id]/page.tsx` - Public approval page (force-dynamic, JWT verification)
- `src/components/projects/project-detail-client.tsx` - Added Change Orders tab + import types
- `src/app/(app)/projects/[id]/page.tsx` - Added getChangeOrders + getChangeOrderImpact parallel fetch
- `src/components/shell/app-header.tsx` - Added /change-order to PAGE_TITLES

## Decisions Made

- `approveChangeOrder` and `declineChangeOrder` use `adminDb` (not `withRls`) — public approval page has no user JWT context; customer identity verified by JWT token in URL, not Supabase auth
- `getChangeOrderPublicData` also uses `adminDb` — same reason, same pattern as proposal public page
- `ChangeOrderApprovalPage` uses only inline styles — public page is outside the `(app)` layout which provides CSS custom properties; Tailwind classes would apply but CSS vars like `--primary` would not resolve
- `company_name` is sourced from `orgs.name` — `orgSettings` has no `company_name` column (discovered during implementation, auto-fixed)
- Cost allocation per change order (not per project) per user decision stated in plan objective: "office chooses cost allocation per change order"

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Wrong column: `customers.name` → `customers.full_name`**
- **Found during:** Task 1 (sendChangeOrder + getChangeOrderPublicData)
- **Issue:** `customers.name` does not exist — column is `full_name` per the customers schema
- **Fix:** Updated all customer name references to `customers.full_name`
- **Files modified:** src/actions/projects-change-orders.ts
- **Committed in:** 9ec50c1 (Task 1 commit)

**2. [Rule 1 - Bug] Wrong column: `orgSettings.company_name` → `orgs.name`**
- **Found during:** Task 1 (sendChangeOrder + getChangeOrderPublicData)
- **Issue:** `orgSettings` has no `company_name`, `company_email`, `company_phone`, or `logo_url` — company name is in `orgs.name`, logo is in `orgs.logo_url`
- **Fix:** Replaced `orgSettings` join with `orgs` table join for company display name
- **Files modified:** src/actions/projects-change-orders.ts
- **Committed in:** 9ec50c1 (Task 1 commit)

**3. [Rule 1 - Bug] Wrong insert value: `unit_cost` → `unit_cost_estimated`**
- **Found during:** Task 1 (approveChangeOrder — project_materials insert)
- **Issue:** `project_materials` table uses `unit_cost_estimated` not `unit_cost` per schema
- **Fix:** Updated insert to use `unit_cost_estimated: String(li.unit_price)` and `quantity_estimated: String(li.quantity)` (string per Drizzle numeric type)
- **Files modified:** src/actions/projects-change-orders.ts
- **Committed in:** 9ec50c1 (Task 1 commit)

**4. [Rule 1 - Bug] Wrong alert field: `message` → `description`**
- **Found during:** Task 1 (declineChangeOrder — alerts insert)
- **Issue:** `alerts` table uses `description` column, not `message`
- **Fix:** Renamed field to `description` in the alert insert
- **Files modified:** src/actions/projects-change-orders.ts
- **Committed in:** 9ec50c1 (Task 1 commit)

---

**Total deviations:** 4 auto-fixed (all Rule 1 — column name mismatches discovered during implementation)
**Impact on plan:** All auto-fixes necessary for correctness. No scope creep.

## Issues Encountered

- Pre-existing TypeScript errors in accounting, portal, and alerts components — unrelated to this plan, not fixed per scope boundary rule

## User Setup Required

- `CHANGE_ORDER_TOKEN_SECRET` env var must be set (32+ character random string) — already documented in `src/lib/projects/change-order-token.ts` comments from Plan 06

## Next Phase Readiness

- Change order full lifecycle built — create, send, customer approve/decline, project auto-update
- Cumulative impact tracking works — office can see original vs. current contract on project detail
- Issue flags can be converted to COs via `convertIssueFlagToChangeOrder`
- Ready for Plan 14: Project Financials (billing milestones, retainage tracking, final invoice)

## Self-Check: PASSED

All created files verified:
- src/actions/projects-change-orders.ts — FOUND
- src/lib/emails/change-order-email.tsx — FOUND
- src/components/projects/change-order-builder.tsx — FOUND
- src/components/projects/change-order-approval-page.tsx — FOUND
- src/components/projects/project-change-orders-tab.tsx — FOUND
- src/app/change-order/[id]/page.tsx — FOUND

All commits verified:
- 9ec50c1 (Task 1: server actions + email template) — FOUND
- 8a6caa2 (Task 2: UI components + approval page) — FOUND

---
*Phase: 12-projects-renovations*
*Completed: 2026-03-17*
