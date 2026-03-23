---
phase: 13-truck-inventory-shopping-lists
plan: "02"
subsystem: shopping-lists-and-field-ui
tags:
  - shopping-lists
  - truck-inventory
  - prep-tab
  - field-ui
  - inventory-page
  - settings
dependency-graph:
  requires:
    - 13-01 (truck-inventory schema + actions + barcode scanner)
    - parts-catalog (Phase 6)
    - work-orders (Phase 6)
    - route-stops (Phase 4)
    - service-visits (Phase 3)
  provides:
    - shopping_list_items full lifecycle (needed→ordered→received→loaded→used)
    - getShoppingList, addShoppingListItem, transitionShoppingListItem
    - autoGenerateFromWO, autoGenerateFromLowInventory, autoGenerateFromScheduleForecast
    - getPartsReadyStatus for work order readiness
    - getWhatToBring cross-reference aggregation
    - /inventory page (office + tech views)
    - TruckInventoryView (categorized, inline edit, barcode scan, transfer)
    - ShoppingListView (lifecycle transitions, urgency flags, source badges)
    - TruckTemplatesSettings (settings tab, CRUD + apply to tech)
    - PrepTab (What to Bring, color-coded Missing/Low/Stocked/Predicted)
    - Routes page Prep tab (third tab alongside Routes | Projects)
    - Settings > Inventory tab (owner only, template management)
    - Sidebar Inventory link (all roles)
  affects:
    - src/components/field/routes-tabs-client.tsx (additive third tab)
    - src/app/(app)/routes/page.tsx (prepData server fetch)
    - src/app/(app)/settings/page.tsx (truckLoadTemplates fetch)
    - src/components/settings/settings-tabs.tsx (Inventory tab added)
    - src/components/shell/app-sidebar.tsx (Inventory nav entry)
tech-stack:
  added: []
  patterns:
    - LEFT JOIN + GROUP BY aggregation (no correlated subqueries inside withRls)
    - Controlled decimal input state per MEMORY.md
    - Dynamic import for BarcodeScannerDialog (ssr: false)
    - Graceful catch + fallback null for prepData (never breaks routes page)
    - next/dynamic for camera API components
key-files:
  created:
    - src/actions/shopping-lists.ts
    - src/actions/what-to-bring.ts
    - src/components/inventory/truck-inventory-view.tsx
    - src/components/inventory/shopping-list-view.tsx
    - src/components/inventory/truck-templates-settings.tsx
    - src/components/field/prep-tab.tsx
    - src/app/(app)/inventory/page.tsx
    - src/app/(app)/inventory/inventory-page-client.tsx
  modified:
    - src/components/field/routes-tabs-client.tsx (Prep tab added)
    - src/app/(app)/routes/page.tsx (prepData fetch + RoutesTabsClient props)
    - src/app/(app)/settings/page.tsx (truckLoadTemplates + SettingsTabs props)
    - src/components/settings/settings-tabs.tsx (Inventory tab + TruckTemplatesSettings)
    - src/components/shell/app-sidebar.tsx (PackageIcon + Inventory entries)
decisions:
  - "BarcodeScannerDialog uses onOpenChange not onClose — fixed to match actual v1.1.3 API"
  - "PrepData fetch wrapped in .catch(() => null) on routes page — inventory failure never blocks route rendering"
  - "Shopping list lifecycle transition validates sequentially — cannot skip steps"
  - "getWhatToBring uses JS-side aggregation of dosing history (not SQL aggregation) to avoid correlated subqueries inside withRls per MEMORY.md"
  - "Forecast items go in separate predicted section (not mixed with confirmed missing/low/stocked)"
  - "Linter auto-generated Plan 03 components (purchasing-dashboard, spending-insights, chemical-usage-panel) included in commit since they compile and inventory-page-client references them — they are placeholders for Plan 03"
metrics:
  duration: 17
  completed: "2026-03-23"
  tasks: 2
  files: 13
---

# Phase 13 Plan 02: Shopping List System and Field UI Summary

Full shopping list system with procurement lifecycle, tech-facing inventory and shopping list UIs, "What to Bring" Prep tab on the routes page, /inventory page, and Settings Inventory tab with template management.

## What Was Built

### Task 1: Shopping List Actions and What to Bring Aggregation

**src/actions/shopping-lists.ts** — Complete shopping list server action surface:
- `getShoppingList(techId?)` — tech's items + shared org items, or all org for office. Ordered by urgency DESC, status (needed first), created_at DESC.
- `addShoppingListItem(data)` — inserts with full source tracking (manual/work_order/project/low_inventory/forecast)
- `transitionShoppingListItem(itemId, newStatus, data?)` — sequential validation (needed→ordered→received→loaded→used), records timestamps and user attribution at each step
- `autoGenerateFromWO(workOrderId)` — reads part line items, deduplicates by catalog_item_id + source_wo_id, assigns to WO's tech
- `autoGenerateFromLowInventory(techId)` — scans items below min_threshold, calculates needed quantity as (threshold − current), sets is_urgent=true
- `autoGenerateFromScheduleForecast(techId, routeDate)` — aggregates dosing history from last 4 visits per scheduled pool, creates forecast items
- `getPartsReadyStatus(workOrderId)` — returns { ready, total, loaded, items } by cross-referencing WO line items vs shopping list
- `deleteShoppingListItem`, `flagUrgent`, `unflagUrgent`

**src/actions/what-to-bring.ts** — Pre-route summary aggregation:
- `getWhatToBring(techId, routeDate)` — fetches route stops → WO parts → dosing history → truck inventory; cross-references and returns `{ missing, low, stocked, predicted }` arrays sorted by urgency
- LEFT JOIN + GROUP BY pattern throughout (MEMORY.md compliance — no correlated subqueries in withRls)
- Chemical unit conversion handled via `convertUnits()` for accurate on-truck quantity comparison

### Task 2: All UI Components and Integration

**TruckInventoryView** — Categorized list (chemical / part / tool / equipment / other) with:
- Inline quantity editing: local string state, flush on blur or Enter (controlled decimal per MEMORY.md)
- Below-threshold items: amber border + "Low" badge + threshold hint
- Mark Used (−1 quick decrement), Remove (office only), Transfer (office only, opens transfer dialog)
- Add Item dialog with optional barcode scan (BarcodeScannerDialog via next/dynamic ssr:false)

**ShoppingListView** — Items grouped by status (needed → ordered → received → loaded → used):
- Each group is collapsible; "used" collapsed by default to reduce clutter
- Source badges: WO (blue), Project (purple), Low Stock (amber), Forecast (cyan)
- Urgency flag toggle on each item (red border when urgent)
- Status transitions: Mark Ordered → vendor dialog; Mark Loaded → barcode scan dialog (skippable); other transitions immediate
- Add Item dialog with barcode scan to populate item name
- Office sees all org items; tech sees their items + shared (null tech_id) items

**TruckTemplatesSettings** — Settings > Inventory tab content:
- Create templates with name + target_role + item list (name, category, qty, unit, min threshold)
- Edit (name/role only — items require delete+recreate per simplicity)
- Delete, Apply to Tech (shows applied/skipped count)

**PrepTab** — What to Bring summary with four sections:
- Missing (red): 0 on truck — sorted by shortfall desc
- Running Low (amber): on truck but below needed — sorted by shortfall desc
- Stocked (green): at or above needed — collapsed by default, sorted by name
- Predicted Needs (cyan): forecast estimates — collapsed by default, labeled as predictions
- "Add to List" button on missing/low/predicted items creates shopping list entry

**Routes page (RoutesTabsClient)** — Third Prep tab:
- Tab bar now: Routes | Projects | Prep (33% each when all shown)
- Server-side `getWhatToBring()` fetch with `.catch(() => null)` — never blocks page
- `showPrepTab={isFieldUser}` — tech and owner see Prep tab; office sees route content only

**Settings page** — Inventory tab:
- Added to `OWNER_TABS` and `TabId` type in settings-tabs.tsx
- `getTruckLoadTemplates()` fetched server-side for owner
- `TruckTemplatesSettings` rendered in the Inventory tab panel
- `inventoryTechProfiles` passed from existing `techProfiles` fetch (already available)

**Sidebar** — `/inventory` entry:
- `PackageIcon` from lucide-react
- Appears in `NAV_ITEMS` for `["owner", "office"]`
- Appears in `TECH_NAV_ITEMS` for tech (between My Routes and Settings)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] BarcodeScannerDialog prop name mismatch**
- **Found during:** Task 2 TypeScript compile
- **Issue:** Plan components used `onClose` prop, but BarcodeScannerDialog v1.1.3 uses `onOpenChange: (open: boolean) => void`
- **Fix:** Changed all usages to `onOpenChange={(open) => !open && setShowScanner(false)}`
- **Files modified:** `truck-inventory-view.tsx`, `shopping-list-view.tsx`
- **Commit:** 0a97fab

**2. [Rule 3 - Blocking] Linter-generated Plan 03 stub components**
- **Found during:** Task 2 implementation
- **Issue:** An automated linter process generated Plan 03 components (`purchasing-dashboard.tsx`, `spending-insights.tsx`, `chemical-usage-panel.tsx`, `po-builder.tsx`) and added their imports to `inventory-page-client.tsx`. Removing them would break the build since they were already wired in.
- **Fix:** Accepted the linter-generated files as valid Plan 03 scaffolding (they compile cleanly using real types from `purchasing.ts` and `reporting.ts`). Included in commit as placeholders.
- **Files modified:** `src/components/inventory/*.tsx` (4 new files)
- **Commit:** 0a97fab

## Self-Check: PASSED

All files verified present:
- FOUND: `src/actions/shopping-lists.ts`
- FOUND: `src/actions/what-to-bring.ts`
- FOUND: `src/components/inventory/truck-inventory-view.tsx`
- FOUND: `src/components/inventory/shopping-list-view.tsx`
- FOUND: `src/components/inventory/truck-templates-settings.tsx`
- FOUND: `src/components/field/prep-tab.tsx`
- FOUND: `src/app/(app)/inventory/page.tsx`
- FOUND: `src/app/(app)/inventory/inventory-page-client.tsx`

All commits verified:
- 2ef381e: `feat(13-02): shopping list actions with full lifecycle, WO auto-gen, and What to Bring aggregation`
- 0a97fab: `feat(13-02): inventory page, field UIs, Prep tab, Settings Inventory tab, and sidebar entry`

Build: `npm run build` — compiled successfully in 6.7s, zero errors.
