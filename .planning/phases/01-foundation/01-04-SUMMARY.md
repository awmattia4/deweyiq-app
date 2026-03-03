---
phase: 01-foundation
plan: 04
subsystem: infra
tags: [dexie, indexeddb, offline, pwa, sync, hooks, react, lucide, shadcn, typescript]

# Dependency graph
requires:
  - phase: 01-01
    provides: Dexie installed, syncQueue/routeCache schema stub, use-online-status.ts stub, directory structure (src/lib/offline/, src/hooks/, src/components/shell/)
provides:
  - Dexie IndexedDB schema with SyncQueueItem (status, lastError) and CachedRoute (expiresAt) fields
  - Sync engine: enqueueWrite, processSyncQueue with exponential backoff (max 5 retries)
  - initSyncListener: online event + visibilitychange listeners for cross-platform sync
  - getSyncQueueStatus: queryable queue state (pending/processing/failed counts)
  - prefetchTodayRoutes: stub establishing pre-caching architecture for Phase 3
  - useSyncStatus hook: polls queue state with adaptive intervals
  - OfflineBanner: thin amber bar at viewport top, renders null when online
  - SyncStatusIcon: header icon with 4 states (synced/syncing/pending/error) + tooltip
  - shadcn Tooltip component
affects:
  - 01-05 (app shell integrates OfflineBanner and SyncStatusIcon)
  - 01-06 (PWA testing verifies offline writes persist and sync)
  - Phase 3 (prefetchTodayRoutes activated with real route API)
  - All phases (enqueueWrite replaces direct fetch() for all mutation requests)

# Tech tracking
tech-stack:
  added:
    - dexie@4.3.0 (already installed; schema upgraded with status/lastError/expiresAt)
    - shadcn tooltip component (via npx shadcn@latest add tooltip)
    - lucide-react CloudIcon, CloudUploadIcon, CloudAlertIcon
  patterns:
    - enqueueWrite pattern: all data mutations go through sync queue, not direct fetch
    - Adaptive polling: useSyncStatus polls at 2.5s (active) or 10s (idle) intervals
    - Cross-platform sync trigger: window online event + visibilitychange (works on iOS Safari)
    - Background Sync API as enhancement only (not relied upon; iOS unsupported)
    - Error state deferred: SyncStatusIcon shows error only after MAX_RETRIES exhausted

key-files:
  created:
    - src/lib/offline/sync.ts (sync engine with enqueueWrite, processSyncQueue, retry)
    - src/hooks/use-sync-status.ts (sync queue state hook with adaptive polling)
    - src/components/shell/offline-banner.tsx (thin amber bar, null when online)
    - src/components/shell/sync-status-icon.tsx (4-state icon + tooltip for header)
    - src/components/ui/tooltip.tsx (shadcn tooltip component)
  modified:
    - src/lib/offline/db.ts (upgraded schema: added status, lastError, expiresAt fields)

key-decisions:
  - "Exponential backoff: baseDelay=1000ms, maxDelay=60000ms, max 5 retries before marking failed"
  - "prefetchTodayRoutes stub in sync.ts (not db.ts) — establishes architecture without route API"
  - "OfflineBanner renders null (no DOM) when online — not hidden via CSS"
  - "SyncStatusIcon error state only after MAX_RETRIES exhausted, per user decision"

patterns-established:
  - "Pattern: enqueueWrite — all write mutations use this instead of direct fetch() calls"
  - "Pattern: online+visibilitychange events for cross-platform background sync (iOS compatible)"
  - "Pattern: adaptive polling — fast when active, slow when idle, no constant polling overhead"

requirements-completed: []

# Metrics
duration: 3min
completed: 2026-03-03
---

# Phase 01 Plan 04: Offline-First Infrastructure Summary

**Dexie IndexedDB sync queue with exponential-backoff replay engine, cross-platform online event listeners (iOS + Android), OfflineBanner thin amber bar, and SyncStatusIcon 4-state header widget**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-03T22:56:02Z
- **Completed:** 2026-03-03T22:59:27Z
- **Tasks:** 2/2
- **Files modified:** 6 created + 1 modified

## Accomplishments

- Full sync engine implemented: `enqueueWrite` stores writes in IndexedDB, `processSyncQueue` replays them with exponential backoff (baseDelay 1s, maxDelay 60s, max 5 retries)
- Cross-platform sync triggers: `online` event + `visibilitychange` covers both iOS (no Background Sync API) and Android. Background Sync registered as enhancement only.
- `prefetchTodayRoutes()` stub establishes the pre-caching architecture with documented TODOs — Phase 3 fills in the real API call
- OfflineBanner is a thin 4px amber bar (not a blocking modal) that renders null when online
- SyncStatusIcon shows 4 distinct states in the header and only shows error after retries exhausted

## Task Commits

1. **Task 1: Dexie IndexedDB schema and sync engine** - `f8292e8` (feat)
2. **Task 2: Hooks, offline banner, and sync status icon** - `e22c207` (feat)

**Plan metadata:** (recorded in final docs commit below)

## Files Created/Modified

- `src/lib/offline/db.ts` - Upgraded Dexie schema: SyncQueueItem now has `status`/`lastError`, CachedRoute has `expiresAt`; OfflineDB stores both in IndexedDB
- `src/lib/offline/sync.ts` - Full sync engine: `enqueueWrite`, `processSyncQueue` (exponential backoff), `initSyncListener` (online + visibilitychange), `getSyncQueueStatus`, `prefetchTodayRoutes` stub
- `src/hooks/use-sync-status.ts` - Polls syncQueue state; adaptive interval (2.5s active / 10s idle); returns `{ status, pendingCount, failedCount }`
- `src/components/shell/offline-banner.tsx` - Thin 4px amber bar fixed at top; slides in/out via CSS animation; renders null (not hidden) when online
- `src/components/shell/sync-status-icon.tsx` - Header icon with 4 states via Lucide icons + shadcn Tooltip showing details
- `src/components/ui/tooltip.tsx` - shadcn Tooltip component (added via `npx shadcn@latest add tooltip`)

## Decisions Made

- **MAX_RETRIES = 5**: Plan gave discretion; 5 retries with exponential backoff (max 60s delay) gives ~2 minutes of retry window before alerting user — balanced between resilience and timeliness.
- **prefetchTodayRoutes in sync.ts**: Placed in the sync module (not db.ts) since it's a sync concern. The stub documents the full cache-write pattern with TODOs for Phase 3.
- **OfflineBanner renders null**: Returns `null` when online (no DOM element), not `display: none`. Cleaner, no layout shift.
- **Adaptive polling in useSyncStatus**: Fast 2.5s poll when queue has items, slow 10s when idle. Avoids constant overhead when everything is synced.

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written.

---

**Note on pre-existing TypeScript error:** `src/lib/db/index.ts` line 60 has a pre-existing `TS2352` error from Plan 02 (`tx as typeof adminDb` cast). This is out-of-scope for Plan 04 (not caused by my changes). Logged to `deferred-items.md`. Does not affect runtime behavior.

## Issues Encountered

- **npm cache permissions**: Same pre-existing issue as Plan 01 (`/Users/aaronmattia/.npm` root-owned). Worked around by using `npm_config_cache=/tmp/npm-cache` prefix for `npx shadcn@latest add tooltip`.

## User Setup Required

None — all offline infrastructure is client-side (IndexedDB + browser events). No external service configuration required.

## Next Phase Readiness

- **Ready:** Plan 05 (app shell) can integrate OfflineBanner and SyncStatusIcon into the layout — both are exported and ready to drop in
- **Ready:** Plan 06 (PWA/offline testing) can test write queueing and sync replay
- **Note:** TooltipProvider must be added to the root layout before SyncStatusIcon renders correctly (tooltips won't appear without it). Plan 05 should handle this.
- **Phase 3:** `prefetchTodayRoutes()` stub is ready — just fill in the fetch + `offlineDb.routeCache.bulkPut()` call

---
*Phase: 01-foundation*
*Completed: 2026-03-03*

## Self-Check: PASSED

All 7 key files verified present. Both task commits (f8292e8, e22c207) confirmed in git history.
