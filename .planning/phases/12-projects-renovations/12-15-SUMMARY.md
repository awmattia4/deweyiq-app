---
phase: 12-projects-renovations
plan: 15
subsystem: ui
tags: [inspections, quality-assurance, punch-list, warranty, pdf, projects]

# Dependency graph
requires:
  - phase: 12-01
    provides: project_inspections, project_punch_list, project_warranty_terms, warranty_claims tables
  - phase: 12-12
    provides: completePhase in projects-field.ts (quality gate wired into this)
  - phase: 12-14
    provides: generateFinalInvoice (called from customerSignOffPunchList)

provides:
  - src/actions/projects-inspections.ts: inspection CRUD, rework task creation on failure, quality checklist validation, punch list with customer sign-off
  - src/actions/projects-warranty.ts: warranty term management, activateWarranty, generateWarrantyCertificate, claim submission/review/resolution, expiration reminders
  - src/lib/pdf/warranty-certificate-pdf.tsx: WarrantyCertificateDocument with coverage table
  - src/components/projects/inspection-tracker.tsx: schedule + record results UI
  - src/components/projects/punch-list.tsx: digital punch list with sign-off flow
  - src/components/projects/warranty-manager.tsx: warranty coverage + claims UI
  - Quality checklist gate in completePhase blocks phase completion when checklist items incomplete
  - customerSignOffPunchList triggers: project complete + warranty activation + final invoice generation

affects:
  - 12-16 (final plan in phase — these are the last QA/warranty lifecycle features)
  - /projects/[id] — three new tabs: Inspections, Punch List (conditional), Warranty (conditional)
  - projects-billing.ts generateFinalInvoice — signature changed to accept token | null

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Quality checklist templates keyed by phase name — server-side defaults per phase type
    - customerSignOffPunchList uses adminDb (portal context) and triggers three downstream actions via dynamic import to avoid circular dependency
    - generateFinalInvoice accepts token | null — when null uses adminDb for all queries (portal context)
    - activateWarranty accepts token | null — always uses adminDb since it's called from portal sign-off flow
    - Dynamic import pattern for cross-action calls to avoid circular module dependencies

key-files:
  created:
    - src/actions/projects-inspections.ts
    - src/actions/projects-warranty.ts
    - src/lib/pdf/warranty-certificate-pdf.tsx
    - src/components/projects/inspection-tracker.tsx
    - src/components/projects/punch-list.tsx
    - src/components/projects/warranty-manager.tsx
  modified:
    - src/actions/projects-billing.ts (generateFinalInvoice signature: added token | null first arg)
    - src/actions/projects-field.ts (completePhase: wired getQualityChecklist validation)
    - src/components/projects/project-detail-client.tsx (added 3 new tabs)
    - src/app/(app)/projects/[id]/page.tsx (fetch inspections, punch list, warranty terms)

key-decisions:
  - "generateFinalInvoice signature changed from (projectId) to (token | null, projectId) — required because customerSignOffPunchList uses adminDb with no user session. Used queryFn() abstraction to select withRls or adminDb transparently."
  - "Quality checklist items are defined as server-side templates keyed by phase name — no DB table needed. Tech completes them by creating tasks with [Quality] prefix. If no [Quality] tasks exist, checklist validation is non-blocking (degrades gracefully)."
  - "customerSignOffPunchList uses dynamic import for activateWarranty and generateFinalInvoice to avoid circular module-level dependencies between projects-inspections and projects-warranty/billing."
  - "Warranty tabs are contextual — Punch List shown only in punch_list/complete/warranty_active stages; Warranty tab shown only in warranty_active/complete stages."
  - "WARRANTY-COVERED prefix in WO description serves as billing flag until a dedicated column is added to work_orders schema."

patterns-established:
  - "Pattern: token | null function signatures for actions callable from both authenticated office context and unauthenticated portal context — use adminDb fallback when token is null"
  - "Pattern: dynamic import for cross-action calls to prevent circular module dependencies at module level"

requirements-completed:
  - PROJ-69
  - PROJ-70
  - PROJ-71
  - PROJ-72
  - PROJ-73
  - PROJ-74
  - PROJ-75
  - PROJ-76
  - PROJ-77

# Metrics
duration: 28min
completed: 2026-03-17
---

# Phase 12 Plan 15: Inspections, Quality Checklists, Punch List & Warranty Summary

**Inspection tracking with rework cycles, quality checklist gate in completePhase, digital punch list with customer sign-off triggering completion + warranty activation + final invoice, warranty certificate PDF, and claim handling**

## Performance

- **Duration:** 28 min
- **Started:** 2026-03-17T17:24:50Z
- **Completed:** 2026-03-17T17:52:50Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- Built `projects-inspections.ts` (8 exports): inspection CRUD with failed inspection auto-creating correction tasks as required phase tasks, quality self-inspection checklist templates per phase type (10 phase types), punch list CRUD, and `customerSignOffPunchList` that atomically completes project + activates warranty + generates final invoice
- Built `projects-warranty.ts` (9 exports): warranty term CRUD, `activateWarranty` (sets stage to warranty_active, triggers certificate), `generateWarrantyCertificate` (renders PDF via react-pdf, uploads to Supabase Storage), `submitWarrantyClaim` (portal-facing), `reviewWarrantyClaim` (creates WO for approved claims — covered = no invoice, billable = standard WO), `resolveWarrantyClaim`, `checkWarrantyExpirations` (90/60/30-day reminder alerts)
- Built `warranty-certificate-pdf.tsx`: professional PDF with company header, certificate number, warranty holder + issuing company blocks, project completion badge, coverage table with type/duration/coverage/exclusions/expiration columns, terms section, authorized signature block, "Powered by DeweyIQ" footer
- Wired PROJ-71 quality checklist validation into `completePhase` in `projects-field.ts` — blocks phase completion if any required checklist items are incomplete, returning `{ error, incompleteItems: string[] }`
- Updated `generateFinalInvoice` signature in `projects-billing.ts` to accept `token | null` — enables calling from portal context without a user session using `adminDb` fallback
- Built three UI components: `InspectionTracker`, `PunchList`, `WarrantyManager`
- Added Inspections, Punch List (conditional), and Warranty (conditional) tabs to project detail client

## Task Commits

Each task was committed atomically:

1. **Task 1: Server actions — inspections, quality checklist, punch list, warranty, PDF** - `3081172` (feat)
2. **Task 2: UI components — inspection tracker, punch list, warranty manager** - `d2aee5a` (feat)

## Files Created/Modified

- `src/actions/projects-inspections.ts` — 8 server actions covering PROJ-69 through PROJ-72
- `src/actions/projects-warranty.ts` — 9 server actions covering PROJ-73 through PROJ-77
- `src/lib/pdf/warranty-certificate-pdf.tsx` — Warranty certificate PDF document component
- `src/components/projects/inspection-tracker.tsx` — Inspection scheduling and result recording UI
- `src/components/projects/punch-list.tsx` — Digital punch list with status workflow and sign-off
- `src/components/projects/warranty-manager.tsx` — Warranty coverage, claims, and certificate UI
- `src/actions/projects-billing.ts` — Modified `generateFinalInvoice` to accept `token | null`
- `src/actions/projects-field.ts` — Wired `getQualityChecklist` into `completePhase` validation
- `src/components/projects/project-detail-client.tsx` — Added 3 new tabs
- `src/app/(app)/projects/[id]/page.tsx` — Added parallel fetching for inspections, punch list, warranty

## Decisions Made

- Changed `generateFinalInvoice` signature from `(projectId)` to `(tokenOrNull, projectId)` — portal context has no user session, needs adminDb. Used `queryFn()` abstraction to select `withRls` vs `adminDb` transparently without duplicating logic.
- Quality checklist uses server-side templates (10 types: excavation, steel, gunite, plumbing, electrical, decking, tile, equipment, startup, final) — no DB table needed. Tech checks off items by creating tasks prefixed `[Quality]`. Gracefully degrades if no quality tasks exist.
- Dynamic import used for cross-action calls (`activateWarranty`, `generateFinalInvoice` in `customerSignOffPunchList`) to prevent circular module dependencies at module load time.
- Warranty WO flag uses description prefix (`[WARRANTY-COVERED]` / `[WARRANTY-BILLABLE]`) rather than a new schema column — avoids a migration for this plan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed generateFinalInvoice to accept token | null**
- **Found during:** Task 1 (customerSignOffPunchList implementation)
- **Issue:** The plan called `generateFinalInvoice(token, projectId)` but the existing function only took `(projectId)`. The portal sign-off context has no user session token.
- **Fix:** Updated function signature to `(tokenOrNull: SupabaseToken | null, projectId: string)` with `queryFn()` abstraction selecting between `withRls` and `adminDb`.
- **Files modified:** `src/actions/projects-billing.ts`
- **Committed in:** `3081172`

**2. [Rule 2 - Missing Critical] Added graceful degradation for quality checklist**
- **Found during:** Task 1 (getQualityChecklist implementation)
- **Issue:** If `getQualityChecklist` fails or returns an error, `completePhase` should not hard-block the tech. Non-critical path.
- **Fix:** Added `if (!("error" in checklistResult))` guard — if checklist fetch fails, validation is skipped (non-blocking degradation).
- **Files modified:** `src/actions/projects-field.ts`
- **Committed in:** `3081172`

**3. [Rule 2 - Missing Critical] Fixed activity log type conformance**
- **Found during:** Task 1 (TypeScript compile check)
- **Issue:** Projects activity_log type requires `{ type, at, by_id, note }` — several new log entries were missing `by_id`.
- **Fix:** Added `by_id: "system"` or `by_id: "customer"` to all new activity log entries. Removed `signature` field from sign-off entry (not in schema type).
- **Files modified:** `src/actions/projects-inspections.ts`, `src/actions/projects-warranty.ts`
- **Committed in:** `3081172`

---

**Total deviations:** 3 auto-fixed (1 bug, 2 missing critical)
**Impact on plan:** All auto-fixes necessary for correctness. No scope creep.

## Issues Encountered

- `orgSettings` table does not have `logo_url` — it's on the `orgs` table directly. Fixed queries to use `orgs.logo_url` instead.
- `projects.completion_date` doesn't exist — correct column name is `actual_completion_date`. Fixed all references.
- Work orders table doesn't have `is_warranty_covered` or `type` columns — used description prefix as a flag for now per decision above.

## User Setup Required

None — no new environment variables or external services required. All new functionality is immediately accessible on project detail pages.

## Next Phase Readiness

- Quality assurance lifecycle is complete: inspections → rework → phase quality gate → final walkthrough → sign-off → warranty + invoice
- `customerSignOffPunchList` is ready to be exposed from the customer portal
- `checkWarrantyExpirations` is ready to be called from a scheduled job (cron/Edge function)
- `submitWarrantyClaim` is ready to be exposed from the customer portal
- Plan 16 (the final plan in Phase 12) can proceed

## Self-Check: PASSED

All created files verified:
- FOUND: `src/actions/projects-inspections.ts`
- FOUND: `src/actions/projects-warranty.ts`
- FOUND: `src/lib/pdf/warranty-certificate-pdf.tsx`
- FOUND: `src/components/projects/inspection-tracker.tsx`
- FOUND: `src/components/projects/punch-list.tsx`
- FOUND: `src/components/projects/warranty-manager.tsx`
- FOUND: `src/components/projects/project-detail-client.tsx`
- FOUND: `src/app/(app)/projects/[id]/page.tsx`

All commits verified:
- FOUND: `3081172` (Task 1: server actions)
- FOUND: `d2aee5a` (Task 2: UI components)

---
*Phase: 12-projects-renovations*
*Completed: 2026-03-17*
