---
phase: 14-service-agreements-contracts
plan: "06"
subsystem: agreements
tags: [agreements, lifecycle, amendments, billing, schedule-rules]
dependency_graph:
  requires: ["14-04", "14-05"]
  provides: ["pause-resume", "cancel-with-notice", "amendment-flow", "expire-check", "renew"]
  affects: ["schedule-rules", "customers.billing_model", "agreement-amendments"]
tech_stack:
  added: []
  patterns:
    - "Lifecycle server actions returning fresh DB data for direct state updates"
    - "Amendment classification: major (re-sign) vs minor (auto-approve)"
    - "JWT amendment token encoding both agreementId + amendmentId"
    - "Bilateral billing_model save/restore via activity_log"
key_files:
  created:
    - src/lib/emails/agreement-amendment-email.tsx
    - src/components/agreements/amendment-dialog.tsx
  modified:
    - src/actions/agreements.ts
    - src/components/agreements/agreement-detail.tsx
    - src/components/agreements/agreement-approval-page.tsx
    - src/app/(app)/agreements/[id]/page.tsx
    - src/app/agreement/[token]/page.tsx
    - src/app/api/agreements/[id]/sign/route.ts
    - src/lib/agreements/agreement-token.ts
decisions:
  - "Pause saves previous billing_model in activity_log entry for reliable restore on resume"
  - "Cancel with notice period sets end_date only (no status change); cancel with 0 days sets status=cancelled immediately"
  - "Amendment changes applied immediately on creation; customer declining a major amendment does NOT revert changes (office is notified to decide next steps)"
  - "Amendment token embeds amendmentId in JWT payload; sign route detects amendment vs original sign by presence of amendmentId"
  - "noticePeriodDays fetched server-side via adminDb and passed to AgreementDetail to avoid extra client-side fetch"
metrics:
  duration_minutes: 10
  completed_date: "2026-03-25"
  tasks_completed: 2
  files_modified: 8
---

# Phase 14 Plan 06: Agreement Lifecycle & Amendment System Summary

Full agreement lifecycle management and amendment system with version history.

## What Was Built

**Lifecycle server actions (src/actions/agreements.ts):**

- `pauseAgreement(id, reason?)`: Verifies active status, deactivates all linked schedule rules via `inArray`, saves current `billing_model` in activity_log, sets `customers.billing_model = 'paused'` only if no other active agreements exist for the customer.

- `resumeAgreement(id)`: Reactivates schedule rules with `anchor_date = toLocalDateString(today)`, restores billing_model from most recent `agreement_paused` log entry that includes `previous_billing_model`.

- `cancelAgreement(id)`: Reads `org_settings.agreement_notice_period_days` via adminDb. If > 0: sets `end_date = today + N days` (agreement stays active until then). If 0: immediate cancellation — deactivates all schedule rules, sets status = 'cancelled'.

- `renewAgreement(id)`: Atomically increments agreement number sequence, creates new draft copying all fields + pool entries (schedule_rule_id omitted — created fresh on customer sign), logs on original agreement.

- `checkExpiredAgreements()`: Finds active non-auto-renew agreements with `end_date <= today`, transitions each to 'expired', deactivates schedule rules. Called by cron in Plan 07.

- `amendAgreement(id, changes, changeSummary)`: Classifies as major (price/term/frequency changes) or minor (checklist/notes). Creates `agreement_amendments` row with snapshot_json. Major: sets `pending_amendment_id`, generates token with `amendmentId` in payload, sends amendment email. Minor: auto-approves, updates linked schedule rules, sends notification email (non-blocking).

**Amendment email (src/lib/emails/agreement-amendment-email.tsx):**

Dark-themed React Email template. Major variant includes "Review & Approve Amendment" CTA button. Minor variant is informational only. All colors hex for email client compatibility.

**AmendmentDialog (src/components/agreements/amendment-dialog.tsx):**

Real-time major/minor classification badge. Editable fields: term type, per-pool pricing (pricing model + amount inputs), per-pool frequency/preferred day. Auto-populates change summary from changed fields, user can override.

**Agreement detail page (src/components/agreements/agreement-detail.tsx):**

Replaced all disabled placeholder buttons with functional implementations:
- Pause → opens PauseDialog (optional reason) → calls pauseAgreement → updates local state
- Resume → confirmation prompt → calls resumeAgreement → updates local state
- Cancel → opens CancelDialog (shows notice period info or "immediately") → calls cancelAgreement
- Amend → opens AmendmentDialog → calls amendAgreement
- Renew → calls renewAgreement → redirects to new agreement detail page
- Create New from This (cancelled/declined) → calls renewAgreement

**Token + sign route updates:**

`signAgreementToken` now accepts optional `amendmentId`. `verifyAgreementToken` returns `{ agreementId, amendmentId? }`. Sign route detects amendment vs original sign, routes to `_handleAmendmentAccept` (marks signed, clears `pending_amendment_id`) or `_handleAmendmentDecline` (marks rejected, clears `pending_amendment_id`).

**Approval page (agreement-approval-page.tsx):**

`isAmendment` prop triggers amendment-specific header, change summary banner, and success/decline messages. Agreement token page (`/agreement/[token]`) detects when agreement is `active` with matching `pending_amendment_id` and renders amendment review UI instead of "already signed" message.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- src/lib/emails/agreement-amendment-email.tsx: FOUND
- src/components/agreements/amendment-dialog.tsx: FOUND
- Commit 1670471 (Task 1): FOUND
- Commit 834b710 (Task 2): FOUND
