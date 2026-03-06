---
phase: 03-field-tech-app
plan: "01"
subsystem: database
tags: [drizzle, postgres, supabase, rls, dexie, indexeddb, offline, pwa]

# Dependency graph
requires:
  - phase: 02-customer-pool-data-model
    provides: customers, pools, service_visits (stub), profiles, relations.ts pattern
provides:
  - route_days table with stop_order JSONB and unique(org_id,tech_id,date) constraint
  - checklist_templates and checklist_tasks tables for visit task management
  - visit_photos table with storage_path and tag columns
  - chemical_products table for dosing engine product catalog
  - service_visits extended with chemistry_readings, checklist_completion, photo_urls, status, skip_reason, report_html, completed_at, email_sent_at
  - Dexie v2 schema with visitDrafts and photoQueue offline stores
  - VisitDraft and PhotoQueueItem TypeScript interfaces
  - Phase 3 npm dependencies: @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities, browser-image-compression, dexie-react-hooks
affects:
  - 03-02 (chemistry engine uses chemical_products table)
  - 03-03 (route list reads route_days, writes service_visits via visitDrafts)
  - 03-04 (checklist UI reads checklist_templates/checklist_tasks)
  - 03-05 (photo capture uses visit_photos and photoQueue)

# Tech tracking
tech-stack:
  added:
    - "@dnd-kit/core@6.3.1 — drag-and-drop for route reordering (Phase 4)"
    - "@dnd-kit/sortable@10.0.0 — sortable list primitives"
    - "@dnd-kit/utilities@3.2.2 — DnD helper utilities"
    - "browser-image-compression@2.0.2 — client-side WebP compression before upload"
    - "dexie-react-hooks@4.2.0 — reactive Dexie queries in React components"
  patterns:
    - "Dexie immutable versioning: version(1) never modified; version(2) adds new stores with all prior stores carried forward"
    - "PhotoQueueItem.blob NOT indexed — indexing Blob columns corrupts IDB performance"
    - "Client-generated UUID for visitDrafts.id — visit_id known before Supabase sync"
    - "JSONB stop_order array on route_days — minimal Phase 3 approach; Phase 4 migrates to relational rows"

key-files:
  created:
    - src/lib/db/schema/route-days.ts
    - src/lib/db/schema/checklists.ts
    - src/lib/db/schema/chemical-products.ts
    - src/lib/db/schema/visit-photos.ts
  modified:
    - src/lib/db/schema/service-visits.ts
    - src/lib/db/schema/relations.ts
    - src/lib/db/schema/index.ts
    - src/lib/offline/db.ts
    - package.json

key-decisions:
  - "route_days.stop_order as JSONB array — minimal Phase 3 approach; Phase 4 replaces with relational stop rows and full scheduling system"
  - "checklist_tasks.org_id denormalized — enables RLS without JOIN to checklist_templates"
  - "visit_photos insert allows 'tech' role — techs can upload their own visit photos but cannot delete"
  - "PhotoQueueItem.blob NOT indexed in Dexie — indexing Blob columns corrupts IndexedDB performance"
  - "VisitDraft.id is client-generated UUID — visit_id is known before sync enabling optimistic offline writes"
  - "drizzle-kit push creates NULL RLS policies (known pitfall) — all 20 Phase 3 policies manually recreated via psql after push"

patterns-established:
  - "Phase 3 RLS manual fix: drizzle-kit push always creates NULL qual/with_check; follow with manual DROP/CREATE for all new tables"
  - "Dexie version increment: add version(N+1).stores({}) carrying ALL prior stores forward — never touch earlier versions"

requirements-completed:
  - FIELD-01
  - FIELD-03
  - FIELD-06
  - FIELD-07
  - FIELD-10

# Metrics
duration: 4min
completed: 2026-03-06
---

# Phase 3 Plan 01: Schema Foundation Summary

**5 new Drizzle/Postgres tables (route_days, checklists, visit_photos, chemical_products), 8 new service_visits columns, Dexie v2 offline stores (visitDrafts, photoQueue), and 5 Phase 3 npm deps installed**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-06T15:19:52Z
- **Completed:** 2026-03-06T15:24:00Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- Created 4 new Drizzle schema files with full 4-policy RLS (select/insert/update/delete) for 5 tables
- Extended service_visits with all Phase 3 columns (chemistry_readings, checklist_completion, photo_urls, status, skip_reason, report_html, completed_at, email_sent_at)
- Upgraded Dexie offline DB to v2 with visitDrafts (field data) and photoQueue (compressed photo staging) stores
- Installed all 5 Phase 3 npm dependencies for drag-and-drop, image compression, and reactive offline queries
- Applied drizzle-kit push and manually recreated all 20 Phase 3 RLS policies (known pitfall — drizzle-kit creates NULL conditions)
- Verified all 24 policies (20 new + 4 service_visits) have correct non-NULL conditions

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Phase 3 Drizzle schema files and extend service_visits** - `67c1e31` (feat)
2. **Task 2: Upgrade Dexie offline DB to v2 and install Phase 3 npm dependencies** - `911ea91` (feat)

**Plan metadata:** (created after summary)

## Files Created/Modified

- `src/lib/db/schema/route-days.ts` — route_days table: org_id, tech_id, date, stop_order JSONB, unique(org_id,tech_id,date), 4 RLS policies
- `src/lib/db/schema/checklists.ts` — checklist_templates and checklist_tasks tables with RLS; tasks support template-level and customer-level overrides
- `src/lib/db/schema/visit-photos.ts` — visit_photos table: storage_path, tag, INSERT allows tech role, DELETE owner+office only
- `src/lib/db/schema/chemical-products.ts` — chemical_products table: name, chemical_type, concentration_pct, unit, is_active
- `src/lib/db/schema/service-visits.ts` — extended with 8 Phase 3 columns (chemistry_readings jsonb, checklist_completion jsonb, photo_urls jsonb, status, skip_reason, report_html text, completed_at, email_sent_at)
- `src/lib/db/schema/relations.ts` — added Phase 3 relations: routeDaysRelations, checklistTemplatesRelations, checklistTasksRelations, visitPhotosRelations, chemicalProductsRelations; serviceVisitsRelations extended with photos: many(visitPhotos); customersRelations extended with checklistTasks
- `src/lib/db/schema/index.ts` — barrel updated to export all 4 new Phase 3 schema files
- `src/lib/offline/db.ts` — Dexie v2 schema with visitDrafts and photoQueue stores; VisitDraft and PhotoQueueItem interfaces added
- `package.json` — 5 new deps: @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities, browser-image-compression, dexie-react-hooks

## Decisions Made

- **route_days.stop_order as JSONB array** — Phase 3 needs minimal route display; full scheduling system (Phase 4) will migrate to relational stop rows without breaking Phase 3 data
- **checklist_tasks.org_id denormalized** — Avoids JOIN to checklist_templates for RLS evaluation, matching the pattern used in Phase 2 (service_visits carries org_id directly)
- **visit_photos INSERT allows tech role** — Techs need to capture photos at job sites; DELETE restricted to owner+office to prevent data loss
- **VisitDraft.id is client-generated UUID** — Enables optimistic offline writes with a stable visit_id before connectivity is restored for Supabase sync
- **PhotoQueueItem.blob NOT indexed** — Critical Dexie constraint: indexing Blob/ArrayBuffer columns corrupts IndexedDB performance

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Known Pitfall] Manually recreated all 20 Phase 3 RLS policies**
- **Found during:** Task 1 (drizzle-kit push verification step)
- **Issue:** drizzle-kit push created all 20 Phase 3 policies with NULL USING/WITH CHECK expressions — documented Phase 2 critical pitfall
- **Fix:** Dropped and recreated all 20 policies via psql with correct SQL expressions matching Drizzle schema definitions
- **Tables affected:** route_days (4), checklist_templates (4), checklist_tasks (4), visit_photos (4), chemical_products (4)
- **Verification:** SELECT from pg_catalog.pg_policies confirmed all 24 policies (20 new + 4 service_visits) show correct non-NULL conditions for their respective command types
- **Committed in:** `67c1e31` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (known RLS pitfall from Phase 2)
**Impact on plan:** Required fix per MEMORY.md documented pitfall. No scope creep.

## Issues Encountered

- TypeScript check showed errors in `src/lib/chemistry/__tests__/dosing.test.ts` and `lsi.test.ts` — these reference `../dosing` and `../lsi` modules that Plan 03-02 (chemistry engine) will create. Pre-existing out-of-scope errors; verified our schema files compile cleanly in isolation.

## User Setup Required

None — all changes are local schema and offline DB upgrades. Supabase running locally, no external service configuration required.

## Next Phase Readiness

- All Phase 3 database foundation tables are in Postgres with verified RLS
- Dexie v2 offline stores ready for visitDraft writes and photo staging
- Plan 03-02 (chemistry engine) can now reference chemical_products table
- Plan 03-03 (route list) can read route_days and write service_visits via visitDrafts
- All npm dependencies available for Phase 3 UI plans

---
*Phase: 03-field-tech-app*
*Completed: 2026-03-06*
