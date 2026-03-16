---
phase: 11-payroll-team-management-full-accounting
plan: 11
subsystem: billing-payments
tags: [payment-plans, customer-credits, collections, ar-aging, qbo-reconciliation]
dependency_graph:
  requires: ["11-06"]
  provides: ["payment_plans table", "payment_plan_installments table", "customer_credits table", "CollectionsDashboard", "PaymentPlans", "CustomerCredits"]
  affects: ["billing-page", "accounting-journal"]
tech_stack:
  added: []
  patterns: ["setImmediate for fire-and-forget journal entries", "LEFT JOIN + inArray for batch payment lookups", "tab navigation with badge counts"]
key_files:
  created:
    - src/actions/payment-reconciliation.ts
    - src/components/billing/collections-dashboard.tsx
    - src/components/billing/payment-plans.tsx
    - src/components/billing/customer-credits.tsx
  modified:
    - src/lib/db/schema/payments.ts
    - src/components/billing/billing-page-client.tsx
    - src/app/(app)/billing/page.tsx
    - src/actions/invoices.ts
    - src/actions/expenses.ts
decisions:
  - "setImmediate for journal entries on credit issuance/application — prevents blocking user action on accounting system failure"
  - "Billing page extended with tabs rather than new routes — consistent with UX preference for all org management in /settings and consolidated billing"
  - "Collections dashboard owner-only (not office) — matches business requirement for collections authority"
  - "Payment plans owner+office read/write — office staff need visibility to assist customers"
metrics:
  duration: "14 min"
  completed: "2026-03-16"
  tasks: 2
  files: 9
---

# Phase 11 Plan 11: Payment Reconciliation, Payment Plans, Customer Credits, and Collections Summary

Payment lifecycle completion — QBO reconciliation journal entries, flexible installment plans for customers, trackable credits, and a severity-bucketed collections dashboard integrated into the Billing page.

## What Was Built

### Task 1: Schema + Server Actions (`9800026`)

**Schema extensions (`src/lib/db/schema/payments.ts`):**
- `payment_plans` — invoice_id FK, total_amount, installment_count, installment_amount, frequency ('weekly'|'bi_weekly'|'monthly'), start_date, status, created_by. RLS: owner+office read/write, owner delete.
- `payment_plan_installments` — payment_plan_id FK, installment_number, due_date, amount, status ('pending'|'paid'|'overdue'), payment_record_id FK. RLS: owner+office.
- `customer_credits` — customer_id FK, amount, reason, source_type ('refund'|'goodwill'|'overpayment'), applied_to_invoice_id, status ('available'|'applied'|'expired'). RLS: owner+office.

**Server actions (`src/actions/payment-reconciliation.ts`):**
- `onQboPaymentReceived` — QBO webhook handler. Dr Bank (1000), Cr AR (1100). Idempotent.
- `createPaymentPlan` — splits invoice total into equal installments with last-installment rounding correction.
- `getPaymentPlans` — returns active plans with installment status via batch query (not N+1).
- `recordInstallmentPayment` — marks installment paid, auto-completes plan when all paid.
- `issueCustomerCredit` — creates credit row, fire-and-forget journal entry (Dr Revenue/AR, Cr Customer Credits 2200).
- `applyCustomerCredit` — marks credit applied, fire-and-forget journal entry (Dr Customer Credits 2200, Cr AR 1100).
- `getCustomerCredits` / `getAllCustomerCredits` — customer credit queries with invoice number lookup.
- `getCollectionsDashboard` — aggregates 30+/60+/90+ day overdue customers, last payment dates, failed autopay counts.
- `getArApAging` — full AR aging buckets (current, 1-30, 31-60, 61-90, 90+) with customer breakdown.
- `createRefundEntry` — wrapper for existing `createRefundJournalEntry` exposed as server action.
- `getOpenInvoicesForCustomer` — returns unpaid invoices for Apply Credit UI.

### Task 2: UI Components + Billing Page (`e684df1`)

**`src/components/billing/collections-dashboard.tsx`:**
- Summary cards: Total Overdue, 30+, 60+, 90+ amounts and counts.
- Filter chips: All / 30+ Days / 60+ Days / 90+ Days / Failed AutoPay.
- Customer table: severity dot indicator, overdue amount, oldest invoice, last payment, failed autopay badge.
- Color-coded by bucket: red (90+), amber (60+), yellow (30+).

**`src/components/billing/payment-plans.tsx`:**
- Create plan form: invoice selector, installment count slider (2-12), frequency picker, start date.
- Live installment schedule preview (client-side calculation).
- Active plans list with expandable installment detail, progress bar (% paid), next due date.
- Per-installment status badges (pending/paid/overdue).

**`src/components/billing/customer-credits.tsx`:**
- Issue credit form: customer selector, amount, credit type, reason.
- Credits list split into Available and Applied/Expired sections.
- Inline "Apply to Invoice" action: loads open invoices for the customer, select and confirm.

**`src/components/billing/billing-page-client.tsx` (extended):**
- Tab navigation: Invoices | Collections (owner only) | Payment Plans | Credits.
- Tab badges: Collections shows 90+ count in red; Payment Plans shows active count; Credits shows available count.
- Overdue action item in Invoices tab now links to Collections tab.
- All existing Invoices tab functionality preserved.

**`src/app/(app)/billing/page.tsx` (extended):**
- Parallel fetches: `getCollectionsDashboard`, `getPaymentPlans`, `getAllCustomerCredits`.
- Server-side customer list for credits form.
- Server-side open invoices for payment plan creation.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `getBillingInsights` / `BillingInsights` missing from invoices.ts**
- **Found during:** Task 2 — billing page import was broken, causing TS error.
- **Issue:** `billing/page.tsx` imported `getBillingInsights` and `BillingInsights` from `@/actions/invoices` but neither existed there.
- **Fix:** Added `BillingInsights` interface and `getBillingInsights()` function to `src/actions/invoices.ts`. Function queries invoice aggregates, completed WOs without invoices, and customers without billing model.
- **Files modified:** `src/actions/invoices.ts`
- **Commit:** `e684df1`

**2. [Rule 1 - Bug] `mapExpenseCategoryToAccount` is sync in a `"use server"` file**
- **Found during:** Task 2 build — Next.js "Server Actions must be async" error.
- **Issue:** `expenses.ts` is a `"use server"` file. All exported functions must be async. `mapExpenseCategoryToAccount` was sync.
- **Fix:** Changed to `async function mapExpenseCategoryToAccount(): Promise<string>`.
- **Files modified:** `src/actions/expenses.ts`
- **Commit:** `e684df1`

### Pre-existing Build Failures (Out of Scope)

The following build errors existed before this plan and are out of scope per the scope boundary rule:
- `company-settings.ts` — `logo_url` not in orgs schema (modified pre-plan)
- `invoices.ts` — `labor_hours`, `labor_rate` not in work_orders schema (pre-existing)
- `quotes.ts` — same labor fields (pre-existing)
- `wo-labor-section.tsx` — imports `updateWorkOrderLabor` not exported from work-orders (pre-existing)
- `stop-workflow.tsx` — imports `processPhotoQueue` not exported (pre-existing)
- `routes/page.tsx` — imports `getPredictiveAlertsForPools` not exported (pre-existing)

These are documented but not fixed (out of scope).

## Architecture Notes

**Journal entry fire-and-forget pattern:** Credit issuance and application use `setImmediate` to generate journal entries without blocking the user action. If accounting fails, the credit still records correctly. This matches the fire-and-forget pattern used in Phase 7 for invoice and payment journal entries.

**LEFT JOIN batch pattern:** `getPaymentPlans` fetches all installments for a batch of plans in a single query using `inArray(payment_plan_id, planIds)` rather than N individual queries. Consistent with MEMORY.md guidance.

**Collections dashboard owner-only:** `getCollectionsDashboard` enforces `role === "owner"` at the server action level. The Collections tab is hidden from office users in the UI as well.

## Self-Check: PASSED

All created files exist on disk. Both task commits verified in git log.

| Check | Result |
|-------|--------|
| `src/actions/payment-reconciliation.ts` | FOUND |
| `src/lib/db/schema/payments.ts` | FOUND |
| `src/components/billing/collections-dashboard.tsx` | FOUND |
| `src/components/billing/payment-plans.tsx` | FOUND |
| `src/components/billing/customer-credits.tsx` | FOUND |
| Commit `9800026` (Task 1) | FOUND |
| Commit `e684df1` (Task 2) | FOUND |
| No new TypeScript errors in my files | VERIFIED |
