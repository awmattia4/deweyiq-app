---
phase: 07-billing-payments
plan: "04"
subsystem: payments
tags: [stripe, stripe-elements, stripe-connect, webhooks, payment-intent, ach, surcharge, manual-payments]

# Dependency graph
requires:
  - phase: 07-02
    provides: "Pay token JWT system (signPayToken/verifyPayToken), invoice email delivery"
  - phase: 07-03
    provides: "Stripe singleton (getStripe), Connect onboarding, payment provider config, surcharge settings"
provides:
  - "Public /pay/[token] branded payment page with Stripe Elements (card + ACH)"
  - "POST /api/pay/[token]/intent PaymentIntent creation on connected accounts"
  - "POST /api/webhooks/stripe endpoint for payment event processing"
  - "handlePaymentSucceeded, handlePaymentFailed, handleAccountUpdated, handleChargeRefunded webhook handlers"
  - "recordManualPayment, getPaymentsForInvoice, voidInvoice server actions"
  - "Stripe Customer creation/reuse per customer per connected account"
affects: [07-05, 07-06, 07-07, 07-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Stripe Elements with connected account: loadStripe(publishableKey, { stripeAccount })"
    - "PaymentIntent on connected account with application_fee_amount for surcharge"
    - "Webhook dual-secret verification: try Connect secret first, fall back to platform secret"
    - "Idempotent webhook handlers using payment_records.stripe_payment_intent_id as dedup key"

key-files:
  created:
    - src/app/pay/[token]/page.tsx
    - src/app/pay/[token]/pay-client.tsx
    - src/app/api/pay/[token]/intent/route.ts
    - src/app/api/webhooks/stripe/route.ts
    - src/lib/stripe/webhook-handlers.ts
    - src/actions/payments.ts
  modified: []

key-decisions:
  - "Reuse existing PaymentIntent if still in requires_payment_method/requires_confirmation state"
  - "Stripe Customer created on connected account (not platform) for proper payment association"
  - "Webhook returns 200 even on handler errors to prevent Stripe retry loops on permanent failures"
  - "ACH payment shows processing state (2-3 business days) instead of immediate success"
  - "Surcharge applied as application_fee_amount on PaymentIntent for transparent fee collection"

patterns-established:
  - "Public payment page pattern: token-verified, adminDb, light theme, PageShell/ErrorCard/StatusCard sub-components"
  - "Webhook handler pattern: adminDb, idempotent checks, structured logging, non-fatal alert creation"
  - "Manual payment recording: withRls, owner+office role check, auto-mark paid if amount covers total"

requirements-completed: [BILL-03, BILL-08]

# Metrics
duration: 8min
completed: 2026-03-12
---

# Phase 7 Plan 04: Payment Processing & Webhook Handlers Summary

**Branded public payment page with Stripe Elements (card + ACH), PaymentIntent creation on connected accounts with surcharge support, idempotent webhook handlers for settlement/failure/refund events, and manual check/cash payment recording**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-12T17:40:37Z
- **Completed:** 2026-03-12T17:48:48Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Public /pay/[token] page renders branded payment form with company logo, invoice details, line items, and surcharge disclosure
- Stripe Elements integration with connected account support for both card and ACH bank transfer payments
- PaymentIntent creation API route with Stripe Customer reuse, surcharge calculation, and payment_records tracking
- Complete webhook handler suite: payment succeeded (marks paid), payment failed (creates alert + updates overdue balance), account updated (syncs onboarding), charge refunded (creates refund records)
- Manual payment recording for check/cash with automatic invoice status transition
- Invoice voiding with Stripe PaymentIntent cancellation

## Task Commits

Each task was committed atomically:

1. **Task 1: Branded payment page and PaymentIntent creation** - `b57bde0` (feat)
2. **Task 2: Stripe webhook handler for payment events** - `6d11e4b` (feat)

## Files Created/Modified
- `src/app/pay/[token]/page.tsx` - Server component: token verification, invoice/org/customer data fetching, status gates, branded PageShell
- `src/app/pay/[token]/pay-client.tsx` - Client component: Stripe Elements provider, PaymentElement, surcharge disclosure, processing/success states
- `src/app/api/pay/[token]/intent/route.ts` - POST handler: Stripe Customer creation/reuse, PaymentIntent with application_fee_amount, payment_records entry
- `src/app/api/webhooks/stripe/route.ts` - Webhook endpoint: dual-secret signature verification, event routing to handlers
- `src/lib/stripe/webhook-handlers.ts` - Four idempotent handlers: payment succeeded, payment failed, account updated, charge refunded
- `src/actions/payments.ts` - Server actions: recordManualPayment, getPaymentsForInvoice, voidInvoice

## Decisions Made
- **PaymentIntent reuse:** If invoice already has a PaymentIntent in a usable state (requires_payment_method etc.), reuse it instead of creating a new one. Prevents orphaned PIs on page refresh.
- **Stripe Customer on connected account:** Created via `stripeAccount` option, not on the platform. This ensures the customer object lives on the merchant's Stripe account for proper payment association.
- **Webhook 200 on error:** Returns 200 even when a handler throws, logging the error. Prevents Stripe from retrying events that will permanently fail (e.g. missing metadata), avoiding webhook backlog.
- **ACH processing state:** ACH payments show a distinct "Payment processing" screen explaining the 2-3 business day settlement timeline, using the `?status=processing` query param on redirect.
- **Surcharge as application_fee_amount:** Platform collects the surcharge via Stripe's application fee mechanism on PaymentIntents. This is the standard Connect approach for transparent fee collection.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- **Pre-existing build failure:** `npm run build` fails during "Collecting page data" phase due to a Next.js webpack/Serwist build trace issue (missing `.nft.json` and `pages-manifest.json`). This is a pre-existing infrastructure issue unrelated to Plan 04 changes. TypeScript compilation (`npx tsc --noEmit`) passes cleanly and the compilation step succeeds. The build failure affects all plans equally and is not caused by these changes.

## User Setup Required

**Environment variables to add:**
- `STRIPE_CONNECT_WEBHOOK_SECRET` -- Stripe Dashboard > Developers > Webhooks > Add endpoint for Connect events > Signing secret
- `STRIPE_WEBHOOK_SECRET` -- Stripe Dashboard > Developers > Webhooks > Add endpoint for platform events > Signing secret

**Stripe webhook configuration:**
1. In Stripe Dashboard, create a webhook endpoint pointing to `{your-domain}/api/webhooks/stripe`
2. Select events: `payment_intent.succeeded`, `payment_intent.payment_failed`, `account.updated`, `charge.refunded`
3. For Connect events, check "Listen to events on Connected accounts"
4. Copy the signing secret(s) to the environment variables above

## Next Phase Readiness
- Payment processing infrastructure complete for Plan 05 (AutoPay / recurring payments)
- Receipt email integration point marked with TODO(Plan-05) in handlePaymentSucceeded
- Webhook handlers ready for additional event types in future plans
- Manual payment recording ready for office workflow integration

## Self-Check: PASSED

- All 6 created files verified on disk
- Commits b57bde0 and 6d11e4b verified in git log
- TypeScript type check passes (no errors in project code)

---
*Phase: 07-billing-payments*
*Completed: 2026-03-12*
