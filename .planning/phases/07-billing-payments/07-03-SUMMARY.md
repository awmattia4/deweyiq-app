---
phase: 07-billing-payments
plan: "03"
subsystem: payments, settings
tags: [stripe, stripe-connect, payment-provider, surcharge, settings-ui]

# Dependency graph
requires:
  - phase: 07-billing-payments
    provides: "org_settings schema extensions (stripe_account_id, payment_provider, cc_surcharge_*)"
provides:
  - "Stripe server-side singleton with lazy initialization"
  - "Connect onboarding API routes (POST onboard, GET return)"
  - "getStripeAccountStatus server action for UI display"
  - "updatePaymentProvider and updateSurchargeSettings server actions"
  - "StripeConnectSettings and PaymentStackSettings UI components"
  - "Billing tab in settings page (owner only)"
affects: [07-04, 07-05, 07-06, 07-07]

# Tech tracking
tech-stack:
  added: []
  patterns: ["lazy Stripe singleton via Proxy to avoid build-time env errors", "radio group payment provider selector", "surcharge percentage validation with Visa 3% cap"]

key-files:
  created:
    - src/lib/stripe/client.ts
    - src/app/api/connect/stripe/onboard/route.ts
    - src/app/api/connect/stripe/return/route.ts
    - src/actions/stripe-connect.ts
    - src/components/settings/stripe-connect-settings.tsx
    - src/components/settings/payment-stack-settings.tsx
  modified:
    - src/components/settings/settings-tabs.tsx
    - src/app/(app)/settings/page.tsx
    - src/actions/company-settings.ts

key-decisions:
  - "Lazy Stripe singleton via Proxy pattern avoids build-time errors when STRIPE_SECRET_KEY not set"
  - "Standard connected accounts (not Express) for maximum merchant control"
  - "Return URL is an API route (GET handler) that checks account status and redirects with query params"
  - "OrgSettings type extended with Phase 7 billing fields and defaults added"
  - "Surcharge stored as decimal (2.99% -> 0.0299), displayed as percentage in UI"

patterns-established:
  - "Lazy Stripe init: getStripe() function with Proxy wrapper for module-level export"
  - "Stripe Connect onboarding: POST creates account + link, GET return verifies and redirects"
  - "Settings billing tab: owner-only tab with Stripe Connect and payment stack sections"

requirements-completed: [BILL-10, BILL-08]

# Metrics
duration: 8min
completed: 2026-03-12
---

# Phase 7 Plan 03: Stripe Connect Onboarding & Payment Settings Summary

**Stripe Connect onboarding flow with lazy-initialized singleton, payment provider selector (Stripe/QBO/Both/None), and credit card surcharge configuration with Visa 3% cap and legal disclaimer**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-12T17:21:29Z
- **Completed:** 2026-03-12T17:29:28Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Stripe server-side singleton with lazy initialization that avoids build-time errors when API key is not set
- Complete Connect onboarding flow: POST creates Standard account + account link, GET return route verifies onboarding status
- Settings page Billing tab with Stripe Connect status display, payment provider radio selector, and surcharge toggle with legal disclaimer
- Server actions for Stripe account status, payment provider update, and surcharge configuration (all owner-only)

## Task Commits

Each task was committed atomically:

1. **Task 1: Stripe singleton, Connect onboarding API routes, and account status action** - `20ba276` (feat)
2. **Task 2: Billing settings tab with Stripe Connect UI, payment stack selector, and surcharge config** - `fcdb820` (feat)

## Files Created/Modified
- `src/lib/stripe/client.ts` - Lazy-initialized Stripe singleton via Proxy pattern
- `src/app/api/connect/stripe/onboard/route.ts` - POST handler creates connected account and account link URL
- `src/app/api/connect/stripe/return/route.ts` - GET handler checks onboarding status, redirects to settings
- `src/actions/stripe-connect.ts` - Server actions: getStripeAccountStatus, updatePaymentProvider, updateSurchargeSettings
- `src/components/settings/stripe-connect-settings.tsx` - Stripe Connect onboarding UI with status display and toasts
- `src/components/settings/payment-stack-settings.tsx` - Payment provider radio group and surcharge config with legal disclaimer
- `src/components/settings/settings-tabs.tsx` - Added Billing tab (owner only) with new component imports and props
- `src/app/(app)/settings/page.tsx` - Fetches stripe status in parallel, passes billing props to SettingsTabs
- `src/actions/company-settings.ts` - OrgSettings type and DEFAULT_SETTINGS extended with Phase 7 billing fields

## Decisions Made
- Lazy Stripe singleton via Proxy pattern: avoids `next build` failure when STRIPE_SECRET_KEY is not set (happens in CI/CD or first setup); getStripe() creates instance on first access
- Standard connected accounts (type: "standard") for maximum merchant control over their Stripe dashboard
- Return URL is an API route (not a page) that checks account status with Stripe and redirects to /settings with query params for toast notifications
- Surcharge stored as decimal fraction (2.99% -> "0.0299") in DB, displayed as percentage (2.99) in UI
- OrgSettings type extended with all Phase 7 billing fields to support settings page data flow

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Stripe singleton caused build failure**
- **Found during:** Task 1 (build verification)
- **Issue:** `new Stripe(process.env.STRIPE_SECRET_KEY!)` at module scope throws at build time when env var is not set, because Next.js evaluates API route modules during `next build`
- **Fix:** Replaced eager initialization with lazy getStripe() function + Proxy wrapper that defers Stripe construction to first runtime access
- **Files modified:** src/lib/stripe/client.ts
- **Verification:** `npm run build` succeeds without STRIPE_SECRET_KEY in build env
- **Committed in:** 20ba276 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Essential fix for build pipeline. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviation above.

## User Setup Required

Stripe API keys are required for Connect onboarding to work at runtime:
- `STRIPE_SECRET_KEY` - Stripe Dashboard > Developers > API keys > Secret key
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` - Stripe Dashboard > Developers > API keys > Publishable key (needed by future plans for client-side Elements)

## Next Phase Readiness
- Stripe singleton ready for all future payment processing (Plans 04-07)
- Connect onboarding flow complete for owner to link their Stripe account
- Payment provider selection persisted for invoice delivery and payment flow routing
- Surcharge settings ready for invoice total calculations in Plan 04

## Self-Check: PASSED

- All 6 created files verified on disk
- Commits 20ba276 and fcdb820 verified in git log
- `npm run build` succeeds
- TypeScript type check passes (no errors in project code)

---
*Phase: 07-billing-payments*
*Completed: 2026-03-12*
