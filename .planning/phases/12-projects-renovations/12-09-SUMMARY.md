---
phase: 12-projects-renovations
plan: 09
subsystem: materials-procurement
tags: [materials, purchase-orders, receiving, returns, cost-variance, pdf, projects]

# Dependency graph
requires:
  - phase: 12-01
    provides: project_materials, project_purchase_orders, project_po_line_items, project_material_receipts, project_material_returns tables
  - phase: 12-01
    provides: project_proposals, project_proposal_line_items for proposal import

provides:
  - Material lifecycle server actions (populate from proposal, CRUD, receive, return)
  - Purchase order creation with sequential PO-XXXX numbering
  - Partial delivery tracking with order_status transitions (not_ordered/ordered/partial/received/returned)
  - Cost variance computation with 10% alert threshold (PROJ-31)
  - Material returns with credit tracking (PROJ-33)
  - PO PDF document (PurchaseOrderDocument via @react-pdf/renderer)
  - /api/projects/purchase-orders/[id]/pdf route
  - /projects/[id]/materials page (server + client)
  - Materials tab link in project detail navigation

affects:
  - 12-10 through 12-16 plans that depend on material cost data
  - project detail page (added Materials tab)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Server actions with withRls() + adminDb() for sequential counters (same as createProject PO number pattern)
    - Controlled decimal inputs (string state, parse on blur) to prevent decimal-eating bug per MEMORY.md
    - LEFT JOIN for PO line items + material names (no correlated subqueries on RLS-protected tables)
    - populateMaterialsFromProposal idempotent: skips materials with existing proposal_line_item_id match

key-files:
  created:
    - src/actions/projects-materials.ts
    - src/lib/pdf/purchase-order-pdf.tsx
    - src/app/api/projects/purchase-orders/[id]/pdf/route.ts
    - src/app/(app)/projects/[id]/materials/page.tsx
    - src/components/projects/material-list.tsx
    - src/components/projects/purchase-order-builder.tsx
    - src/components/projects/material-receiving.tsx
    - src/components/projects/materials-page-client.tsx
  modified:
    - src/components/projects/project-detail-client.tsx

key-decisions:
  - "PO number generated via adminDb (service role, atomic count) — same pattern as project_number and invoice_number to avoid race conditions under RLS"
  - "proposal_line_item_id match used for idempotent import — prevents duplicate materials on repeated populateMaterialsFromProposal calls"
  - "populateMaterialsFromProposal uses broad category matching (material/equipment/etc) since proposal line items use varied category values across different project types"
  - "projects table has no site_address column — omitted from PO PDF (only project name + number shown)"
  - "Materials tab on project detail is a Link to /projects/[id]/materials (separate route) rather than inline tab content — consistent with Documents tab pattern already established by previous plans"
  - "Cost variance uses quantity_used * unit_cost_actual when usage > 0; falls back to quantity_estimated * cost otherwise — reflects actual spend even before full consumption"

# Metrics
duration: 20min
completed: 2026-03-17
---

# Phase 12 Plan 09: Material Procurement System Summary

**Full material lifecycle from proposal import through PO creation, partial delivery tracking, returns with credits, and cost variance monitoring — with branded PDF purchase orders**

## Performance

- **Duration:** 20 min
- **Started:** 2026-03-17T15:54:51Z
- **Completed:** 2026-03-17T16:14:00Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- Created complete material procurement server actions covering: populate from approved proposal (idempotent, skips existing), add/update materials, create purchase orders with sequential PO-XXXX numbering, receive deliveries with partial delivery support, return materials with credit tracking, cost variance computation with configurable 10% alert threshold
- Built `PurchaseOrderDocument` PDF using @react-pdf/renderer with company header (logo + name), supplier block, project reference, line items table, totals, notes, and three-field signature block — all hex colors, no oklch
- Created `/api/projects/purchase-orders/[id]/pdf` route for authenticated PDF downloads (owner/office only)
- Built `/projects/[id]/materials` page with two-tab layout: Materials (table with full quantity lifecycle, variance color-coding, bulk PO selection) and Purchase Orders (PO cards with status selector, line items, PDF download)
- Added Materials tab link to project detail navigation (consistent with existing Documents link pattern)

## Task Commits

1. **Task 1: Material management server actions and PO PDF** - `6c65f8e` (feat)
2. **Task 2: Materials page UI with list, PO builder, receiving, and returns** - `840e4e4` (feat)

## Files Created/Modified

- `src/actions/projects-materials.ts` — populateMaterialsFromProposal, getMaterials, addMaterial, updateMaterial, createPurchaseOrder, getPurchaseOrders, updatePurchaseOrderStatus, receiveMaterial, getReceipts, returnMaterial, getMaterialCostVariance, getPurchaseOrderForPdf
- `src/lib/pdf/purchase-order-pdf.tsx` — PurchaseOrderDocument with 8-section layout
- `src/app/api/projects/purchase-orders/[id]/pdf/route.ts` — Authenticated PDF download route
- `src/app/(app)/projects/[id]/materials/page.tsx` — Server component with parallel data fetching
- `src/components/projects/material-list.tsx` — Material table with qty tracking, variance coloring, per-row actions, bulk PO selection
- `src/components/projects/purchase-order-builder.tsx` — PO creation dialog with editable line items and PDF download prompt
- `src/components/projects/material-receiving.tsx` — PO cards with status management and PDF download
- `src/components/projects/materials-page-client.tsx` — Two-tab materials page client with cost variance alert
- `src/components/projects/project-detail-client.tsx` — Added Materials tab link

## Decisions Made

- Sequential PO numbering via `adminDb` (service role) for atomic counter — same pattern as `project_number` and `invoice_number`
- `populateMaterialsFromProposal` is idempotent via `proposal_line_item_id` match check — safe to call multiple times
- Projects table has no `site_address` column — PO PDF shows project name + number only, no address
- Materials tab in project detail uses Link (navigates to `/projects/[id]/materials`) rather than inline tab content — consistent with existing Documents tab pattern

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `projectProposalLineItems` has no `unit` field**
- **Found during:** Task 1 TypeScript check
- **Issue:** Plan specified `li.unit ?? "each"` but the schema column doesn't exist — proposal line items don't track units
- **Fix:** Hardcoded `unit: "each"` for materials imported from proposals (can be edited post-import)
- **Files modified:** `src/actions/projects-materials.ts`
- **Commit:** 6c65f8e

**2. [Rule 1 - Bug] `projects.site_address` doesn't exist in schema**
- **Found during:** Task 1 TypeScript check
- **Issue:** Plan asked to include project address in PO PDF, but the projects table has no site_address column (uses customer.address pattern instead)
- **Fix:** Removed from getPurchaseOrderForPdf query; PO PDF shows project name + number only
- **Files modified:** `src/actions/projects-materials.ts`
- **Commit:** 6c65f8e

**3. [Rule 1 - Bug] `orgs.logo_url` not `org_settings.logo_url`**
- **Found during:** Task 1 TypeScript check
- **Issue:** Plan referenced org_settings for company name/logo but those fields live on the `orgs` table
- **Fix:** Changed to query `orgs` table for `name` and `logo_url`
- **Files modified:** `src/actions/projects-materials.ts`
- **Commit:** 6c65f8e

## User Setup Required

None — no external service configuration needed. Materials page is immediately accessible at `/projects/[id]/materials`.

## Next Phase Readiness

- Material cost data available for Phase 12 budget tracking and P&L calculations
- PO PDF generation tested via TypeScript and build compilation — zero errors
- Materials tab accessible from any project detail page
- `getMaterialCostVariance` can be used by future Phase 12 plans for cost reporting

---
*Phase: 12-projects-renovations*
*Completed: 2026-03-17*
