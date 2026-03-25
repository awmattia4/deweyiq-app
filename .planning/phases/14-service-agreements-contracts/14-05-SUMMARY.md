---
phase: 14-service-agreements-contracts
plan: "05"
subsystem: agreements-ui
tags: [agreements, navigation, list-page, detail-page, filters, timeline]
dependency_graph:
  requires: ["14-01", "14-02"]
  provides: ["/agreements page", "/agreements/[id] page", "sidebar integration"]
  affects: [app-sidebar, app-header, agreements workflow]
tech_stack:
  added: []
  patterns: [server-component, client-component, withRls, actionability-sort]
key_files:
  created:
    - src/app/(app)/agreements/page.tsx
    - src/components/agreements/agreement-manager.tsx
    - src/app/(app)/agreements/[id]/page.tsx
    - src/components/agreements/agreement-detail.tsx
  modified:
    - src/components/shell/app-sidebar.tsx
decisions:
  - "Buttons for lifecycle actions (pause, resume, cancel, amend) are rendered but disabled with '(Plan 06)' label — per plan instructions to wire only send/delete/PDF for now"
  - "PAGE_TITLES already had /agreements entry — no header change needed"
  - "Sidebar uses ScrollTextIcon for Agreements nav item (owner+office roles only)"
metrics:
  duration: "4 min"
  completed: "2026-03-25"
  tasks: 2
  files: 5
---

# Phase 14 Plan 05: Agreement Manager & Detail Pages Summary

**One-liner:** Central /agreements list page with status/customer/search filters and full detail view with contextual actions, signature display, and activity timeline.

## What Was Built

### Task 1: Agreement Manager Page

- `/agreements` server page (role-guarded: owner + office only) fetches all agreements + customer list in parallel
- `AgreementManager` client component with three filters: text search (agreement # or customer name), status dropdown (all statuses), customer select
- Agreement cards sorted by actionability: draft → sent → active → paused → expired → cancelled/declined, then newest-first within each group
- Each card shows: agreement number, status badge, customer name, term type, auto-renew indicator, pool count, monthly total, most-relevant date
- Expiring-within-30-days badge on active agreements
- Empty state with prompt to create first agreement
- "New Agreement" button (links to /agreements/new)
- Entire card is clickable (navigates to detail page)

### Sidebar Integration

- "Agreements" added to `NAV_ITEMS` with `ScrollTextIcon`, `roles: ["owner", "office"]`, positioned after Inventory (Phase 14 grouping)
- `PAGE_TITLES` in `app-header.tsx` already had `/agreements: "Agreements"` — no change needed

### Task 2: Agreement Detail Page

- `/agreements/[id]` server page with `notFound()` on missing agreement
- `AgreementDetail` client component with two-column layout (2/3 + 1/3 on large screens)

**Left column:**
- Agreement header with number + status badge, customer link, term + auto-renew info
- Agreement details grid: term type, start/end dates, auto-renew, version, template, created/sent/signed dates
- Pool services section per entry: pool name, frequency with preferred day, pricing model formatted, notes, monthly total footer
- Expandable terms & conditions, cancellation policy, liability waiver (show 200 chars, expand on demand)
- Internal notes section (office-only)

**Right column:**
- Contextual action buttons per status (draft: send, edit, PDF, delete; sent: resend, PDF, cancel-disabled; active: PDF, pause/amend/cancel-disabled; paused: resume-disabled, PDF, cancel-disabled; expired: PDF, renew-disabled; cancelled/declined: PDF, create-new-disabled)
- Signature info card (when signed): name, timestamp, IP address, base64 signature image
- Amendments list with version, type (major/minor), change summary, status badge, date
- Activity timeline rendered from JSONB activity_log (reverse chronological) with dot + connecting line visual

**Action wiring:**
- "Send to Customer" → calls `sendAgreement` → updates local state directly (no router.refresh)
- "Download PDF" → opens `/api/agreements/{id}/pdf` in new tab
- "Delete" → calls `deleteAgreement` (owner only) → redirects to /agreements

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- FOUND: src/app/(app)/agreements/page.tsx
- FOUND: src/components/agreements/agreement-manager.tsx
- FOUND: src/app/(app)/agreements/[id]/page.tsx
- FOUND: src/components/agreements/agreement-detail.tsx
- Commit 4ce8316: feat(14-05): agreement manager page with filters and sidebar integration
- Commit 1e26537: feat(14-05): agreement detail page with actions and activity timeline
