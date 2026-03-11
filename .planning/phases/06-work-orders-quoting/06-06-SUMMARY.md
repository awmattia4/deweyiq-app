---
phase: 06-work-orders-quoting
plan: "06"
subsystem: quotes
tags: [public-page, customer-portal, approval-flow, jwt-token, work-order-conversion]
dependency_graph:
  requires: ["06-05"]
  provides: ["public-quote-approval", "quote-api-endpoint", "wo-auto-conversion"]
  affects: ["work-orders", "alerts", "invoicing-phase-07"]
tech_stack:
  added: []
  patterns:
    - "adminDb for unauthenticated public routes (no Supabase auth session)"
    - "JWT token as authorization for public pages"
    - "Three-panel action UI with expand-on-click pattern"
    - "Real-time total recalculation from optional item toggles"
key_files:
  created:
    - src/app/quote/[token]/page.tsx
    - src/components/quotes/quote-approval-page.tsx
    - src/app/api/quotes/[token]/approve/route.ts
  modified:
    - src/actions/quotes.ts
decisions:
  - "adminDb throughout public quote routes — customer has no Supabase auth session (per 06-RESEARCH.md Pitfall 5)"
  - "Token expiry (90d JWT) vs quote expiry (DB expires_at) are separate checks — both enforced"
  - "approved_optional_item_ids stored on quote row for Plan 07 invoice line item filtering"
  - "onConflictDoNothing on alert insert — unique (org_id, alert_type, reference_id) prevents duplicates"
  - "Status guard on API endpoint — only 'sent' quotes can be acted upon (not draft/approved/declined/superseded)"
  - "WO activity_log appended for all three actions — full audit trail even for decline/changes"
  - "Light theme for public page — customer-facing, not dark admin theme"
  - "No page redirect on action — in-place success state to avoid losing context"
metrics:
  duration: "4 minutes"
  completed_date: "2026-03-11"
  tasks_completed: 2
  files_created: 3
  files_modified: 1
---

# Phase 6 Plan 06: Customer Quote Approval Page Summary

Public quote approval portal: JWT-tokenized page at /quote/[token] where customers can approve quotes with optional e-signature, decline with reason, or request changes — with approved quotes auto-converting the parent work order to 'approved' status.

## What Was Built

**Task 1: Public quote approval page and interactive approval UI**

Created `src/app/quote/[token]/page.tsx` — server component outside the `(app)` route group:
- Verifies JWT token via `verifyQuoteToken()`; renders appropriate error/status pages for invalid/expired/approved/declined states
- Fetches all quote data via `getQuotePublicData()` using `adminDb` (no auth required)
- Light-themed layout with company logo header, centered content, footer

Created `src/components/quotes/quote-approval-page.tsx` — interactive client component:
- Optional line item checkboxes update subtotal/tax/total in real-time
- Three collapsible action panels (only one expands at a time via action state machine)
- **Approve**: optional e-signature text input + consent checkbox + optional items summary
- **Decline**: radio button reason selector (Too expensive / Getting other quotes / Not needed right now / Other) + free-text textarea if "Other"
- **Request Changes**: free-text textarea for change description
- Loading spinners on all submit buttons; in-place success/error states after submission

Added `getQuotePublicData()` to `src/actions/quotes.ts`:
- Fetches quote, WO, customer, org settings, org branding, line items, flaggedBy tech name — all via `adminDb`
- Computes subtotal, tax, total for the approval page display

Added `checkQuoteExpiration()` stretch utility for future cron reminders.

**Task 2: Quote approval API endpoint and auto-WO conversion**

Created `src/app/api/quotes/[token]/approve/route.ts` — POST route handler:
- Verifies token; returns 410 on invalid/expired
- Status guard: only `sent` quotes can be acted on (returns 409 for already-approved, draft, superseded, etc.)
- Expiration guard: returns 409 if `expires_at` has passed
- **action='approve'**: sets `quote.status='approved'`, `approved_at`, `signature_name`, `approved_optional_item_ids` → sets `work_order.status='approved'` → appends `quote_approved` activity log event → inserts `quote_approved` alert (info severity)
- **action='decline'**: sets `quote.status='declined'`, `declined_at`, `decline_reason` → appends `quote_declined` activity log → inserts `quote_declined` alert (warning severity) — WO stays 'quoted'
- **action='request_changes'**: sets `quote.status='changes_requested'`, `change_note` → appends `quote_changes_requested` activity log → inserts `quote_changes_requested` alert (info severity) — WO stays 'quoted'
- All alerts use `onConflictDoNothing()` on the `(org_id, alert_type, reference_id)` unique constraint

## Verification

- `/quote/[token]` page renders without auth (outside app route group)
- Status gates: approved/declined quotes show confirmation messages; expired quotes show expiration with company name
- Optional item toggles update displayed total in real-time
- Three action panels: only the clicked one expands
- API endpoint: approve → quote.status='approved', WO.status='approved', alert inserted
- API endpoint: decline → quote.status='declined', decline_reason stored, WO activity log updated
- API endpoint: request_changes → quote.status='changes_requested', change_note stored
- Build passes: `/quote/[token]` and `/api/quotes/[token]/approve` both appear in Next.js build output

## Deviations from Plan

None — plan executed exactly as written.

## Key Decisions

1. **adminDb throughout**: Per 06-RESEARCH.md Pitfall 5, customers have no Supabase auth session. All public quote routes use `adminDb` (service role). Token verification is the sole authorization.

2. **approved_optional_item_ids on quote row**: The list of customer-selected optional items is stored on the `quotes` row. Plan 07 (invoicing) will use this list to include only approved items on the invoice, without requiring customers to re-select.

3. **onConflictDoNothing for alerts**: The `alerts` table has a unique constraint on `(org_id, alert_type, reference_id)`. Using `reference_id = quote.id` ensures exactly one alert per quote per action type, even if the endpoint is called multiple times.

4. **Status guard, not just expiry check**: API validates `quote.status === 'sent'` before processing. This prevents edge cases where a quote is simultaneously approved via two browser tabs, or where office staff approve after the customer does.

5. **WO activity log appended for all actions**: All three customer actions (approve, decline, request changes) append an event to `work_orders.activity_log`. This gives office staff a complete audit trail of customer interactions without needing to look at the quotes table.

## Self-Check: PASSED

- `src/app/quote/[token]/page.tsx` — exists
- `src/components/quotes/quote-approval-page.tsx` — exists
- `src/app/api/quotes/[token]/approve/route.ts` — exists
- Commit 25fda3e — Task 1 (public page + approval UI) — confirmed
- Commit 9fca922 — Task 2 (API endpoint + WO conversion) — confirmed
- TypeScript check: clean (no errors in new files)
- Next.js build: passed — both routes appear in build output
