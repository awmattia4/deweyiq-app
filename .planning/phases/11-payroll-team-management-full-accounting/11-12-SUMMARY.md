---
phase: 11-payroll-team-management-full-accounting
plan: 12
subsystem: accounting-compliance
tags: [sales-tax, period-close, audit-trail, accounts-payable, vendor-bills]
dependency_graph:
  requires: ["11-06", "11-07", "11-10", "11-11"]
  provides: ["sales-tax-tracking", "period-close", "audit-trail", "ap-workflow"]
  affects: ["financial-dashboard", "accounting-actions", "org-settings"]
tech_stack:
  new: ["vendor-bills schema"]
  existing: ["drizzle", "recharts", "shadcn/ui"]
---

## What Was Built

### Task 1 — Server Actions (sales tax, period close, audit trail, vendor bills)
- `src/actions/accounting.ts`: Extended with getSalesTaxRates, updateSalesTaxRates, getSalesTaxReport, getAccountingPeriods, createAccountingPeriod, closePeriod, reopenPeriod, getAuditTrail
- `src/actions/vendor-bills.ts`: Full AP workflow — createVendorBill, getVendorBills, updateVendorBill, schedulePayment, recordBillPayment, getApAging, getApSummary, getVendors, createVendorQuick
- `src/lib/db/schema/vendor-bills.ts`: New vendorBills table with owner-only RLS, due_date, status, journal refs
- `src/lib/db/schema/org-settings.ts`: Added sales_tax_rates JSONB column

### Task 2 — Sales Tax Manager, Period Close, Audit Trail UI
- `src/components/accounting/sales-tax-manager.tsx`: Per-jurisdiction rate table with inline edit/delete, add-rate form, quarterly tax summary
- `src/components/accounting/period-close.tsx`: Period list with open/closed badges, create period form with overlap validation, close/reopen dialogs
- `src/components/accounting/audit-trail.tsx`: Chronological journal entry log with date/type filters, reversal badges, pagination (100/page)
- `src/components/accounting/financial-dashboard.tsx`: Added Sales Tax, Period Close, Audit Trail tabs

### Task 3 — Accounts Payable Workflow UI
- `src/components/accounting/ap-workflow.tsx`: Full AP management — summary cards, vendor bill entry form with inline vendor creation, bills list with filter chips, AP aging bar chart with expandable bucket rows, schedule payment and record payment dialogs
- `src/components/accounting/financial-dashboard.tsx`: Added Accounts Payable tab

## Self-Check: PASSED

## Key Files

### key-files.created
- src/actions/vendor-bills.ts
- src/lib/db/schema/vendor-bills.ts
- src/components/accounting/sales-tax-manager.tsx
- src/components/accounting/period-close.tsx
- src/components/accounting/audit-trail.tsx
- src/components/accounting/ap-workflow.tsx

### key-files.modified
- src/actions/accounting.ts
- src/lib/db/schema/org-settings.ts
- src/lib/db/schema/index.ts
- src/components/accounting/financial-dashboard.tsx
- src/components/team/team-dashboard.tsx

## Commits
- `b24178e`: feat(11-12): add sales tax, period close, audit trail, and vendor bill actions
- `7c723d9`: feat(11-12): build sales tax manager, period close, and audit trail UI
- `e8b89fc`: feat(11-12): build accounts payable workflow UI

## Deviations
- Fixed pre-existing recharts formatter type error in team-dashboard.tsx (from 11-13 parallel execution)
