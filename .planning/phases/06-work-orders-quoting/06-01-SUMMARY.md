---
phase: 06-work-orders-quoting
plan: 01
subsystem: database
tags: [drizzle, postgres, rls, work-orders, invoices, quotes, parts-catalog, react-pdf]

# Dependency graph
requires:
  - phase: 05-office-operations-dispatch
    provides: org_settings table and patterns for extending it
  - phase: 02-customer-pool-data-model
    provides: customers and pools tables referenced by work_orders FK

provides:
  - work_orders table with RLS (7 status states, priority, categories)
  - work_order_line_items table with RLS
  - parts_catalog table with RLS (active/soft-delete pattern)
  - wo_templates table with RLS (line_items_snapshot JSONB)
  - quotes table with RLS (versioned, customer approval via adminDb token)
  - invoices and invoice_line_items tables with RLS (multi-WO support)
  - org_settings Phase 6 columns (rates, numbering prefixes, WO notifications)
  - customers.tax_exempt boolean column
  - getWorkOrders, getWorkOrder, createWorkOrder, updateWorkOrder, updateWorkOrderStatus, createFollowUpWorkOrder server actions
  - getCatalogItems, addCatalogItem, updateCatalogItem, deleteCatalogItem server actions
  - getWoTemplates, createWoTemplate, deleteWoTemplate server actions
  - @react-pdf/renderer installed and configured via serverExternalPackages

affects:
  - 06-02 (WO UI depends on these tables and actions)
  - 06-03 (Quoting UI depends on quotes table and WO actions)
  - 06-04 (Invoice UI depends on invoices tables)
  - 06-05 (Parts catalog UI depends on parts_catalog table and actions)

# Tech tracking
tech-stack:
  added:
    - "@react-pdf/renderer@^4.3.2 — PDF generation for quotes/invoices"
  patterns:
    - "appendActivityEvent: JSONB COALESCE append pattern for audit log"
    - "Status transition validation: ALLOWED_TRANSITIONS map checked before update"
    - "Separate profile queries to avoid Drizzle multi-alias join complexity"
    - "drizzle-kit push NULL RLS policy fix via ALTER POLICY (confirmed pattern again)"

key-files:
  created:
    - src/lib/db/schema/work-orders.ts
    - src/lib/db/schema/parts-catalog.ts
    - src/lib/db/schema/quotes.ts
    - src/lib/db/schema/invoices.ts
    - src/actions/work-orders.ts
    - src/actions/parts-catalog.ts
  modified:
    - src/lib/db/schema/org-settings.ts
    - src/lib/db/schema/customers.ts
    - src/lib/db/schema/index.ts
    - src/lib/db/schema/relations.ts
    - next.config.ts
    - package.json

key-decisions:
  - "appendActivityEvent uses COALESCE(activity_log, '[]'::jsonb) || event::jsonb — safe on NULL columns"
  - "getWorkOrder fetches profiles in a single inArray query, not multiple self-joins — avoids Drizzle alias complexity"
  - "getWorkOrders sorts by priority in application layer after DB fetch — simpler than CASE WHEN in SQL"
  - "drizzle-kit push NULL RLS policy confirmed again in Phase 6 — all 28 policies manually fixed via ALTER POLICY"
  - "@react-pdf/renderer requires serverExternalPackages in next.config.ts to prevent 'Component is not a constructor' crash"
  - "quotes.status includes 'superseded' to track replaced revisions (versioned quoting)"
  - "invoices.work_order_ids is JSONB string[] to support multi-WO combined invoicing"
  - "parent_wo_id has no FK constraint — avoids cascade complexity when parent is deleted"

patterns-established:
  - "Phase 6 hex-only colors convention: All PDF-related code must use hex colors, not oklch(). Documented in work-orders.ts header."
  - "Soft delete pattern: deleteCatalogItem/deleteWoTemplate set is_active=false — preserves referential integrity for existing line items"

requirements-completed:
  - WORK-01
  - WORK-02

# Metrics
duration: 9min
completed: 2026-03-11
---

# Phase 6 Plan 01: Work Orders & Quoting Data Foundation Summary

**7 new DB tables (work_orders, quotes, invoices + 4 more) with RLS, @react-pdf/renderer, and core WO/catalog server actions using withRls**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-11T18:40:26Z
- **Completed:** 2026-03-11T18:49:30Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments
- Created 7 Phase 6 tables (work_orders, work_order_line_items, parts_catalog, wo_templates, quotes, invoices, invoice_line_items) with full RLS
- Extended org_settings with 12 Phase 6 columns (default rates, invoice/quote numbering, WO notification toggles) and customers with tax_exempt
- Implemented 13 server actions across work-orders.ts and parts-catalog.ts, all using withRls with getRlsToken guard
- Manually fixed all 28 NULL RLS policies post-drizzle-kit-push (confirmed recurring bug per MEMORY.md)
- Installed @react-pdf/renderer and configured serverExternalPackages in next.config.ts

## Task Commits

Each task was committed atomically:

1. **Task 1: Schema tables, org_settings extension, customers extension, @react-pdf/renderer** - `4d7a923` (feat)
2. **Task 2: WO server actions and parts catalog server actions** - `381efbd` (feat)

**Plan metadata:** (see below)

## Files Created/Modified
- `src/lib/db/schema/work-orders.ts` - workOrders + workOrderLineItems tables with RLS
- `src/lib/db/schema/parts-catalog.ts` - partsCatalog + woTemplates tables with RLS
- `src/lib/db/schema/quotes.ts` - quotes table with versioning and RLS
- `src/lib/db/schema/invoices.ts` - invoices + invoiceLineItems with multi-WO support and RLS
- `src/lib/db/schema/org-settings.ts` - Extended with 12 Phase 6 billing/WO settings columns
- `src/lib/db/schema/customers.ts` - Added tax_exempt boolean column
- `src/lib/db/schema/index.ts` - Added Phase 6 barrel exports
- `src/lib/db/schema/relations.ts` - Added Phase 6 Drizzle relations (workOrders, quotes, invoices)
- `src/actions/work-orders.ts` - getWorkOrders, getWorkOrder, createWorkOrder, updateWorkOrder, updateWorkOrderStatus, createFollowUpWorkOrder
- `src/actions/parts-catalog.ts` - getCatalogItems, addCatalogItem, updateCatalogItem, deleteCatalogItem, getWoTemplates, createWoTemplate, deleteWoTemplate
- `next.config.ts` - Added serverExternalPackages: ['@react-pdf/renderer']
- `package.json` / `package-lock.json` - @react-pdf/renderer@^4.3.2 added

## Decisions Made
- `appendActivityEvent` uses `COALESCE(activity_log, '[]'::jsonb) || event::jsonb` — safe null handling
- Multiple profile FK joins (createdBy, assignedTech, flaggedBy) resolved via single `inArray` query rather than multi-alias Drizzle joins
- Application-layer priority sort (emergency→high→normal→low) rather than SQL CASE WHEN
- `parent_wo_id` has no FK constraint to avoid cascade issues when parent is deleted
- `quotes.status` includes 'superseded' for tracking replaced revisions in versioned quoting flow

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed all 28 NULL RLS policies post-drizzle-kit push**
- **Found during:** Task 1 (drizzle-kit push verification)
- **Issue:** drizzle-kit push created all 28 RLS policies with NULL USING/WITH CHECK expressions — the confirmed recurring bug documented in MEMORY.md
- **Fix:** Ran `ALTER POLICY` statements for all 28 policies across all 7 new tables
- **Files modified:** DB only (no source file changes)
- **Verification:** Re-queried pg_catalog.pg_policies — all 28 policies show SET qual/with_check
- **Committed in:** `4d7a923` (included in Task 1 schema commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - known drizzle-kit bug)
**Impact on plan:** Required fix (RLS would be non-functional without it). No scope creep.

## Issues Encountered
- npm cache had root-owned files (`EACCES` on `~/.npm`). Resolved by passing `--cache /tmp/npm-cache` to npm install. No impact on package installation.

## User Setup Required
None - all migrations applied via drizzle-kit push. No external service configuration required.

## Next Phase Readiness
- All 7 Phase 6 tables exist in the database with correct RLS
- Work order CRUD actions fully implemented and type-safe
- Parts catalog + WO template CRUD actions ready
- @react-pdf/renderer installed and Next.js configured for Phase 6 PDF generation
- Phase 6 Plans 02-06 can proceed — all data foundation is in place

---
*Phase: 06-work-orders-quoting*
*Completed: 2026-03-11*
