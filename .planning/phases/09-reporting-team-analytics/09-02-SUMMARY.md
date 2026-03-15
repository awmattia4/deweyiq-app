---
phase: 09-reporting-team-analytics
plan: 02
subsystem: ui, api
tags: [recharts, drizzle, postgres, reports, revenue, charts]

# Dependency graph
requires:
  - phase: 09-reporting-team-analytics
    provides: report-shared.tsx with TimePeriodSelector, KpiCard, CHART_COLORS, downloadCsv, formatCurrency; reports page 7-tab structure; recharts installed
  - phase: 07-billing-payments
    provides: invoices table with paid_at, status, billing_model, customer_id; customers table with assigned_tech_id; profiles table

provides:
  - src/actions/reporting.ts with getRevenueDashboard, getCustomerRevenueDetail, exportRevenueCsv server actions
  - src/components/reports/revenue-dashboard.tsx with full Revenue Dashboard tab (KPI cards, AreaChart, ranked tables, customer drill-down drawer)
  - Reports page Revenue Dashboard tab wired with real data

affects:
  - 09-03-PLAN (Operations — appends to reporting.ts, same file)
  - 09-04-PLAN (Team — appends to reporting.ts, same file)
  - 09-05-PLAN (Profitability — appends to reporting.ts, same file)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Recharts Tooltip.formatter receives ValueType (number | string | undefined) — always normalize with typeof v === 'number' ? v : parseFloat(String(v ?? 0))"
    - "Revenue trend calculation: previous period is same-length window immediately preceding start date"
    - "Outstanding AR is current snapshot (no date filter) — separate from period revenue"
    - "Tech revenue attribution uses current assigned_tech_id — labeled 'Based on current tech assignment'"

key-files:
  created:
    - src/actions/reporting.ts
    - src/components/reports/revenue-dashboard.tsx
  modified:
    - src/app/(app)/reports/page.tsx

key-decisions:
  - "Recharts Tooltip formatter type: accepts ValueType not number — fix with typeof guard to avoid TS2345 build failure"
  - "reportingarts.ts is new Phase 9 actions file (not extending reports.ts) — keeps Phase 7 and Phase 9 reporting concerns separate; Phase 9 Plans 03-05 append to reporting.ts"
  - "Outstanding AR metric shows all org unpaid sent invoices (no date range filter) — this is a current snapshot of total AR owed, not period-scoped"
  - "Previous period revenue uses same-length window preceding the selected start date for accurate trend comparison"

patterns-established:
  - "RevenueDashboard follows useTransition pattern from revenue-report.tsx — refetches on period change, loading skeleton during pending state"
  - "Customer detail drawer uses Sheet (side=right) + lazy fetch on open via startDetailTransition — no N+1 on table render"

requirements-completed:
  - REPT-01

# Metrics
duration: 4min
completed: 2026-03-15
---

# Phase 9 Plan 02: Revenue Dashboard Summary

**Recharts AreaChart + ranked customer/tech tables + drill-down Sheet drawer providing full financial command center for the Revenue Dashboard tab**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-03-15T00:31:45Z
- **Completed:** 2026-03-15T00:35:25Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Created `reporting.ts` with `getRevenueDashboard` (LEFT JOIN pattern, no correlated subqueries), `getCustomerRevenueDetail` (drill-down), and `exportRevenueCsv` (owner-only CSV export)
- Built `RevenueDashboard` client component: 4 KPI cards (Total Revenue with trend, Invoice Count, Avg Invoice Value, Outstanding AR), AreaChart revenue trend with gradient, ranked customer/tech tables, and Sheet drill-down drawer
- Wired Revenue Dashboard tab in reports page with SSR initial data via parallel Promise.all

## Task Commits

1. **Task 1: Revenue dashboard server actions** - `94df711` (feat)
2. **Task 2: Revenue Dashboard UI with charts, tables, and drill-down** - `751259b` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `src/actions/reporting.ts` — Phase 9 server actions: getRevenueDashboard, getCustomerRevenueDetail, exportRevenueCsv
- `src/components/reports/revenue-dashboard.tsx` — Full Revenue Dashboard tab component
- `src/app/(app)/reports/page.tsx` — Added RevenueDashboard import, parallel data fetch, wired tab

## Decisions Made

- **New `reporting.ts` file** (not extending `reports.ts`): Keeps Phase 7 and Phase 9 reporting concerns separate. Phase 9 Plans 03-05 will append to `reporting.ts`.
- **Outstanding AR as current snapshot**: No date range filter on the AR metric — this shows total org unpaid AR right now, not scoped to the selected period. That's what's meaningful for cashflow awareness.
- **Previous period calculation**: Same-length window immediately preceding start date. If the period is 30 days, previous period is the 30 days before start date.
- **Tech revenue attribution disclaimer**: "Based on current tech assignment" note below the tech table — a customer reassigned after their invoices were paid would shift attribution.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Recharts Tooltip.formatter type error**
- **Found during:** Task 2 (Revenue Dashboard UI) — build failure
- **Issue:** `formatter={(value: number) => [...]}` causes TS2345 — Recharts `ValueType` is `number | string | undefined`, not `number`
- **Fix:** Changed to `(value) => [formatCurrency(typeof value === "number" ? value : parseFloat(String(value ?? 0))), "Revenue"]` — applied to both AreaChart and BarChart tooltips
- **Files modified:** src/components/reports/revenue-dashboard.tsx
- **Verification:** `npm run build` succeeds
- **Committed in:** `751259b` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - TypeScript type bug)
**Impact on plan:** Fix necessary for build to succeed. No scope creep.

## Issues Encountered

- Pre-existing `.next/types/routes.d.ts` TypeScript error (`Duplicate identifier 'LayoutProps'`) — pre-existing Next.js generated file issue, not from our changes. `npx tsc --noEmit` shows only this error. `npm run build` succeeds.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **Plan 03 (Operations)**: `reporting.ts` is ready to receive `getOperationsDashboard`. The Operations tab shell in reports page still shows "Coming soon — Phase 9 Plan 03".
- **Plan 04 (Team)**: Same pattern — append to `reporting.ts`, replace Team tab shell.
- **Plan 05 (Profitability)**: Same pattern — append to `reporting.ts`, replace Profitability tab shell.

---
*Phase: 09-reporting-team-analytics*
*Completed: 2026-03-15*
