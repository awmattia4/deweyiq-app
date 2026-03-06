---
phase: 03-field-tech-app
plan: "04"
subsystem: ui
tags: [react, dexie, offline, tabs, chemistry, lsi, dosing, next-js]

# Dependency graph
requires:
  - phase: 03-field-tech-app
    plan: "01"
    provides: "Dexie VisitDraft schema, route data types"
  - phase: 03-field-tech-app
    plan: "02"
    provides: "calculateCSI, interpretCSI, generateDosingRecommendations, classifyReading, targets"
provides:
  - "Stop workflow page at /routes/[stopId] with Chemistry | Tasks | Photos | Notes tabs"
  - "useVisitDraft hook for offline-first Dexie draft management"
  - "ChemistryGrid with 10-parameter quick-entry grid, range validation, LOW/HIGH badges"
  - "ChemistryDosing with live CSI/LSI display and product-aware dosing recommendations"
  - "getStopContext() server action for fetching stop context via LEFT JOIN pattern"
affects: ["03-05", "03-06", "03-07"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "useVisitDraft hook pattern: useLiveQuery from dexie-react-hooks wraps Dexie reads/writes for zero-network offline updates"
    - "Composite stopId key format: {customerId}-{poolId} (two 36-char UUIDs joined) decoded by splitting into 10 UUID groups"
    - "inputMode=decimal on text inputs for iOS decimal keypad — NOT type=number per locked Research pitfall 6"
    - "Live chemistry calculation pattern: useMemo on readings state feeds calculateCSI/generateDosingRecommendations client-side"
    - "crypto.randomUUID() for server-side visit ID generation — no uuid dependency needed in Node 14.17+"

key-files:
  created:
    - src/actions/visits.ts
    - src/app/(app)/routes/[stopId]/page.tsx
    - src/app/(app)/routes/[stopId]/loading.tsx
    - src/components/field/stop-workflow.tsx
    - src/components/field/chemistry-grid.tsx
    - src/components/field/chemistry-dosing.tsx
    - src/hooks/use-visit-draft.ts
  modified: []

key-decisions:
  - "Chemistry tab default: Chemistry is default active tab as it is the primary tech action"
  - "Notes tab has inline textarea (not a placeholder): captures basic visit notes even before Plan 03-06 enriches it"
  - "Temperature has no TargetRanges key — paramKey=null skips classifyReading, always shows as 'ok'"
  - "Pool volume default: 15000 gallons used when pool.volume_gallons is null to avoid dividing by zero in dosing"

patterns-established:
  - "ChemParam.key=null pattern: params with no range classification use key=null to skip classifyReading"
  - "StopWorkflow layout: min-h-[calc(100dvh-4rem)] + fixed bottom bar with pb-28 content padding prevents overlap"

requirements-completed:
  - FIELD-03
  - FIELD-04
  - FIELD-05
  - FIELD-11

# Metrics
duration: 6min
completed: 2026-03-06
---

# Phase 3 Plan 04: Stop Workflow Summary

**Stop workflow page at /routes/[stopId] with 4-tab shell, offline-first Dexie draft management, 10-parameter chemistry grid with live CSI and product-aware dosing recommendations**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-06T15:33:20Z
- **Completed:** 2026-03-06T15:39:41Z
- **Tasks:** 2
- **Files modified:** 7 created

## Accomplishments
- Stop workflow page at /routes/[stopId] decodes composite {customerId}-{poolId} key, fetches context server-side, renders full tab shell
- ChemistryGrid with all 10 parameters (FC, CC, pH, TA, CYA, CH, TDS, Phosphates, Salt, Temp) using inputMode="decimal" inputs, range-colored cells, LOW/HIGH badges, and previous-visit muted column
- ChemistryDosing panel with live CSI calculation (color-coded: green/yellow/red) and exact product-aware dosing recommendations (fl oz for liquids, lbs for dry)
- useVisitDraft hook using useLiveQuery creates or resumes Dexie VisitDraft on mount — completely offline, zero-latency persistence
- Complete button always visible in fixed bottom bar, enabled when any chemistry reading or task is completed

## Task Commits

Each task was committed atomically:

1. **Task 1: Stop workflow page shell with tab layout and visit draft management** - `1e5f2f5` (feat)
2. **Task 2: Chemistry grid with live LSI and dosing recommendations** - `557f215` (feat)

## Files Created/Modified
- `src/actions/visits.ts` — getStopContext() server action; fetches pool/customer/products/checklist/prev chemistry via LEFT JOIN pattern with withRls()
- `src/app/(app)/routes/[stopId]/page.tsx` — Server component decoding composite stopId, calling getStopContext, passing context to StopWorkflow
- `src/app/(app)/routes/[stopId]/loading.tsx` — Loading skeleton matching tab+grid layout
- `src/components/field/stop-workflow.tsx` — Tab host (Chemistry | Tasks | Photos | Notes) with always-visible Complete button in fixed bottom bar
- `src/components/field/chemistry-grid.tsx` — 10-parameter quick-entry grid with inputMode="decimal", range classification, LOW/HIGH badges, previous readings column
- `src/components/field/chemistry-dosing.tsx` — Live CSI/LSI display + product-aware dosing recommendations panel
- `src/hooks/use-visit-draft.ts` — useLiveQuery-based Dexie draft hook for offline-first visit data persistence

## Decisions Made
- Chemistry tab is the default tab — it's the primary action a tech performs at every stop
- Temperature parameter uses `key: null` since `TargetRanges` has no temperature field (no range to classify against)
- Pool volume defaults to 15,000 gallons when `pool.volume_gallons` is null to prevent zero-division in dosing calculations
- Notes tab has a functional textarea (not a placeholder) even though Plan 03-06 will enhance it — basic notes capture works from day one

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed pre-existing TypeScript error in stop-list.tsx blocking build**
- **Found during:** Task 1 verification (npm run build)
- **Issue:** `DraggableAttributes` not assignable to `Record<string, unknown>` in `stop-list.tsx` line 76-77 — pre-existing error from 03-03 that was cached and surfaced during full TypeScript check
- **Fix:** A linter auto-corrected the cast; confirmed by reading updated file and verifying TypeScript passes
- **Files modified:** `src/components/field/stop-list.tsx` (linter-managed)
- **Verification:** `npm run build` succeeds after clearing `.next/cache`
- **Committed in:** 557f215 (already committed in prior plan, surfaced as blocking during this plan's build)

---

**Total deviations:** 1 auto-fixed (1 blocking pre-existing)
**Impact on plan:** No scope creep. The build fix was a pre-existing cache issue in an adjacent file, not new code.

## Issues Encountered
- Next.js build lock file (`/.next/lock`) was stale from a prior interrupted build — removed with `rm -f` to allow retry
- TypeScript had a stale cache reporting errors already fixed in source files — clearing `.next/cache` resolved the discrepancy

## Self-Check: PASSED

Files verified:
- FOUND: src/actions/visits.ts
- FOUND: routes/[stopId]/page.tsx
- FOUND: routes/[stopId]/loading.tsx
- FOUND: stop-workflow.tsx
- FOUND: chemistry-grid.tsx
- FOUND: chemistry-dosing.tsx
- FOUND: use-visit-draft.ts

Commits verified:
- FOUND: 1e5f2f5
- FOUND: 557f215

Key patterns verified:
- FOUND: calculateCSI import in chemistry-dosing.tsx
- FOUND: inputMode="decimal" in chemistry-grid.tsx
- FOUND: offlineDb.visitDrafts writes in use-visit-draft.ts
- FOUND: generateDosingRecommendations in chemistry-dosing.tsx

## Next Phase Readiness
- Stop workflow shell complete — Plans 03-05 and 03-06 can implement Tasks and Photos tabs respectively
- ChemistryGrid and ChemistryDosing fully functional offline — ready for QA after routing system (03-03) creates real stop links
- getStopContext() server action is the data fetching pattern for all stop-context server components going forward

---
*Phase: 03-field-tech-app*
*Completed: 2026-03-06*
