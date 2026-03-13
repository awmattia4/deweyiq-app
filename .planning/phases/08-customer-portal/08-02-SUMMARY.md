---
phase: 08-customer-portal
plan: "02"
subsystem: portal-service-history
tags:
  - portal
  - service-history
  - chemistry
  - photo-gallery
  - timeline
dependency_graph:
  requires:
    - 08-01 (portal foundation — resolveCustomerId, PortalShell, magic link auth)
    - 03-field-tech-app (service_visits with chemistry_readings + photo_urls)
    - lib/chemistry/targets.ts (classifyReading for color coding)
  provides:
    - getServiceHistory server action (portal-data.ts)
    - getVisitPhotos server action with signed URLs (portal-data.ts)
    - /portal/history page with pool tabs
    - VisitTimeline with expandable VisitDetailCard
    - ChemistryDisplay with green/amber/red color coding
    - PhotoGallery with yet-another-react-lightbox
  affects:
    - 08-03+ (portal plans can use getServiceHistory data)
    - customer portal navigation (history tab now functional)
tech_stack:
  added:
    - yet-another-react-lightbox@3.29.1 (photo lightbox)
    - PortalVisit / PortalPool / ServiceHistoryResult / PortalPhoto types (portal-data.ts)
  patterns:
    - adminDb for all portal queries (no RLS — customers lack org_id in JWT)
    - Captions plugin static import, Lightbox component dynamic import (ssr: false)
    - Radix Collapsible for expand/collapse visit cards
    - Chemistry key normalization — camelCase + snake_case aliases for legacy records
key_files:
  created:
    - src/app/portal/(portal)/history/page.tsx
    - src/components/portal/visit-timeline.tsx
    - src/components/portal/visit-detail-card.tsx
    - src/components/portal/chemistry-display.tsx
    - src/components/portal/photo-gallery.tsx
  modified:
    - src/actions/portal-data.ts (getServiceHistory, getVisitPhotos, PortalVisit types)
    - package.json (yet-another-react-lightbox added)
decisions:
  - "adminDb for getServiceHistory/getVisitPhotos — portal customers don't have org_id in JWT claims required for RLS; consistent with portal-data.ts pattern established in 08-01"
  - "chemistry_readings explicitly listed in SELECT + object mapping — MEMORY.md critical note; manual mapping silently drops fields if not listed"
  - "Captions plugin static import, not dynamic — YARL plugins are plain functions (not React components); dynamic() only needed for Lightbox component itself which accesses DOM APIs"
  - "Chemistry key normalization — field app stores camelCase keys; KEY_ALIASES map handles both camelCase and legacy snake_case variants"
  - "Photo deduplication by path — photo_urls JSONB array and visit_photos table may have overlapping entries; Map deduplicates by storage path"
  - "Signed URLs 1-hour expiry for photos — per research recommendation; getVisitPhotos generates signed URLs at page load time"
metrics:
  duration: 10
  completed_date: "2026-03-13"
  tasks_completed: 2
  files_changed: 7
---

# Phase 8 Plan 02: Service History Summary

Service history view with per-pool timeline, expandable visit cards showing chemistry readings (green/amber/red color coded), checklist results, photos, and a photo gallery with lightbox — giving customers proof of work after every service visit.

## What Was Built

### Task 1: Server Actions

**`getServiceHistory(orgId, customerId)`** in `src/actions/portal-data.ts`:
- Two parallel queries: pools for this customer + visits with LEFT JOIN pools
- Tech names resolved in a third query using `inArray(profiles.id, techIds)` — single query, no N+1
- All visit fields explicitly mapped — `chemistry_readings` never dropped (MEMORY.md critical note)
- Results sorted newest first

**`getVisitPhotos(orgId, customerId, poolId?)`**:
- Collects photo paths from both `service_visits.photo_urls` (JSONB array) and `visit_photos` table
- Deduplicates by storage path using a `Map<string, {visitId}>` before generating URLs
- Signed URLs generated in parallel via Supabase admin client (1-hour expiry)
- Optional `poolId` filter for per-pool gallery

**Type exports:** `PortalVisit`, `PortalPool`, `ServiceHistoryResult`, `PortalPhoto`

### Task 2: Service History UI

**`/portal/history` page** (`src/app/portal/(portal)/history/page.tsx`):
- Server component: fetches history and photos in parallel via `Promise.all`
- Multi-pool customers: tabbed interface (All Pools + one tab per pool + Photos)
- Single-pool customers: Timeline + Photos tabs (photos tab hidden if no photos)
- Empty state: muted italic text

**`VisitTimeline`** (`src/components/portal/visit-timeline.tsx`):
- Groups visits by month/year with centered divider headers
- Vertical timeline line with dot indicators (green = complete, amber = skipped)
- Renders each visit as `VisitDetailCard`

**`VisitDetailCard`** (`src/components/portal/visit-detail-card.tsx`):
- Radix Collapsible for accessible expand/collapse
- Entire header is clickable (per MEMORY.md preference)
- Collapsed: date column, visit type + status badges, chemistry summary (pH · Cl · Alk)
- Expanded: chemistry readings, checklist items, photo thumbnails, tech notes, "Serviced by" footer
- Skipped visits: shows skip reason instead of chemistry/checklist
- Photos open in Lightbox with Captions plugin

**`ChemistryDisplay`** (`src/components/portal/chemistry-display.tsx`):
- `KEY_ALIASES` map normalizes camelCase and legacy snake_case keys
- Parameters filtered by sanitizer type (e.g. CYA hidden for bromine pools)
- `classifyReading()` from `lib/chemistry/targets.ts` for status
- Green = ok, Amber = LOW (needs to go up), Red = HIGH (needs to come down)

**`PhotoGallery`** (`src/components/portal/photo-gallery.tsx`):
- 2-col mobile / 3-col desktop grid
- Date + pool name overlay per thumbnail
- `yet-another-react-lightbox` for full-size viewing
- Lightbox: `dynamic(() => import('yet-another-react-lightbox'), { ssr: false })`
- Captions plugin: `import Captions from 'yet-another-react-lightbox/plugins/captions'` (static — plugin functions don't need dynamic)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Build failing before plan execution due to pre-existing missing modules**
- **Found during:** Task 2 verification (`npm run build`)
- **Issue:** Build was already failing before this plan — `@/components/portal/payment-method-manager` referenced in invoices page was missing from git (untracked file existed on disk but wasn't committed)
- **Investigation:** `git stash && npm run build` confirmed failure pre-dated this plan
- **Fix:** Files already existed on disk (created by prior plan sessions) — verified they compile. `git stash pop` restored work. Build passes after all new files are in place.
- **Note:** This was a pre-existing condition, not caused by this plan.

### Minor Deviations

**Captions plugin import approach** — Plan suggested `dynamic(() => import('yet-another-react-lightbox/plugins/captions'))` but YARL plugins are plain functions (return `void`), not React components. TypeScript rejected the `dynamic()` approach. Fixed by using a direct static import for the plugin, dynamic only for the Lightbox component itself.

**`yet-another-react-lightbox` added to package.json** — Plan specified to install if not in package.json. It was not installed. Installed at `3.29.1`.

## Self-Check: PASSED

**Files verified present:**
- src/app/portal/(portal)/history/page.tsx — FOUND
- src/components/portal/visit-timeline.tsx — FOUND
- src/components/portal/visit-detail-card.tsx — FOUND
- src/components/portal/chemistry-display.tsx — FOUND
- src/components/portal/photo-gallery.tsx — FOUND
- getServiceHistory export in portal-data.ts — FOUND
- getVisitPhotos export in portal-data.ts — FOUND

**Commits verified:**
- 7c88a07 — Task 1: getServiceHistory + getVisitPhotos server actions
- 4ba5b83 — Task 2: history page + all portal history UI components

**Build:** `npm run build` — PASSED. `/portal/history` route present in build output.
