---
phase: 12-projects-renovations
plan: 07
subsystem: ui
tags: [react, stripe, jwt, signature-canvas, nextjs, public-pages]

# Dependency graph
requires:
  - phase: 12-projects-renovations
    provides: project schema, proposal token, projects-materials populateMaterialsFromProposal
  - phase: 12-06
    provides: signProposalToken, proposal PDF/email send flow
provides:
  - Public /proposal/[id] approval page (no auth, token-based)
  - Customer can view tiers, addons, sign, and pay deposit without an account
  - approveProposal server action with PROJ-28 material list population trigger
  - Stripe deposit PaymentIntent endpoint (POST /api/projects/deposit)
  - submitChangeRequest for customer-initiated change requests
  - SignaturePad component (draw + type modes)
affects: [12-08, 12-09, billing, customer-portal]

# Tech tracking
tech-stack:
  added: [react-signature-canvas, @types/react-signature-canvas]
  patterns: [adminDb for customer-facing pages (no RLS session), token-verified public pages]

key-files:
  created:
    - src/app/proposal/[id]/page.tsx
    - src/components/projects/proposal-approval-page.tsx
    - src/components/projects/tier-selector.tsx
    - src/components/projects/addon-selector.tsx
    - src/components/projects/signature-pad.tsx
    - src/actions/projects-approval.ts
    - src/app/api/projects/deposit/route.ts
  modified: []

key-decisions:
  - "adminDb for all customer-facing actions — RLS withRls() returns empty without auth session"
  - "PROJ-28 trigger uses adminDb variant of populateMaterials (not withRls) since customer has no auth"
  - "SignaturePad dynamic import with ssr:false — react-signature-canvas requires DOM"
  - "Split deposit creates a second milestone row with due_date 7 days out"
  - "[id] param name in /proposal/[id] per MEMORY.md slug conflict rule — token extracted as id"

patterns-established:
  - "Public approval pages: force-dynamic, verifyToken, adminDb, no sidebar/auth guard"
  - "Customer-facing Stripe: verify token, fetch settings, create/reuse Stripe Customer on connected account"
  - "adminDb material population variant: mirrors withRls variant but uses service role for no-auth paths"

requirements-completed:
  - PROJ-18
  - PROJ-19
  - PROJ-20
  - PROJ-21
  - PROJ-22
  - PROJ-23

# Metrics
duration: 8min
completed: 2026-03-17
---

# Phase 12 Plan 07: Customer Proposal Approval Page Summary

**Token-verified public proposal page with tier columns, addon checkboxes, react-signature-canvas e-sign, Stripe deposit payment, split deposit, and PROJ-28 material list seeding on approval**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-17T00:10:04Z
- **Completed:** 2026-03-17T00:18:00Z
- **Tasks:** 2
- **Files modified:** 7 created

## Accomplishments
- Customer-facing /proposal/[id] page renders without auth — tier selector (3-column desktop, stacked mobile), addon checkboxes, live total, e-signature, Stripe deposit
- approveProposal records signature + selected tier/addons + advances project to 'proposal_approved' + calls populateMaterialsFromProposalAdmin (PROJ-28 bridge)
- Split deposit flow creates second-half milestone 7 days out; first half collected via Stripe PaymentElement inline
- Change request modal submits customer notes, creates proposalChangeRequests row, appends activity log entry

## Task Commits

1. **Task 1: Signature library, approval actions, Stripe deposit endpoint** - `10b2d61` (feat)
2. **Task 2: Public proposal approval page with tiers, add-ons, signature, deposit** - `64c42ac` (feat)

## Files Created/Modified
- `src/app/proposal/[id]/page.tsx` - Server page: token verify, status gates (approved/declined/superseded), renders ProposalApprovalPage
- `src/components/projects/proposal-approval-page.tsx` - Full 13-section approval flow with Stripe Elements integration
- `src/components/projects/tier-selector.tsx` - Side-by-side tier cards with feature lists and price; selected tier highlighted
- `src/components/projects/addon-selector.tsx` - Checkbox list with live total on toggle
- `src/components/projects/signature-pad.tsx` - Draw (react-signature-canvas) and type (Dancing Script canvas render) modes; outputs PNG data URL
- `src/actions/projects-approval.ts` - getProposalPublicData, approveProposal, submitChangeRequest, recordOfflineDeposit, sendDepositReminder
- `src/app/api/projects/deposit/route.ts` - POST PaymentIntent endpoint for connected account deposit; split deposit milestone creation

## Decisions Made
- Used adminDb throughout approval actions — customers have no Supabase auth session, withRls() would return empty results
- populateMaterialsFromProposalAdmin is a separate function (adminDb variant) because the PROJ-28 trigger fires from customer context
- react-signature-canvas loaded via next/dynamic with ssr:false — canvas element requires DOM
- Split deposit: when toggled, charges exactly half rounded to cents and creates "Deposit (second half)" milestone
- Financing link appends `?amount=X` to the partner URL for pre-fill support
- Running total updates live in the sticky bottom bar as tier selection and addon toggles change

## Deviations from Plan

None — plan executed exactly as written. The adminDb variant of material population was explicitly specified in the plan ("adminDb since customer has no auth session").

## Issues Encountered
- Pre-existing build failures (missing `plaid` and `react-plaid-link` packages) were confirmed out-of-scope and logged to deferred items. All new files type-check cleanly.

## User Setup Required
Per plan frontmatter, two env vars are needed:
- `PROPOSAL_TOKEN_SECRET` — already in use from Plan 12-06 (signProposalToken)
- `CHANGE_ORDER_TOKEN_SECRET` — referenced in plan but not used in this plan's implementation (change orders are Plan 12-13)

No new env vars required beyond what Plan 12-06 already set up.

## Next Phase Readiness
- /proposal/[id] page is live and ready for customer-facing links generated by signProposalToken
- approveProposal seeds project_materials (PROJ-28) — Plan 12-09 material list will be pre-populated
- depositMilestoneId returned by approveProposal is ready for Stripe webhook to mark as paid
- Stage transitions (proposal_approved → deposit_received) are wired — downstream plans can rely on these stages

---
*Phase: 12-projects-renovations*
*Completed: 2026-03-17*
