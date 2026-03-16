---
phase: 11-payroll-team-management-full-accounting
plan: 07
subsystem: accounting
tags: [financial-reports, profit-and-loss, balance-sheet, cash-flow, accounting-dashboard]
dependency_graph:
  requires:
    - 11-01 (accounting schema: journalEntries, journalEntryLines, chartOfAccounts)
    - 11-06 (double-entry journal engine, ensureChartOfAccounts)
  provides:
    - getProfitAndLoss — income/expense aggregation by date range
    - getBalanceSheet — assets/liabilities/equity as of date
    - getCashFlowStatement — operating/investing/financing cash flow
    - getFinancialSnapshot — quick monthly KPIs for dashboard overview
    - getTrialBalance — debit/credit validation for accountant mode
  affects:
    - financial-dashboard.tsx (already imports from financial-reports.ts)
    - accounting/page.tsx (already imports from financial-reports.ts)
tech_stack:
  added:
    - src/actions/financial-reports.ts (P&L, Balance Sheet, Cash Flow, Snapshot, Trial Balance)
  patterns:
    - getAccountBalances helper with LEFT JOIN to avoid RLS correlated subquery pitfall
    - Display conventions: income shows as positive (negate credits), expenses/assets show as positive (use debits as-is)
    - All queries use withRls, ensureChartOfAccounts on first call
key_files:
  created:
    - src/actions/financial-reports.ts
  modified: []
  already_existed_from_prior_plans:
    - src/components/accounting/financial-dashboard.tsx (Plan 11-09)
    - src/components/accounting/journal-entry-list.tsx (Plan 11-09)
    - src/components/accounting/chart-of-accounts-editor.tsx (Plan 11-09)
    - src/app/(app)/accounting/page.tsx (Plan 11-09)
    - src/components/shell/app-sidebar.tsx (Plan 11-09, BookOpenIcon + Accounting nav)
    - src/components/shell/app-header.tsx (Plan 11-09, /accounting PAGE_TITLES entry)
decisions:
  - "Positive debit / negative credit convention throughout all report actions"
  - "getAccountBalances uses INNER JOIN on journal_entries to filter by date — avoids correlated subquery RLS pitfall"
  - "Display convention: income displayed as positive (negate credits); expenses/assets as positive (use debits); liabilities/equity as positive (negate credits)"
  - "Cash flow uses indirect method: AR net movement as proxy for operating cash, equity changes as financing"
  - "UI components were pre-built by Plan 11-09 ahead of plan order — this plan fills the missing actions file"
metrics:
  duration_minutes: 17
  completed_date: 2026-03-16
  tasks_completed: 1
  files_created: 1
  files_modified: 0
---

# Phase 11 Plan 07: Financial Statements & Accounting Dashboard Summary

Financial reporting server actions providing P&L, Balance Sheet, Cash Flow, dashboard snapshot, and trial balance by aggregating journal_entry_lines through chart_of_accounts accounts using the positive=debit/negative=credit convention.

## What Was Built

### Task 1: Financial Report Server Actions (`src/actions/financial-reports.ts`)

**`getProfitAndLoss(startDate, endDate)`** — Owner/office only:
- Aggregates journal_entry_lines joined to journal_entries (filtered by entry_date range)
- Income accounts: credits (negative in DB) displayed as positive revenue
- Expense accounts: debits (positive in DB) displayed as positive expense
- Returns per-account breakdown within income/expense categories
- Net profit = total income - total expenses

**`getBalanceSheet(asOfDate)`** — Owner/office only:
- Aggregates all lines through asOfDate (no start date = all history)
- Assets: net debit balance shown as positive
- Liabilities: net credit balance (negative in DB) shown as positive
- Equity: net credit balance (negative in DB) shown as positive
- Net Income: computed from income - expenses accounts (retained earnings since start)
- Balance check: Assets = Liabilities + Equity + Net Income (within 0.01 tolerance)

**`getCashFlowStatement(startDate, endDate)`** — Owner/office only:
- Operating: AR net movement (proxy for cash from customers) + expense outflows
- Investing: non-current, non-cash asset changes
- Financing: equity account changes (owner draws/contributions)
- Opening cash: bank/checking account balances as of day before startDate
- Closing cash: opening + net cash change

**`getFinancialSnapshot()`** — Owner/office only:
- Current month revenue, expenses, profit
- All-time cash position (checking/savings accounts)
- All-time AR and AP balances
- Prior month revenue/expenses for month-over-month trend

**`getTrialBalance(asOfDate)`** — Owner/office only (accountant mode):
- Total debits and total credits per account through asOfDate
- Validates isBalanced: total debits = total credits within 0.01

**Shared helper: `getAccountBalances(token, orgId, opts)`**:
- Uses INNER JOIN on journal_entries table to filter by entry_date range
- Avoids correlated subquery RLS pitfall (MEMORY.md critical note)
- Returns Map<accountId, netAmount> (positive = net debit)

### Task 2: Accounting UI

All UI components were already created by Plan 11-09 (which ran ahead of plan order and pre-built the dashboard that imports from `financial-reports.ts`):

- `src/components/accounting/financial-dashboard.tsx` — Full accounting dashboard (Plan 11-09)
- `src/components/accounting/journal-entry-list.tsx` — Journal entry list with manual entry creation (Plan 11-09)
- `src/components/accounting/chart-of-accounts-editor.tsx` — CoA tree view with inline editing (Plan 11-09)
- `src/app/(app)/accounting/page.tsx` — Server component with role guard and snapshot fetch (Plan 11-09)
- `src/components/shell/app-sidebar.tsx` — Accounting nav item (BookOpenIcon) already added (Plan 11-09)
- `src/components/shell/app-header.tsx` — /accounting in PAGE_TITLES already added (Plan 11-09)

## Deviations from Plan

### Observed: Plan 11-09 ran before 11-07 (out of order)

- **Found during:** Task 2 execution
- **Issue:** Plan 11-09 ("bank reconciliation") pre-built all accounting UI components (financial-dashboard, journal-entry-list, chart-of-accounts-editor, accounting/page, sidebar, header) and imported from `@/actions/financial-reports` which didn't exist yet. This plan's Task 2 is therefore already complete.
- **Impact:** Build errors referencing `financial-reports.ts` were resolved when we created the file in Task 1. No rework needed.
- **Rule applied:** Out-of-scope (pre-existing work). Not a deviation we caused — recorded for context only.

### Pre-existing Build Errors (not caused by this plan)

Build fails due to pre-existing errors (documented in deferred-items.md):
- `company-settings.ts` — schema columns missing (`suppresses_task_id`, `logo_url`, etc.)
- `wo-labor-section.tsx` — imports `updateWorkOrderLabor` not yet exported
- `routes/page.tsx` — imports `getPredictiveAlertsForPools` not yet exported

Our new `financial-reports.ts` has zero TypeScript errors (`npx tsc --noEmit` shows no errors in our file).

## Self-Check: PASSED

| Check | Status |
|-------|--------|
| src/actions/financial-reports.ts exists | FOUND |
| Commit 10a63b2 (financial-reports.ts) exists | FOUND |
| getProfitAndLoss exported | FOUND |
| getBalanceSheet exported | FOUND |
| getCashFlowStatement exported | FOUND |
| getFinancialSnapshot exported | FOUND |
| getTrialBalance exported | FOUND |
| TypeScript errors in our file | 0 |
| financial-dashboard.tsx imports from financial-reports.ts | FOUND (Plan 11-09) |
| accounting/page.tsx exists | FOUND (Plan 11-09) |
| /accounting in app-header PAGE_TITLES | FOUND (Plan 11-09) |
| Accounting nav in app-sidebar | FOUND (Plan 11-09, BookOpenIcon) |
