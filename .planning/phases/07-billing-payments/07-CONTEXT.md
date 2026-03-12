# Phase 7: Billing & Payments - Context

**Gathered:** 2026-03-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Invoice customers across multiple billing models (per-stop, flat rate, plus-chemicals, custom), collect payments via Stripe Connect or QuickBooks Payments, handle failed payments with configurable dunning, sync bidirectionally with QuickBooks Online, and provide built-in financial reports. Companies choose their payment stack or use both.

</domain>

<decisions>
## Implementation Decisions

### Billing models & invoicing
- Billing model is a per-customer setting (not per-pool) — office selects when creating/editing customer
- Supported models: per-stop, monthly flat rate, plus-chemicals, custom line items
- Plus-chemicals model: auto-populate chemical line items from service visit dosing data, but office can edit/add/remove before finalizing
- Bulk invoicing: "Generate All Invoices" one-click batch button — creates invoices for all customers due this period, office reviews the batch, then sends all
- Invoices include a billing period range (e.g. "Service period: Mar 1 – Mar 31") with individual stop dates as line items, plus invoice date and due date

### Customer payment flow
- Dual payment access: email link for quick pay (no login required, branded payment page) AND portal for full invoice history/management (Phase 8)
- AutoPay is opt-in per customer — office or customer enables it; saved card/ACH charged automatically on invoice generation with receipt email
- Supported payment methods: credit/debit card, ACH bank transfer (via Stripe), plus manual recording for check and cash payments
- Branded payment page: shows the pool company's logo and brand color — looks like their own billing page, not generic platform branding

### QBO sync behavior
- Conflict resolution: PoolCo wins — PoolCo is the source of truth, QBO gets overwritten on sync
- Synced entities: invoices, payments, and customers (not expenses/income categories)
- Sync timing: real-time auto-sync — every invoice/payment/customer change pushes to QBO immediately
- QBO connection status: displayed on the settings page with connected/disconnected badge and last sync time — not in header or sidebar

### Dunning & collections
- Dunning sequence is fully configurable by the owner — number of retries, days between, and email templates set in settings
- Overdue accounts flagged visually on customer profile and route stops — tech sees the flag, office decides whether to pause service (never auto-paused)
- Payment retries: use Stripe Smart Retries (Stripe optimizes retry timing) — PoolCo handles the dunning email sequence separately
- Collections visibility: both alerts on existing alerts dashboard for immediate attention AND a dedicated AR aging view (30/60/90 days, total outstanding, per-customer breakdown)

### Claude's Discretion
- Stripe Connect onboarding flow UX details
- Exact dunning email template defaults
- QBO OAuth flow implementation details
- Invoice PDF layout refinements (Phase 6 established the base pattern)
- AR aging page layout and filtering
- Surcharge/convenience fee disclosure formatting (must be legally compliant)
- Built-in P&L and revenue report layout

</decisions>

<specifics>
## Specific Ideas

- Payment page should feel like the company's own billing page — customer sees pool company branding, not PoolCo platform branding
- Email-to-pay link should work without login (same pattern as quote approval from Phase 6)
- Bulk invoicing should feel like a one-click operation — generate, review, send, done
- QBO sync should be invisible day-to-day — just works in background, status check on settings page only

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 07-billing-payments*
*Context gathered: 2026-03-12*
