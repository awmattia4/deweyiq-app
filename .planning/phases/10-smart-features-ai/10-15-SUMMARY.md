---
phase: 10-smart-features-ai
plan: 15
subsystem: ui
tags: [internal-notes, service-visits, dexie, offline, flags, office-only]

# Dependency graph
requires:
  - phase: 03-field-tech-app
    provides: stop workflow, service visits table, Dexie offline draft system
  - phase: 09-field-operations-polish
    provides: equipment readings, dosing amounts on service visits

provides:
  - internal_notes and internal_flags columns on service_visits
  - InternalNotes tech input component (collapsible, Office only badge, flag chips, handoff display)
  - FlagBadge display component for timeline and handoff context
  - updateInternalNotes server action for post-completion office editing
  - ServiceHistoryTimeline updated to show internal notes for owner/office roles
  - Inline edit capability on customer timeline for office-side note annotation

affects:
  - 10-smart-features-ai NOTIF-05 stop completion notification (flags enrich urgency metadata)
  - customer portal (must never show internal_notes — verified by role gate)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Role-gated UI: userRole prop passed from server page to client component, conditional render hides internal sections from tech/customer"
    - "Inline edit pattern: read state + edit button → save/cancel via useTransition + server action"
    - "FlagBadge exported from internal-notes.tsx for reuse in timeline and handoff sections"

key-files:
  created:
    - src/lib/db/migrations/0010_tranquil_spencer_smythe.sql
    - src/components/field/internal-notes.tsx
  modified:
    - src/lib/db/schema/service-visits.ts
    - src/actions/visits.ts
    - src/components/customers/service-history-timeline.tsx
    - src/app/(app)/customers/[id]/page.tsx
    - src/hooks/use-visit-draft.ts
    - src/lib/offline/db.ts

key-decisions:
  - "Internal notes are collapsible in the tech workflow (Notes tab) — tech actively opens the section, reducing cognitive load on routine stops"
  - "Previous tech notes shown as collapsed sub-section for handoff context — visible only after expanding InternalNotes"
  - "Customer timeline shows inline edit (not a separate modal) for office note annotation — keeps context in view"
  - "Role gate implemented at prop-level (userRole passed from server page) — internal notes section absent from DOM for tech/customer roles entirely"
  - "FlagBadge extracted as separate export from internal-notes.tsx so timeline can import it without circular dependency"

patterns-established:
  - "InternalNotes component: amber-tinted border/background + lock icon signals internal-only data at a glance"
  - "Flag chips: tappable toggles with per-flag color semantics (amber=follow-up, blue=parts, red=safety, gray=handoff)"

requirements-completed:
  - NOTIF-05

# Metrics
duration: 15min
completed: 2026-03-16
---

# Phase 10 Plan 15: Internal Service Notes Summary

**Tech-to-office internal notes system with flag chips, handoff context, and office-editable timeline annotations — hidden from all customer-facing views**

## Performance

- **Duration:** 15 min
- **Started:** 2026-03-16T13:07:00Z
- **Completed:** 2026-03-16T13:22:00Z
- **Tasks:** 2 (Task 1 pre-committed; Task 2 completed this session)
- **Files modified:** 6

## Accomplishments

- Internal notes + flags stored on `service_visits` (text + jsonb columns, migration 0010)
- `InternalNotes` component: collapsible with "Office only" badge, flag chip toggles, previous-tech handoff section
- `FlagBadge` export for reuse in customer timeline and handoff context
- `updateInternalNotes` server action for office post-completion annotation
- `ServiceHistoryTimeline` updated: real chemistry data displayed (was "--" stubs), internal notes section shown to owner/office only, inline edit with save/cancel
- `CustomerProfilePage` passes `userRole` to timeline and includes `internal_notes`/`internal_flags` in visit mapping

## Task Commits

Each task was committed atomically:

1. **Task 1: Internal notes schema and server action** - `ddfb061` (feat)
2. **Task 2: Internal notes UI for tech and office views** - `9977460` (feat)

**Plan metadata:** (follows in final commit)

## Files Created/Modified

- `src/lib/db/schema/service-visits.ts` - Added `internal_notes` (text) and `internal_flags` (jsonb string[]) columns
- `src/lib/db/migrations/0010_tranquil_spencer_smythe.sql` - Migration adding the two columns
- `src/actions/visits.ts` - Extended `CompleteStopInput` with `internalNotes`/`internalFlags`; added `updateInternalNotes` action; `getStopContext` populates `previousInternalNotes` from last visit
- `src/components/field/internal-notes.tsx` - InternalNotes component + FlagBadge export (new file added in Task 1 session)
- `src/hooks/use-visit-draft.ts` - Added `updateInternalNotesDraft` callback
- `src/lib/offline/db.ts` - Added `internalNotes?` and `internalFlags?` to `VisitDraft` type
- `src/components/field/stop-workflow.tsx` - Renders InternalNotes in Notes tab, passes draft fields through to completeStop
- `src/components/customers/service-history-timeline.tsx` - Real chemistry display, internal notes section (role-gated), inline edit capability
- `src/app/(app)/customers/[id]/page.tsx` - Passes `userRole` to ServiceHistoryTimeline, includes `internal_notes`/`internal_flags` in visit mapping

## Decisions Made

- Collapsible section for tech workflow reduces friction on routine stops — tech only opens it when needed
- Previous tech notes collapsed by default (one more tap) so recent notes don't crowd the current workflow
- Role gate at the component prop level ensures internal notes are absent from the DOM for non-office roles
- Inline edit on timeline (not modal) keeps the office in context while annotating historical visits

## Deviations from Plan

**1. [Rule 2 - Missing Critical] Added real chemistry readings to ServiceHistoryTimeline**
- **Found during:** Task 2 (customer timeline update)
- **Issue:** Timeline was showing "--" stubs for pH/Cl/Alk even though chemistry_readings data exists in the DB. The NO-PLACEHOLDER-UI rule requires wiring real data through.
- **Fix:** Added proper chemistry_readings display to TimelineCard — iterates actual readings in display-priority order, falls back to "--" stubs only when no readings exist
- **Files modified:** src/components/customers/service-history-timeline.tsx
- **Committed in:** 9977460 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical / no-placeholder rule)
**Impact on plan:** Fix was necessary to comply with NO-PLACEHOLDER-UI user preference. No scope creep.

## Issues Encountered

None — pre-existing type errors in `company-settings.ts`, `invoices.ts`, and other files were present before this plan and are out of scope per SCOPE BOUNDARY rule.

## Next Phase Readiness

- Internal notes fully wired: tech writes during stop, office reads on customer timeline, office can annotate post-completion
- `FlagBadge` available for reuse in alerts page or notification display if needed
- NOTIF-05 can now include flag metadata in urgency escalation (needs_follow_up/safety_concern → needs_action urgency)
- Customer portal never receives internal_notes data (role gate confirmed)

---
*Phase: 10-smart-features-ai*
*Completed: 2026-03-16*
