---
phase: 14-service-agreements-contracts
plan: 03
subsystem: pdf-email-delivery
tags: [pdf, email, jwt, react-pdf, react-email, resend, agreements]
dependency_graph:
  requires:
    - 14-01 (service_agreements schema + CRUD actions)
    - 14-02 (agreement builder UI — creates draft agreements)
  provides:
    - AgreementDocument PDF renderer (10 sections)
    - GET /api/agreements/[id]/pdf authenticated download route
    - signAgreementToken / verifyAgreementToken (180-day JWT)
    - AgreementEmail React Email template
    - sendAgreement full delivery pipeline (PDF + email + status transition)
  affects:
    - src/actions/agreements.ts (sendAgreement updated from stub to full pipeline)
tech_stack:
  added: []
  patterns:
    - react-pdf/renderer with hex-only colors (no oklch)
    - jose JWT signing/verification (same pattern as quote-token.ts)
    - Resend SDK email delivery with PDF attachment
    - renderEmail (@react-email/render) for HTML generation
    - withRls for status update after email delivery
    - adminDb for fetching data (no RLS constraints needed for server-side PDF generation)
key_files:
  created:
    - src/lib/pdf/agreement-pdf.tsx
    - src/app/api/agreements/[id]/pdf/route.ts
    - src/lib/agreements/agreement-token.ts
    - src/lib/emails/agreement-email.tsx
  modified:
    - src/actions/agreements.ts (sendAgreement — full delivery pipeline replacing stub)
decisions:
  - "PDF uses hex-only colors (#2563eb, etc.) — react-pdf/renderer cannot parse oklch, same constraint as MapLibre"
  - "Agreement token uses separate AGREEMENT_TOKEN_SECRET env var (not QUOTE_TOKEN_SECRET) — one secret per feature pattern prevents cross-token forgery"
  - "180-day JWT expiry (vs 90d for quotes) — agreements cover 12-month terms, token must outlast the contract period"
  - "pdfUrl in email links to authenticated /api/agreements/[id]/pdf — customer sees this link after clicking through to the approval page which will proxy the PDF; using raw UUID rather than token for the PDF route since approval page handles auth context"
  - "sendAgreement uses adminDb for all read queries (agreement, customer, org, pool entries) — consistent with sendQuote pattern; withRls only needed for the status update write"
metrics:
  duration: 12 minutes
  completed: 2026-03-25
  tasks: 2
  files: 5
---

# Phase 14 Plan 03: Agreement PDF, Token, Email, and Send Flow Summary

**One-liner:** Agreement delivery pipeline — react-pdf/renderer document (10 sections), 180-day JWT tokens with AGREEMENT_TOKEN_SECRET, React Email template with agreement summary, and full sendAgreement action that generates PDF, sends via Resend with attachment, and transitions status to 'sent'.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Create agreement PDF and download route | 681076b | src/lib/pdf/agreement-pdf.tsx, src/app/api/agreements/[id]/pdf/route.ts |
| 2 | Create token system, email template, and send flow | 5fd1125 | src/lib/agreements/agreement-token.ts, src/lib/emails/agreement-email.tsx, src/actions/agreements.ts |

## What Was Built

### Agreement PDF (Task 1)

`AgreementDocument` component using `@react-pdf/renderer` with all 10 required sections:

1. **Header** — Company logo + name, "SERVICE AGREEMENT" label, agreement number (e.g. SA-0001), date created, term type and dates
2. **Parties** — Service provider (company name) and customer (name, service address, phone, email) in two-column layout
3. **Scope of Service** — Per-pool blocks showing pool name, type (Pool / Spa / Fountain), frequency (Weekly — Every Monday, etc.), and optional notes
4. **Pricing & Billing** — Per-pool pricing model description (monthly flat / per-visit / tiered) with amounts; estimated total monthly cost at bottom
5. **Term & Renewal** — Term type, start date, end date (or "Ongoing"), auto-renew policy text
6. **Cancellation Policy** — From `agreement.cancellation_policy` field, rendered as paragraphs
7. **Terms & Conditions** — From `agreement.terms_and_conditions` field
8. **Liability & Limitations** — From `agreement.liability_waiver` field
9. **Signature Block** — Two-column (company rep / customer) with blank lines for signature, printed name, and date; electronic signature disclaimer below
10. **Footer** — "Powered by DeweyIQ" + page numbers on every page (fixed footer)

Authenticated PDF route `GET /api/agreements/[id]/pdf`:
- Requires owner or office role
- Fetches agreement + customer + org branding + pool entries via adminDb
- Joins `agreement_pool_entries` with `pools` table to get pool names and types
- Returns `application/pdf` with `Content-Disposition: attachment` and `Cache-Control: private, no-cache`

### Token System (Task 2)

`src/lib/agreements/agreement-token.ts`:
- `signAgreementToken(agreementId)` — HS256, 180-day expiry, `AGREEMENT_TOKEN_SECRET` env var
- `verifyAgreementToken(token)` — returns `{ agreementId }` or null on any error (expired/invalid/malformed)
- Mirrors `quote-token.ts` exactly with separate secret

### Email Template (Task 2)

`AgreementEmail` React Email component:
- Dark-themed (#0f172a background) matching app design system
- Company name in header with "Service Agreement Ready for Review" heading
- Customer greeting + customizable body text
- Agreement summary table: number, term type, start date, pools covered, estimated monthly cost (green)
- "Review & Sign Agreement" primary CTA button → approvalUrl
- "Download Full Agreement (PDF)" secondary link → pdfUrl
- "Powered by DeweyIQ" footer
- Props: `companyName`, `customerName`, `agreementNumber`, `termType`, `startDate`, `totalMonthlyCost`, `poolCount`, `approvalUrl`, `pdfUrl`, `customBody?`, `customFooter?`

### sendAgreement Action (Task 2)

Full delivery pipeline replacing the stub from Plan 01:

1. Validates status is `draft` or `declined` (can resend declined agreements)
2. Fetches agreement, customer, org, and pool entries via `adminDb`
3. Builds `AgreementDocumentProps` and generates PDF buffer via `renderToBuffer`
4. Signs 180-day JWT, builds approval URL `/agreement/{token}`
5. Calculates total monthly cost across all pool entries for email summary
6. Renders email HTML via `@react-email/render`
7. Sends via Resend SDK with PDF attachment (`Agreement-SA-0001.pdf`)
8. Updates agreement via `withRls`: status='sent', sent_at=now, appends activity_log entry `{ type: "agreement_sent", note: "Agreement sent to customer@email.com" }`
9. Dev mode: logs to console when `RESEND_API_KEY` not set (same pattern as `sendQuote`)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Pools schema uses `type` column, not `pool_type`**
- **Found during:** Task 1 implementation
- **Issue:** Plan spec referenced `pools.pool_type` but the schema column is `pools.type` (using `poolTypeEnum`)
- **Fix:** Used `pools.type` in the JOIN query in both the PDF route and sendAgreement action; aliased to `pool_type` in the select for clarity
- **Files modified:** src/app/api/agreements/[id]/pdf/route.ts, src/actions/agreements.ts
- **Commit:** 681076b

## Required Environment Setup

Before `sendAgreement` works in production, add to `.env.local`:

```
AGREEMENT_TOKEN_SECRET=<output of: openssl rand -hex 32>
```

The public agreement approval page `/agreement/[token]` (Plan 04) will call `verifyAgreementToken` to validate the JWT before rendering.

## Self-Check: PASSED

All files found on disk. All task commits verified in git log.
