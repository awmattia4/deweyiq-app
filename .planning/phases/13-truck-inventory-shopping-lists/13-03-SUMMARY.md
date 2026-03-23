---
phase: 13-truck-inventory-shopping-lists
plan: "03"
subsystem: purchasing-dashboard-and-qbo-sync
tags:
  - purchasing
  - purchase-orders
  - qbo-sync
  - spending-insights
  - chemical-usage
  - recharts
dependency-graph:
  requires:
    - shopping-lists schema (13-01)
    - parts-catalog with qbo_item_id (13-01)
    - org-settings.next_po_number (13-01)
    - QBO client/mappers (Phase 7)
    - service_visits.dosing_amounts (Phase 9)
  provides:
    - getPurchasingDashboard action (supplier/urgency grouping)
    - createPurchaseOrder action (auto-incrementing PO numbers)
    - sendPurchaseOrder action (Resend email to supplier)
    - updatePurchaseOrderStatus action
    - getSpendingInsights action (time-series + breakdown for recharts)
    - syncCatalogItemToQbo action
    - syncQboItemToDeweyIq action (webhook-driven)
    - reconcileCatalogWithQbo action (bulk sync)
    - importQboItems action (one-time import)
    - mapCatalogItemToQboItem / mapQboItemToCatalogItem mapper functions
    - getChemicalUsageReport action
    - PurchasingDashboard component
    - PoBuilder component (formal + checklist modes)
    - SpendingInsights component (recharts charts)
    - ChemicalUsagePanel component (sortable table)
    - /inventory page with Purchasing/Spending/Chemical Usage tabs for office
  affects:
    - src/lib/qbo/mappers.ts (additive — new mapper functions)
    - src/actions/qbo-sync.ts (additive — Item webhook handler)
    - src/actions/reporting.ts (additive — getChemicalUsageReport)
    - src/app/(app)/inventory/inventory-page-client.tsx (extended from 2 to 5 tabs)
    - src/app/(app)/inventory/page.tsx (extended with 3 new server-side fetches)
tech-stack:
  added: []
  patterns:
    - LEFT JOIN + GROUP BY aggregation (never correlated subqueries in withRls)
    - adminDb for PO number auto-increment (avoids RLS re-auth overhead)
    - node-quickbooks cast to any (JS methods exist at runtime, no TS typings for Item CRUD)
    - Dynamic import for qbo-items in webhook handler (avoids potential circular imports)
    - Local string state for decimal inputs in PoBuilder (MEMORY.md pattern)
    - recharts hex-only colors (no oklch per MEMORY.md MapLibre/chart constraint)
    - Collapsible group cards via native React state (no @radix-ui/collapsible needed)
key-files:
  created:
    - src/actions/purchasing.ts
    - src/actions/qbo-items.ts
    - src/components/inventory/purchasing-dashboard.tsx
    - src/components/inventory/po-builder.tsx
    - src/components/inventory/spending-insights.tsx
    - src/components/inventory/chemical-usage-panel.tsx
  modified:
    - src/lib/qbo/mappers.ts (added mapCatalogItemToQboItem, mapQboItemToCatalogItem)
    - src/actions/qbo-sync.ts (extended handleQboWebhook to handle Item events)
    - src/actions/reporting.ts (added getChemicalUsageReport)
    - src/app/(app)/inventory/inventory-page-client.tsx (5-tab office view)
    - src/app/(app)/inventory/page.tsx (6 parallel server-side fetches)
decisions:
  - "Used adminDb (not withRls) for PO number auto-increment — org_settings update runs with explicit org_id check and doesn't need per-user RLS claims"
  - "node-quickbooks Item CRUD methods (getItem, createItem, updateItem, findItems) exist in JS at runtime but have no TypeScript declarations — cast qbo client to any rather than fighting missing types"
  - "Dynamic import of syncQboItemToDeweyIq inside handleQboWebhook to break potential circular dependency (qbo-sync → qbo-items → qbo-sync)"
  - "dosing_amounts JSONB processed in TypeScript (not SQL JSONB unpacking) for chemical usage report — simpler and sufficient for the aggregation needed"
  - "No @radix-ui/collapsible — not installed. Replaced with native React state toggle in PurchasingDashboard group cards"
  - "getSpendingInsights uses Drizzle select() with sql`` tagged expressions for GROUP BY DATE() — avoids raw db.execute() and the .rows type confusion"
metrics:
  duration: 20
  completed: "2026-03-23"
  tasks: 2
  files: 9
---

# Phase 13 Plan 03: Purchasing Dashboard and QBO Item Sync Summary

Purchasing dashboard with fleet-wide aggregated needs (supplier/urgency grouping), dual-mode PO builder (formal PDF/email + checklist), recharts spending trend charts, chemical usage tracking per tech/route/customer/pool, and QBO two-way item catalog sync (push from DeweyIQ, pull from QBO webhook).

## What Was Built

### Task 1: Backend Actions, QBO Sync, and Mappers

**src/actions/purchasing.ts** — Complete purchasing action surface:
- `getPurchasingDashboard(groupBy)` — Aggregates shopping_list_items with status 'needed'/'ordered' using LEFT JOIN + GROUP BY to profiles. Two grouping modes: supplier (by vendor field) and urgency (urgent-needed → needed → ordered).
- `createPurchaseOrder(data)` — Auto-increments PO number from org_settings.next_po_number using adminDb (same pattern as invoice numbers). Creates po_line_items. Updates linked shopping_list_items to 'ordered' with ordered_at, ordered_by_id, vendor, po_reference.
- `sendPurchaseOrder(poId)` — Emails PO HTML to supplier via Resend. Only available for formal mode POs with supplier_email set.
- `updatePurchaseOrderStatus(poId, status, markItemsReceived)` — Transitions PO status. When complete, optionally marks linked shopping_list_items as 'received'.
- `getSpendingInsights(period, compareBy)` — Returns time-series (daily totals) and breakdown (by supplier) for recharts charts. Uses Drizzle select() with sql`` tagged GROUP BY DATE() expressions.

**src/actions/qbo-items.ts** — QBO two-way item sync:
- `syncCatalogItemToQbo(itemId)` — Pushes parts_catalog item to QBO (create or update). Uses `getItem` to fetch SyncToken for updates.
- `syncQboItemToDeweyIq(qboItemId, orgId)` — Pulls QBO Item into parts_catalog. Called from webhook handler via dynamic import.
- `reconcileCatalogWithQbo(orgId)` — Bulk sync: fetches all QBO Items, matches by qbo_item_id or SKU, creates/updates in DeweyIQ.
- `importQboItems(orgId)` — One-time import wrapper for Settings UI.

**src/lib/qbo/mappers.ts** additions:
- `mapCatalogItemToQboItem(item)` — Maps is_labor to Service/NonInventory Type. Maps SKU, prices, description.
- `mapQboItemToCatalogItem(qboItem)` — Reverse: Service → is_labor=true. Handles missing fields gracefully.

**src/actions/qbo-sync.ts** extension:
- `handleQboWebhook` now handles Item.Create and Item.Update events. Uses dynamic import of `syncQboItemToDeweyIq` to avoid potential circular dependency.

### Task 2: UI Components and Extended Inventory Page

**src/components/inventory/purchasing-dashboard.tsx**:
- Supplier/urgency grouping toggle with pending indicator
- Stats bar: total needed, total ordered, total outstanding
- Collapsible group cards (native React state — no @radix-ui/collapsible required)
- Each card: group label, item count badge, "Create PO" button, item list with urgency badges and source badges
- Opens PoBuilder modal with pre-populated items

**src/components/inventory/po-builder.tsx**:
- Mode toggle: Checklist (default) vs Formal
- Supplier name, contact, email fields
- Line item editor: item name, quantity, unit, unit price (formal only)
- Local string state for all decimal inputs per MEMORY.md pattern — blur-flush to valid number
- Checklist mode: marks items ordered without formal PO document
- Formal mode: saves PO and triggers sendPurchaseOrder if supplier email provided

**src/components/inventory/spending-insights.tsx**:
- Period selector: 7 Days / 30 Days / 90 Days
- Compare-by selector: Supplier / Category
- Line chart (time-series) using recharts — hex-only colors, no oklch
- Bar chart (breakdown) using recharts — color-coded cells from CHART_COLORS array
- Breakdown table below bar chart with percentage column

**src/components/inventory/chemical-usage-panel.tsx**:
- Period and group-by selectors (tech/route/customer/pool)
- Stats cards: groups, chemicals, total visits
- Sortable table: click any column header to sort ascending/descending
- Shows: group label, chemical name, visits, total amount, avg/visit

**src/actions/reporting.ts** addition:
- `getChemicalUsageReport(period, groupBy)` — Fetches service_visits with dosing_amounts in period, processes JSONB array in TypeScript (avoids SQL JSONB complexity), aggregates by group → chemical. LEFT JOIN to profiles and customers for names.

**Inventory page extensions**:
- `inventory-page-client.tsx`: Expanded from 2-tab to 5-tab for office role (Truck Inventory | Shopping Lists | Purchasing | Spending | Chemical Usage). Tech tab keeps 2 tabs. New optional props with default empty data shapes.
- `page.tsx`: Now fetches 6 parallel data sources for office view. All wrapped in .catch() for graceful degradation.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] node-quickbooks missing TypeScript types for Item CRUD**
- **Found during:** Task 1 TypeScript compile
- **Issue:** `qbo.getItem`, `qbo.createItem`, `qbo.updateItem`, `qbo.findItems` all exist in the JS runtime (verified in index.js) but are not typed in the package's TypeScript declarations
- **Fix:** Cast QuickBooks instance to `any` in qbo-items.ts — the methods work at runtime
- **Files modified:** `src/actions/qbo-items.ts`

**2. [Rule 3 - Blocking] @radix-ui/collapsible not installed**
- **Found during:** Task 2 TypeScript compile
- **Issue:** purchasing-dashboard.tsx imported from `@/components/ui/collapsible` which doesn't exist
- **Fix:** Replaced with native React state toggle (`open` boolean + conditional render) — same UX, no new dependency
- **Files modified:** `src/components/inventory/purchasing-dashboard.tsx`

**3. [Rule 1 - Bug] recharts Tooltip formatter type incompatibility**
- **Found during:** Task 2 TypeScript compile
- **Issue:** Typed `(value: number) => [string, string]` but recharts expects `ValueType` (any) as first param
- **Fix:** Changed to `(value: any) => [formatCurrency(Number(value)), "Spend"]`
- **Files modified:** `src/components/inventory/spending-insights.tsx`

**4. [Rule 1 - Bug] getRlsToken signature mismatch**
- **Found during:** Task 1 TypeScript compile
- **Issue:** Plan referenced old pattern `getRlsToken(session)` with session arg — actual signature is `getRlsToken()` (no args, no session param)
- **Fix:** Updated getToken() helper in purchasing.ts to use current signature
- **Files modified:** `src/actions/purchasing.ts`

**5. [Rule 1 - Bug] db.execute() returns array not { rows }**
- **Found during:** Task 1 TypeScript compile
- **Issue:** getSpendingInsights used `.rows` property on db.execute() result — postgres-js driver returns the array directly
- **Fix:** Replaced raw db.execute() with typed Drizzle select() + sql`` tagged GROUP BY expressions
- **Files modified:** `src/actions/purchasing.ts`

## Self-Check: PASSED

All files verified present:
- FOUND: `src/actions/purchasing.ts`
- FOUND: `src/actions/qbo-items.ts`
- FOUND: `src/lib/qbo/mappers.ts` (updated)
- FOUND: `src/actions/qbo-sync.ts` (updated)
- FOUND: `src/actions/reporting.ts` (updated)
- FOUND: `src/components/inventory/purchasing-dashboard.tsx`
- FOUND: `src/components/inventory/po-builder.tsx`
- FOUND: `src/components/inventory/spending-insights.tsx`
- FOUND: `src/components/inventory/chemical-usage-panel.tsx`
- FOUND: `src/app/(app)/inventory/inventory-page-client.tsx` (updated)
- FOUND: `src/app/(app)/inventory/page.tsx` (updated)

All commits verified:
- 38de0de: `feat(13-03): purchasing dashboard actions, PO generation, QBO item sync, and spending insights`
- 0a97fab: `feat(13-02): inventory page, field UIs...` (captured Plan 03 UI files alongside Plan 02 files)

TypeScript: zero errors across all modified files.
Build: Next.js build succeeds cleanly.
