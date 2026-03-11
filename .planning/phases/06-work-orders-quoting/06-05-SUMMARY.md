---
phase: 06-work-orders-quoting
plan: "05"
subsystem: ui
tags: [react, nextjs, react-pdf, resend, jwt, work-orders, quotes, pdf-generation, email, jose]

# Dependency graph
requires:
  - phase: 06-01
    provides: quotes DB table, work_orders, work_order_line_items, org_settings schema
  - phase: 06-04
    provides: OrgSettings type with Phase 6 fields, line item structure

provides:
  - QuoteDocument: @react-pdf/renderer branded quote PDF with line items, totals, terms
  - QuoteEmail: React Email template with quote summary table, CTA approval button
  - signQuoteToken/verifyQuoteToken: jose HS256 JWT with QUOTE_TOKEN_SECRET, 90-day expiry
  - createQuote: atomic quote number generation, snapshot_json, draft creation
  - sendQuote: PDF generation + Resend delivery with attachment, WO status to quoted
  - reviseQuote: versioning (marks old as superseded, creates new draft)
  - extendQuote: expiry extension with expired→sent reset
  - getQuotesForWorkOrder: query all versions ordered by version desc
  - QuoteBuilder: full quote editing UI with totals preview, confirmation dialog, PDF preview
  - GET /api/quotes/[id]/pdf: authenticated PDF download route handler

affects:
  - 06-02 (WO detail page — should embed QuoteBuilder)
  - 06-06 (invoice builder — follows same PDF pattern)

# Tech tracking
tech-stack:
  added:
    - resend (npm package for email delivery with PDF attachment)
    - "@react-email/components (already installed — QuoteEmail uses it)"
  patterns:
    - renderToBuffer cast as any to bypass @react-pdf/renderer generic type mismatch with react JSXElement
    - adminDb for org_settings increment (RLS requires owner; adminDb lets office create quotes too)
    - snapshot_json stores scope_of_work, tax_rate, terms at send time for immutable quote history
    - createElement + renderToBuffer pattern (not JSX) in server actions and route handlers
    - Resend SDK directly from server action (not Edge Function) — PDF buffers not serialized across function boundary

key-files:
  created:
    - src/lib/pdf/quote-pdf.tsx
    - src/lib/emails/quote-email.tsx
    - src/lib/quotes/quote-token.ts
    - src/actions/quotes.ts
    - src/components/work-orders/quote-builder.tsx
    - src/app/api/quotes/[id]/pdf/route.ts
    - src/components/ui/textarea.tsx
  modified:
    - package.json (added resend)
    - package-lock.json

key-decisions:
  - "renderToBuffer requires 'as any' cast — @react-pdf/renderer Document type expects DocumentProps but QuoteDocument is a React function component; cast bypasses the generic mismatch"
  - "adminDb for next_quote_number increment — org_settings UPDATE RLS is owner-only; using adminDb lets office staff create quotes without owner role"
  - "QUOTE_TOKEN_SECRET separate from REPORT_TOKEN_SECRET per 06-RESEARCH.md Pitfall 3"
  - "snapshot_json stores quote state at send time — scope_of_work, tax_rate, line items preserved even if WO changes post-send"
  - "Buffer.from(pdfBuffer).toString('base64') for Resend attachments — Resend API expects base64 string content"
  - "New Uint8Array(buffer) for Web Response API — Node.js Buffer not assignable to BodyInit; Uint8Array is"
  - "textarea shadcn component added via npx shadcn add textarea — was missing from project"

patterns-established:
  - "PDF route handler: adminDb fetch → createElement(Document, props) as any → renderToBuffer → new Uint8Array(buffer) → Response with Content-Type: application/pdf"
  - "Quote email: createElement(QuoteEmail, props) → renderEmail() → Resend sdk with html + attachments[{filename, content: base64}]"
  - "Quote number format: {prefix}-{padStart(4,'0')} e.g. Q-0001"

requirements-completed:
  - WORK-03

# Metrics
duration: 10min
completed: 2026-03-11
---

# Phase 06 Plan 05: Quote Builder, PDF Generation & Email Delivery Summary

**Quote PDF via @react-pdf/renderer, branded email via Resend SDK with PDF attachment, JWT approval tokens, and full quote builder UI with draft/send/revise flow**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-11T07:54:55Z
- **Completed:** 2026-03-11T08:04:55Z
- **Tasks:** 2
- **Files modified/created:** 7

## Accomplishments

- QuoteDocument PDF component: Letter-size, hex colors only, header with logo+quote number, customer info, flagged-by badge, line items table with alternating rows and optional labels, subtotal/discount/tax/grand total section, terms section
- QuoteEmail React Email template: dark-themed, company header, quote summary table (number/total/expiry), scope snippet, View & Approve CTA button, PDF attachment note
- signQuoteToken/verifyQuoteToken: jose HS256 JWT, QUOTE_TOKEN_SECRET, 90-day expiry, exact mirror of report-token.ts
- createQuote: fetches WO+line items, atomically increments next_quote_number via adminDb SQL, builds snapshot_json, inserts draft quote, appends activity log
- sendQuote: fetches all data, calculates totals with tax/discount, generates PDF buffer, signs approval JWT, renders email HTML, sends via Resend SDK with base64 PDF attachment, updates quote to sent, updates WO to quoted
- reviseQuote: marks current as superseded, creates new draft with version+1
- extendQuote: extends expires_at, resets expired→sent
- QuoteBuilder UI: scope textarea, line items grid with optional/taxable switches, live totals preview, expiration date picker, terms textarea, Save Draft / Send to Customer buttons, confirmation dialog with quote summary, revision flow for changes_requested, approved/sent/changes-requested status banners
- GET /api/quotes/[id]/pdf: authenticated route handler (owner+office only), fetches all data via adminDb, builds QuoteDocumentProps, renderToBuffer → Uint8Array response

## Task Commits

1. **Task 1: Quote PDF component, email template, and token system** - `26605fb` (feat)
2. **Task 2: Quote builder UI, server actions, and PDF route handler** - `d777bf8` (feat)

## Files Created/Modified

- `src/lib/pdf/quote-pdf.tsx` - QuoteDocument @react-pdf/renderer component, all hex colors
- `src/lib/emails/quote-email.tsx` - React Email quote delivery template
- `src/lib/quotes/quote-token.ts` - signQuoteToken/verifyQuoteToken jose JWT utilities
- `src/actions/quotes.ts` - createQuote, sendQuote, reviseQuote, extendQuote, getQuotesForWorkOrder, updateQuoteDraft
- `src/components/work-orders/quote-builder.tsx` - Full quote builder UI with all states
- `src/app/api/quotes/[id]/pdf/route.ts` - Authenticated PDF download route
- `src/components/ui/textarea.tsx` - shadcn textarea component (was missing)
- `package.json` / `package-lock.json` - Added resend npm package

## Decisions Made

- `renderToBuffer` requires `as any` cast for the React element — `@react-pdf/renderer` exports `Document` with `DocumentProps` but `QuoteDocument` is a React function component. The types don't align; `as any` is the correct bypass.
- `adminDb` for `next_quote_number` atomic increment — `org_settings` UPDATE RLS policy is owner-only. Using `adminDb` for just the counter increment lets office staff create quotes without needing owner role.
- `QUOTE_TOKEN_SECRET` is separate from `REPORT_TOKEN_SECRET` — per research Pitfall 3, using the same secret for different token types creates cross-token confusion risk.
- `snapshot_json` stores scope_of_work and terms at creation time — these can diverge from WO/org defaults after the quote is sent, so we snapshot them.
- `new Uint8Array(buffer)` for the Response API — Node.js `Buffer` is not assignable to `BodyInit` in the Web fetch API types; `Uint8Array` is.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] renderToBuffer type mismatch with React element**
- **Found during:** Task 2 (server action and PDF route handler)
- **Issue:** TypeScript error: `FunctionComponentElement<QuoteDocumentProps>` not assignable to `ReactElement<DocumentProps, ...>`. @react-pdf/renderer's `renderToBuffer` signature expects `DocumentProps` but QuoteDocument is a function component.
- **Fix:** Added `as any` cast on `createElement(QuoteDocument, documentProps)` in both `sendQuote` and the PDF route handler
- **Files modified:** `src/actions/quotes.ts`, `src/app/api/quotes/[id]/pdf/route.ts`
- **Verification:** TypeScript check passes with no errors
- **Committed in:** d777bf8

**2. [Rule 3 - Blocking] user.orgId → user.org_id in route handler**
- **Found during:** Task 2 (PDF route handler)
- **Issue:** TypeScript error: `Property 'orgId' does not exist on type 'AuthUser'. Did you mean 'org_id'?` — AuthUser uses snake_case not camelCase.
- **Fix:** Changed all `user.orgId` to `user.org_id` in route handler
- **Files modified:** `src/app/api/quotes/[id]/pdf/route.ts`
- **Verification:** TypeScript check passes
- **Committed in:** d777bf8

**3. [Rule 3 - Blocking] Buffer not assignable to BodyInit in Web Response API**
- **Found during:** Task 2 (PDF route handler)
- **Issue:** TypeScript: `Buffer<ArrayBufferLike>` is not assignable to `BodyInit | null | undefined`. Node.js Buffer ≠ Web API BodyInit.
- **Fix:** Wrapped buffer in `new Uint8Array(buffer)` before passing to Response constructor
- **Files modified:** `src/app/api/quotes/[id]/pdf/route.ts`
- **Verification:** TypeScript check passes
- **Committed in:** d777bf8

**4. [Rule 2 - Missing Critical] Added textarea shadcn component**
- **Found during:** Task 2 (QuoteBuilder component)
- **Issue:** `@/components/ui/textarea` does not exist in the project. QuoteBuilder requires it for scope and terms inputs.
- **Fix:** `npx shadcn add textarea` — created `src/components/ui/textarea.tsx`
- **Files modified:** `src/components/ui/textarea.tsx`
- **Verification:** TypeScript check passes, import resolves
- **Committed in:** d777bf8

---

**Total deviations:** 4 auto-fixed (3 blocking type errors, 1 missing critical component)
**Impact on plan:** All auto-fixes necessary for correct TypeScript compilation. No scope creep.

## User Setup Required

This plan requires external environment variable configuration:

- `QUOTE_TOKEN_SECRET` — Generate a 32+ character random string and add to `.env.local`:
  ```
  openssl rand -hex 32
  # Add to .env.local: QUOTE_TOKEN_SECRET=<output>
  ```
- `RESEND_API_KEY` — Add your Resend API key to `.env.local`:
  ```
  RESEND_API_KEY=re_xxxxxxxxxxxx
  ```

## Next Phase Readiness

- QuoteBuilder is ready to be embedded in the WO detail page (06-02)
- Quote approval page (public `/quote/[token]` route) is unbuilt — this is Plan 06-04's scope per the roadmap
- PDF and email templates are reusable for invoice generation in Phase 06-06
- The `renderToBuffer` + `as any` + `createElement` pattern is established for all future PDF documents

---
*Phase: 06-work-orders-quoting*
*Completed: 2026-03-11*
