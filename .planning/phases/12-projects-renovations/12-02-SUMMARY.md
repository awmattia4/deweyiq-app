---
phase: 12-projects-renovations
plan: 02
subsystem: ui
tags: [react, nextjs, dnd-kit, kanban, projects, pipeline, settings, sidebar]

# Dependency graph
requires:
  - phase: 12-projects-renovations
    plan: 01
    provides: projects, project_templates, project_phases, project_phase_tasks DB schema with RLS

provides:
  - /projects pipeline dashboard (kanban default + list toggle)
  - PipelineKanban with @dnd-kit/core drag-and-drop stage transitions
  - PipelineList with sortable columns and stage/type/status filters
  - ProjectCard component with type badge, contract amount, days-in-stage, on-hold indicator
  - CreateProjectDialog with customer search, template selection, auto-suggested project name
  - ProjectsDashboard client component with metrics cards and view toggle
  - src/lib/projects-constants.ts — shared PROJECT_STAGES/LABELS constants (non-server)
  - getProjects, createProject, updateProjectStage, holdProject, resumeProject server actions
  - getProjectTemplates, createProjectTemplate, updateProjectTemplate, deleteProjectTemplate server actions
  - getProjectPipelineMetrics server action (stage counts, stalled, lead-to-close rate)
  - ProjectTemplates settings UI in Settings > Projects tab (owner only)
  - Sidebar: Projects nav item between Work Orders and Billing
  - AppHeader: /projects added to PAGE_TITLES map

affects:
  - 12-03-PLAN (project detail — ProjectDetail type now exported from actions)
  - All future plans consuming project pipeline data

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "@dnd-kit/core DndContext + useDroppable + useDraggable for kanban drag-and-drop"
    - "Optimistic UI update on drag: update local state immediately, revert on server error"
    - "PROJECT_STAGES/LABELS/TYPE_LABELS in src/lib/projects-constants.ts — imported by both server and client components"
    - "Server page fetches data, passes to client ProjectsDashboard for interactive view toggle"

key-files:
  created:
    - src/actions/projects.ts
    - src/lib/projects-constants.ts
    - src/app/(app)/projects/page.tsx
    - src/app/(app)/projects/loading.tsx
    - src/components/projects/pipeline-kanban.tsx
    - src/components/projects/pipeline-list.tsx
    - src/components/projects/project-card.tsx
    - src/components/projects/projects-dashboard.tsx
    - src/components/projects/create-project-dialog.tsx
    - src/components/settings/project-templates.tsx
  modified:
    - src/components/shell/app-sidebar.tsx
    - src/components/shell/app-header.tsx
    - src/app/(app)/settings/page.tsx
    - src/components/settings/settings-tabs.tsx

key-decisions:
  - "PROJECT_STAGES/LABELS constants extracted to src/lib/projects-constants.ts because Next.js 'use server' files cannot export non-async values"
  - "Kanban drag uses 8px activationConstraint distance to prevent accidental drags when clicking cards"
  - "Project card navigates to /projects/[id] on click (entire card clickable, per user preference)"
  - "Pipeline metrics show stall threshold at 14 days (distinct from org_settings.project_inactivity_alert_days which is 7)"
  - "ProjectDetail type added to actions/projects.ts for compatibility with pre-existing Plan 03 stub components"

patterns-established:
  - "Pattern: Non-async shared constants live in src/lib/*-constants.ts, not in 'use server' action files"
  - "Pattern: Kanban columns use useDroppable; cards use useDraggable (not SortableContext) because items move between containers"

requirements-completed:
  - PROJ-02
  - PROJ-03
  - PROJ-04
  - PROJ-05
  - PROJ-06
  - PROJ-44
  - PROJ-80
  - PROJ-83
  - PROJ-91

# Metrics
duration: 16min
completed: 2026-03-17
---

# Phase 12 Plan 02: Project Template System, Pipeline Dashboard, and Kanban Board Summary

**@dnd-kit/core kanban board with 11 stage columns, drag-and-drop stage transitions, list view toggle, pipeline metrics, project creation dialog with template seeding, and template management in Settings**

## Performance

- **Duration:** 16 min
- **Started:** 2026-03-17T15:35:14Z
- **Completed:** 2026-03-17T15:51:12Z
- **Tasks:** 2
- **Files modified:** 14

## Accomplishments

- Built the full pipeline kanban board with @dnd-kit drag-and-drop: 11 stage columns (Lead through Warranty Active), drag overlay preview, optimistic updates with rollback on error
- Created all project CRUD server actions: getProjects, createProject (with sequential PRJ-XXXX numbering and template phase seeding), updateProjectStage, holdProject, resumeProject, plus full template management
- Added Projects to the sidebar (FolderKanban icon, between Work Orders and Billing) and /projects to PAGE_TITLES map in AppHeader
- Built Settings > Projects tab with full template CRUD (phase builder with task management, estimated days per phase)
- Discovered and fixed Next.js "use server" restriction: moved PROJECT_STAGES/LABELS to src/lib/projects-constants.ts

## Task Commits

Each task was committed atomically:

1. **Task 1: Server actions, template settings, sidebar/header** - `fb9cde3` (feat)
2. **Task 2: Pipeline kanban board, list view, projects dashboard** - `ca85d71` (feat)

**Plan metadata:** (to be added)

## Files Created/Modified

- `src/actions/projects.ts` - Full project CRUD, stage transitions, hold/resume, template management, pipeline metrics
- `src/lib/projects-constants.ts` - Shared PROJECT_STAGES, PROJECT_STAGE_LABELS, PROJECT_TYPE_LABELS constants
- `src/app/(app)/projects/page.tsx` - Server component fetching projects + metrics + templates
- `src/app/(app)/projects/loading.tsx` - Kanban skeleton with column headers + card placeholders
- `src/components/projects/pipeline-kanban.tsx` - DndContext kanban board with droppable columns and DragOverlay
- `src/components/projects/pipeline-list.tsx` - Sortable table with stage/type/status filters
- `src/components/projects/project-card.tsx` - Kanban card with type badge, amount, days-in-stage, on-hold badge
- `src/components/projects/projects-dashboard.tsx` - Client dashboard with kanban/list toggle + metrics cards
- `src/components/projects/create-project-dialog.tsx` - New project dialog with customer search + template selection
- `src/components/settings/project-templates.tsx` - Template CRUD with phase+task builder
- `src/components/shell/app-sidebar.tsx` - Added Projects nav item (FolderKanbanIcon)
- `src/components/shell/app-header.tsx` - Added /projects to PAGE_TITLES
- `src/app/(app)/settings/page.tsx` - Fetch and pass projectTemplates to SettingsTabs
- `src/components/settings/settings-tabs.tsx` - Added Projects tab with ProjectTemplates component

## Decisions Made

- PROJECT_STAGES, PROJECT_STAGE_LABELS, PROJECT_TYPE_LABELS extracted to `src/lib/projects-constants.ts` because Next.js "use server" files cannot export non-async values (objects, arrays, strings). All consuming components import from this constants file.
- 8px activation distance on PointerSensor to prevent accidental drags when tapping/clicking kanban cards
- Optimistic kanban: update state immediately on drag, revert if server action returns error — feels instant for good network, recovers gracefully for errors
- ProjectDetail type added to actions/projects.ts to support pre-existing Plan 03 stub components that were already committed

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Moved constants out of "use server" file**
- **Found during:** Task 2 (build verification)
- **Issue:** Next.js "use server" files can only export async functions. PROJECT_STAGES, PROJECT_STAGE_LABELS, PROJECT_TYPE_LABELS are non-async values (array + objects), causing build error: "A 'use server' file can only export async functions, found object."
- **Fix:** Created `src/lib/projects-constants.ts` with the constants. Updated all consuming files to import from there. The actions file imports them internally via the constants module.
- **Files modified:** src/lib/projects-constants.ts (created), all project components, settings-tabs.tsx (linter auto-fixed most)
- **Verification:** `npm run build` succeeds, /projects and /projects/[id] both build
- **Committed in:** ca85d71 (Task 2 commit)

**2. [Rule 2 - Missing Critical] Added ProjectDetail type**
- **Found during:** Task 2 (TypeScript check)
- **Issue:** Pre-existing Plan 03 stub components (`project-detail-client.tsx`, `project-detail-header.tsx`, `project-overview-tab.tsx`) imported `ProjectDetail` type from `@/actions/projects` — but that type didn't exist yet. TypeScript errors blocked build.
- **Fix:** Added `ProjectDetail extends ProjectSummary` interface with additional detail fields (lead_notes, site_notes, financing_status, activity_log, poolName, etc.)
- **Files modified:** src/actions/projects.ts
- **Verification:** TypeScript check passes, build succeeds
- **Committed in:** fb9cde3 (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 missing critical)
**Impact on plan:** Both fixes were required for build to succeed. No scope creep.

## Issues Encountered

- Pre-existing Plan 03 stub components were already committed to the repo (from a prior execution run that completed Plan 03 before this conversation). This caused TypeScript errors for missing types and missing component files. Fixed by adding `ProjectDetail` type and creating minimal stub components for the few that were still missing (`project-phases-tab.tsx`, `project-activity-log.tsx`). These were already committed by the time we needed them.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- /projects kanban board is live and builds successfully
- All project CRUD server actions are wired up
- PROJECT_STAGES constants pattern established — future project components follow the same import pattern
- Plan 03 (project detail page) is already committed and builds successfully
- Ready for Plan 04 and beyond

---
*Phase: 12-projects-renovations*
*Completed: 2026-03-17*
