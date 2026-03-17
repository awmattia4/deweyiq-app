---
phase: 12-projects-renovations
plan: 11
subsystem: ui
tags: [nextjs, react, gantt, scheduling, drag-to-reschedule, dependency-cascade, weather, svar-ui]

# Dependency graph
requires:
  - phase: 12-projects-renovations
    plan: 03
    provides: projectPhases schema, cascadeDependencies Kahn algorithm, project activity_log pattern
  - phase: 10-smart-features-ai
    provides: open-meteo weather API client, classifyWeatherDay function

provides:
  - /projects/[id]/timeline page with interactive Gantt chart
  - GanttTimeline component wrapping @svar-ui/react-gantt (WillowDark dark theme)
  - TimelinePageClient with weather alert banner and auto-schedule button
  - projects-scheduling.ts server actions (updatePhaseDates, cascadeDependencies, assignCrewToPhase, checkWeatherDelay, getGanttData)
  - Timeline tab in project detail navigation

affects:
  - src/components/projects/project-detail-client.tsx (Timeline tab added)
  - next.config.ts (webpack alias for @svar-ui module resolution)

# Tech tracking
tech-stack:
  added:
    - "@svar-ui/react-gantt@2.5.2 — interactive Gantt chart with drag/resize/dependency lines"
  patterns:
    - "SVAR Gantt loaded with next/dynamic ssr=false (client-only WebGL rendering)"
    - "WillowDark wrapper for dark mode — wraps entire Gantt, no custom CSS variable juggling needed"
    - "webpack resolve.alias in next.config.ts to fix @svar-ui exports map extension mismatch (.cjs vs .cjs.js)"
    - "Direct node_modules CSS import via relative path to bypass exports map CSS resolution issue"
    - "Kahn topological sort for dependency cascade (reuses Plan 03 algorithm, now in dedicated actions file)"
    - "Optimistic local state update on drag + full server refresh on cascade"
    - "creoCascadeDependencies runs in separate server action, called by updatePhaseDates after date change"

key-files:
  created:
    - src/actions/projects-scheduling.ts
    - src/components/projects/gantt-timeline.tsx
    - src/components/projects/gantt-dark-theme.css
    - src/app/(app)/projects/[id]/timeline/page.tsx
    - src/components/projects/timeline-page-client.tsx
  modified:
    - src/components/projects/project-detail-client.tsx (Timeline tab added)
    - next.config.ts (webpack alias for @svar-ui/react-gantt)

key-decisions:
  - "@svar-ui/react-gantt installed and resolved via webpack alias in next.config.ts — package.json exports map references ./dist/index.cjs.js but file is ./dist/index.cjs, causing webpack resolution failure. Fix: alias to ./dist/index.es.js directly"
  - "SVAR WillowDark theme used for dark mode — avoids need to override individual CSS variables; the entire app is dark-first so no theme toggle needed"
  - "CSS imported via direct node_modules relative path (../../../node_modules/@svar-ui/react-gantt/dist/index.css) instead of @svar-ui/react-gantt/style.css exports map subpath — webpack CSS loader doesn't resolve subpath exports for CSS files"
  - "getGanttData uses LEFT JOIN + GROUP BY for task counts — no correlated subqueries per MEMORY.md RLS pitfall"
  - "Weather check returns alerts only — office decides to delay, never auto-delays (PROJ-45)"

patterns-established:
  - "Pattern: Timeline page follows same structure as materials/documents pages — separate server page + client wrapper component"
  - "Pattern: Weather alert banner placed in page header (not inside Gantt) so it's always visible even when scrolled"
  - "Pattern: Auto-Schedule button triggers cascadeDependencies from the UI, then router.refresh() for updated dates"

requirements-completed:
  - PROJ-40
  - PROJ-41
  - PROJ-42
  - PROJ-43
  - PROJ-45

# Metrics
duration: 9min
completed: 2026-03-17
---

# Phase 12 Plan 11: Gantt Timeline Summary

**Interactive Gantt timeline at /projects/[id]/timeline using @svar-ui/react-gantt with drag-to-reschedule, dependency cascade, weather delay alerts, and WillowDark theme for dark mode**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-17T16:53:33Z
- **Completed:** 2026-03-17T17:02:33Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Built scheduling server actions: `updatePhaseDates` (move phase), `cascadeDependencies` (Kahn topological sort to shift downstream), `assignCrewToPhase` (with route stop conflict detection), `checkWeatherDelay` (Open-Meteo for outdoor phases), `getGanttData` (SVAR-formatted output)
- Interactive Gantt chart at `/projects/[id]/timeline` — drag phase bars to reschedule, resize to change duration, dependency lines rendered for hard phase links
- Dark mode via SVAR's built-in `WillowDark` wrapper — no manual CSS variable mapping required
- Weather alert banner shows outdoor phases with bad weather in the next 7 days (storms, extreme heat, high wind)
- Auto-Schedule button triggers `cascadeDependencies` on demand to fix any out-of-order phase dates
- Timeline tab added to project detail navigation
- Fixed @svar-ui webpack module resolution issue (exports map extension mismatch)

## Task Commits

Each task was committed atomically:

1. **Task 1: Scheduling server actions** - `242bd90` (feat)
2. **Task 2: Gantt timeline UI** - `373d65a` (feat)

## Files Created/Modified

- `src/actions/projects-scheduling.ts` — 5 server actions for scheduling, dependency cascade, crew assignment, weather, Gantt data
- `src/components/projects/gantt-timeline.tsx` — GanttTimeline React component (SVAR wrapper, dark mode, status colors, zoom controls, legend)
- `src/components/projects/gantt-dark-theme.css` — Status-color overrides for task bars (not_started/in_progress/complete/on_hold/skipped)
- `src/app/(app)/projects/[id]/timeline/page.tsx` — Server page with auth guard + parallel data fetch
- `src/components/projects/timeline-page-client.tsx` — Client wrapper with auto-schedule, weather banner, optimistic task state
- `src/components/projects/project-detail-client.tsx` — Added Timeline tab to navigation
- `next.config.ts` — Webpack alias to resolve @svar-ui/react-gantt module path issue

## Decisions Made

- `@svar-ui/react-gantt` resolved via `webpack.resolve.alias` in `next.config.ts` — the package's `package.json` exports map references `./dist/index.cjs.js` (with `.js`) but the actual file is `./dist/index.cjs` (without `.js`). Webpack fails to find the module. Fix: alias the package to the ESM bundle `./dist/index.es.js` directly.
- CSS imported via relative path `../../../node_modules/@svar-ui/react-gantt/dist/index.css` — webpack CSS loader doesn't follow subpath exports (`@svar-ui/react-gantt/style.css`) reliably, so direct path is used instead.
- `WillowDark` theme chosen over manual CSS variable overrides — the SVAR library ships a complete dark theme; manual overrides risk missing variables and diverging from library updates.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] @svar-ui/react-gantt webpack module resolution failure**
- **Found during:** Task 2 (npm run build)
- **Issue:** Package `@svar-ui/react-gantt` has exports map entry `"require": "./dist/index.cjs.js"` but the actual file is `./dist/index.cjs`. Webpack resolves the package using the exports map and fails with "Module not found".
- **Fix:** Added `webpack.resolve.alias` in `next.config.ts` pointing `@svar-ui/react-gantt` to `./dist/index.es.js` (the ESM bundle). Also added CSS path alias for the style import.
- **Files modified:** `next.config.ts`

**2. [Rule 3 - Blocking] @svar-ui/react-gantt/style.css subpath not resolved by CSS loader**
- **Found during:** Task 2 (npm run build after fix #1)
- **Issue:** Even with the JS alias, `import "@svar-ui/react-gantt/style.css"` still failed — webpack's CSS loader doesn't follow package.json exports map subpath entries for CSS files.
- **Fix:** Changed import to direct relative path from node_modules: `../../../node_modules/@svar-ui/react-gantt/dist/index.css`.
- **Files modified:** `src/components/projects/gantt-timeline.tsx`

**Total deviations:** 2 auto-fixed (both Rule 3 blocking build issues)
**Impact on plan:** Both required to achieve buildable output. No scope changes.

## Issues Encountered

- Pre-existing build errors for `plaid` / `react-plaid-link` packages (from a different plan) remain unresolved — out of scope for this plan, logged in pre-existing TypeScript errors.

## User Setup Required

None — no new environment variables or external service API keys needed. Weather uses the existing Open-Meteo free API (no key required).

## Next Phase Readiness

- `/projects/[id]/timeline` renders with SVAR Gantt chart populated from phase data
- Dependency cascade tested (Kahn's algorithm, reuses Plan 03 logic)
- Weather delay alerts surface outdoor phases with bad weather forecast
- Auto-Schedule button available for one-click dependency repair
- Ready for Plan 12: Field Project Workflow (tech-facing project stop, time tracking, photo capture)

## Self-Check: PASSED

All created files verified:
- src/actions/projects-scheduling.ts — FOUND
- src/components/projects/gantt-timeline.tsx — FOUND
- src/components/projects/gantt-dark-theme.css — FOUND
- src/app/(app)/projects/[id]/timeline/page.tsx — FOUND
- src/components/projects/timeline-page-client.tsx — FOUND

All commits verified:
- 242bd90 (Task 1: server actions) — FOUND
- 373d65a (Task 2: UI components) — FOUND

---
*Phase: 12-projects-renovations*
*Completed: 2026-03-17*
