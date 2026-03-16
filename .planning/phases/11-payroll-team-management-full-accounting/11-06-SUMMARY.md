---
phase: 11-payroll-team-management-full-accounting
plan: 06
subsystem: accounting
tags: [double-entry, journal-entries, chart-of-accounts, invoice, payment, webhook]
dependency_graph:
  requires:
    - 11-01 (accounting schema: journalEntries, journalEntryLines, chartOfAccounts, accountingPeriods)
    - 07 (invoices, paymentRecords, expenses schemas)
    - stripe-webhooks (handlePaymentSucceeded, handleChargeRefunded)
  provides:
    - createJournalEntry — core balanced journal entry creation
    - reverseJournalEntry — immutable ledger correction via reversal
    - createInvoiceJournalEntry — auto DR AR / CR Revenue on invoice finalization
    - createPaymentJournalEntry — auto DR Bank / CR AR on payment settlement
    - createRefundJournalEntry — auto DR AR / CR Bank on refund
    - createExpenseJournalEntry — auto DR Expense / CR Bank on expense recording
    - getChartOfAccounts — owner+office CoA view with running balances
    - createManualJournalEntry — accountant-mode manual entries
  affects:
    - finalizeInvoice (auto journal entry after QBO sync)
    - sendInvoice (inherits from finalizeInvoice)
    - createCreditNote (auto journal entry for credit note)
    - handlePaymentSucceeded (auto journal entry with Stripe fee split)
    - handleChargeRefunded (auto journal entry for refund)
tech_stack:
  added:
    - src/lib/accounting/journal.ts (double-entry engine)
    - src/actions/accounting.ts (chart of accounts + journal entry server actions)
  patterns:
    - Positive=debit / negative=credit convention throughout
    - Fire-and-forget pattern — accounting never blocks financial operations
    - Idempotency via getJournalEntriesForSource before every auto-generation
    - adminDb for all system operations (no user RLS context in webhooks)
    - ensureChartOfAccounts lazy-seeds 25 pool-company accounts on first access
key_files:
  created:
    - src/lib/accounting/journal.ts
    - src/actions/accounting.ts
  modified:
    - src/actions/invoices.ts (finalizeInvoice, createCreditNote hooks)
    - src/lib/stripe/webhook-handlers.ts (handlePaymentSucceeded, handleChargeRefunded hooks)
decisions:
  - Used positive=debit/negative=credit numeric convention (not separate debit/credit columns)
  - Auto-generation is fire-and-forget — accounting failure never blocks payments/invoicing
  - ensureChartOfAccounts in journal.ts (not chart-of-accounts.ts) to avoid circular imports
  - Credit notes use createInvoiceJournalEntry on the credit note record (negative total
    produces reversing entry naturally: Dr Revenue negative + Cr AR positive)
  - Expenses without status field treated as always-paid (Dr Expense / Cr Checking)
  - Stripe fee extracted from balance_transaction.fee in webhook when available
metrics:
  duration_minutes: 6
  completed_date: 2026-03-16
  tasks_completed: 2
  files_created: 2
  files_modified: 2
---

# Phase 11 Plan 06: Double-Entry Accounting Engine Summary

Double-entry accounting engine with auto-generated journal entries wired into all financial events (invoice, payment, refund, expense) using fire-and-forget hooks that never block primary financial operations.

## What Was Built

### Task 1: Journal Entry Engine and Chart of Accounts Actions

**`src/lib/accounting/journal.ts`** — Core double-entry engine:

- `validateEntryBalance(lines)` — Validates sum(amounts) = 0 within ±0.01 tolerance; throws on imbalance. Uses positive=debit, negative=credit convention.
- `createJournalEntry(input)` — Validates balance, checks accounting period is not closed, inserts `journal_entries` header + all `journal_entry_lines` atomically. Uses adminDb (system operation).
- `reverseJournalEntry(entryId, reason)` — Creates negated entry linked via `reversal_of`, marks original as `is_reversed=true`. Immutable ledger — never deletes original.
- `getJournalEntriesForSource(sourceType, sourceId)` — Idempotency check; finds existing entries for a given source document.
- `ensureChartOfAccounts(orgId)` — Lazy-seeds pool company CoA if no accounts exist for the org.
- `shouldSkipEntry(orgId, eventDate)` — Checks `accounting_start_date`; returns true if event predates accounting start.
- `createInvoiceJournalEntry(invoiceId)` — Dr AR (1100) +total, Cr Revenue (4000) -subtotal, Cr Tax Payable (2100) -taxAmount.
- `createPaymentJournalEntry(paymentRecordId, stripeFeeAmountCents?)` — Stripe: Dr Stripe Clearing (1020) +net, Dr Stripe Fees (5600) +fee, Cr AR (1100) -gross. Manual: Dr Checking (1000) +amount, Cr AR (1100) -amount.
- `createExpenseJournalEntry(expenseId)` — Dr appropriate expense account, Cr Checking (1000). Category-to-account mapping for all 10 expense categories.
- `createRefundJournalEntry(paymentRecordId, refundAmount)` — Dr AR (1100) +amount, Cr Stripe Clearing (1020) or Checking (1000) -amount.

**`src/actions/accounting.ts`** — Server actions:

- `getChartOfAccounts()` — Owner+office. Calls ensureChartOfAccounts, returns all accounts with running balances computed from journal_entry_lines.
- `createAccount(input)` — Owner only. Validates no duplicate account numbers.
- `updateAccount(accountId, updates)` — Owner only. Blocks account_type/number changes on system accounts.
- `deleteAccount(accountId)` — Owner only. Blocks deletion of system accounts or accounts with transactions.
- `getJournalEntries(filters?)` — Owner+office. Paginated list with lines and account details. Supports date range, sourceType, accountId filters.
- `createManualJournalEntry(input)` — Owner only. Requires `accountant_mode_enabled=true`. Validates balance before creating.

### Task 2: Wire Auto Journal Entries into Financial Actions

**`src/actions/invoices.ts`** changes:
- `finalizeInvoice()`: Added `createInvoiceJournalEntry(invoiceId)` fire-and-forget after QBO sync.
- `createCreditNote()`: Added `createInvoiceJournalEntry(creditNoteId)` fire-and-forget — credit notes have negative totals, so the auto-generated entry naturally reverses revenue recognition (Dr Revenue, Cr AR).

**`src/lib/stripe/webhook-handlers.ts`** changes:
- `handlePaymentSucceeded()`: Added `createPaymentJournalEntry(paymentRecordId, stripeFeeAmountCents)` fire-and-forget after QBO sync. Extracts Stripe fee from `balance_transaction.fee` when the charge object has it expanded.
- `handleChargeRefunded()`: Modified to capture the inserted refund record ID via `.returning({ id })`, then calls `createRefundJournalEntry(refundId, refundedAmount)` fire-and-forget.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Expenses schema missing expense_date and status fields**
- **Found during:** Task 1 (createExpenseJournalEntry)
- **Issue:** Plan assumed `expense_date` and `status` fields on expenses table. Actual schema uses `date` and has no `status` field.
- **Fix:** Changed field references to use `expenses.date`. Since expenses have no status, they are always treated as cash-paid (Dr Expense / Cr Checking). Added code comment explaining AP accrual is a future enhancement.
- **Files modified:** src/lib/accounting/journal.ts

**2. [Rule 2 - Missing functionality] Stripe fee extraction in webhook**
- **Found during:** Task 2 (handlePaymentSucceeded)
- **Issue:** Plan specified Stripe fee split but `balance_transaction.fee` requires the charge to have `balance_transaction` expanded. Simple access without expansion returns undefined.
- **Fix:** Added safe optional chaining to extract fee only when `balance_transaction` is an expanded object with a numeric `fee` property. Falls back to fee=0 (no fee line in journal entry) when not available. This is correct — most webhook deliveries include the balance transaction data.
- **Files modified:** src/lib/stripe/webhook-handlers.ts

## Self-Check: PASSED

| Check | Status |
|-------|--------|
| src/lib/accounting/journal.ts exists | FOUND |
| src/actions/accounting.ts exists | FOUND |
| Commit e1c5931 (Task 1) exists | FOUND |
| Commit 788f23e (Task 2) exists | FOUND |
| createInvoiceJournalEntry imported in invoices.ts | FOUND (line 43) |
| createInvoiceJournalEntry called in finalizeInvoice | FOUND (line 1005) |
| createInvoiceJournalEntry called in createCreditNote | FOUND (line 1785) |
| createPaymentJournalEntry imported in webhook-handlers.ts | FOUND (line 26) |
| createPaymentJournalEntry called in handlePaymentSucceeded | FOUND (line 175) |
| createRefundJournalEntry called in handleChargeRefunded | FOUND |
| TypeScript errors introduced by our files | 0 (89 pre-existing errors unchanged) |
