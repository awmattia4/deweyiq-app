---
phase: 07-billing-payments
plan: "07"
subsystem: reporting
tags: [ar-aging, revenue, pnl, expenses, csv-export, overdue-flags]

# Dependency graph
requires:
  - phase: 07-04
    provides: "Stripe webhook handlers (handlePaymentSucceeded, handlePaymentFailed)"
  - phase: 07-05
    provides: "AutoPay and dunning engine with payment records"
  - phase: 07-01
    provides: "Invoice schema with billing_model, due_date, paid_at fields"
provides:
  - "Reports page with AR aging, revenue by customer, P&L tabs"
  - "Expense CRUD actions for manual P&L expense tracking"
  - "CSV export for invoices, payments, AR aging, expenses"
  - "Overdue balance visual flags on customer profiles and route stops"
  - "overdue_balance recalculation on payment success"
affects: [08-customer-portal, 11-bank-reconciliation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Report queries use LEFT JOIN with customers table (not correlated subqueries) per MEMORY.md"
    - "Date range filtering on timestamp columns uses ::timestamptz cast for correct timezone handling"
    - "CSV export returns string from server action, client handles Blob URL download"
    - "Expense entry uses local string state for decimal amount per MEMORY.md pattern"

key-files:
  created:
    - src/actions/reports.ts
    - src/actions/expenses.ts
    - src/app/(app)/reports/page.tsx
    - src/components/reports/ar-aging-view.tsx
    - src/components/reports/revenue-report.tsx
    - src/components/reports/pnl-report.tsx
    - src/components/reports/expense-entry-form.tsx
  modified:
    - src/components/customers/customer-header.tsx
    - src/components/customers/customer-inline-edit.tsx
    - src/app/(app)/customers/[id]/page.tsx
    - src/components/schedule/route-stop-list.tsx
    - src/components/schedule/route-map.tsx
    - src/components/schedule/route-builder.tsx
    - src/actions/schedule.ts
    - src/lib/stripe/webhook-handlers.ts
    - src/components/shell/app-sidebar.tsx

key-decisions:
  - "AR aging buckets from due_date (not issued_at) for proper aging calculation"
  - "CSV export is owner-only; report viewing is owner+office"
  - "Overdue banner on customer profile is office/owner only; route stop pill is visible to tech per locked decision"
  - "handlePaymentSucceeded recalculates overdue_balance from remaining unpaid invoices (not additive)"
  - "Reports nav added to sidebar in Phase 7 (originally planned for Phase 9)"

patterns-established:
  - "Report server actions return typed result objects consumed by client components with date range state"
  - "ScheduleStop.overdueBalance flows through getStopsForDay -> mapToScheduleStop -> route-stop-list"

requirements-completed: [BILL-07, BILL-09]

# Metrics
duration: 9min
completed: 2026-03-12
---

# Phase 7 Plan 07: Reports & Overdue Flags Summary

**AR aging with 30/60/90 buckets, revenue by customer, P&L with real expenses and manual entry, CSV export for tax prep, and overdue balance flags on customer profiles and route stops**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-12T18:18:35Z
- **Completed:** 2026-03-12T18:27:35Z
- **Tasks:** 2
- **Files modified:** 15

## Accomplishments
- Reports page with three tabs: AR Aging, Revenue by Customer, and P&L
- AR aging report correctly buckets unpaid invoices by days overdue from due_date with per-customer breakdown
- P&L report shows real revenue from paid invoices and real expenses from the expenses table (not stubbed)
- Expense entry form with amount (decimal-safe input), category dropdown, date, description
- CSV export for invoices, payments, AR aging snapshot, and expenses (owner only)
- Overdue balance banner on customer profile (office/owner only)
- Overdue pill indicator on route stop cards (visible to tech)
- handlePaymentSucceeded now recalculates overdue_balance from remaining unpaid invoices

## Task Commits

Each task was committed atomically:

1. **Task 1: Reports page with AR aging, revenue, P&L, expense entry** - `982ea3c` (feat)
2. **Task 2: Overdue flags on customer profiles and route stops** - `42303da` (feat)

## Files Created/Modified
- `src/actions/reports.ts` - AR aging, revenue by customer, P&L, and CSV export server actions
- `src/actions/expenses.ts` - Expense CRUD (create, list, delete, group by category)
- `src/app/(app)/reports/page.tsx` - Server component with tabbed layout, role guard, initial data fetch
- `src/components/reports/ar-aging-view.tsx` - AR aging table with color-coded buckets and export
- `src/components/reports/revenue-report.tsx` - Revenue by customer with date range, sortable columns
- `src/components/reports/pnl-report.tsx` - P&L with revenue/expense breakdown, monthly table, recent expenses
- `src/components/reports/expense-entry-form.tsx` - Dialog form for recording business expenses
- `src/components/customers/customer-header.tsx` - Added overdue dot and badge to customer header
- `src/components/customers/customer-inline-edit.tsx` - Added overdue balance banner in read mode
- `src/app/(app)/customers/[id]/page.tsx` - Passes userRole to CustomerInlineEdit
- `src/components/schedule/route-stop-list.tsx` - Added "Overdue" pill badge on stop rows
- `src/components/schedule/route-map.tsx` - Extended ScheduleStop interface with overdueBalance
- `src/components/schedule/route-builder.tsx` - Updated mapToScheduleStop to pass overdueBalance
- `src/actions/schedule.ts` - Added overdue_balance to getStopsForDay customer query
- `src/lib/stripe/webhook-handlers.ts` - Added overdue_balance recalculation in handlePaymentSucceeded
- `src/components/shell/app-sidebar.tsx` - Added Reports nav item for owner+office

## Decisions Made
- AR aging uses due_date for calculating days overdue (not issued_at) -- this matches standard accounting practice
- CSV export restricted to owner role only for security; report viewing available to both owner and office
- Overdue banner on customer profile visible to office/owner only (per MEMORY.md role-appropriate views)
- Overdue indicator on route stops visible to tech (per locked decision: "tech sees the flag, office decides whether to pause service")
- handlePaymentSucceeded recalculates overdue_balance by summing remaining unpaid past-due invoices (not subtracting from existing balance) -- avoids drift from additive/subtractive approach
- Reports nav item added to sidebar in Phase 7 (originally planned for Phase 9 but needed here)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added overdue_balance recalculation in handlePaymentSucceeded**
- **Found during:** Task 2 (overdue flags)
- **Issue:** Plan noted this needed to be added if not already in webhook handlers from Plan 04; confirmed it was missing
- **Fix:** Added recalculation query using SUM of remaining overdue invoices after marking payment as settled
- **Files modified:** src/lib/stripe/webhook-handlers.ts
- **Verification:** Build passes, non-blocking try/catch wrapping
- **Committed in:** 42303da (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Essential for correctness -- without this, overdue_balance would never decrease when payments succeed.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Reports page functional with real data queries
- Overdue flags wired end-to-end from payment webhooks through to UI
- Bank reconciliation explicitly noted as Phase 11 (Plaid integration)
- Ready for Plan 08 (notification template customization) and Plan 09

## Self-Check: PASSED

All 16 files verified present. Both task commits (982ea3c, 42303da) verified in git log.

---
*Phase: 07-billing-payments*
*Completed: 2026-03-12*
