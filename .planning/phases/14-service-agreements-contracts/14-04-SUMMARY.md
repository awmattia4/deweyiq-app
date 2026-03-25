---
phase: 14-service-agreements-contracts
plan: 04
subsystem: customer-approval-flow
tags: [public-page, e-signature, jwt, auto-provisioning, schedule-rules, billing]
dependency_graph:
  requires:
    - 14-01 (service_agreements + agreement_pool_entries schema)
    - 14-03 (verifyAgreementToken, PDF route, agreement-token.ts)
  provides:
    - Public agreement approval page at /agreement/[token]
    - AgreementApprovalPage client component (dual e-signature)
    - POST /api/agreements/[id]/sign — accept/decline with auto-provisioning
    - Token-based PDF access at /api/agreements/[id]/pdf?token=JWT
  affects:
    - src/app/api/agreements/[id]/pdf/route.ts (refactored to shared helper)
    - customers table (billing_model, flat_rate_amount set on acceptance)
    - schedule_rules table (rows created on acceptance)
    - agreement_pool_entries table (schedule_rule_id linked on acceptance)
tech_stack:
  added: []
  patterns:
    - adminDb for all public-page DB access (customer has no Supabase session)
    - JWT token-based authorization for public pages (same pattern as quote approval)
    - react-signature-canvas for canvas draw mode (direct import, "use client")
    - Local date construction without toISOString() for anchor_date
    - Separate declineLoading/declineError state to avoid ActionState type narrowing
    - Resend SDK for office decline notification email (dev: console.log fallback)
key_files:
  created:
    - src/app/agreement/[token]/page.tsx
    - src/components/agreements/agreement-approval-page.tsx
    - src/app/api/agreements/[id]/sign/route.ts
  modified:
    - src/app/api/agreements/[id]/pdf/route.ts (dual auth + shared helper)
decisions:
  - "react-signature-canvas imported directly (not via next/dynamic) in 'use client' component — Next.js client components don't SSR, so the import is safe; dynamic() loses TypeScript types for class components"
  - "Separate declineLoading + declineError state for decline form — avoids ActionState union narrowing where TypeScript infers type=decline-form inside JSX block and rejects checks for type=error/loading"
  - "anchor_date computed from local Date parts (year/month/day) not toISOString() — follows critical timezone pitfall rule in MEMORY.md"
  - "PDF route refactored to shared _generatePdfResponse() helper — eliminates ~90 lines of duplicate fetch+render code between token and session paths"
  - "Decline email sent to all owner+office profiles (not just one) — office team needs to see declines regardless of which staff member opened the agreement"
metrics:
  duration: 7 minutes
  completed: 2026-03-25
  tasks: 2
  files: 4
---

# Phase 14 Plan 04: Customer Agreement Approval Flow Summary

**One-liner:** Public agreement approval page with typed-name and canvas draw e-signature, auto-provisioning schedule rules per pool and billing model on acceptance, and decline flow with office email notification.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Build public approval page with dual e-signature | 6ee39e7 | src/app/agreement/[token]/page.tsx, src/components/agreements/agreement-approval-page.tsx |
| 2 | Create sign API route with auto-provisioning | d9dedad | src/app/api/agreements/[id]/sign/route.ts, src/app/api/agreements/[id]/pdf/route.ts |

## What Was Built

### Public Approval Page (Task 1)

**`src/app/agreement/[token]/page.tsx`** — Server component with no auth:
- Calls `verifyAgreementToken(token)` — returns error page on invalid/expired JWT
- Fetches agreement, customer, org branding, and pool entries via `adminDb`
- Status gates: `active` (already signed), `declined`, non-`sent` (not available), end_date past (offer expired) — each shows an appropriate inline message
- Renders `AgreementApprovalPage` client component with typed props

**`src/components/agreements/agreement-approval-page.tsx`** — 635-line "use client" component:

*Key Terms Summary:*
- Customer name + service address
- Term type formatted as "Month-to-Month", "6 Months (Apr 1 – Sep 30, 2026)", etc.
- Auto-renewal indicator
- Per-pool cards: pool name, type badge, frequency (e.g. "Weekly — Every Monday"), pricing summary ($125.00/month, $45.00/visit, or tiered description)
- Estimated monthly total summed across all flat-rate and tiered entries

*Collapsible sections:*
- Terms & Conditions (chevron toggle)
- Cancellation Policy (chevron toggle)

*Dual signature modes:*
- **Type Your Name** (default): full legal name input, validated as >2 characters before enabling accept
- **Draw Signature**: `react-signature-canvas` canvas (560×140px, `touch-none` for mobile), Clear button, `onEnd` callback tracks canvas non-empty state

*Accept/Decline flows:*
- Accept: POSTs to `/api/agreements/${agreementId}/sign` with `{ action, signatureName, signatureImageBase64?, token }`. Inline loading/error/success states. 409 handled as "already processed."
- Decline: Separate decline form section with optional textarea. Uses independent `declineLoading`/`declineError` state vars to avoid TypeScript ActionState union narrowing conflict.

*PDF download:* "Download Full Agreement (PDF)" button links to `/api/agreements/${agreementId}/pdf?token=${token}` — opens in new tab.

### Sign API Route (Task 2)

**`POST /api/agreements/[id]/sign`** — Token-authenticated, adminDb only:

*Accept flow:*
1. Verifies JWT token matches route param (401/403 on mismatch)
2. Idempotency guard: 409 if `agreement.status !== 'sent'`
3. Updates agreement: status='active', signed_at, signature_name, signature_image_base64, signature_ip (x-forwarded-for), signature_user_agent
4. Appends activity_log entry via `COALESCE(activity_log, '[]'::jsonb) || ...::jsonb`
5. Auto-provisions `schedule_rules` for each pool entry — inserts with org_id, customer_id, pool_id, frequency, anchor_date (local date, not UTC), preferred_day_of_week, active=true; links back via `agreementPoolEntries.schedule_rule_id`
6. Auto-configures customer billing: all monthly_flat → flat_rate + sum, all per_visit → per_visit, mixed/tiered → flat_rate with monthly equivalent

*Decline flow:*
1. Sets status='declined', declined_at, decline_reason
2. Appends activity_log entry
3. Fetches all owner+office profile emails for org
4. Sends Resend email: "Agreement SA-0001 Declined by Customer Name" with decline reason (or dev console.log)

### PDF Route Refactor (Task 2)

**`GET /api/agreements/[id]/pdf`** — now supports dual auth:
- `?token=JWT` path: verifies `verifyAgreementToken`, no org_id restriction needed (token is scoped to the specific agreement ID)
- Session path (no token): verifies getCurrentUser, office/owner role, and org_id ownership
- Both paths share `_generatePdfResponse(agreementId)` helper — eliminates ~90 lines of duplicate DB fetch + PDF render code

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript ActionState narrowing conflict in decline form**
- **Found during:** Task 1 implementation
- **Issue:** TypeScript narrows `actionState` to `{ type: "decline-form" }` inside the `{actionState.type === "decline-form" && ...}` JSX block, making checks like `actionState.type === "error"` impossible (TS2367 — types have no overlap)
- **Fix:** Added separate `declineLoading: boolean` and `declineError: string | null` state vars for the decline form. `handleDecline` sets these instead of `actionState`. Avoids the union narrowing issue entirely.
- **Files modified:** src/components/agreements/agreement-approval-page.tsx
- **Commit:** 6ee39e7 (inline fix, same commit as page creation)

**2. [Rule 1 - Bug] react-signature-canvas loses TypeScript types via next/dynamic**
- **Found during:** Task 1 — TypeScript check
- **Issue:** `dynamic<React.ComponentProps<typeof SignatureCanvas>>()` produced TS2769 "No overload matches" because the dynamic wrapper loses the class component's ref compatibility
- **Fix:** Imported `SignatureCanvas` directly (not via `next/dynamic`). The component is inside a `"use client"` file which Next.js never SSRs, so direct import is safe and preserves full TypeScript types including ref.
- **Files modified:** src/components/agreements/agreement-approval-page.tsx
- **Commit:** 6ee39e7

## Self-Check: PASSED
