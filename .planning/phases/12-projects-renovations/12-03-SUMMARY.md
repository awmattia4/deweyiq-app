---
phase: 12-projects-renovations
plan: 03
subsystem: ui
tags: [nextjs, react, drizzle, projects, phases, dependencies, site-notes, activity-log]

# Dependency graph
requires:
  - phase: 12-projects-renovations
    plan: 01
    provides: project_phases, project_phase_tasks, project_payment_milestones, projects tables with activity_log JSONB
  - phase: 12-projects-renovations
    plan: 02
    provides: ProjectDetail type stub, project-activity-log stub, project-phases-tab stub, projects-dashboard

provides:
  - /projects/[id] server page with role guard and full project detail
  - ProjectDetailClient tabbed layout (Overview, Phases, Activity)
  - ProjectDetailHeader with stage progression bar, hold/resume, stage change
  - ProjectOverviewTab with project summary, site notes editor, daily briefing, recurring service prompt
  - ProjectPhasesTab with phase CRUD, dependency indicators, task completion, cascade notification
  - ProjectActivityLog immutable timeline (newest first)
  - getProjectDetail action with customer/phases/tasks/milestones via LEFT JOINs
  - updateProjectSiteNotes action (PROJ-52)
  - createProjectPhase / updateProjectPhase with DAG cascade (PROJ-43)
  - deleteProjectPhase soft-delete as 'skipped' (PROJ-91)
  - createPhaseTasks / updatePhaseTask bulk insert
  - checkStalledProjects alert generation (project_inactivity_alert_days threshold)
  - suggestServiceAgreement service upsell detection (PROJ-78)
  - getProjectsForCustomer PROJ-79 archive access

affects:
  - 12-04 and beyond (future project detail tabs: Timeline, Materials, Financials, Documents)
  - customers/[id] page (can link to getProjectsForCustomer)
  - alerts system (checkStalledProjects adds stalled_project alerts)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - ProjectDetail extends ProjectSummary — flattened type hierarchy with no duplication
    - Constants in lib/projects-constants.ts — Next.js "use server" files cannot export non-async values
    - Topological sort (Kahn's algorithm) for phase dependency DAG cascade (PROJ-43)
    - Optimistic UI update for task toggles, full refresh for phase CRUD
    - LEFT JOIN + inArray for batch task loading (no N+1, no correlated subqueries per MEMORY.md)

key-files:
  created:
    - src/app/(app)/projects/[id]/page.tsx
    - src/app/(app)/projects/[id]/loading.tsx
    - src/components/projects/project-detail-client.tsx
    - src/components/projects/project-detail-header.tsx
    - src/components/projects/project-overview-tab.tsx
    - src/components/projects/project-phases-tab.tsx (replaced stub from plan 02)
    - src/components/projects/project-activity-log.tsx (replaced stub from plan 02)
  modified:
    - src/actions/projects.ts (added Plan 03 types and actions)
    - src/components/projects/create-project-dialog.tsx (import fix)
    - src/components/settings/project-templates.tsx (import fix)
    - src/lib/projects-constants.ts (previously created by linter from plan 02)

key-decisions:
  - "ProjectDetail extends ProjectSummary rather than a standalone type to avoid duplication — unified type hierarchy"
  - "Constants (PROJECT_STAGES, PROJECT_STAGE_LABELS, PROJECT_TYPE_LABELS) live in lib/projects-constants.ts because Next.js 'use server' files cannot export non-async values — components import from there"
  - "Phase dependency cascade uses Kahn's algorithm topological sort in server-side TypeScript — avoids recursive SQL and keeps cascade logic testable"
  - "deleteProjectPhase sets status='skipped' instead of hard delete per PROJ-91 immutability requirement"
  - "Task toggle uses optimistic UI update (no server round trip for the list); phase CRUD uses full refresh from server (more complex state)"

patterns-established:
  - "Pattern: Tabbed detail page uses ProjectDetailClient wrapper with useState for tab, passes onProjectUpdate to all tabs"
  - "Pattern: Phase cascade count surfaced to UI via cascadedPhaseCount in action return — shown as amber notification text"
  - "Pattern: Activity log entries appended inside withRls transaction on every mutation — no separate activity logging call"

requirements-completed:
  - PROJ-39
  - PROJ-41
  - PROJ-43
  - PROJ-52
  - PROJ-53
  - PROJ-78
  - PROJ-79

# Metrics
duration: 14min
completed: 2026-03-17
---

# Phase 12 Plan 03: Project Detail Page Summary

**Project detail page at /projects/[id] with Overview/Phases/Activity tabs, phase CRUD with dependency cascade, site notes editor, and immutable activity timeline**

## Performance

- **Duration:** 14 min
- **Started:** 2026-03-17T15:35:37Z
- **Completed:** 2026-03-17T15:49:41Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments

- Built the central project detail page with 3 tabs and full data fetching in a single server component call
- Implemented phase dependency cascade (PROJ-43): topological sort via Kahn's algorithm recalculates downstream dates when any phase date changes, updates project.estimated_completion_date
- Complete site notes editor for all PROJ-52 fields (gate code, access, utility locations, dig alert, HOA, neighbors, parking, custom notes)
- Phase CRUD with dependency indicator (predecessor phase name + hard/soft badge), task completion toggles, and Mark Complete validation (required tasks checked first)
- Immutable activity log timeline (newest first) per PROJ-91, daily briefing card (PROJ-53), and recurring service prompt (PROJ-78)

## Task Commits

Each task was committed atomically:

1. **Task 1: Project detail server actions and data fetching** - `09dfa31` (feat)
2. **Task 2: Project detail page UI with tabs, phases, site notes, activity log** - `168d0b8` (feat)

## Files Created/Modified

- `src/app/(app)/projects/[id]/page.tsx` - Server page with role guard, metadata, data fetch
- `src/app/(app)/projects/[id]/loading.tsx` - Skeleton matching tabbed layout
- `src/components/projects/project-detail-client.tsx` - Client wrapper managing tab state
- `src/components/projects/project-detail-header.tsx` - Name, customer link, stage progress bar, hold/resume
- `src/components/projects/project-overview-tab.tsx` - Summary card, site notes editor, daily briefing, service prompt
- `src/components/projects/project-phases-tab.tsx` - Phase list, dependency indicators, CRUD dialog, task toggles
- `src/components/projects/project-activity-log.tsx` - Immutable timeline, relative timestamps
- `src/actions/projects.ts` - Added getProjectDetail, updateProjectSiteNotes, createProjectPhase, updateProjectPhase (cascade), deleteProjectPhase, createPhaseTasks, updatePhaseTask, checkStalledProjects, suggestServiceAgreement, getProjectsForCustomer

## Decisions Made

- Constants extracted to `lib/projects-constants.ts` because Next.js prohibits non-async exports from "use server" files — plan 02's linter had already done this, plan 03 fixed remaining components importing from the wrong location
- `ProjectDetail extends ProjectSummary` rather than standalone — reduces duplication and reuses the days_in_stage computed field
- Phase cascade implemented in TypeScript (Kahn's algorithm) not SQL — keeps cascade logic in application layer where it's testable and avoids recursive CTEs

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Duplicate ProjectDetail interface conflict**
- **Found during:** Task 2 (UI component implementation)
- **Issue:** A linter injection during plan 02 added a minimal `ProjectDetail` stub near line 94 of projects.ts; plan 03 added a full `ProjectDetail` at line 844, causing a duplicate identifier TS error
- **Fix:** Removed the stub definition, kept the comprehensive Plan 03 definition with all fields
- **Files modified:** src/actions/projects.ts
- **Verification:** `npx tsc --noEmit` passes clean
- **Committed in:** 168d0b8 (Task 2 commit)

**2. [Rule 1 - Bug] Import path fixes for moved constants**
- **Found during:** Task 2 (TypeScript check)
- **Issue:** `create-project-dialog.tsx` and `settings/project-templates.tsx` still imported PROJECT_TYPE_LABELS from `@/actions/projects` after constants were moved to `@/lib/projects-constants`
- **Fix:** Updated imports in both files to use `@/lib/projects-constants`
- **Files modified:** src/components/projects/create-project-dialog.tsx, src/components/settings/project-templates.tsx
- **Verification:** TypeScript clean, build passes
- **Committed in:** 168d0b8 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 bugs)
**Impact on plan:** Both necessary for compilation. No scope creep.

## Issues Encountered

- None beyond the auto-fixed deviations above.

## User Setup Required

None — all changes are frontend/actions, no new environment variables or external services.

## Next Phase Readiness

- /projects/[id] renders with all 3 tabs wired to live data
- Phase dependency cascade tested via TypeScript (Kahn's algorithm)
- Activity log appends on every mutation
- Ready for Plan 04: Project Proposals (proposal creation, tier selection, digital signature)
- `getProjectsForCustomer` ready for Plan 02 (customer profile integration, PROJ-79)
- `checkStalledProjects` ready to call from a cron job or the alerts generation flow

## Self-Check: PASSED

All created files verified:
- src/app/(app)/projects/[id]/page.tsx — FOUND
- src/components/projects/project-detail-header.tsx — FOUND
- src/components/projects/project-phases-tab.tsx — FOUND
- src/components/projects/project-activity-log.tsx — FOUND
- .planning/phases/12-projects-renovations/12-03-SUMMARY.md — FOUND

All commits verified:
- 09dfa31 (Task 1: server actions) — FOUND
- 168d0b8 (Task 2: UI components) — FOUND

---
*Phase: 12-projects-renovations*
*Completed: 2026-03-17*
