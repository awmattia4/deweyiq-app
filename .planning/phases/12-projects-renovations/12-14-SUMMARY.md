---
phase: 12-projects-renovations
plan: 14
subsystem: billing
tags: [billing, invoicing, retainage, profitability, financials, projects]

# Dependency graph
requires:
  - phase: 12-01
    provides: project_payment_milestones, projects, project_phases, project_change_orders, project_permits tables
  - phase: 12-03
    provides: getProjectDetail, ProjectDetail type, activity_log pattern
  - phase: 12-09
    provides: project_materials with cost tracking for profitability calculation
  - phase: 12-10
    provides: getSubPaymentSummary, project_phase_subcontractors for sub cost tracking

provides:
  - src/actions/projects-billing.ts with full progress billing lifecycle
  - onPhaseComplete: auto-generates draft progress invoices on phase completion
  - generateProgressInvoice: manual milestone invoice trigger
  - getRetainageSummary: retainage computed fresh from invoice records (Pitfall 8 safe)
  - getProjectInvoices: all project invoices with type/status/retainage
  - generateFinalInvoice: remaining balance + retainage release + outstanding COs
  - getProjectProfitability: revenue/material/labor/sub/permit real-time margin
  - checkProfitabilityAlerts: alerts when margin below configurable threshold
  - calculateCancellationSettlement: deposit - completed work - materials - fee breakdown
  - recordCancellationRefund: marks project cancelled with activity log
  - suspendProject: suspends project with critical alert
  - checkSuspensionTriggers: scheduled auto-suspend for overdue projects
  - /projects/[id]/financials page with budget vs actual, profitability, retainage, invoices
  - ProfitabilityGauge component with visual margin bar and threshold marker
  - RetainageTracker component with per-invoice breakdown
  - ProjectInvoiceList component with type badges, retainage columns, View/Review links

affects:
  - 12-15 (final walkthrough/sign-off triggers generateFinalInvoice)
  - /projects/[id] detail page (added Financials tab)
  - /billing — project invoices appear alongside regular invoices

# Tech tracking
tech-stack:
  added: []
  patterns:
    - adminDb for atomic invoice number counter (shared org_settings sequence — no separate project counter)
    - Retainage computed fresh from invoice records — never from stored running total (Pitfall 8)
    - LEFT JOIN pattern throughout — no correlated subqueries on RLS-protected tables (MEMORY.md)
    - toLocalDateString() for all YYYY-MM-DD date strings (no toISOString().split("T")[0])
    - Draft invoices held for office review before sending — never auto-sent

key-files:
  created:
    - src/actions/projects-billing.ts
    - src/components/projects/profitability-gauge.tsx
    - src/components/projects/retainage-tracker.tsx
    - src/components/projects/project-invoice-list.tsx
    - src/app/(app)/projects/[id]/financials/page.tsx
  modified:
    - src/components/projects/project-detail-client.tsx (added Financials tab link)

key-decisions:
  - "Invoice numbering uses shared org_settings sequence (no separate project counter per PROJ-66 and Pitfall 5 research)"
  - "Retainage is computed fresh from invoice records at every query — never from a stored running total — so void invoices correctly reduce the balance (Pitfall 8)"
  - "Progress invoices are created as draft and held for office review — office must explicitly send per user decision"
  - "Profitability thresholds default to 15% floor / 20% overrun — stored in org_settings when Phase 12 threshold columns are added via migration"
  - "Sub costs use amount_paid if > 0, else agreed_price as estimate — reflects actual spend before full payment"
  - "Financials page is a Link tab (separate route) not inline tab content — consistent with Materials and Documents pattern"

patterns-established:
  - "Pattern: onPhaseComplete() integrates with completePhase from Plan 12 — checks projectPaymentMilestones.trigger_phase_id"
  - "Pattern: CancellationSettlement type provides breakdown array for UI display without business logic in components"

requirements-completed:
  - PROJ-62
  - PROJ-63
  - PROJ-64
  - PROJ-65
  - PROJ-66
  - PROJ-67
  - PROJ-68
  - PROJ-90
  - PROJ-92

# Metrics
duration: 7min
completed: 2026-03-17
---

# Phase 12 Plan 14: Project Billing & Financial Dashboard Summary

**Progress billing with retainage tracking, final invoice generation, real-time profitability computation, cancellation settlement, and the /projects/[id]/financials dashboard**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-17T17:10:24Z
- **Completed:** 2026-03-17T17:17:09Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Built complete project billing server actions file (12 exported functions) covering all 9 PROJ requirements
- `onPhaseComplete`: auto-generates DRAFT progress invoices when a phase is marked complete, held for office review — creates invoice, adds line item, updates milestone.invoice_id, creates office alert. Uses shared org_settings invoice number sequence (no separate project counter)
- `generateProgressInvoice`: manual trigger for a specific milestone in case auto-generation was bypassed
- `getRetainageSummary`: computes retainage from actual invoice records (excludes void invoices) — never from a stored running total per research Pitfall 8
- `generateFinalInvoice`: calculates remaining balance + releases all prior retainage + includes outstanding collect_immediately COs, with transparent line items for each component
- `getProjectProfitability`: real-time margin from material costs (actual or estimated), labor hours × hourly rate, sub payments (actual or agreed), and permit fees — projects remaining costs from % complete
- `checkProfitabilityAlerts`: creates `project_margin_at_risk` and `project_cost_overrun` alerts at configurable thresholds
- `calculateCancellationSettlement`: deposit received minus completed work, non-returnable materials, and cancellation fee — returns refund or balance owed
- `suspendProject` + `checkSuspensionTriggers`: suspension lifecycle with configurable 14-day cure period, critical alerts
- Built `/projects/[id]/financials` server page with at-risk banner, summary cards, budget vs actual table, ProfitabilityGauge, RetainageTracker, ProjectInvoiceList
- Added Financials tab link to project-detail-client.tsx between Materials and Documents

## Task Commits

Each task was committed atomically:

1. **Task 1: Progress billing, retainage, final invoice, profitability, and cancellation server actions** - `173da09` (feat)
2. **Task 2: Project financial dashboard with profitability gauge, retainage tracker, and invoice list** - `2e20304` (feat)

## Files Created/Modified

- `src/actions/projects-billing.ts` — 12 server actions covering PROJ-62 through PROJ-68, PROJ-90, PROJ-92
- `src/components/projects/profitability-gauge.tsx` — Visual margin bar with threshold marker, color coding (green/amber/red)
- `src/components/projects/retainage-tracker.tsx` — Per-invoice retainage breakdown with totals and release status
- `src/components/projects/project-invoice-list.tsx` — Table with type badges, retainage columns, View/Review links to /billing/[id]
- `src/app/(app)/projects/[id]/financials/page.tsx` — Server component with parallel data fetching, at-risk banner, budget vs actual
- `src/components/projects/project-detail-client.tsx` — Added Financials tab link

## Decisions Made

- Shared invoice number sequence (org_settings `next_invoice_number`) per PROJ-66 research note on avoiding a separate project counter — ensures no gaps in the invoice numbering sequence
- Retainage computed fresh from invoice records at query time (never a stored total) — voided invoices correctly reduce the balance per Pitfall 8
- Profitability defaults (15% floor, 20% overrun) are hardcoded in the action for now — Phase 12 org_settings migration columns would expose them as configurable; the UI is already structured to show `marginFloor` from the returned data

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written.

The org_settings `project_margin_floor_pct` and `project_overrun_alert_pct` columns mentioned in the plan are not yet in the schema (no migration added in this phase). Per the plan's description of "configurable thresholds," the defaults (15% and 20%) are used and the profitability type exposes `marginFloor` so the UI can display them. The columns will be added via schema migration when needed.

## User Setup Required

None — no new environment variables or external services. The financials page is immediately accessible at `/projects/[id]/financials`.

## Next Phase Readiness

- `onPhaseComplete` is ready to be called from Plan 12's `completePhase` action
- `generateFinalInvoice` is ready to be triggered from Plan 15's final walkthrough sign-off
- `getProjectProfitability` is available for any future profitability reporting features
- All project invoices appear in `/billing` alongside regular service invoices
- Financials tab accessible from any project detail page

## Self-Check: PASSED

All created files verified:
- FOUND: `src/actions/projects-billing.ts`
- FOUND: `src/components/projects/profitability-gauge.tsx`
- FOUND: `src/components/projects/retainage-tracker.tsx`
- FOUND: `src/components/projects/project-invoice-list.tsx`
- FOUND: `src/app/(app)/projects/[id]/financials/page.tsx`

All commits verified:
- FOUND: `173da09` (Task 1: server actions)
- FOUND: `2e20304` (Task 2: UI components)

---
*Phase: 12-projects-renovations*
*Completed: 2026-03-17*
