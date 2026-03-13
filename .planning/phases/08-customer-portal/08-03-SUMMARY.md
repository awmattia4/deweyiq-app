---
phase: 08-customer-portal
plan: "03"
subsystem: payments
tags: [stripe, stripe-connect, payment-elements, setup-intent, payment-intent, portal, invoices, react]

# Dependency graph
requires:
  - phase: 08-01
    provides: Portal auth foundation, magic link flow, resolveCustomerId, adminDb portal pattern
  - phase: 07-03
    provides: Stripe Connect setup, getStripe() client, surcharge pattern, connected account payments
  - phase: 07-04
    provides: PaymentIntent pattern, payment_records table, invoice schema with stripe fields

provides:
  - getCustomerInvoices — returns sent/paid invoices with line items and payment history
  - createPortalPaymentIntent — creates Stripe PI on connected account for portal invoice payment
  - createPortalSetupIntent — creates SetupIntent for saving payment methods off-session
  - confirmPaymentMethodUpdate — saves autopay_method_id after successful SetupIntent
  - getCustomerPaymentMethods — lists card and ACH methods from connected Stripe account
  - updateCustomerContactInfo — allows customers to update their phone/email only
  - /portal/invoices page with full billing self-service UX

affects:
  - 08-04 (messages — portal shell, data patterns)
  - 08-05 (service requests — portal patterns)
  - 07-05 (AutoPay — confirmPaymentMethodUpdate enables AutoPay enrollment from portal)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - All portal Stripe ops use { stripeAccount: org.stripe_account_id } on connected account
    - Stripe PI reuse pattern — retrieve existing PI before creating new (avoids orphaned PIs)
    - Stripe loader cache keyed by publishableKey:stripeAccount for connected account per-account loading
    - Portal server actions always use adminDb (customers have no staff-role JWT)
    - Invoice sort by actionability: overdue → unpaid → paid, newest first within group

key-files:
  created:
    - src/app/portal/(portal)/invoices/page.tsx
    - src/components/portal/invoice-list.tsx
    - src/components/portal/invoice-detail.tsx
    - src/components/portal/payment-form.tsx
    - src/components/portal/payment-method-manager.tsx
  modified:
    - src/actions/portal-data.ts

key-decisions:
  - "Portal PI creation includes surcharge for cards (cc_surcharge_pct) — customer sees full card amount upfront, can switch to ACH to avoid fee"
  - "PI reuse pattern: check for existing usable PI on invoice before creating new — avoids orphaned PaymentIntents"
  - "SetupIntent with usage:off_session and automatic_payment_methods — customer saves method for future AutoPay charges without making a payment"
  - "updateCustomerContactInfo allows phone/email only — name/address/billing require contacting company"
  - "Stripe Elements dark theme (night) for portal payment forms — matches portal dark-first design system"
  - "Invoice sort order: overdue > unpaid > paid, newest-first within group — shows most actionable items first"

patterns-established:
  - "Portal Stripe payment: createPortalPaymentIntent → PaymentForm with Elements → ?payment=success redirect handling"
  - "Portal payment method save: createPortalSetupIntent → SetupForm with Elements → confirmPaymentMethodUpdate"
  - "Contact info edit: plain HTML inputs with local state → updateCustomerContactInfo server action on submit"

requirements-completed:
  - PORT-02
  - PORT-03

# Metrics
duration: 10min
completed: 2026-03-13
---

# Phase 8 Plan 03: Customer Portal Invoices & Payments Summary

**Customer self-service billing portal: invoice list with Pay Now via Stripe Elements, SetupIntent-based payment method management, and contact info editor — all on connected Stripe accounts**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-13T17:34:50Z
- **Completed:** 2026-03-13T17:44:50Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Invoice list page sorted by actionability (overdue → unpaid → paid) with expandable line item detail and payment history
- Stripe Elements payment form (PaymentElement) with dark theme, surcharge disclosure, real-time card/ACH method toggle
- SetupIntent-based payment method manager for saving cards/bank accounts for AutoPay enrollment
- Contact info editor allowing customers to update phone/email (restricted from name/address/billing)
- Six new server actions in portal-data.ts covering full billing self-service lifecycle

## Task Commits

1. **Task 1: Invoice and payment server actions** - `0e22ded` (feat)
2. **Task 2: Invoice list, payment form, and payment method manager UI** - `73a0dfa` (feat)

**Plan metadata:** (see final commit below)

## Files Created/Modified

- `src/actions/portal-data.ts` — Added 6 new functions: getCustomerInvoices, createPortalPaymentIntent, createPortalSetupIntent, confirmPaymentMethodUpdate, getCustomerPaymentMethods, updateCustomerContactInfo
- `src/app/portal/(portal)/invoices/page.tsx` — Server component page loading invoices + payment methods + customer contact info
- `src/components/portal/invoice-list.tsx` — Sortable invoice cards with Pay Now flow and inline Stripe payment form
- `src/components/portal/invoice-detail.tsx` — Line items table with totals and payment history
- `src/components/portal/payment-form.tsx` — Stripe Elements PaymentElement form with dark theme, surcharge display, success/error states
- `src/components/portal/payment-method-manager.tsx` — Saved methods list, SetupIntent form, contact info editor

## Decisions Made

- **Portal PI includes surcharge upfront:** `createPortalPaymentIntent` creates the PI with surcharge baked in for card payments. Customer sees the full card amount and can switch to ACH to avoid the fee. This matches the `/pay/[token]` pattern.
- **PI reuse before creation:** Before creating a new PaymentIntent, the action checks if the invoice already has a PI in a reusable state (requires_payment_method, requires_confirmation, requires_action). This prevents orphaned PIs — same pattern as Phase 7 `/pay/[token]`.
- **SetupIntent off_session + automatic_payment_methods:** Allows customers to save any payment method type (card, ACH) in one flow, with the saved method used for future off-session AutoPay charges.
- **Stripe Elements dark theme (night):** Portal uses dark-first design, so payment forms use Stripe's `night` theme with CSS variable overrides for `--card` background and `--foreground` text colors.
- **updateCustomerContactInfo restricted to phone/email:** Name, address, billing model, and payment fields are office-only changes. Customers can self-service their contact details only.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `.next` build directory was in a corrupt state from a previous interrupted build. Resolved by removing the directory and rebuilding clean.
- TypeScript: `pm.us_bank_account.last4` returns `string | null` from Stripe SDK; added `?? "0000"` null coalesce to satisfy `PortalPaymentMethod.last4: string` interface.

## User Setup Required

None - no external service configuration required beyond what was already set up in Phase 7 (Stripe Connect).

## Next Phase Readiness

- Portal invoices page is functional — customers can view invoices, pay, and save payment methods
- Plan 04 (Messages) and Plan 05 (Service Requests) can proceed — portal shell and patterns are stable
- Phase 7-09 (deferred dunning improvements) can use `confirmPaymentMethodUpdate` for portal AutoPay enrollment

---
*Phase: 08-customer-portal*
*Completed: 2026-03-13*
