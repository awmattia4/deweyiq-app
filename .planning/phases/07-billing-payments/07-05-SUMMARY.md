---
phase: 07-billing-payments
plan: "05"
subsystem: payments
tags: [stripe, autopay, dunning, react-email, resend, pg_cron, edge-function]

# Dependency graph
requires:
  - phase: 07-04
    provides: "PaymentIntent creation, webhook handlers, payment page UI"
  - phase: 07-01
    provides: "Invoice generation, billing models, customer autopay schema fields"
  - phase: 07-03
    provides: "Stripe Connect, connected account operations"
provides:
  - "AutoPay enrollment via SetupIntent / setup_future_usage"
  - "Off-session charging for AutoPay customers on invoice generation"
  - "Receipt email template for all successful payments"
  - "Configurable dunning engine with retry + reminder emails"
  - "Dunning settings UI for owner configuration"
  - "pg_cron daily dunning scan via Edge Function"
  - "Cron API route for dunning execution"
affects: [07-07, 07-08, 07-09, 08-customer-portal]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "setup_future_usage on PaymentIntent for saving payment method"
    - "off_session + confirm:true for background charging"
    - "CRON_SECRET header auth for internal cron routes"
    - "Edge Function as thin wrapper calling Next.js API routes"

key-files:
  created:
    - src/app/api/pay/[token]/setup/route.ts
    - src/lib/emails/receipt-email.tsx
    - src/lib/emails/dunning-email.tsx
    - src/actions/dunning.ts
    - src/components/settings/dunning-settings.tsx
    - src/app/api/cron/dunning/route.ts
    - supabase/functions/dunning-scan/index.ts
  modified:
    - src/app/api/pay/[token]/intent/route.ts
    - src/app/pay/[token]/pay-client.tsx
    - src/app/pay/[token]/page.tsx
    - src/actions/payments.ts
    - src/actions/billing.ts
    - src/lib/stripe/webhook-handlers.ts
    - src/components/settings/settings-tabs.tsx
    - src/app/(app)/settings/page.tsx

key-decisions:
  - "setup_future_usage on PaymentIntent instead of separate SetupIntent flow -- simpler, single payment action saves method automatically when AutoPay opted-in"
  - "Manual dunning retry replaces Stripe Smart Retries -- Smart Retries only work with Stripe Billing/Subscriptions, not standalone PaymentIntents on connected accounts"
  - "Receipt email sent from webhook handler (handlePaymentSucceeded) -- ensures ALL payments (manual and AutoPay) get receipts consistently"
  - "Dunning scan uses day_offset with 1-day window for cron timing tolerance"
  - "CRON_SECRET Bearer token auth for internal cron API route"

patterns-established:
  - "AutoPay flow: saveMethod flag -> setup_future_usage on PI -> enableAutoPay server action -> chargeAutoPay on future invoices"
  - "Internal cron pattern: pg_cron -> Edge Function -> /api/cron/* route with CRON_SECRET auth"
  - "Dunning step tracking via payment_records attempt_count cross-referenced with step index"

requirements-completed: [BILL-04, BILL-05]

# Metrics
duration: 14min
completed: 2026-03-12
---

# Phase 7 Plan 05: AutoPay & Dunning Summary

**AutoPay enrollment with off-session charging on invoice generation, receipt emails for all payments, and configurable dunning engine with retry + reminder email sequences**

## Performance

- **Duration:** 14 min
- **Started:** 2026-03-12T18:00:21Z
- **Completed:** 2026-03-12T18:14:36Z
- **Tasks:** 2
- **Files modified:** 15

## Accomplishments

- Customers can opt into AutoPay via checkbox on the payment page -- saves payment method for future off-session charges
- Invoice generation automatically charges AutoPay customers (failure does not block invoice creation)
- Receipt email sent for every successful payment (manual and AutoPay) via webhook handler
- Owner-configurable dunning sequence: step count, day offsets, custom email subject/body, max retries
- Daily cron scan identifies overdue invoices, sends reminder emails at configured intervals, and retries payments for AutoPay customers
- Edge Function + API route pattern for pg_cron integration

## Task Commits

Each task was committed atomically:

1. **Task 1: AutoPay -- SetupIntent, saved payment method, auto-charge, and receipt emails** - `c80dfde` (feat)
2. **Task 2: Dunning engine -- configurable manual retry schedule, reminder emails, and settings UI** - `e91b18e` (feat)

## Files Created/Modified

- `src/app/api/pay/[token]/setup/route.ts` - SetupIntent creation for saving payment methods
- `src/app/api/pay/[token]/intent/route.ts` - Updated with saveMethod/setup_future_usage support
- `src/app/pay/[token]/pay-client.tsx` - AutoPay checkbox, post-payment enableAutoPay call
- `src/app/pay/[token]/page.tsx` - Passes customerId to PayClient
- `src/actions/payments.ts` - enableAutoPay, disableAutoPay, chargeAutoPay functions
- `src/actions/billing.ts` - AutoPay charge after invoice generation
- `src/lib/emails/receipt-email.tsx` - Dark-themed receipt email template
- `src/lib/stripe/webhook-handlers.ts` - Receipt email dispatch in handlePaymentSucceeded
- `src/actions/dunning.ts` - runDunningScan, retryPayment, getDunningConfig, updateDunningConfig
- `src/lib/emails/dunning-email.tsx` - Amber-themed dunning reminder email template
- `src/components/settings/dunning-settings.tsx` - Dunning sequence configuration UI
- `src/components/settings/settings-tabs.tsx` - DunningSettings added to Billing tab
- `src/app/(app)/settings/page.tsx` - Fetches and passes dunning config
- `src/app/api/cron/dunning/route.ts` - Internal cron handler with CRON_SECRET auth
- `supabase/functions/dunning-scan/index.ts` - Edge Function for pg_cron

## Decisions Made

- **setup_future_usage instead of separate SetupIntent flow**: The plan suggested both approaches. Chose setup_future_usage on the existing PaymentIntent because it's simpler (single payment action saves the method automatically) and avoids a separate SetupIntent confirmation step. The SetupIntent route was still created as a fallback but the primary flow uses setup_future_usage.
- **Manual dunning retry is correct**: Per 07-RESEARCH.md, Stripe Smart Retries only work with Stripe Billing (Subscriptions/Invoices). This project uses standalone PaymentIntents on connected accounts, so the manual retry via runDunningScan + chargeAutoPay is the only viable approach.
- **Receipt email in webhook handler**: Sending from handlePaymentSucceeded ensures ALL successful payments (both manual pay-now and AutoPay off-session) receive receipts without duplicating email logic in multiple places.
- **redirect: "if_required" on confirmPayment**: Changed from always-redirect to redirect-only-when-needed so card payments can be handled inline (enabling AutoPay save immediately after success without waiting for redirect round-trip).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

**External services require manual configuration:**
- **CRON_SECRET**: Add to `.env.local` and Supabase secrets -- a random string for authenticating cron API requests
- **APP_URL**: Set in Supabase Edge Function secrets for the dunning-scan function
- **pg_cron**: Enable the extension in Supabase Dashboard (Database > Extensions > pg_cron) and create the cron job:
  ```sql
  SELECT cron.schedule(
    'dunning-scan',
    '0 9 * * *',
    $$SELECT net.http_post(
      url := 'YOUR_SUPABASE_URL/functions/v1/dunning-scan',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := '{}'::jsonb
    )$$
  );
  ```
- Deploy Edge Function: `supabase functions deploy dunning-scan`

## Next Phase Readiness

- AutoPay and dunning engine complete -- customers can enroll in automatic payments and overdue invoices are automatically managed
- Receipt emails flow through for all payment types
- Ready for Plan 07 (remaining billing features) and Phase 8 (customer portal)

## Self-Check: PASSED

All 7 created files verified present on disk. Both task commits (c80dfde, e91b18e) verified in git log.

---
*Phase: 07-billing-payments*
*Completed: 2026-03-12*
