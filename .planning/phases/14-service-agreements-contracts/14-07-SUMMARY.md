---
phase: 14-service-agreements-contracts
plan: 07
subsystem: agreements
tags: [agreements, cron, compliance, renewal, email]
dependency_graph:
  requires:
    - 14-06  # checkExpiredAgreements stub was added in 06; we replaced it here
  provides:
    - agreement renewal reminder emails (office-facing)
    - agreement auto-renewal (extends end_date)
    - agreement compliance tracking (frequency + billing)
  affects:
    - /agreements (compliance badges + filter)
    - /agreements/[id] (compliance section)
    - cron/agreement-renewal (new daily job)
tech_stack:
  added:
    - AgreementRenewalEmail (React Email template, src/lib/emails/)
    - POST /api/cron/agreement-renewal (new cron route)
  patterns:
    - adminDb for cron (no user session)
    - withRls for user-facing compliance queries
    - Single-pass bulk compliance via LEFT JOINs + GROUP BY
key_files:
  created:
    - src/app/api/cron/agreement-renewal/route.ts
    - src/lib/emails/agreement-renewal-email.tsx
  modified:
    - src/actions/agreements.ts
    - src/app/(app)/agreements/page.tsx
    - src/app/(app)/agreements/[id]/page.tsx
    - src/components/agreements/agreement-manager.tsx
    - src/components/agreements/agreement-detail.tsx
decisions:
  - "Cron uses adminDb (no user session) — consistent with dunning cron pattern"
  - "Compliance computed on-demand (not cached) to avoid stale data"
  - "Billing compliance checks flat_monthly and per_visit; tiered marked unchecked"
  - "checkExpiredAgreements() migrated from withRls to adminDb — cron has no session"
  - "Renewal reminder uses exact day match on daysUntilExpiry vs lead_days array"
metrics:
  duration: 9 min
  completed: 2026-03-25
  tasks: 2
  files: 7
---

# Phase 14 Plan 07: Renewal Reminders and Compliance Tracking Summary

Automated agreement renewal reminders via daily cron and compliance tracking that flags missed stops and billing mismatches — giving the office clear visibility into whether agreed-upon service levels are being met.

## Tasks Completed

| Task | Name | Commit | Key files |
|------|------|--------|-----------|
| 1 | Renewal reminder cron + auto-renewal | dae1377 | route.ts, agreement-renewal-email.tsx, agreements.ts |
| 2 | Compliance tracking + UI indicators | eb080f4 | agreements.ts, agreement-manager.tsx, agreement-detail.tsx |

## What Was Built

### Task 1: Renewal Reminder Cron

**`POST /api/cron/agreement-renewal`** — Daily cron route. Same CRON_SECRET bearer pattern as dunning cron. Calls two functions in parallel:

1. **`runAgreementRenewalScan()`** — Scans all orgs for active agreements with `end_date` approaching. For each org, reads `agreement_renewal_lead_days` from `org_settings` (default `[30, 7]`). Sends reminders when `daysUntilExpiry` exactly matches a configured lead day. Duplicate prevention: skips if `renewal_reminder_sent_at` was set within the last 24 hours. Resets `renewal_reminder_sent_at` to null when an agreement auto-renews so reminders fire again for the new term.

2. **`checkExpiredAgreements()`** — Migrated from `withRls` to `adminDb` (cron has no user session). Now handles two paths:
   - `auto_renew = true`: extends `end_date` by the term duration (6 or 12 months), sets `renewed_at`, logs "Auto-renewed"
   - `auto_renew = false`: transitions to `expired`, deactivates schedule rules (unchanged behavior)

**`AgreementRenewalEmail`** — React Email template sent to office/owner users (not the customer). Shows agreement number, customer name, expiry date, days remaining, and a color-coded action message — green "No action needed" for auto-renew agreements, orange "Take action" for non-auto-renew. "View Agreement" CTA button. "Powered by DeweyIQ" footer.

### Task 2: Compliance Tracking + UI

**`getAgreementCompliance(agreementId)`** — Per-agreement compliance for the detail page. For each pool entry, counts completed `route_stops` (`status = 'complete'`) over a rolling 30-day window and compares against expected stops based on frequency (weekly=4, biweekly=2, monthly=1, custom=30/interval). Billing check: for `flat_monthly`, compares invoiced total vs agreement monthly_amount; for `per_visit`, compares actual stops × rate vs invoiced total. Returns per-pool `frequency_status` (compliant/warning/breach) and `billing_status`.

**`getAgreementsWithCompliance()`** — Bulk version for the list page. Uses a single pass with batched queries (avoids N+1): one query for all pool entries across active agreements, one for stop counts across all affected pools, one for invoice totals per customer. Returns `Map<agreement_id, AgreementComplianceSummary>`.

**Agreement Manager** — Compliance badges appear on cards with warning or breach status (compliant = no badge, keeping the UI clean). Yellow summary bar at top shows "X agreements with compliance issues" with a "Show only" filter link. Compliance filter dropdown added to the action bar.

**Agreement Detail** — Compliance section added below Pool Services for active agreements. Per-pool grid shows: service frequency (actual/expected stops with color-coded status), billing status, and a highlighted details string for breaches or mismatches.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] checkExpiredAgreements used withRls but is called from cron**
- **Found during:** Task 1
- **Issue:** The existing `checkExpiredAgreements()` used `withRls(token, ...)` and `getRlsToken()`, requiring an authenticated user session. Cron routes have no user session.
- **Fix:** Rewrote to use `adminDb` throughout, consistent with `runAgreementRenewalScan()` and the dunning cron pattern.
- **Files modified:** `src/actions/agreements.ts`
- **Commit:** dae1377

**2. [Rule 2 - Missing] Dynamic import of @react-email/render inside scan function**
- **Found during:** Task 1 (code review before committing)
- **Issue:** Initially used a dynamic import inside `runAgreementRenewalScan()` for `renderEmail`, which was already imported at the file's top level.
- **Fix:** Used the already-imported `renderEmail` and `createElement` directly.
- **Files modified:** `src/actions/agreements.ts`
- **Commit:** dae1377

## Self-Check: PASSED

- FOUND: src/app/api/cron/agreement-renewal/route.ts
- FOUND: src/lib/emails/agreement-renewal-email.tsx
- FOUND: commit dae1377 (Task 1)
- FOUND: commit eb080f4 (Task 2)
