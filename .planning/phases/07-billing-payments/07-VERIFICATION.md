---
phase: 07-billing-payments
verified: 2026-03-12T20:15:00Z
status: human_needed
score: 8/8 must-haves verified (automated)
re_verification: false
human_verification:
  - test: "Stripe Connect onboarding flow"
    expected: "Owner clicks Connect Stripe, completes onboarding, returns to settings with connected status"
    why_human: "Requires real Stripe test mode interaction and redirect flow"
  - test: "Payment page renders with company branding and Stripe Elements loads"
    expected: "Customer opens /pay/[token] link, sees company logo, invoice details, card and ACH payment options"
    why_human: "Visual rendering, Stripe Elements initialization, and branding cannot be verified programmatically"
  - test: "AutoPay opt-in and automatic charging on invoice generation"
    expected: "Customer checks AutoPay, pays invoice, next invoice auto-charges saved method"
    why_human: "Requires Stripe test card interaction and webhook delivery"
  - test: "QBO OAuth2 flow and bidirectional sync"
    expected: "Owner connects QBO, creates invoice, invoice appears in QBO"
    why_human: "Requires Intuit sandbox credentials and real OAuth flow"
  - test: "Dunning sequence fires correctly"
    expected: "Overdue invoice triggers retry and reminder email at configured day offsets"
    why_human: "Requires time-based cron execution and email delivery verification"
  - test: "Invoice email with PDF attachment and payment link"
    expected: "Customer receives email with PDF, clicks Pay Now, lands on payment page"
    why_human: "Requires Resend API delivery and email content inspection"
  - test: "Template editor preview and customized send"
    expected: "Owner edits template, previews with example data, sends customized email"
    why_human: "Visual UI interaction and email content verification"
  - test: "Reports page visual layout and data accuracy"
    expected: "AR aging shows correct buckets, P&L shows real expenses, CSV downloads valid"
    why_human: "Requires real invoice and expense data to validate report accuracy"
---

# Phase 7: Billing & Payments Verification Report

**Phase Goal:** The company can invoice customers across multiple billing models, collect payments via Stripe Connect (company's own Stripe) or QuickBooks Payments, handle failed payments gracefully, sync bidirectionally with QuickBooks Online, and run built-in financial reports -- companies choose their payment stack or use both

**Verified:** 2026-03-12T20:15:00Z
**Status:** human_needed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Office can generate invoices across all four billing models (per-stop, flat-rate, plus-chemicals, custom) | VERIFIED | `billing.ts` exports `generateInvoiceForCustomer` with billing_model switch logic (553 lines). All four models implemented with correct line item generation. Plus-chemicals auto-populates from `service_visits.chemistry_readings`. Customer inline edit has billing model selector wired to `updateCustomerBillingModel`. |
| 2 | Office can bulk-generate and deliver invoices via email (with PDF) and SMS | VERIFIED | `generateAllInvoices` with sequential processing and duplicate prevention. `sendInvoice` sends email via Resend with PDF attachment and SMS via `send-invoice-sms` Edge Function. `sendAllInvoices` batch send. Invoice list UI has Send/Send All buttons with Email/SMS/Both delivery method selector. |
| 3 | Company can connect Stripe via Connect and process card/ACH payments | VERIFIED | Stripe singleton (`src/lib/stripe/client.ts`), Connect onboarding routes (`/api/connect/stripe/onboard`, `/api/connect/stripe/return`), branded `/pay/[token]` page with Stripe Elements PaymentElement (card + ACH), PaymentIntent creation on connected account (`/api/pay/[token]/intent`). Payment page fetches intent via `fetch(/api/pay/${token}/intent)`. |
| 4 | AutoPay customers are automatically charged and failed payments trigger dunning | VERIFIED | `chargeAutoPay` creates off-session PaymentIntent with `confirm: true`. `generateInvoiceForCustomer` calls `chargeAutoPay` after invoice creation. Dunning engine (`src/actions/dunning.ts`, 525 lines) with `runDunningScan`, `retryPayment`, configurable `dunning_config` table. Edge Function `dunning-scan` + cron API route `/api/cron/dunning`. `DunningSettings` component in Billing tab. |
| 5 | QBO bidirectional sync pushes invoices/payments/customers and receives QBO payment webhooks | VERIFIED | `src/lib/qbo/client.ts` with advisory lock token refresh, `src/lib/qbo/mappers.ts` with 4 mappers. `syncInvoiceToQbo` called from `billing.ts`, `invoices.ts`. `syncPaymentToQbo` called from `payments.ts`, `webhook-handlers.ts`. QBO webhook handler at `/api/webhooks/qbo` routes to `handleQboWebhook`. OAuth2 flow via `/api/connect/qbo/authorize` and `/api/connect/qbo/callback`. |
| 6 | Built-in financial reports (AR aging, revenue, P&L with real expenses) with CSV export | VERIFIED | Reports page at `/reports` with 3 tabs. `getArAging` (30/60/90 day buckets from due_date), `getRevenueByCustomer` (date range, per-customer), `getPnlReport` (real expenses from expenses table, not stubbed). `exportFinancialCsv` supports 4 export types. `createExpense` CRUD action. Report components wire to actions: `ArAgingView` -> `getArAging`, `RevenueReport` -> `getRevenueByCustomer`, `PnlReport` -> `getPnlReport`. All 618 lines in reports.ts. |
| 7 | Surcharge and payment stack are configurable, overdue flags visible on profiles and route stops | VERIFIED | `PaymentStackSettings` with radio group (Stripe/QBO/Both/None). Surcharge toggle with percentage input (3% cap) and legal disclaimer. `customer-inline-edit.tsx` shows overdue banner when `overdue_balance > 0` (office/owner only). `route-stop-list.tsx` shows "Overdue" pill badge. `handlePaymentSucceeded` recalculates `overdue_balance` from remaining unpaid invoices. |
| 8 | All notification templates are customizable with merge tags, preview, and defaults | VERIFIED | `notification_templates` table with 10 template types. `template-engine.ts` with 15 merge tags and `resolveTemplate`. `default-templates.ts` with `DEFAULT_TEMPLATES` for all 10 types. `TemplateEditor` component (585 lines) with edit/preview tabs, merge tag insertion, reset-to-default. `getResolvedTemplate` called from `invoices.ts`, `quotes.ts`, `dunning.ts`, `visits.ts`, `notifications.ts`, `webhook-handlers.ts`. Org settings support `google_review_url`, `custom_email_footer`, `custom_sms_signature`. |

**Score:** 8/8 truths verified (automated checks)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/db/schema/payments.ts` | payment_records table with RLS | VERIFIED | 79 lines, `paymentRecords` table with org_id, invoice_id, amount, method, status, indexes |
| `src/lib/db/schema/dunning.ts` | dunning_config table with RLS | VERIFIED | 78 lines, `dunningConfig` table with steps JSONB, max_retries, unique org constraint |
| `src/lib/db/schema/expenses.ts` | expenses table with RLS | VERIFIED | 83 lines, `expenses` table with EXPENSE_CATEGORIES constant, category/amount/date/receipt_url |
| `src/actions/billing.ts` | Billing model logic, invoice generation | VERIFIED | 553 lines, exports 4 functions: generateInvoiceForCustomer, generateAllInvoices, getPlusChemicalsLineItems, updateCustomerBillingModel |
| `src/lib/pay-token.ts` | JWT sign/verify for payment tokens | VERIFIED | exports signPayToken, verifyPayToken |
| `src/lib/emails/invoice-email.tsx` | React Email branded invoice template | VERIFIED | InvoiceEmail component with customBody/customFooter props |
| `src/lib/stripe/client.ts` | Stripe singleton instance | VERIFIED | Lazy-init via Proxy pattern for build-time safety |
| `src/app/pay/[token]/page.tsx` | Public branded payment page | VERIFIED | Server component with verifyPayToken, adminDb data fetch, branding |
| `src/app/pay/[token]/pay-client.tsx` | Client Stripe Elements component | VERIFIED | PaymentElement, AutoPay checkbox, surcharge disclosure, processing states |
| `src/app/api/webhooks/stripe/route.ts` | Stripe webhook handler | VERIFIED | Dual-secret verification, routes to 4 handlers |
| `src/lib/stripe/webhook-handlers.ts` | Event handler functions | VERIFIED | 513 lines, handlePaymentSucceeded/Failed/AccountUpdated/ChargeRefunded with idempotency, ReceiptEmail dispatch, overdue_balance recalculation, QBO sync |
| `src/actions/payments.ts` | Manual payment recording, AutoPay | VERIFIED | 604 lines, recordManualPayment, chargeAutoPay, enableAutoPay, disableAutoPay, voidInvoice, getPaymentsForInvoice |
| `src/actions/dunning.ts` | Dunning scan and retry logic | VERIFIED | 525 lines, runDunningScan, retryPayment, getDunningConfig, updateDunningConfig |
| `src/lib/emails/receipt-email.tsx` | Receipt email template | VERIFIED | ReceiptEmail component imported and used in webhook-handlers.ts |
| `src/lib/emails/dunning-email.tsx` | Dunning reminder email template | VERIFIED | DunningEmail component with step info |
| `src/lib/qbo/client.ts` | QBO client factory | VERIFIED | getQboClient with token refresh + advisory lock, isQboConnected, qboPromise |
| `src/lib/qbo/mappers.ts` | Entity mapping functions | VERIFIED | mapCustomerToQbo, mapInvoiceToQbo, mapPaymentToQbo exported and used in qbo-sync.ts |
| `src/actions/qbo-sync.ts` | Real-time sync push/pull | VERIFIED | 655 lines, syncCustomerToQbo, syncInvoiceToQbo, syncPaymentToQbo, handleQboWebhook, disconnectQbo, getQboStatus |
| `src/app/api/webhooks/qbo/route.ts` | QBO webhook handler | VERIFIED | HMAC verification, routes to handleQboWebhook |
| `src/app/(app)/reports/page.tsx` | Reports page with tabs | VERIFIED | Server component with AR Aging, Revenue, P&L tabs, role guard |
| `src/components/reports/ar-aging-view.tsx` | AR aging table | VERIFIED | 213 lines, color-coded buckets, CSV export |
| `src/components/reports/revenue-report.tsx` | Revenue by customer report | VERIFIED | 276 lines, date range filter, sortable, CSV export |
| `src/components/reports/pnl-report.tsx` | P&L report with real expenses | VERIFIED | 458 lines, real expenses from expenses table, monthly breakdown, CSV export |
| `src/components/reports/expense-entry-form.tsx` | Expense entry form | VERIFIED | 237 lines, creates expenses via `createExpense` action |
| `src/actions/reports.ts` | Report data queries | VERIFIED | 618 lines, getArAging, getRevenueByCustomer, getPnlReport, exportFinancialCsv |
| `src/actions/expenses.ts` | Expense CRUD | VERIFIED | 230 lines, createExpense, getExpenses, deleteExpense, getExpensesByCategory |
| `src/lib/db/schema/notification-templates.ts` | notification_templates table | VERIFIED | notificationTemplates table with RLS, unique (org_id, template_type) |
| `src/lib/notifications/template-engine.ts` | Merge tag resolution engine | VERIFIED | 100 lines, MERGE_TAGS array (15 tags), resolveTemplate function |
| `src/lib/notifications/default-templates.ts` | Default templates for all types | VERIFIED | 170 lines, DEFAULT_TEMPLATES for 10 notification types, TemplateType union, ALL_TEMPLATE_TYPES |
| `src/actions/notification-templates.ts` | Template CRUD actions | VERIFIED | 399 lines, getTemplates, updateTemplate, resetTemplate, getResolvedTemplate |
| `src/components/settings/template-editor.tsx` | Template editor UI | VERIFIED | 585 lines, type selector, edit/preview tabs, merge tag buttons, org settings panel |
| `src/components/settings/stripe-connect-settings.tsx` | Stripe Connect UI | VERIFIED | Status display, connect/complete onboarding button, toasts |
| `src/components/settings/payment-stack-settings.tsx` | Payment stack selector | VERIFIED | Radio group + surcharge config with legal disclaimer |
| `src/components/settings/dunning-settings.tsx` | Dunning configuration UI | VERIFIED | Step editor with day offset, subject, body, add/remove steps |
| `src/components/settings/qbo-connect-settings.tsx` | QBO connection UI | VERIFIED | Connect/disconnect with status badge |
| `supabase/functions/send-invoice-sms/index.ts` | SMS Edge Function | VERIFIED | Handles both invoice and quote SMS types |
| `supabase/functions/dunning-scan/index.ts` | Dunning cron Edge Function | VERIFIED | Thin wrapper calling /api/cron/dunning |
| `src/app/api/connect/stripe/onboard/route.ts` | Stripe Connect onboarding route | VERIFIED | stripe.accounts.create + accountLinks.create |
| `src/app/api/connect/qbo/authorize/route.ts` | QBO OAuth2 authorize | VERIFIED | Generates auth URL, redirect |
| `src/app/api/connect/qbo/callback/route.ts` | QBO OAuth2 callback | VERIFIED | Token exchange, stores in org_settings |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `billing.ts` | `invoices schema` | billing_model column lookup | WIRED | billing_model switch drives line item generation |
| `billing.ts` | `payments.ts` | chargeAutoPay on invoice generation | WIRED | `import { chargeAutoPay }` called after invoice creation |
| `pay-client.tsx` | `/api/pay/[token]/intent` | fetch POST for PaymentIntent | WIRED | `fetch(/api/pay/${token}/intent, ...)` confirmed |
| `webhooks/stripe/route.ts` | `webhook-handlers.ts` | event routing | WIRED | imports all 4 handlers, routes by event.type |
| `webhook-handlers.ts` | `invoices` | status -> paid | WIRED | `status: "paid"` update on payment succeeded |
| `webhook-handlers.ts` | `receipt-email.tsx` | ReceiptEmail dispatch | WIRED | import + createElement(ReceiptEmail) in handlePaymentSucceeded |
| `webhook-handlers.ts` | `qbo-sync.ts` | syncPaymentToQbo | WIRED | fire-and-forget call after payment settled |
| `qbo-sync.ts` | `qbo/client.ts` | getQboClient | WIRED | imported and called in all sync functions |
| `qbo-sync.ts` | `qbo/mappers.ts` | entity mappers | WIRED | mapCustomerToQbo, mapInvoiceToQbo, mapPaymentToQbo all imported and used |
| `webhooks/qbo/route.ts` | `qbo-sync.ts` | handleQboWebhook | WIRED | imported and called |
| `invoices.ts` | `qbo-sync.ts` | syncInvoiceToQbo | WIRED | fire-and-forget after send/finalize |
| `payments.ts` | `qbo-sync.ts` | syncPaymentToQbo | WIRED | fire-and-forget after manual payment |
| `stripe-connect-settings.tsx` | `/api/connect/stripe/onboard` | fetch POST | WIRED | `fetch("/api/connect/stripe/onboard", { method: "POST" })` |
| `onboard/route.ts` | `stripe/client.ts` | stripe.accounts.create | WIRED | import + API call confirmed |
| `qbo-connect-settings.tsx` | `/api/connect/qbo/authorize` | redirect | WIRED | `window.location.href = "/api/connect/qbo/authorize"` |
| `ar-aging-view.tsx` | `reports.ts` | getArAging + exportFinancialCsv | WIRED | imports + calls confirmed |
| `revenue-report.tsx` | `reports.ts` | getRevenueByCustomer | WIRED | import + call confirmed |
| `pnl-report.tsx` | `reports.ts` | getPnlReport + exportFinancialCsv | WIRED | imports + calls confirmed |
| `expense-entry-form.tsx` | `expenses.ts` | createExpense | WIRED | import + call confirmed |
| `customer-inline-edit.tsx` | `overdue_balance` | visual flag | WIRED | parseFloat(customer.overdue_balance), banner shown when > 0 |
| `route-stop-list.tsx` | `overdueBalance` | visual flag | WIRED | "Overdue" pill badge when overdueBalance > 0 |
| `invoices.ts` | `notification-templates.ts` | getResolvedTemplate | WIRED | Resolves invoice_email/invoice_sms templates before send |
| `quotes.ts` | `notification-templates.ts` | getResolvedTemplate | WIRED | Resolves quote_email/quote_sms templates |
| `dunning.ts` | `notification-templates.ts` | getResolvedTemplate | WIRED | Resolves dunning_email template |
| `visits.ts` | `notification-templates.ts` | getResolvedTemplate | WIRED | Resolves service_report_email template |
| `notifications.ts` | `notification-templates.ts` | getResolvedTemplate | WIRED | Resolves pre_arrival_email/sms templates |
| `webhook-handlers.ts` | `notification-templates.ts` | getResolvedTemplate | WIRED | Resolves receipt_email template |
| `template-editor.tsx` | `template-engine.ts` | resolveTemplate for preview | WIRED | import + call for preview rendering |
| `settings-tabs.tsx` | All billing components | import + render | WIRED | StripeConnectSettings, PaymentStackSettings, QboConnectSettings, DunningSettings, TemplateEditor all imported and rendered |

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| BILL-01 | 07-01, 07-02, 07-08 | Multi-model invoicing (per-stop, flat-rate, plus-chemicals, custom) | SATISFIED | 4 billing models in `generateInvoiceForCustomer`, customer billing model selector in inline edit |
| BILL-02 | 07-01, 07-02, 07-08 | Bulk invoice generation and delivery | SATISFIED | `generateAllInvoices`, `sendAllInvoices` batch send, email with PDF + SMS delivery |
| BILL-03 | 07-04 | Online payment via card or ACH through Stripe Connect | SATISFIED | `/pay/[token]` page with Stripe Elements PaymentElement, PaymentIntent on connected account |
| BILL-04 | 07-05 | AutoPay with saved payment method | SATISFIED | AutoPay checkbox on payment page, `chargeAutoPay` with off-session PaymentIntent, `enableAutoPay` |
| BILL-05 | 07-05 | Configurable dunning schedule for failed payments | SATISFIED | `dunning_config` table, `runDunningScan` with retry + email, `DunningSettings` UI, pg_cron Edge Function |
| BILL-06 | 07-06 | Bidirectional QBO sync (customers, invoices, payments) | SATISFIED | QBO client, mappers, sync actions wired into all write paths, QBO webhook handler for inbound payments |
| BILL-07 | 07-07 | Built-in accounting (P&L, expense tracking, revenue reporting) | SATISFIED | Reports page with AR aging, revenue, P&L tabs. Expenses table with CRUD. Real expenses in P&L (not stubbed). |
| BILL-08 | 07-03, 07-04 | Credit card surcharge/convenience fee | SATISFIED | `PaymentStackSettings` surcharge toggle with 3% cap and legal disclaimer, surcharge on payment page |
| BILL-09 | 07-07 | Tax prep exports and financial reporting | SATISFIED | `exportFinancialCsv` supports invoices, payments, AR aging, expenses. CSV download from all report views. |
| BILL-10 | 07-03, 07-06 | Payment stack choice (Stripe, QBO, or both) | SATISFIED | `PaymentStackSettings` radio group, Stripe Connect onboarding, QBO OAuth2 flow, both configurable |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None | - | - | - | No TODOs, FIXMEs, placeholders, or stubs found in any Phase 7 files |

### Build Verification

| Check | Status | Details |
|-------|--------|---------|
| TypeScript compilation (`tsc --noEmit`) | PASSED | Zero errors |
| Next.js build (`npm run build`) | PASSED | All routes compile including /pay/[token], /reports, /api/webhooks/stripe, /api/webhooks/qbo |
| All critical file existence | PASSED | 40+ Phase 7 files verified present |
| All key exports | PASSED | All planned function exports confirmed |
| All key links | PASSED | 28 critical integration points verified wired |

### Human Verification Required

The following items pass all automated checks but require human interaction with external services (Stripe, QBO, Resend, Twilio) to fully verify:

### 1. Stripe Connect Onboarding Flow

**Test:** Go to Settings > Billing, click "Connect Stripe Account", complete Stripe onboarding
**Expected:** Stripe hosted onboarding page loads, after completion redirects to settings with "Connected" status and account info
**Why human:** Requires real Stripe test mode interaction, redirect flow, and visual confirmation of status badges

### 2. Payment Page Rendering and Payment Flow

**Test:** Open a payment link (/pay/[token]), verify branding, pay with test card 4242424242424242
**Expected:** Company logo and colors shown, invoice details correct, card and ACH options available, surcharge disclosed if enabled, payment succeeds
**Why human:** Stripe Elements rendering, visual branding, real Stripe test payment required

### 3. AutoPay Enrollment and Automatic Charging

**Test:** Check "Enable AutoPay" on payment page, pay, then generate a new invoice for that customer
**Expected:** Auto-charge fires, invoice stays pending until webhook, receipt email sent after settlement
**Why human:** Requires Stripe webhook delivery in test mode and email inspection

### 4. QBO OAuth2 Connection and Sync

**Test:** Go to Settings > Billing > QBO, click "Connect QuickBooks", complete OAuth flow
**Expected:** QBO connected, creating invoice in PoolCo pushes it to QBO, recording payment syncs to QBO
**Why human:** Requires Intuit sandbox credentials and real API interaction

### 5. Dunning Sequence Execution

**Test:** Create overdue invoice, trigger dunning scan, verify retry and email at configured day offsets
**Expected:** Dunning scan retries payment for AutoPay customers AND sends reminder email with pay link
**Why human:** Time-based cron execution and email delivery verification

### 6. Invoice Email Delivery with PDF

**Test:** Send invoice via email, check inbox
**Expected:** Email arrives with PDF attachment and "Pay Now" link pointing to /pay/[token]
**Why human:** Requires Resend API and email client inspection

### 7. Template Editor and Customized Notifications

**Test:** Edit invoice email template, change subject, add Google review link, preview, send
**Expected:** Preview shows resolved merge tags, sent email uses customized subject and footer with review link
**Why human:** Visual UI interaction and email content verification

### 8. Reports Data Accuracy

**Test:** With real invoice/expense data, check AR aging buckets, P&L totals, CSV exports
**Expected:** AR aging correctly buckets by days from due_date, P&L shows Net Income = Revenue - Expenses (real data), CSV files download with correct headers and data
**Why human:** Requires real data to validate calculation accuracy

### Gaps Summary

No automated gaps found. All artifacts exist, are substantive (no stubs -- smallest file is 79 lines for a schema table, largest is 655 lines for QBO sync), and are properly wired. TypeScript compiles cleanly and Next.js build succeeds.

The phase has 8 human verification items remaining. These all involve external service interactions (Stripe, QBO, Resend/Twilio) or visual/UX verification that cannot be tested programmatically. The code infrastructure for all features is complete and correctly integrated.

---

_Verified: 2026-03-12T20:15:00Z_
_Verifier: Claude (gsd-verifier)_
