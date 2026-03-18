# Phase 11: Subscription Billing - Context

**Gathered:** 2026-03-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Pool companies pay for using the PoolCo SaaS platform via tiered subscriptions based on their pool count. All features are included in every tier — pricing scales with usage (number of pools managed). Stripe handles payment processing, subscription lifecycle, and payment method storage. This phase covers the entire subscription lifecycle: signup trial, checkout, plan management, usage enforcement, failed payments, and account restriction/recovery.

This is the SOFTWARE's billing system (billing pool companies for using the platform), NOT Phase 7 (pool companies billing their end customers for pool service).

</domain>

<decisions>
## Implementation Decisions

### Tier structure
- Starter: 1–79 pools ($X/mo or $X*10/yr)
- Pro: 80–200 pools ($Y/mo or $Y*10/yr)
- Enterprise: 200+ pools ($Z/mo or $Z*10/yr)
- All features included in all tiers — no feature gating, purely pool-count pricing
- Annual billing = 10 months (2 months free)

### Payment processing
- Stripe for everything: Checkout Sessions, Customer Portal, webhooks
- No custom payment form — Stripe Checkout handles PCI compliance, 3DS, Apple Pay
- Stripe Customer Portal for payment method management and invoice downloads
- Local `subscriptions` table synced via webhooks (not live Stripe API on every page load)

### Trial period
- 14-day free trial, no credit card required (reduces signup friction)
- Stripe-native trial on the subscription object (Stripe handles reminders)
- Trial expiry without payment: full-screen blocker, app becomes read-only

### Pool count enforcement
- Soft enforcement with 7-day grace period when limit exceeded
- During grace: show warning banner, allow new pool creation
- After grace: block new pool creation only (existing pools remain functional)
- No auto-downgrade when pools are deleted below threshold (manual only)

### Failed payment handling
- 7-day grace period from first failure
- Stripe Smart Retries handle automatic retry schedule
- Day 7: account enters restricted mode (read-only, full-screen blocker)
- Payment method update + successful charge lifts all restrictions

### Claude's Discretion
- Tier pricing amounts (placeholder — owner sets actual prices in Stripe Dashboard)
- Trial banner dismissibility rules and visual treatment
- Invoice history pagination
- Webhook event deduplication strategy
- Account restriction enforcement granularity (which write operations to block)

</decisions>

<specifics>
## Specific Ideas

- Trial banner visible to ALL roles (not just owner) so techs understand if service is about to stop
- Account restriction is read-only (can view all data) not full lockout — owner needs to see data to decide to pay
- Billing page is owner-only (other roles don't see it in nav)
- Use Stripe Customer Portal for payment methods — never handle raw card data in our app
- Invoice list on billing page fetches directly from Stripe API (not cached) since billing page is rarely visited

</specifics>

<deferred>
## Deferred Ideas

- Usage-based pricing (per-stop charges) — future enhancement if needed
- Multi-currency support — US-only initially
- Coupon/discount codes — can add via Stripe Dashboard later without code changes
- Reseller/white-label billing — out of scope

</deferred>

---

*Phase: 11-subscription-billing*
*Context gathered: 2026-03-09*
