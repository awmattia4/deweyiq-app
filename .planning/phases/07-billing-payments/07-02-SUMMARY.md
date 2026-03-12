---
phase: 07-billing-payments
plan: "02"
subsystem: payments
tags: [resend, react-email, twilio, sms, jwt, pdf, supabase-edge-functions]

# Dependency graph
requires:
  - phase: 07-01
    provides: "Invoice schema, billing model, generateInvoicesForPeriod, finalizeInvoice"
  - phase: 06-05
    provides: "Quote email delivery pattern, quote-token.ts, QuoteDocument PDF"
provides:
  - "Invoice email delivery with PDF attachment via Resend"
  - "Pay token JWT system (signPayToken/verifyPayToken) for public payment pages"
  - "Invoice SMS delivery via Twilio Edge Function"
  - "Quote SMS delivery option in sendQuote"
  - "Batch sendAllInvoices for bulk-generated invoices"
  - "send-invoice-sms Edge Function handling both invoice and quote SMS"
affects: [07-04, 07-05, 07-06, 07-07, 07-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single Edge Function for multiple SMS types (invoice + quote) to avoid duplicate functions"
    - "Pay token JWT system mirroring quote-token.ts for public payment page access"
    - "Delivery method selector UI pattern (email/sms/both) gated on customer phone availability"
    - "Sequential batch send for invoices to prevent race conditions on number generation"

key-files:
  created:
    - src/lib/pay-token.ts
    - src/lib/emails/invoice-email.tsx
    - supabase/functions/send-invoice-sms/index.ts
  modified:
    - src/actions/invoices.ts
    - src/actions/quotes.ts
    - src/components/work-orders/invoice-list.tsx
    - src/components/work-orders/quote-builder.tsx
    - src/components/work-orders/wo-detail.tsx
    - src/app/(app)/work-orders/[id]/page.tsx
    - src/app/(app)/work-orders/page.tsx

key-decisions:
  - "Single Edge Function (send-invoice-sms) handles both invoice and quote SMS to avoid duplicate Deno functions"
  - "Pay token uses separate INVOICE_TOKEN_SECRET env var (not shared with QUOTE_TOKEN_SECRET or REPORT_TOKEN_SECRET)"
  - "365-day expiry on pay tokens — invoices can stay outstanding for months"
  - "SMS delivery is non-fatal — if SMS fails after email succeeds, the send is still considered successful"
  - "Batch send processes sequentially (not Promise.all) to prevent race conditions on invoice number generation"

patterns-established:
  - "Delivery method selector: clickable cards for email/sms/both, SMS gated on customer phone"
  - "getCustomerPhonesForInvoices two-query pattern for phone availability checks"

requirements-completed: [BILL-01, BILL-02]

# Metrics
duration: 18min
completed: 2026-03-12
---

# Phase 7 Plan 02: Invoice & Quote Delivery Summary

**Invoice email with PDF attachment via Resend, pay token JWT for public payment pages, SMS delivery via Twilio Edge Function, and quote SMS option in QuoteBuilder**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-03-12
- **Completed:** 2026-03-12
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- Invoice email delivery with branded React Email template, PDF attachment, and "Pay Now" CTA link
- Pay token JWT system (jose, HS256, 365-day expiry) for unauthenticated payment page access
- SMS delivery for both invoices and quotes via single Deno Edge Function using Twilio REST API
- Batch "Send All" for bulk-generated invoices with sequential processing
- Quote SMS delivery option with delivery method selector (Email / SMS / Email + SMS) in QuoteBuilder
- Customer phone gating -- SMS options only shown when customer has phone on file

## Task Commits

Each task was committed atomically:

1. **Task 1: Invoice email template, pay token system, and invoice delivery actions** - `a66b6d2` (feat)
2. **Task 2: Quote SMS delivery and invoice SMS Edge Function** - `51633b7` (feat)

## Files Created/Modified

- `src/lib/pay-token.ts` - JWT sign/verify for payment page tokens (mirrors quote-token.ts)
- `src/lib/emails/invoice-email.tsx` - Branded React Email invoice template with dark theme, invoice details, and Pay Now CTA
- `supabase/functions/send-invoice-sms/index.ts` - Deno Edge Function handling both invoice and quote SMS via Twilio REST API
- `src/actions/invoices.ts` - Enhanced sendInvoice (email+SMS), added sendAllInvoices batch send, added getCustomerPhonesForInvoices
- `src/actions/quotes.ts` - Added smsEnabled option to sendQuote, phone lookup, SMS invocation via Edge Function
- `src/components/work-orders/invoice-list.tsx` - Send dropdown (Email/SMS/Both) per invoice, Send All button for batch
- `src/components/work-orders/quote-builder.tsx` - Delivery method selector cards in send confirmation dialog
- `src/components/work-orders/wo-detail.tsx` - Added customerPhone prop, passed to QuoteBuilder
- `src/app/(app)/work-orders/[id]/page.tsx` - Fetches customer phone and passes to WoDetail
- `src/app/(app)/work-orders/page.tsx` - Fetches customer phones for invoice list SMS gating
- `src/components/work-orders/wo-invoices-tab-shell.tsx` - Passes customerPhones prop through to InvoiceList

## Decisions Made

- **Single Edge Function for both SMS types:** `send-invoice-sms` handles both `type='invoice'` and `type='quote'` to avoid duplicate Deno functions with identical Twilio logic.
- **Separate INVOICE_TOKEN_SECRET:** Pay tokens use their own secret, not shared with QUOTE_TOKEN_SECRET or REPORT_TOKEN_SECRET, per security best practice.
- **365-day pay token expiry:** Invoices can remain outstanding for months; long expiry ensures payment links stay valid.
- **Non-fatal SMS:** If SMS delivery fails after email succeeds, the overall send operation is still considered successful. Email is the primary channel.
- **Sequential batch send:** `sendAllInvoices` processes invoices one at a time to prevent race conditions on the atomic invoice number counter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Missing cn import in quote-builder.tsx**
- **Found during:** Task 2 (Quote SMS delivery)
- **Issue:** Added delivery method selector cards using `cn()` utility for conditional class merging, but forgot to import it
- **Fix:** Added `import { cn } from "@/lib/utils"` to imports
- **Files modified:** src/components/work-orders/quote-builder.tsx
- **Verification:** `npx tsc --noEmit` passes cleanly
- **Committed in:** 51633b7 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Trivial missing import fix. No scope creep.

## Issues Encountered

- **Pre-existing TS error in settings/page.tsx:** `Property 'payment_provider' does not exist on type 'OrgSettings'` -- this error exists in the working tree from Phase 07-01/03 schema additions but is not caused by this plan's changes. Out of scope; logged as pre-existing.

## User Setup Required

**Environment variables to add:**
- `INVOICE_TOKEN_SECRET` -- Generate with: `openssl rand -hex 32`. Required for pay token JWT signing.

**Supabase Edge Function deployment:**
- `supabase functions deploy send-invoice-sms` -- deploys the SMS delivery function
- Twilio secrets (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER) should already be configured from Phase 5

## Next Phase Readiness
- Pay token system ready for Plan 04 (public payment page with Stripe checkout)
- Invoice email + SMS delivery ready for end-to-end billing flow
- Quote SMS delivery extends the existing quote workflow
- Batch send ready for the bulk invoicing flow from Plan 01

## Self-Check: PASSED

- All 3 created files verified on disk
- Both task commits (a66b6d2, 51633b7) verified in git history

---
*Phase: 07-billing-payments*
*Completed: 2026-03-12*
