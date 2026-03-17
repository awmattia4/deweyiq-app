---
phase: 12-projects-renovations
plan: 06
subsystem: api
tags: [jwt, pdf, react-pdf, resend, email, sms, proposal, react-email, notification-templates]

# Dependency graph
requires:
  - phase: 12-projects-renovations
    plan: 05
    provides: projectProposals, ProposalDetail type, sendProposal uses proposal/project/customer data
  - phase: 12-projects-renovations
    plan: 01
    provides: projects schema with stage, activity_log, project_proposals schema

provides:
  - src/lib/projects/proposal-token.ts — signProposalToken/verifyProposalToken (HS256, PROPOSAL_TOKEN_SECRET)
  - src/lib/projects/change-order-token.ts — signChangeOrderToken/verifyChangeOrderToken (CHANGE_ORDER_TOKEN_SECRET, for Plan 13)
  - src/lib/pdf/proposal-pdf.tsx — ProposalDocument PDF with tiers, conditional line detail, payment schedule, legal sections, DeweyIQ footer
  - src/lib/emails/proposal-email.tsx — ProposalEmail React Email template with CTA + PDF attachment note
  - sendProposal server action — generates PDF, sends via Resend, optional SMS, updates proposal status=sent, project stage=proposal_sent
  - getProposalPdf server action — PDF buffer download/preview for proposal builder
  - proposal_email and proposal_sms notification template types with customizable defaults

affects:
  - 12-07 (customer approval page uses verifyProposalToken and reads proposal built by Plan 05)
  - 12-13 (change order approval page uses verifyChangeOrderToken)
  - Settings notifications tab (proposal_email/proposal_sms now in template list)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Same hex-only color constraint as quote-pdf.tsx (no oklch in @react-pdf/renderer)
    - sendProposal mirrors sendQuote pattern exactly — adminDb for data fetches, withRls for status updates
    - buildProposalDocumentProps extracted as internal helper used by both sendProposal and getProposalPdf
    - SMS delivery via same Supabase Edge Function (send-invoice-sms) with type="proposal"
    - Notification templates extended by adding new TemplateType union members (no DB migration needed — template_type is plain text column)

key-files:
  created:
    - src/lib/projects/proposal-token.ts
    - src/lib/projects/change-order-token.ts
    - src/lib/pdf/proposal-pdf.tsx
    - src/lib/emails/proposal-email.tsx
  modified:
    - src/actions/projects-proposals.ts (added sendProposal, getProposalPdf, buildProposalDocumentProps)
    - src/lib/notifications/default-templates.ts (added proposal_email and proposal_sms types + defaults)

key-decisions:
  - "PROPOSAL_TOKEN_SECRET is separate from QUOTE_TOKEN_SECRET — separate secrets per token type prevents cross-type token confusion attacks"
  - "CHANGE_ORDER_TOKEN_SECRET defined in Plan 06 (not Plan 13) to keep the token utility files co-located in lib/projects/"
  - "buildProposalDocumentProps is an internal helper using adminDb — shared by sendProposal (user context) and getProposalPdf, avoids code duplication"
  - "Proposal PDF show_line_item_detail toggle: true = full itemized table grouped by category, false = one summary row per category"
  - "Tiers comparison uses side-by-side columns with badge colors (green/blue/purple) matching the builder UI"
  - "projects table has name column, not description — PDF uses project.name as projectDescription field"

requirements-completed:
  - PROJ-14
  - PROJ-17

# Metrics
duration: 18min
completed: 2026-03-17
---

# Phase 12 Plan 06: Proposal PDF, Token System & Email Delivery Summary

**JWT-secured proposal approval links via HS256 tokens, professional branded PDF with conditional line detail and tiers comparison, and Resend email delivery with optional SMS — updating proposal status and project stage on send**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-03-17T17:52:12Z
- **Completed:** 2026-03-17T18:10:00Z
- **Tasks:** 1
- **Files modified:** 6

## Accomplishments

- Proposal JWT token system: separate `PROPOSAL_TOKEN_SECRET` and `CHANGE_ORDER_TOKEN_SECRET` — mirrors quote-token.ts pattern exactly, HS256 with 90-day expiry
- Professional proposal PDF with 14 sections: company branding, customer/project info, scope, conditional line items (detailed vs. summary), Good/Better/Best tiers comparison with badge colors, add-ons, payment schedule with percentages, T&C, warranty, cancellation policy, signature block, and DeweyIQ footer
- PDF respects `show_line_item_detail` toggle — detailed view groups items by category; summary view shows one row per category total
- Proposal email template with dark theme, project summary table, scope snippet, CTA button, and PDF attachment note — all hex colors for email client compatibility
- Added `proposal_email` and `proposal_sms` to the notification template system with default templates and merge tags (`{{proposal_link}}`, `{{proposal_total}}`)
- `sendProposal` action: fetches data via adminDb, generates PDF, signs token, resolves templates, sends via Resend with PDF attachment, invokes SMS Edge Function, then updates `proposal.status=sent` and `project.stage=proposal_sent` with activity_log entry
- `getProposalPdf` action for proposal builder download/preview

## Task Commits

1. **Task 1: Proposal PDF, token system, and email delivery** - `304a443` (feat)

## Files Created/Modified

- `src/lib/projects/proposal-token.ts` — `signProposalToken`/`verifyProposalToken` using PROPOSAL_TOKEN_SECRET
- `src/lib/projects/change-order-token.ts` — `signChangeOrderToken`/`verifyChangeOrderToken` using CHANGE_ORDER_TOKEN_SECRET (for Plan 13)
- `src/lib/pdf/proposal-pdf.tsx` — `ProposalDocument` React PDF component with full branded layout
- `src/lib/emails/proposal-email.tsx` — `ProposalEmail` React Email template
- `src/actions/projects-proposals.ts` — Added `sendProposal`, `getProposalPdf`, `buildProposalDocumentProps`; updated imports to include adminDb, createElement, renderToBuffer, Resend, etc.
- `src/lib/notifications/default-templates.ts` — Added `proposal_email`/`proposal_sms` to TemplateType, TEMPLATE_TYPE_META, ALL_TEMPLATE_TYPES, and DEFAULT_TEMPLATES

## Decisions Made

- Separate PROPOSAL_TOKEN_SECRET from QUOTE_TOKEN_SECRET: prevents token reuse across different approval flows. If an attacker obtains a quote token, it cannot be used to approve proposals.
- `buildProposalDocumentProps` extracted as an internal adminDb helper shared by `sendProposal` and `getProposalPdf` — avoids duplicating the 80+ line data-assembly logic.
- Projects table uses `name` column (not `description`) — the PDF renders the project name as the `projectDescription` display field.
- PDF tiers comparison uses three-column side-by-side layout with tier-specific badge colors (good=green, better=blue, best=purple) matching the office proposal builder UI so customers see a consistent visual.
- SMS delivery reuses the existing `send-invoice-sms` Supabase Edge Function with `type: "proposal"` — no new infrastructure needed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed `project.description` → `project.name`**
- **Found during:** Task 1 (TypeScript type check)
- **Issue:** `projects` table has a `name` column (not `description`). The plan specified using `projectDescription` from the project, which mapped to a non-existent column.
- **Fix:** Changed Drizzle query to select `projects.name` and mapped it to `projectDescription` in both `buildProposalDocumentProps` and `sendProposal`.
- **Files modified:** src/actions/projects-proposals.ts
- **Verification:** `npx tsc --noEmit` shows 0 errors in my files
- **Committed in:** 304a443

---

**Total deviations:** 1 auto-fixed (1 bug — wrong column name)
**Impact on plan:** Necessary correctness fix. No scope creep.

## Issues Encountered

- Pre-existing TypeScript errors in `bank-feeds.ts` (plaid package missing) and `gantt-timeline.tsx` (component type constraint) — unrelated to this plan, not addressed per scope boundary rule.

## User Setup Required

Add to `.env.local`:
```
PROPOSAL_TOKEN_SECRET=<openssl rand -hex 32>
CHANGE_ORDER_TOKEN_SECRET=<openssl rand -hex 32>
```

Test values added to `.env.local` for development (gitignored). Production deployment requires real secrets.

## Next Phase Readiness

- `signProposalToken` and `verifyProposalToken` ready for Plan 07 customer approval page (`/proposal/[token]`)
- `signChangeOrderToken` and `verifyChangeOrderToken` ready for Plan 13 change order approval
- `sendProposal` can be wired to a "Send Proposal" button on the proposal builder page
- `getProposalPdf` can be wired to a "Download PDF" button on the proposal builder page
- `proposal_email` and `proposal_sms` templates visible in Settings > Notifications for customization

## Self-Check: PASSED

Files verified:
- src/lib/projects/proposal-token.ts — FOUND
- src/lib/projects/change-order-token.ts — FOUND
- src/lib/pdf/proposal-pdf.tsx — FOUND
- src/lib/emails/proposal-email.tsx — FOUND

Commits verified:
- 304a443 (Task 1) — FOUND

---
*Phase: 12-projects-renovations*
*Completed: 2026-03-17*
