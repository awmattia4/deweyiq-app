---
phase: 11-payroll-team-management-full-accounting
plan: 09
subsystem: accounting
tags: [reconciliation, bank-feed, stripe, plaid, journal-entries, matching-algorithm, webhook]

dependency_graph:
  requires:
    - "11-06 (journal.ts createJournalEntry, ensureChartOfAccounts, getJournalEntriesForSource)"
    - "11-08 (bankAccounts, bankTransactions schema, Plaid sync)"
  provides:
    - "scoreBankTransactionMatch: 0-100+ scoring of bank txn vs journal entry"
    - "matchBankTransaction: single-txn scoring against all unmatched entries"
    - "autoMatchTransactions: batch auto-match at score >= 80"
    - "getReconciliationView: paginated bank txns with status + suggestions"
    - "confirmMatch / unmatchTransaction / excludeTransaction / restoreTransaction"
    - "createEntryFromTransaction: new journal entry from unmatched bank txn + auto-match"
    - "runAutoMatch: owner-triggered batch auto-match server action"
    - "handlePayoutPaid: Stripe payout.paid webhook creates journal entry + auto-matches bank txn"
    - "BankFeed component: transaction list with status badges, filter chips, auto-match button"
    - "ReconcilePanel: match confirmation dialog with scored suggestions and entry creation"
  affects:
    - "FinancialDashboard (added Bank Feed tab)"
    - "Accounting page (fetches bank accounts for dashboard)"
    - "Stripe webhook route (handles payout.paid event)"

tech-stack:
  added: []
  patterns:
    - "Score-based matching: 0-100 score from amount (50pts), date proximity (30/20/10pts), description overlap (40/20pts)"
    - "Threshold-based match status: >= 80 auto-match, 50-79 suggest review, < 50 unmatched"
    - "Idempotency via getJournalEntriesForSource before payout journal entry creation"
    - "Auto-match best-effort: non-fatal, journal entry is committed even if match fails"

key-files:
  created:
    - src/lib/accounting/reconciliation.ts
    - src/actions/reconciliation.ts
    - src/components/accounting/bank-feed.tsx
    - src/components/accounting/reconcile-panel.tsx
  modified:
    - src/app/(app)/accounting/page.tsx
    - src/components/accounting/financial-dashboard.tsx
    - src/app/api/webhooks/stripe/route.ts
    - src/lib/stripe/webhook-handlers.ts
    - src/components/shell/app-header.tsx

key-decisions:
  - "Score >= 80 auto-match (not >= 70) — conservative threshold reduces false matches"
  - "Suggestions shown only for unmatched txns scoring 50-79 (not auto-match range)"
  - "Payout journal entry: Dr Checking / Cr Stripe Clearing (per-charge fees already recorded at payment time)"
  - "Multi-tenant payout guard: if > 1 org exists and no account context, skip gracefully"
  - "BankFeed lazy-loads — user must click Load to fetch transactions (avoids expensive queries on page load)"
  - "ReconcilePanel loads suggestions on-demand via getTransactionSuggestions (not pre-loaded)"
  - "createEntryFromTransaction uses bank account's CoA link as credit account, falls back to account 1000"

requirements-completed:
  - ACCT-07
  - PAY-02

duration: 12min
completed: 2026-03-16
---

# Phase 11 Plan 09: Bank Reconciliation Summary

**Smart bank reconciliation with score-based transaction matching, a full reconcile UI integrated into the Accounting page, and Stripe payout auto-reconciliation via webhook.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-16T21:39:16Z
- **Completed:** 2026-03-16T21:51:16Z
- **Tasks:** 2
- **Files modified:** 8 (4 created, 4 modified)

## Accomplishments

- Pure matching algorithm scores bank transactions 0-100+ against journal entries by amount, date proximity, and description; auto-matches at >= 80, suggests review at 50-79
- Full reconciliation UI in Accounting page's new "Bank Feed" tab — filter chips, auto-match button, transaction table, slide-out ReconcilePanel
- Stripe `payout.paid` webhook creates balanced Dr Checking / Cr Stripe Clearing journal entry and auto-matches to bank transaction by amount ± $0.01 within 3-day window

## Task Commits

1. **Task 1: Matching algorithm and server actions** - `353ef50` (feat)
2. **Task 2: UI components and Stripe payout** - `19a9d62` (feat)

## Files Created/Modified

- `src/lib/accounting/reconciliation.ts` — Scoring algorithm (scoreBankTransactionMatch, matchBankTransaction, autoMatchTransactions)
- `src/actions/reconciliation.ts` — 7 server actions: getReconciliationView, confirmMatch, unmatchTransaction, excludeTransaction, restoreTransaction, createEntryFromTransaction, runAutoMatch + getTransactionSuggestions + getBankAccountsForReconciliation
- `src/components/accounting/bank-feed.tsx` — Bank transaction list with status color coding, filter chips, date range, auto-match button, click-to-reconcile
- `src/components/accounting/reconcile-panel.tsx` — Dialog: transaction details, scored suggestions with confirm button, manual match search, create-entry form with CoA picker, exclude/restore/unmatch actions
- `src/app/(app)/accounting/page.tsx` — Now fetches bank accounts and passes to FinancialDashboard
- `src/components/accounting/financial-dashboard.tsx` — Added BankFeed as "Bank Feed" tab (owner only)
- `src/app/api/webhooks/stripe/route.ts` — Added payout.paid case
- `src/lib/stripe/webhook-handlers.ts` — Added handlePayoutPaid: idempotent journal entry + best-effort bank transaction auto-match
- `src/components/shell/app-header.tsx` — Added /accounting to PAGE_TITLES

## Decisions Made

- Auto-match threshold set at 80 (not 70) to reduce false positives — owner reviews 50-79 range
- Payout journal entry records only net amount (Dr Checking, Cr Stripe Clearing) because per-charge fees are already captured in createPaymentJournalEntry during payment processing
- Multi-tenant payout handling: if more than 1 org found in DB, skip with warning — prevents wrong-org journal entries
- BankFeed doesn't auto-load on mount — user selects account and clicks Load to avoid unnecessary DB queries

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Accounting page already existed with FinancialDashboard**
- **Found during:** Task 2 (UI integration)
- **Issue:** Plan said to "add BankFeed to the Accounting page as a tab" but assumed no accounting page existed. The accounting page already had a FinancialDashboard with multiple tabs.
- **Fix:** Added BankFeed as a new "Bank Feed" tab within FinancialDashboard instead of creating a separate page. Passed bankAccounts prop from page down to dashboard.
- **Files modified:** src/app/(app)/accounting/page.tsx, src/components/accounting/financial-dashboard.tsx
- **Committed in:** 19a9d62

---

**Total deviations:** 1 auto-fixed (Rule 3 - Blocking)
**Impact on plan:** Fix required for correct integration. Result is better than plan — bank feed is a first-class tab alongside P&L, Balance Sheet, Cash Flow in the unified Accounting page.

## Issues Encountered

- Linter auto-reverted some edits during multi-file editing — required reading files before each edit. No data loss.
- Pre-existing TypeScript build errors in company-settings.ts, invoices.ts, quotes.ts (unrelated schema mismatches from earlier phases) — our new files compile without errors.

## User Setup Required

None — no new external service configuration required. Stripe and Plaid were already configured in Phase 11 Plans 06 and 08.

## Next Phase Readiness

- Reconciliation infrastructure complete — bank transactions can be matched to journal entries
- Stripe payout auto-reconciliation runs on each payout.paid webhook
- ReconcilePanel's create-entry flow allows owner to categorize any unmatched bank expense
- Ready for Phase 11 Plan 10+ (remaining accounting/payroll plans)

---
*Phase: 11-payroll-team-management-full-accounting*
*Completed: 2026-03-16*

## Self-Check: PASSED

| Check | Status |
|-------|--------|
| src/lib/accounting/reconciliation.ts exists | FOUND |
| src/actions/reconciliation.ts exists | FOUND |
| src/components/accounting/bank-feed.tsx exists | FOUND |
| src/components/accounting/reconcile-panel.tsx exists | FOUND |
| Commit 353ef50 (Task 1) exists | FOUND |
| Commit 19a9d62 (Task 2) exists | FOUND |
| scoreBankTransactionMatch exported | FOUND (7 matches in reconciliation.ts) |
| autoMatchTransactions exported | FOUND |
| handlePayoutPaid in webhook-handlers | FOUND (12 matches) |
| payout.paid case in stripe/route.ts | FOUND |
| /accounting in PAGE_TITLES | FOUND |
| BankFeed tab in FinancialDashboard | FOUND (bank-feed TabsContent) |
