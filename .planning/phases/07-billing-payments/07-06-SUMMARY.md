---
phase: 07-billing-payments
plan: "06"
subsystem: payments
tags: [quickbooks, oauth2, qbo, sync, webhook, intuit, node-quickbooks]

# Dependency graph
requires:
  - phase: 07-01
    provides: "Invoice schema, billing model, generateInvoiceForCustomer"
  - phase: 07-03
    provides: "Stripe Connect, payment stack selector, org_settings QBO fields"
provides:
  - "QBO client factory with automatic token refresh and advisory lock"
  - "OAuth2 flow for connecting QBO account from settings"
  - "Entity mappers for customer, invoice, and payment sync"
  - "Fire-and-forget QBO sync on every invoice/payment/customer write"
  - "QBO webhook handler for inbound payment notifications"
  - "QboConnectSettings component for settings Billing tab"
affects: [07-07, 07-08, 07-09]

# Tech tracking
tech-stack:
  added: [node-quickbooks, intuit-oauth]
  patterns: [qbo-client-factory, fire-and-forget-sync, advisory-lock-token-refresh, hmac-webhook-verification]

key-files:
  created:
    - src/lib/qbo/client.ts
    - src/lib/qbo/mappers.ts
    - src/actions/qbo-sync.ts
    - src/app/api/connect/qbo/authorize/route.ts
    - src/app/api/connect/qbo/callback/route.ts
    - src/app/api/webhooks/qbo/route.ts
    - src/components/settings/qbo-connect-settings.tsx
    - src/types/node-quickbooks.d.ts
  modified:
    - src/actions/invoices.ts
    - src/actions/billing.ts
    - src/actions/payments.ts
    - src/lib/stripe/webhook-handlers.ts
    - src/components/settings/settings-tabs.tsx
    - src/app/(app)/settings/page.tsx

key-decisions:
  - "adminDb for all sync operations -- QBO sync runs as fire-and-forget side effect, no user session needed for push"
  - "Advisory lock on token refresh uses pg_advisory_xact_lock(hashtext('qbo_refresh_' || orgId)) to prevent concurrent refresh races"
  - "QBO webhook returns 200 immediately and processes asynchronously -- Intuit requires fast response"
  - "PoolCo is source of truth -- QBO customer/invoice webhook events are ignored, only Payment events processed"
  - "QBO sync failure never blocks primary operations -- all sync calls wrapped in try/catch with console.error logging"
  - "CSRF state token stored in httpOnly cookie for OAuth callback validation"

patterns-established:
  - "Fire-and-forget sync pattern: syncXToQbo(id).catch(err => console.error(...))"
  - "QBO entity mapper pattern: mapXToQbo returns plain object matching QBO API shape"
  - "OAuth redirect flow: authorize route generates auth URL, callback route exchanges code for tokens"

requirements-completed: [BILL-06, BILL-10]

# Metrics
duration: 16min
completed: 2026-03-12
---

# Phase 7 Plan 06: QBO Integration Summary

**QuickBooks Online bidirectional sync with OAuth2 connection, entity mappers, real-time push on every write, and webhook handler for inbound payments**

## Performance

- **Duration:** 16 min
- **Started:** 2026-03-12T17:39:56Z
- **Completed:** 2026-03-12T17:55:43Z
- **Tasks:** 2
- **Files modified:** 14

## Accomplishments
- QBO client factory with automatic token refresh using Postgres advisory lock to prevent race conditions
- OAuth2 flow (authorize + callback routes) for connecting QBO from settings page
- Entity mappers for customer, invoice, and payment sync between PoolCo and QBO formats
- Fire-and-forget sync calls wired into invoices.ts, billing.ts, payments.ts, and Stripe webhook handlers
- QBO webhook handler with HMAC-SHA256 verification processes inbound payment notifications
- Settings page Billing tab shows QBO connection status with connect/disconnect UI

## Task Commits

Each task was committed atomically:

1. **Task 1: QBO client, OAuth flow, entity mappers, and type definitions** - `b57bde0` (feat) -- previously committed in 07-04 batch
2. **Task 2: QBO sync actions, webhook handler, and settings UI** - `4c615fe` (feat)

## Files Created/Modified
- `src/lib/qbo/client.ts` - QBO client factory with token refresh and advisory lock
- `src/lib/qbo/mappers.ts` - Entity mappers (customer, invoice, payment) between PoolCo and QBO
- `src/actions/qbo-sync.ts` - Server actions for sync push/pull, disconnect, status
- `src/app/api/connect/qbo/authorize/route.ts` - OAuth2 authorization redirect
- `src/app/api/connect/qbo/callback/route.ts` - OAuth2 callback token exchange
- `src/app/api/webhooks/qbo/route.ts` - QBO webhook handler with HMAC verification
- `src/components/settings/qbo-connect-settings.tsx` - Connection status UI with connect/disconnect
- `src/types/node-quickbooks.d.ts` - TypeScript declarations for node-quickbooks and intuit-oauth
- `src/actions/invoices.ts` - Added syncInvoiceToQbo calls to sendInvoice and finalizeInvoice
- `src/actions/billing.ts` - Added syncInvoiceToQbo call to generateInvoiceForCustomer
- `src/actions/payments.ts` - Added syncPaymentToQbo call to recordManualPayment
- `src/lib/stripe/webhook-handlers.ts` - Added syncPaymentToQbo call to handlePaymentSucceeded
- `src/components/settings/settings-tabs.tsx` - Added QboConnectSettings to Billing tab
- `src/app/(app)/settings/page.tsx` - Fetches QBO status and passes to SettingsTabs

## Decisions Made
- adminDb for all sync operations rather than withRls -- QBO sync runs as a background side effect without user session context
- Advisory lock uses `pg_advisory_xact_lock(hashtext('qbo_refresh_' || orgId))` for deterministic per-org locking
- QBO webhook returns 200 immediately and processes asynchronously via fire-and-forget Promise
- Only QBO Payment events are processed inbound; Customer and Invoice events ignored (PoolCo is source of truth)
- CSRF state token stored in httpOnly cookie with 10-minute TTL for OAuth callback validation
- Task 1 files were already committed in 07-04 batch commit; Task 2 is the new work

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Task 1 files already committed in prior session**
- **Found during:** Task 1
- **Issue:** All Task 1 files (QBO client, mappers, OAuth routes, types, packages) were already committed in `b57bde0` as part of the 07-04 plan execution batch
- **Fix:** Verified files match spec exactly, skipped redundant commit, proceeded to Task 2
- **Files modified:** None (already committed)
- **Verification:** `git diff HEAD -- src/lib/qbo/ src/types/` shows no changes
- **Committed in:** b57bde0 (prior session)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** No impact -- Task 1 work was already done correctly, Task 2 is the net new contribution.

## Issues Encountered
- Pre-existing `.next` build cache caused ENOENT errors on first build attempt; resolved by deleting `.next` directory

## User Setup Required

External services require manual configuration for QBO integration:

**Environment variables to add:**
- `INTUIT_CLIENT_ID` - From Intuit Developer Portal -> My Apps -> Keys & OAuth -> Client ID
- `INTUIT_CLIENT_SECRET` - From Intuit Developer Portal -> My Apps -> Keys & OAuth -> Client Secret
- `INTUIT_REDIRECT_URI` - Set to `{NEXT_PUBLIC_APP_URL}/api/connect/qbo/callback`
- `QBO_WEBHOOK_VERIFIER_TOKEN` - From Intuit Developer Portal -> My Apps -> Webhooks -> Verifier Token
- `QBO_SANDBOX` - Set to `"true"` for sandbox testing, omit for production

**Intuit Developer Portal configuration:**
1. Create an Intuit Developer app at developer.intuit.com
2. Set redirect URI to `{APP_URL}/api/connect/qbo/callback` in Keys & OAuth
3. Configure webhook endpoint URL to `{APP_URL}/api/webhooks/qbo` in Webhooks section

## Next Phase Readiness
- QBO sync infrastructure complete and ready for use
- All invoice/payment writes automatically push to QBO when connected
- Settings page provides full connect/disconnect lifecycle
- Webhook handler processes inbound QBO payment notifications

## Self-Check: PASSED

All 8 created files verified on disk. Both commit hashes (b57bde0, 4c615fe) found in git log.

---
*Phase: 07-billing-payments*
*Completed: 2026-03-12*
