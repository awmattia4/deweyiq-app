---
phase: 12-projects-renovations
plan: 05
subsystem: ui
tags: [nextjs, react, drizzle, projects, proposals, tiers, line-items, payment-schedule, versioning]

# Dependency graph
requires:
  - phase: 12-projects-renovations
    plan: 01
    provides: project_proposals, project_proposal_tiers, project_proposal_line_items, project_proposal_addons, project_payment_milestones schema
  - phase: 12-projects-renovations
    plan: 03
    provides: ProjectDetail type, getProjectDetail action, project phases list for payment trigger selector

provides:
  - /projects/[id]/proposal server page (auto-creates draft on first visit)
  - ProposalBuilder multi-section client component (scope/tiers/line-items/addons/payment/summary)
  - TierBuilder Good/Better/Best side-by-side columns with name/description/price/features
  - ProposalLineItems categorized line items with markup calculation and tier assignment
  - AddonBuilder optional add-on upsells with checkbox-preview presentation
  - PaymentScheduleBuilder milestone table with phase trigger selector and 100% validation
  - createProposal, getProposal, getProposalForProject, updateProposal server actions
  - Tier CRUD: createProposalTier, updateProposalTier, deleteProposalTier
  - Line item CRUD: addProposalLineItem, updateProposalLineItem, removeProposalLineItem
  - Add-on CRUD: addProposalAddon, updateProposalAddon, removeProposalAddon
  - setPaymentSchedule with percentage sum validation and amount calculation
  - getDefaultPaymentSchedule from project template
  - createNewProposalVersion: supersedes current, copies all tiers/items/addons/milestones (PROJ-16)

affects:
  - 12-07 (customer approval page reads proposal built here)
  - 12-08 (permits/change orders reference proposal)
  - project detail page gains Proposal nav link (future)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Server actions return fresh ProposalDetail state on every mutation (per MEMORY.md invoicing pattern)
    - Controlled string state for decimal inputs with parseFloat flush on blur (per MEMORY.md decimal pitfall)
    - 600ms debounced auto-save on text field blur via useRef + setTimeout
    - LEFT JOIN for milestone phase names — no correlated subqueries (per MEMORY.md RLS pitfalls)
    - All sections scroll-visible (not wizard/stepper) per plan decision

key-files:
  created:
    - src/actions/projects-proposals.ts
    - src/app/(app)/projects/[id]/proposal/page.tsx
    - src/components/projects/proposal-builder.tsx
    - src/components/projects/tier-builder.tsx
    - src/components/projects/proposal-line-items.tsx
    - src/components/projects/addon-builder.tsx
    - src/components/projects/payment-schedule-builder.tsx
  modified:
    - src/components/projects/proposal-builder.tsx (replaced stub from plan 04)

key-decisions:
  - "Multi-section scrollable layout rather than wizard/stepper — all sections visible on one page for fast office editing"
  - "TierBuilder manages each tier column independently with its own state, fires server actions on blur"
  - "Line items support both shared (tier_id = null) and per-tier (tier_id set) assignment — displayed in grouped sections"
  - "Payment schedule edit/save cycle: view mode shows table, Edit button switches to inline editing with 100% validation badge"
  - "createProposal is idempotent — returns existing active proposal if one exists rather than creating duplicates"

requirements-completed:
  - PROJ-10
  - PROJ-11
  - PROJ-12
  - PROJ-13
  - PROJ-15
  - PROJ-16

# Metrics
duration: 21min
completed: 2026-03-17
---

# Phase 12 Plan 05: Proposal Builder Summary

**Full proposal builder at /projects/[id]/proposal with Good/Better/Best tiers, categorized line items with markup, optional add-ons, configurable payment schedule, and proposal versioning**

## Performance

- **Duration:** ~21 min
- **Started:** 2026-03-17T15:54:38Z
- **Completed:** 2026-03-17T16:15:00Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Built complete proposal server actions file covering all CRUD operations across 5 related tables (proposals, tiers, line items, add-ons, milestones)
- Proposal versioning (PROJ-16): `createNewProposalVersion` supersedes current proposal and deep-copies all tiers, line items (with tier ID remapping), add-ons, and milestones to a new v+1 draft
- Payment schedule with phase trigger dropdown (ties milestone to a project phase completion) and server-side percentage sum validation
- Good/Better/Best tier builder in SaaS pricing page side-by-side layout per user decision
- Line items with all 6 categories, markup % calculation, and optional tier scoping (shared vs. per-tier)
- Add-on upsells displayed with checkbox preview (matching customer approval page presentation)
- All inputs use controlled decimal state per MEMORY.md pitfall (never `parseFloat` on change)
- Auto-save on blur with 600ms debounce for text fields; immediate server save for selects/toggles

## Task Commits

1. **Task 1: Proposal server actions** - `18cb79a` (feat)
2. **Task 2: Proposal builder UI** - `934cfea` (feat)

## Files Created/Modified

- `src/actions/projects-proposals.ts` — All proposal server actions (createProposal, getProposal, getProposalForProject, updateProposal, tier CRUD, line item CRUD, addon CRUD, setPaymentSchedule, getDefaultPaymentSchedule, createNewProposalVersion)
- `src/app/(app)/projects/[id]/proposal/page.tsx` — Server page with role guard, auto-create draft
- `src/components/projects/proposal-builder.tsx` — Main multi-section builder (replaced stub)
- `src/components/projects/tier-builder.tsx` — Good/Better/Best tier columns
- `src/components/projects/proposal-line-items.tsx` — Categorized line item editor
- `src/components/projects/addon-builder.tsx` — Optional add-on upsell list
- `src/components/projects/payment-schedule-builder.tsx` — Milestone table with phase triggers

## Decisions Made

- Multi-section scrollable layout rather than wizard/stepper: all sections visible on one page for fast office editing. Stepper would slow down experienced office staff who jump directly to the section they need.
- `createProposal` is idempotent: if an active (non-superseded) proposal already exists, returns it rather than creating a duplicate. Prevents accidental double-proposals.
- TierBuilder manages each tier column independently with its own local state, fires server actions on blur. Avoids round-trip on every keystroke.
- Payment schedule uses view mode / edit mode pattern — prevents accidental partial saves while user is mid-edit.
- Line item total = `quantity * unit_price * (1 + markup_pct / 100)` — markup is applied to the pre-quantity subtotal consistently.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Stub file already existed for proposal-builder.tsx**
- **Found during:** Task 2 (file creation)
- **Issue:** A stub `proposal-builder.tsx` had been created by a prior plan with `ProposalBuilderProps` interface defined but only a placeholder div
- **Fix:** Overwrote the stub with the full implementation using the Write tool (since stub had the correct interface signature, no type conflicts)
- **Files modified:** src/components/projects/proposal-builder.tsx
- **Commit:** 934cfea

None beyond the above auto-fixed stub replacement.

## Issues Encountered

- Build lock file leftover from a prior dev server session required clearing `.next/lock` before `npm run build` would proceed.

## User Setup Required

None — all changes are frontend/actions, no new environment variables or external services required.

## Next Phase Readiness

- `/projects/[id]/proposal` renders full proposal builder with all 6 sections
- `createProposal`, `getProposalForProject`, `updateProposal` available for customer approval page (Plan 07)
- `createNewProposalVersion` ready for revision workflow
- `setPaymentSchedule` ready for billing integration (Plan 09)
- Proposal status transitions (draft → sent → approved) reserved for Plan 07 customer approval flow

## Self-Check: PASSED

All created files verified:
- src/actions/projects-proposals.ts — FOUND
- src/app/(app)/projects/[id]/proposal/page.tsx — FOUND
- src/components/projects/proposal-builder.tsx — FOUND
- src/components/projects/tier-builder.tsx — FOUND
- src/components/projects/proposal-line-items.tsx — FOUND
- src/components/projects/addon-builder.tsx — FOUND
- src/components/projects/payment-schedule-builder.tsx — FOUND

All commits verified:
- 18cb79a (Task 1: server actions) — FOUND
- 934cfea (Task 2: UI components) — FOUND

---
*Phase: 12-projects-renovations*
*Completed: 2026-03-17*
