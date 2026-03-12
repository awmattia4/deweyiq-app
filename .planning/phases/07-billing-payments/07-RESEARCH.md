# Phase 7: Billing & Payments - Research

**Researched:** 2026-03-12
**Domain:** Stripe Connect, QuickBooks Online API, Invoice lifecycle, Dunning, AR aging
**Confidence:** HIGH (Stripe), MEDIUM (QBO), HIGH (codebase patterns)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Billing models & invoicing**
- Billing model is a per-customer setting (not per-pool) — office selects when creating/editing customer
- Supported models: per-stop, monthly flat rate, plus-chemicals, custom line items
- Plus-chemicals model: auto-populate chemical line items from service visit dosing data, but office can edit/add/remove before finalizing
- Bulk invoicing: "Generate All Invoices" one-click batch button — creates invoices for all customers due this period, office reviews the batch, then sends all
- Invoices include a billing period range (e.g. "Service period: Mar 1 – Mar 31") with individual stop dates as line items, plus invoice date and due date

**Customer payment flow**
- Dual payment access: email link for quick pay (no login required, branded payment page) AND portal for full invoice history/management (Phase 8)
- Invoice delivery via email AND SMS — SMS sends a short text with payment link (uses existing Twilio infrastructure from Phase 5). SMS option only shown if customer has a phone number on file.
- AutoPay is opt-in per customer — office or customer enables it; saved card/ACH charged automatically on invoice generation with receipt email
- Supported payment methods: credit/debit card, ACH bank transfer (via Stripe), plus manual recording for check and cash payments
- Branded payment page: shows the pool company's logo and brand color — looks like their own billing page, not generic platform branding

**Quote delivery via SMS**
- Add SMS delivery option for quotes (Phase 6 quotes currently email-only) — customer receives text with quote approval link
- Same Twilio infrastructure as pre-arrival notifications and invoice SMS
- Office chooses email, SMS, or both when sending a quote — SMS option only available if customer has a phone number on file

**QBO sync behavior**
- Conflict resolution: PoolCo wins — PoolCo is the source of truth, QBO gets overwritten on sync
- Synced entities: invoices, payments, and customers (not expenses/income categories)
- Sync timing: real-time auto-sync — every invoice/payment/customer change pushes to QBO immediately
- QBO connection status: displayed on the settings page with connected/disconnected badge and last sync time — not in header or sidebar

**Dunning & collections**
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

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| BILL-01 | Office can create invoices with multiple billing models (per-stop, monthly flat rate, per-chemical, custom line items) | Schema extension: add `billing_model`, `billing_period_start/end` to invoices; `service_visits.chemistry_readings` JSONB drives plus-chemicals auto-population |
| BILL-02 | System supports bulk invoice generation (batch invoicing for all customers) | Single server action queries all active customers due in period by billing_model, creates draft invoices atomically; office reviews batch before sending |
| BILL-03 | Customers can pay invoices online via credit card or ACH — through Stripe Connect or QuickBooks Payments | Stripe Payment Element (react-stripe-js) on public /pay/[token] route; PaymentIntent created server-side using connected account; ACH uses bank_transfer payment method type |
| BILL-04 | System supports AutoPay — customers can save payment method and auto-charge on invoice generation | Stripe SetupIntent saves card/ACH to Stripe Customer per org's connected account; off-session PaymentIntent on invoice finalization; webhook confirms settlement |
| BILL-05 | System retries failed payments with configurable dunning schedule | Stripe Smart Retries handle card retries automatically; PoolCo dunning email sequence triggered by `payment_intent.payment_failed` webhook via Supabase pg_cron daily scan |
| BILL-06 | System provides bi-directional sync with QuickBooks Online (customers, invoices, payments, expenses) | `intuit-oauth` + `node-quickbooks` for OAuth2 and API calls; QBO webhooks for inbound changes; real-time push on every PoolCo write |
| BILL-07 | System includes built-in accounting — P&L, expense tracking, revenue reporting, bank reconciliation | Postgres SQL queries over invoices/payments tables; AR aging report uses CASE bucketing (30/60/90 days); P&L derived from invoices (revenue) vs manual expense entries |
| BILL-08 | System supports surcharging / convenience fee passthrough on credit card payments, configurable per payment method | application_fee_amount on PaymentIntent (or separate line item before charging); must display disclosure before payment; state-specific legal compliance required |
| BILL-09 | System provides tax prep exports and financial reporting | CSV export of invoices + payments within date range; P&L view in-app |
| BILL-10 | Companies choose their payment stack — Stripe Connect for direct processing, QuickBooks Payments via QBO sync, or both simultaneously | org_settings payment_provider field: `stripe` / `qbo` / `both`; invoice payment routing logic branches on provider setting |
</phase_requirements>

---

## Summary

Phase 7 integrates payment collection, automated billing, QuickBooks sync, and financial reporting into the existing pool management platform. The technical core is two-pronged: **Stripe Connect** for direct payment processing and **QuickBooks Online API** for accounting sync. These can operate independently or together.

The existing codebase provides strong foundations. Phase 6 delivered: `invoices` and `invoice_line_items` tables (with RLS), `@react-pdf/renderer` for PDF generation, the `jose` JWT token pattern for public no-login pages (`/quote/[token]`), `adminDb` for unauthenticated access, and `resend` + Twilio edge functions for notifications. Phase 7 extends these rather than replacing them.

The most complex technical area is the Stripe Connect integration, specifically: storing per-org connected account IDs, routing PaymentIntents through connected accounts using `application_fee_amount`, handling both connected-account and platform webhooks, and implementing SetupIntent → off-session charge for AutoPay. QBO integration is less complex at the API level but requires careful OAuth token refresh management (access tokens expire in 1 hour, refresh tokens in 100 days).

**Primary recommendation:** Build the payment flow first (Stripe Connect onboarding → payment page → webhook), then AutoPay, then QBO sync, then dunning, then reporting. Each is independently deployable and testable.

---

## Standard Stack

### Core (new additions)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `stripe` | 20.4.1 | Stripe Node.js SDK — server-side PaymentIntent, SetupIntent, Connect account creation, webhook verification | Official Stripe SDK, full TypeScript, active maintenance |
| `@stripe/react-stripe-js` | 5.6.1 | React Payment Element, Elements provider, useStripe/useElements hooks | Official React wrapper for Stripe.js |
| `@stripe/stripe-js` | 8.9.0 | Browser-side Stripe.js loader — required peer dep for react-stripe-js | Official browser SDK with TypeScript types |
| `node-quickbooks` | 2.0.48 | QBO REST API client — create/update Invoice, Payment, Customer entities | Community standard for QBO Node.js integration; last published March 2026 |
| `intuit-oauth` | 4.2.2 | Intuit OAuth2 client — authorization code flow, token refresh | Official Intuit library for OAuth2 |

### Already in Project (used by this phase)

| Library | Version | Purpose |
|---------|---------|---------|
| `resend` | 6.9.3 | Transactional email — invoice delivery, dunning emails, payment receipts |
| `jose` | (bundled with Next.js) | JWT signing for payment page tokens (same pattern as quote tokens) |
| `@react-pdf/renderer` | 4.3.2 | Invoice PDF generation (already used for quotes) |
| `zod` | 4.3.6 | Input validation for payment amounts, billing config |

### Supabase Services Used

| Service | Purpose |
|---------|---------|
| `pg_cron` | Daily dunning scan — checks overdue invoices and fires email sequence steps |
| Supabase Edge Functions | Stripe webhook receiver, QBO webhook receiver, dunning email dispatch |
| Supabase Storage | Already hosts org logos — used by branded payment page |

**Installation:**
```bash
npm install stripe @stripe/react-stripe-js @stripe/stripe-js node-quickbooks intuit-oauth
```

**Note on TypeScript:** `node-quickbooks` does not include native TypeScript types. Create a local `src/types/node-quickbooks.d.ts` or use `any` casts at the API boundary. The `intuit-oauth` package has adequate types. `stripe` SDK has excellent TypeScript support throughout.

---

## Architecture Patterns

### Recommended New Files/Structure

```
src/
├── app/
│   ├── pay/[token]/                  # Public payment page (no login, JWT gated)
│   │   └── page.tsx
│   ├── (app)/
│   │   ├── invoices/                 # Invoice list + bulk actions
│   │   │   └── page.tsx
│   │   ├── reports/                  # AR aging, P&L, exports
│   │   │   └── page.tsx
│   │   └── settings/                 # (existing) — add Stripe Connect + QBO sections
├── api/
│   ├── webhooks/
│   │   ├── stripe/route.ts           # Stripe webhook handler
│   │   └── qbo/route.ts              # QBO webhook handler
│   ├── pay/
│   │   └── [token]/
│   │       ├── intent/route.ts       # Create PaymentIntent for payment page
│   │       └── setup/route.ts        # Create SetupIntent for saving payment method
│   └── connect/
│       └── stripe/
│           └── onboard/route.ts      # Generate Stripe Connect account link
├── actions/
│   ├── billing.ts                    # Billing model logic, invoice generation
│   ├── payments.ts                   # Stripe payment operations, AutoPay charge
│   ├── qbo-sync.ts                   # QBO push/pull operations
│   └── dunning.ts                    # Dunning sequence logic
├── lib/
│   ├── stripe/
│   │   ├── client.ts                 # Stripe instance (singleton)
│   │   └── webhook-handlers.ts       # Event handler functions
│   ├── qbo/
│   │   ├── client.ts                 # QBO client factory with token refresh
│   │   └── mappers.ts                # PoolCo entity ↔ QBO entity mapping
│   └── pay-token.ts                  # JWT sign/verify for /pay/[token] pages
└── db/schema/
    ├── payments.ts                   # NEW: payment_records table
    ├── dunning-configs.ts            # NEW: dunning_config table (per-org)
    └── (migrations)
```

### Pattern 1: Stripe Connect Per-Org Account Storage

**What:** Each org that connects Stripe gets one entry in `org_settings` with their `stripe_account_id` (`acct_*`) and a `stripe_customer_id` per end-customer in the `customers` table.

**When to use:** Every PaymentIntent, SetupIntent, and refund uses the org's `stripe_account_id`.

```typescript
// Source: https://docs.stripe.com/connect/direct-charges
// Creating a PaymentIntent on behalf of a connected account (direct charge)
const paymentIntent = await stripe.paymentIntents.create(
  {
    amount: totalCents,
    currency: "usd",
    customer: stripeCustomerId,        // customer in the connected account's namespace
    payment_method_types: ["card", "us_bank_account"],
    setup_future_usage: "off_session", // save for AutoPay
    application_fee_amount: surchargeAmountCents, // platform fee (for surcharge passthrough)
    metadata: { invoice_id: invoiceId, org_id: orgId },
  },
  {
    stripeAccount: connectedAccountId, // route to org's Stripe account
  }
)
```

**Schema additions to `org_settings`:**
```sql
stripe_account_id        text,             -- acct_* from Stripe Connect
stripe_onboarding_done   boolean default false,
qbo_realm_id             text,             -- QBO company ID
qbo_access_token         text,             -- encrypted, expires in 1 hour
qbo_refresh_token        text,             -- encrypted, expires in 100 days
qbo_token_expires_at     timestamptz,
qbo_last_sync_at         timestamptz,
qbo_connected            boolean default false,
payment_provider         text default 'stripe', -- 'stripe' | 'qbo' | 'both'
cc_surcharge_pct         numeric(5,4),     -- e.g. 0.0299 for 2.99%
cc_surcharge_enabled     boolean default false,
```

**Schema additions to `customers`:**
```sql
billing_model      text,           -- 'per_stop' | 'flat_rate' | 'plus_chemicals' | 'custom'
flat_rate_amount   numeric(10,2),  -- used when billing_model = 'flat_rate'
stripe_customer_id text,           -- per connected account
autopay_enabled    boolean default false,
autopay_method_id  text,           -- Stripe PaymentMethod ID
qbo_customer_id    text,           -- QBO Customer ref ID
overdue_balance    numeric(10,2),  -- denormalized for quick flag display
```

### Pattern 2: Invoice Token for Public Payment Page

**What:** Same JWT pattern as Phase 6 quote approval. Token signed with `INVOICE_TOKEN_SECRET`, contains `invoiceId`. Public route `/pay/[token]` uses `adminDb` — no Supabase auth session.

```typescript
// Source: established pattern from src/lib/quotes/quote-token.ts
// New file: src/lib/pay-token.ts
import { SignJWT, jwtVerify, type JWTPayload } from "jose"

interface PayTokenPayload extends JWTPayload {
  invoiceId: string
}

export async function signPayToken(invoiceId: string): Promise<string> {
  return new SignJWT({ invoiceId })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("365d")  // longer than invoice lifecycle
    .sign(getSecretKey())
}

export async function verifyPayToken(token: string): Promise<PayTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey())
    return payload as PayTokenPayload
  } catch {
    return null
  }
}
```

### Pattern 3: Stripe Webhook Handler (App Router)

**What:** Stripe webhooks require the raw body (not JSON-parsed) for signature verification. In Next.js App Router, use `req.text()` before verification.

```typescript
// Source: https://docs.stripe.com/webhooks
// src/app/api/webhooks/stripe/route.ts
import Stripe from "stripe"
import { stripe } from "@/lib/stripe/client"

export const config = { api: { bodyParser: false } } // not needed in App Router

export async function POST(req: Request) {
  const body = await req.text()  // MUST be text(), not json()
  const sig = req.headers.get("stripe-signature")!

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err) {
    return new Response(`Webhook Error: ${err}`, { status: 400 })
  }

  // Route to handler
  switch (event.type) {
    case "payment_intent.succeeded":
      await handlePaymentSucceeded(event.data.object as Stripe.PaymentIntent)
      break
    case "payment_intent.payment_failed":
      await handlePaymentFailed(event.data.object as Stripe.PaymentIntent)
      break
    case "account.updated":
      await handleAccountUpdated(event.data.object as Stripe.Account, event.account!)
      break
  }
  return new Response(null, { status: 200 })
}
```

**CRITICAL:** For Connect webhooks listening to events on connected accounts, set `connect: true` in Stripe dashboard webhook config AND use a separate webhook signing secret for Connect events.

### Pattern 4: AutoPay — SetupIntent → Off-Session Charge

**What:** Two-step flow: (1) customer saves payment method via SetupIntent on the payment page; (2) office/system charges saved method off-session on invoice generation.

```typescript
// Step 1: Save payment method (customer on payment page)
// Source: https://docs.stripe.com/payments/save-and-reuse
const setupIntent = await stripe.setupIntents.create(
  {
    customer: stripeCustomerId,
    usage: "off_session",
    payment_method_types: ["card", "us_bank_account"],
  },
  { stripeAccount: connectedAccountId }
)

// Step 2: Charge saved method (server-side, on invoice finalization)
const paymentIntent = await stripe.paymentIntents.create(
  {
    amount: totalCents,
    currency: "usd",
    customer: stripeCustomerId,
    payment_method: savedPaymentMethodId,
    off_session: true,
    confirm: true,
    metadata: { invoice_id: invoiceId },
  },
  { stripeAccount: connectedAccountId }
)

// Mark invoice paid ONLY after webhook confirms settlement — not inline
```

**CRITICAL:** Do NOT mark invoice as paid immediately after creating the PaymentIntent. Only mark paid after receiving `payment_intent.succeeded` webhook. ACH bank transfers take 1-3 business days — the webhook fires when funds actually arrive.

### Pattern 5: QBO Real-Time Sync Push

**What:** Every time a PoolCo write modifies a customer, invoice, or payment, push to QBO immediately. Token refresh handled transparently.

```typescript
// Source: node-quickbooks npm, intuit-oauth npm
// src/lib/qbo/client.ts
import OAuthClient from "intuit-oauth"
import QuickBooks from "node-quickbooks"

export async function getQboClient(orgId: string) {
  // 1. Load tokens from org_settings (decrypted)
  // 2. Refresh if expired (access token expires in 1 hour)
  // 3. Return QuickBooks client
  const settings = await getOrgQboSettings(orgId)

  const oauthClient = new OAuthClient({
    clientId: process.env.INTUIT_CLIENT_ID!,
    clientSecret: process.env.INTUIT_CLIENT_SECRET!,
    environment: "production",
    redirectUri: process.env.INTUIT_REDIRECT_URI!,
  })

  if (Date.now() > settings.qbo_token_expires_at.getTime() - 60_000) {
    // Refresh — ALWAYS store the NEW refresh token returned
    const authResponse = await oauthClient.refreshUsingToken(settings.qbo_refresh_token)
    await updateOrgQboTokens(orgId, authResponse)
  }

  return new QuickBooks(
    process.env.INTUIT_CLIENT_ID!,
    process.env.INTUIT_CLIENT_SECRET!,
    settings.qbo_access_token,
    false, // no token secret for OAuth2
    settings.qbo_realm_id,
    false, // sandbox = false
    false, // debug = false
    null,  // minorversion
    "2.0",
    settings.qbo_refresh_token
  )
}
```

**CRITICAL QBO TOKEN PITFALL:** Always store the NEW refresh token returned on every refresh call. The old refresh token is invalidated immediately. If you discard the new refresh token, the integration goes permanently offline until the user re-authenticates.

### Pattern 6: AR Aging Query

**What:** SQL query bucketing unpaid invoices into 30/60/90 day bands.

```sql
-- Source: standard AR aging pattern, built over local invoices table
SELECT
  c.id          AS customer_id,
  c.full_name   AS customer_name,
  i.id          AS invoice_id,
  i.invoice_number,
  i.total,
  i.issued_at,
  CURRENT_DATE - i.issued_at::date AS days_overdue,
  CASE
    WHEN i.issued_at::date > CURRENT_DATE - INTERVAL '30 days' THEN 'current'
    WHEN i.issued_at::date > CURRENT_DATE - INTERVAL '60 days' THEN '1_30'
    WHEN i.issued_at::date > CURRENT_DATE - INTERVAL '90 days' THEN '31_60'
    ELSE '90_plus'
  END AS aging_bucket
FROM invoices i
JOIN customers c ON c.id = i.customer_id
WHERE i.org_id = $1
  AND i.status IN ('sent', 'overdue')
  AND i.paid_at IS NULL
ORDER BY days_overdue DESC;
```

### Anti-Patterns to Avoid

- **Marking invoice paid inline after PaymentIntent creation:** ACH and some cards require async settlement. Always wait for `payment_intent.succeeded` webhook.
- **Discarding the new QBO refresh token:** Permanently breaks the integration. Always persist the latest refresh token.
- **Using oklch() colors in PDF or Stripe appearance:** `@react-pdf/renderer` and Stripe Appearance API require hex colors.
- **Correlated subqueries inside `withRls` transactions:** Use LEFT JOIN instead (established MEMORY.md pattern).
- **Storing raw Stripe/QBO secrets in `org_settings` as plaintext:** Encrypt QBO tokens at rest using a server-side AES key (or Supabase Vault).
- **Using Stripe Smart Retries for standalone PaymentIntents:** Smart Retries are Stripe Billing only (subscriptions/invoices). For standalone PaymentIntents, implement retry logic manually using `payment_intent.payment_failed` webhook + pg_cron daily scan.
- **Reusing the same dynamic route slug at the same directory level:** MEMORY.md pitfall — `api/invoices/[id]/pdf` and `api/pay/[token]/intent` must NOT be siblings under `api/[something]`. Keep `/pay/[token]` at the root app level.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Payment UI (card input, bank auth) | Custom card form | `@stripe/react-stripe-js` Payment Element | PCI compliance, 3DS/SCA handling, 100+ payment methods, ACH micro-deposit verification |
| OAuth2 token exchange with QBO | Manual token request | `intuit-oauth` | Handles code exchange, refresh, error parsing; edge cases in OAuth2 are numerous |
| QBO API entity CRUD | Raw fetch to QBO REST API | `node-quickbooks` | Already maps QBO entity shapes, handles minor version, error wrapping |
| Webhook signature verification | Manual HMAC check | `stripe.webhooks.constructEvent()` | Stripe's built-in handles timing attacks, encoding edge cases |
| Surcharge state-law compliance | Custom legal research | Display disclosure before payment + let org confirm compliance per state | State laws change; platform responsibility is disclosure, not legal advice |
| Invoice PDF | Custom HTML-to-PDF | `@react-pdf/renderer` (already in project) | Consistent with Phase 6 quote PDF patterns |
| Scheduled dunning jobs | External cron service | Supabase `pg_cron` + Edge Function | Already available in Supabase stack; no new infrastructure |

**Key insight:** Payment UI is where security and compliance are most critical. Stripe's Payment Element handles PCI scope, 3D Secure, card brand rules, and ACH micro-deposit flows — none of these should be custom-built.

---

## Common Pitfalls

### Pitfall 1: Paying Before Webhook Confirms Settlement

**What goes wrong:** Invoice marked "paid" immediately after `stripe.paymentIntents.create()` succeeds. ACH transfers take 1-3 business days. `payment_intent.succeeded` fires when funds arrive, not when the intent is created.

**Why it happens:** Developers assume a successful API call = payment completed, which is true for cards but NOT for ACH bank transfers or some international payment methods.

**How to avoid:** Invoice status stays "sent" after creating a PaymentIntent. Only transition to "paid" inside the `payment_intent.succeeded` webhook handler. Store `stripe_payment_intent_id` on the invoice for idempotency.

**Warning signs:** ACH payments showing as paid immediately; `paid_at` timestamps matching invoice creation times (not future dates).

### Pitfall 2: QBO Refresh Token Overwrite Race Condition

**What goes wrong:** Two concurrent QBO operations both check token expiry, both find it expired, both call refresh, but only one stores the new refresh token — the other stores an already-invalidated token.

**Why it happens:** Real-time sync means multiple server actions can fire simultaneously (customer update + invoice create in same request cycle).

**How to avoid:** Use a Postgres advisory lock or atomic UPDATE...RETURNING on the `org_settings` row before token refresh. Alternative: queue QBO operations serially via a simple job table.

**Warning signs:** QBO integration going offline after a period of heavy usage; "Token has expired" errors despite recent successful syncs.

### Pitfall 3: Connect Webhook vs. Platform Webhook Confusion

**What goes wrong:** Stripe sends two distinct webhook streams: events on your platform account and events on connected accounts. Using the wrong signing secret causes signature verification failure.

**Why it happens:** Connect setup requires two separate webhook endpoints with two separate signing secrets. Many developers only configure one.

**How to avoid:** Configure two webhook endpoints in Stripe dashboard: one standard (platform events like `account.updated`) and one Connect (checked "Events on Connected accounts" for `payment_intent.*` events). Store both secrets in env vars: `STRIPE_WEBHOOK_SECRET` and `STRIPE_CONNECT_WEBHOOK_SECRET`.

**Warning signs:** 400 errors from webhook handler; Stripe logs showing delivery failures on connected account events.

### Pitfall 4: Stripe Smart Retries Only Work for Stripe Billing

**What goes wrong:** Enabling Smart Retries in Stripe dashboard has no effect on standalone PaymentIntents (the model used here). Failed AutoPay charges are never retried.

**Why it happens:** Smart Retries is a Stripe Billing subscription feature. Direct PaymentIntents don't participate.

**How to avoid:** Implement custom retry logic: on `payment_intent.payment_failed`, record the failure in a `payment_failures` table with attempt_count. A `pg_cron` daily job scans for invoices meeting retry criteria and re-attempts via `stripe.paymentIntents.create()` with `off_session: true`.

**Warning signs:** Failed payments never being retried despite Smart Retries being enabled.

### Pitfall 5: Surcharge Disclosure is a Legal Requirement

**What goes wrong:** Surcharge added to payment total without clear disclosure before the customer confirms. This violates card network rules and US state laws.

**Why it happens:** Developers add the surcharge to the PaymentIntent amount without updating the payment page UI first.

**How to avoid:** Show surcharge amount explicitly on the payment page before the payment form. Add a separate line item in the invoice for the surcharge. Four US states (CT, ME, MA, CA) prohibit surcharges entirely — implement a per-customer location check or make surcharges opt-in per state. Cap at 3% (Visa limit).

**Warning signs:** Customer complaints; card network compliance violations.

### Pitfall 6: `next_invoice_number` Counter Race Condition

**What goes wrong:** Bulk invoice generation (all customers at once) creates race condition on `next_invoice_number` in `org_settings`. Multiple server actions read the same counter value and generate duplicate invoice numbers.

**Why it happens:** Phase 6 uses `adminDb` for atomic counter increment via `FOR UPDATE` lock — but if bulk generation spawns concurrent promises, all read before any write.

**How to avoid:** Use the existing `adminDb` pattern with `SELECT ... FOR UPDATE` on `org_settings`. For bulk generation, generate all invoice numbers in a single transaction by incrementing the counter by N and assigning sequential values. Never run `Promise.all` over individual invoice creation if each one touches the counter.

**Warning signs:** Duplicate invoice numbers; `unique constraint violation` errors during bulk generation.

### Pitfall 7: `plus_chemicals` Data Availability

**What goes wrong:** When generating a plus-chemicals invoice, `service_visits.chemistry_readings` JSONB field may be null for older visits or if the tech didn't record chemicals.

**Why it happens:** `chemistry_readings` was added in Phase 3 and is nullable. Visits before Phase 3 don't have it.

**How to avoid:** `plus_chemicals` invoice generation must handle null/missing chemistry data gracefully — show an empty line items list (not error) and let office fill in manually. Never block invoice creation because no dosing data exists.

**Warning signs:** Invoice generation failing for long-term customers with pre-Phase 3 service history.

---

## Code Examples

### Stripe Connect Onboarding

```typescript
// Source: https://docs.stripe.com/connect/marketplace/tasks/onboard
// src/app/api/connect/stripe/onboard/route.ts
export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (user?.role !== "owner") return new Response("Forbidden", { status: 403 })

  // 1. Create connected account (once per org)
  let accountId = await getOrgStripeAccountId(user.org_id)
  if (!accountId) {
    const account = await stripe.accounts.create({ type: "standard" })
    accountId = account.id
    await saveOrgStripeAccountId(user.org_id, accountId)
  }

  // 2. Generate account link (single-use, expires quickly)
  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings?stripe=refresh`,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings?stripe=success`,
    type: "account_onboarding",
  })

  return Response.json({ url: accountLink.url })
}
```

### QBO OAuth2 Flow

```typescript
// Source: https://github.com/intuit/oauth-jsclient
// src/app/api/connect/qbo/callback/route.ts
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get("code")!
  const realmId = searchParams.get("realmId")!

  const oauthClient = new OAuthClient({ /* config */ })
  const authResponse = await oauthClient.createToken(req.url)
  const tokens = authResponse.getJson()

  await adminDb.update(orgSettings)
    .set({
      qbo_access_token: tokens.access_token,   // ALWAYS store new tokens
      qbo_refresh_token: tokens.refresh_token,  // refresh token CHANGES on every refresh
      qbo_token_expires_at: new Date(Date.now() + tokens.expires_in * 1000),
      qbo_realm_id: realmId,
      qbo_connected: true,
      qbo_last_sync_at: new Date(),
    })
    .where(eq(orgSettings.org_id, orgId))
}
```

### Stripe Appearance API for Branding

```typescript
// Source: https://docs.stripe.com/elements/appearance-api
// Applied to Elements provider on /pay/[token] page
const appearance: StripeElementsOptions["appearance"] = {
  theme: "stripe",
  variables: {
    colorPrimary: org.brand_color ?? "#3b82f6",  // hex — NO oklch()
    colorBackground: "#ffffff",
    colorText: "#111827",
    fontFamily: "system-ui, sans-serif",
    borderRadius: "8px",
  },
}

// Pass to Elements provider
<Elements stripe={stripePromise} options={{ clientSecret, appearance }}>
  <PaymentElement />
</Elements>
```

### Plus-Chemicals Auto-Population

```typescript
// src/actions/billing.ts
// Auto-populate chemical line items from service_visits.chemistry_readings
export async function getPlusChemicalsLineItems(
  customerId: string,
  periodStart: Date,
  periodEnd: Date,
  orgId: string
): Promise<DraftLineItem[]> {
  // Query all completed visits in billing period for this customer
  const visits = await withRls(token, (db) =>
    db.select({
      visited_at: serviceVisits.visited_at,
      chemistry_readings: serviceVisits.chemistry_readings,
    })
    .from(serviceVisits)
    .where(
      and(
        eq(serviceVisits.customer_id, customerId),
        eq(serviceVisits.org_id, orgId),
        gte(serviceVisits.visited_at, periodStart),
        lte(serviceVisits.visited_at, periodEnd),
        eq(serviceVisits.status, "complete"),
      )
    )
  )

  const lineItems: DraftLineItem[] = []
  for (const visit of visits) {
    const readings = visit.chemistry_readings as ChemistryReadings | null
    if (!readings?.dosing) continue
    for (const [chemical, dose] of Object.entries(readings.dosing)) {
      lineItems.push({
        description: `${chemical} - ${visit.visited_at.toLocaleDateString()}`,
        item_type: "chemical",
        quantity: dose.amount,
        unit: dose.unit,
        unit_price: await getChemicalPrice(chemical, orgId),
      })
    }
  }
  return lineItems  // office reviews and edits before finalizing
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual Stripe.js integration | `@stripe/react-stripe-js` Payment Element | 2022 | Handles 100+ payment methods, 3DS, ACH in one component |
| Stripe Checkout (redirect) | Payment Element (embedded, no redirect) | 2021 | Stays on branded payment page, no Stripe-hosted redirect |
| QBO OAuth1 | OAuth2 via `intuit-oauth` v4 | 2019 | OAuth1 deprecated; all new integrations must use OAuth2 |
| Stripe Connect hosted onboarding only | Embedded onboarding component available | 2023 | Embedded keeps user in-app but adds @stripe/connect-js dep |
| Smart Retries for subscriptions only | Still subscriptions only | N/A | Must build manual retry logic for standalone PaymentIntents |

**Deprecated/outdated:**
- QBO OAuth1: Fully deprecated. Use `intuit-oauth` v4 with OAuth2 only.
- Stripe Checkout redirect for custom-branded pages: Works but redirects away from branded page. Use Payment Element instead.
- Stripe Connect type `custom` or `express` for this use case: `standard` is correct — companies manage their own Stripe account.

---

## New Schema Requirements Summary

The planner must include tasks for these schema additions:

### `invoices` table extensions
```sql
billing_model          text,          -- 'per_stop' | 'flat_rate' | 'plus_chemicals' | 'custom'
billing_period_start   date,
billing_period_end     date,
due_date               date,
stripe_payment_intent_id text,
payment_method         text,          -- 'card' | 'ach' | 'check' | 'cash' | 'qbo'
surcharge_amount       numeric(10,2),
qbo_invoice_id         text,
sent_sms_at            timestamptz,   -- when SMS was sent (separate from sent_at)
```

### `invoice_line_items` table extensions
```sql
visit_id               uuid references service_visits(id),  -- for per-stop line items
stop_date              date,          -- individual stop date shown on invoice
```

### New `payment_records` table
Tracks each payment attempt (card, ACH, check, cash, QBO). Separate from invoices to support partial payments and multiple attempts.

```typescript
// src/lib/db/schema/payments.ts
export const paymentRecords = pgTable("payment_records", {
  id: uuid("id").defaultRandom().primaryKey(),
  org_id: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  invoice_id: uuid("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  // 'card' | 'ach' | 'check' | 'cash' | 'qbo'
  method: text("method").notNull(),
  // 'pending' | 'settled' | 'failed' | 'refunded'
  status: text("status").notNull().default("pending"),
  stripe_payment_intent_id: text("stripe_payment_intent_id"),
  qbo_payment_id: text("qbo_payment_id"),
  settled_at: timestamptz("settled_at"),
  failure_reason: text("failure_reason"),
  attempt_count: integer("attempt_count").notNull().default(1),
  next_retry_at: timestamptz("next_retry_at"),
  created_at: timestamptz("created_at").defaultNow().notNull(),
})
// RLS: owner+office SELECT/INSERT/UPDATE; owner DELETE
```

### New `dunning_config` table
Per-org dunning settings (steps, intervals, email templates).

```typescript
export const dunningConfig = pgTable("dunning_config", {
  id: uuid("id").defaultRandom().primaryKey(),
  org_id: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  // JSON array: [{ day_offset: 3, template: "reminder_1" }, ...]
  steps: jsonb("steps").$type<DunningStep[]>().notNull().default([]),
  max_retries: integer("max_retries").notNull().default(3),
  created_at: timestamptz("created_at").defaultNow().notNull(),
  updated_at: timestamptz("updated_at").defaultNow().notNull(),
})
```

### `org_settings` extensions
(Columns listed under Pattern 1 above — stripe_account_id, qbo fields, payment_provider, surcharge config.)

### `customers` extensions
(Columns listed under Pattern 1 above — billing_model, stripe_customer_id, autopay fields, qbo_customer_id, overdue_balance.)

---

## Open Questions

1. **QBO token encryption at rest**
   - What we know: QBO access/refresh tokens are sensitive credentials stored in `org_settings`
   - What's unclear: Supabase Vault is available but adds complexity; a simpler AES-256 encrypt/decrypt using a server-side env var key may be sufficient
   - Recommendation: Use a simple `encryptToken(token, ENCRYPTION_KEY)` / `decryptToken()` utility at the server action boundary; store encrypted base64 in the DB

2. **QBO Webhooks vs. polling for inbound changes**
   - What we know: QBO supports webhooks for Customer, Invoice, Payment entities with HMAC verification; real-time sync is locked as a decision
   - What's unclear: QBO webhooks require a registered endpoint on the Intuit Developer portal per app, not per customer company — payload just says "entity X changed in realm Y"
   - Recommendation: Register a single `/api/webhooks/qbo` endpoint; on receipt, fetch the changed entity from QBO API and update PoolCo records

3. **Surcharge geographic detection**
   - What we know: CT, ME, MA, CA prohibit credit card surcharges; Virginia requires conspicuous disclosure; Kansas requires point-of-sale notice
   - What's unclear: How to determine if the pool company operates in a prohibited state (their billing address vs. customer billing address?)
   - Recommendation: Show a disclaimer in the surcharge settings UI listing prohibited states; make it the operator's responsibility to disable surcharges if applicable; do not attempt automated geo-blocking

4. **QBO Payments (non-Stripe) integration**
   - What we know: BILL-06 includes QBO sync; BILL-10 says companies can use QBO Payments instead of Stripe
   - What's unclear: "QuickBooks Payments via QBO sync" likely means customers pay via QBO's payment portal and the payment record flows back to PoolCo via webhook — NOT that PoolCo embeds QBO Payments UI
   - Recommendation: Treat QBO Payments as a manual recording flow — invoice is sent from QBO (or linked to QBO invoice), payment recorded in QBO, webhook syncs paid status back to PoolCo. PoolCo does NOT process the actual charge for QBO Payments path.

5. **Bulk invoice generation performance**
   - What we know: Batch creates invoices for all active customers; large orgs could have 200-500 customers
   - What's unclear: Whether bulk generation should be synchronous (blocking UI) or async (background job with progress)
   - Recommendation: Use a Supabase Edge Function invoked from the server action; return a job ID; poll for completion. This avoids Next.js 60s function timeout and keeps the UI responsive.

---

## Sources

### Primary (HIGH confidence)
- [Stripe Connect Standard Accounts](https://docs.stripe.com/connect/standard-accounts) — onboarding flow, account links API
- [Stripe Direct Charges](https://docs.stripe.com/connect/direct-charges) — application_fee_amount, connected account routing
- [Stripe Save and Reuse](https://docs.stripe.com/payments/save-and-reuse) — SetupIntent, off-session PaymentIntents
- [Stripe Connect Webhooks](https://docs.stripe.com/connect/webhooks) — connect vs account webhook distinction, account property
- [Stripe ACH Bank Transfers](https://docs.stripe.com/payments/bank-transfers/accept-a-payment) — ACH settlement timing 1-3 days, webhook events
- [Stripe Elements Appearance API](https://docs.stripe.com/elements/appearance-api) — branding customization
- [Stripe Onboard Connected Account](https://docs.stripe.com/connect/marketplace/tasks/onboard) — Account Links v2 API
- [Supabase Cron](https://supabase.com/docs/guides/cron) — pg_cron scheduled jobs, Edge Function invocation
- [GitHub: intuit/oauth-jsclient](https://github.com/intuit/oauth-jsclient) — official Intuit OAuth2 Node.js client
- [GitHub: mcohen01/node-quickbooks](https://github.com/mcohen01/node-quickbooks) — QBO API Node.js client
- Existing codebase: `src/lib/quotes/quote-token.ts`, `src/app/quote/[token]/page.tsx`, `src/lib/db/schema/invoices.ts`
- npm registry: stripe@20.4.1, @stripe/react-stripe-js@5.6.1, @stripe/stripe-js@8.9.0, node-quickbooks@2.0.48, intuit-oauth@4.2.2

### Secondary (MEDIUM confidence)
- [QBO Webhooks Documentation](https://developer.intuit.com/app/developer/qbo/docs/develop/webhooks) — entity types, HMAC verification (page rendered JS configuration, not full docs text)
- [QBO Rate Limits](https://help.developer.intuit.com/s/article/API-call-limits-and-throttling) — 500 req/min per company, 10 concurrent (confirmed via multiple sources)
- [QBO Token Expiry](https://help.developer.intuit.com/s/article/Handling-OAuth-token-expiration) — access token 1 hour, refresh token 100 days
- [Intuit OAuth2 Lazy Lync Guide](https://www.lazylync.com/blog/intuit-quickbooks-oauth-node-nextjs-sveltekit) — Next.js OAuth2 flow pattern
- [Credit Card Surcharge Laws 2025](https://www.lawpay.com/about/blog/credit-card-surcharge-rules/) — CT, ME, MA, CA prohibition; 3% Visa cap
- [Stripe Smart Retries](https://docs.stripe.com/billing/revenue-recovery/smart-retries) — confirmed Billing-only, not standalone PaymentIntents

### Tertiary (LOW confidence)
- WebSearch findings on QBO API rate limits (500 req/min) — cross-verified with multiple sources but page content unreadable
- WebSearch findings on `node-quickbooks` TypeScript support — no native types confirmed

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all library versions verified via npm registry
- Stripe Connect patterns: HIGH — verified against official Stripe docs
- QBO integration patterns: MEDIUM — official OAuth2 docs confirmed; node-quickbooks API shape from npm/GitHub
- Pitfalls: HIGH (Stripe-specific) / MEDIUM (QBO-specific) — Stripe from official docs; QBO from multiple sources
- Surcharge legal requirements: MEDIUM — multiple sources agree on state list but laws change

**Research date:** 2026-03-12
**Valid until:** 2026-04-12 for Stripe patterns (stable); 2026-03-26 for QBO patterns (check for API version updates before implementation)
