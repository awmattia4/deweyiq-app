---
phase: 13-truck-inventory-shopping-lists
plan: "01"
subsystem: schema-and-infrastructure
tags:
  - truck-inventory
  - shopping-lists
  - barcode
  - schema
  - drizzle
  - dexie
  - offline
dependency-graph:
  requires:
    - parts-catalog (Phase 6)
    - chemical-products (Phase 3)
    - alerts (Phase 5)
    - notifications/dispatch (Phase 10)
    - visits/completeStop (Phase 3)
  provides:
    - truck_inventory table with RLS
    - truck_inventory_log table with RLS
    - truck_load_templates + truck_load_template_items tables
    - shopping_list_items table with RLS
    - purchase_orders + po_line_items tables
    - barcode_catalog_links table with RLS
    - decrementTruckInventoryFromDosing action (hooked into completeStop)
    - BarcodeScanner + BarcodeScannerDialog components
    - InventoryDeductPrompt component
    - Dexie v5 inventoryUpdates offline store
  affects:
    - src/actions/visits.ts (additive integration — non-blocking)
    - src/lib/offline/db.ts (additive v5 store)
    - src/lib/db/schema/parts-catalog.ts (qbo_item_id column)
    - src/lib/db/schema/org-settings.ts (next_po_number column)
tech-stack:
  added:
    - react-zxing@1.1.3 (cross-platform barcode scanning via camera)
  patterns:
    - withRls/adminDb pattern (consistent with all prior phases)
    - Non-blocking try/catch wrapping for completeStop integration
    - Controlled decimal input state (MEMORY.md pattern) in InventoryDeductPrompt
    - next/dynamic with ssr:false required for BarcodeScanner (camera API)
    - Dexie additive versioning (v5 carries forward all v4 stores unchanged)
key-files:
  created:
    - src/lib/db/schema/truck-inventory.ts
    - src/lib/db/schema/shopping-lists.ts
    - src/lib/db/schema/barcode-catalog.ts
    - src/actions/truck-inventory.ts
    - src/actions/barcode.ts
    - src/lib/unit-conversion.ts
    - src/components/field/barcode-scanner.tsx
    - src/components/field/inventory-deduct-prompt.tsx
    - src/lib/db/migrations/0016_steady_hedge_knight.sql
  modified:
    - src/lib/db/schema/index.ts (Phase 13 exports)
    - src/lib/db/schema/relations.ts (Phase 13 relations)
    - src/lib/db/schema/parts-catalog.ts (qbo_item_id)
    - src/lib/db/schema/org-settings.ts (next_po_number)
    - src/actions/visits.ts (auto-decrement hook in completeStop)
    - src/lib/offline/db.ts (Dexie v5)
    - src/components/shell/app-header.tsx (/inventory title)
decisions:
  - "Used adminDb (not withRls) inside decrementTruckInventoryFromDosing because it runs in server action context with explicit org/tech ID params — avoids RLS re-auth overhead in a non-user-session context"
  - "Used dynamic import for decrementTruckInventoryFromDosing in visits.ts to avoid circular module dependency"
  - "UPC API caching via Next.js fetch next.revalidate: 86400 (24h) rather than manual DB caching — simpler and sufficient for trial tier"
  - "react-zxing onResult callback (not onDecodeResult) — matched v1.1.3 actual API"
metrics:
  duration: 13
  completed: "2026-03-23"
  tasks: 2
  files: 17
---

# Phase 13 Plan 01: Schema Foundation and Infrastructure Summary

Full Phase 13 schema foundation: 8 new tables with complete RLS policies, truck inventory CRUD with auto-decrement from dosing (hooked non-blocking into completeStop), barcode scanner component using react-zxing, post-dosing confirmation prompt, unit conversion utility for floz/gallon/lbs matching, and Dexie v5 offline store.

## What Was Built

### Task 1: Phase 13 Schema

Created three new schema files following the established `pgTable + pgPolicy + enableRLS + authenticatedRole` pattern:

**truck-inventory.ts** — four tables:
- `truck_inventory`: per-tech item tracking (chemicals, parts, tools, equipment) with quantity, unit, min_threshold, reorder_alert_sent_at
- `truck_inventory_log`: immutable audit log of every quantity change (auto_decrement, manual_use, loaded, damaged, transfer_out, transfer_in, adjustment)
- `truck_load_templates`: office-managed standard truck load templates
- `truck_load_template_items`: line items within templates

**shopping-lists.ts** — three tables:
- `shopping_list_items`: multi-source (manual, work_order, project, low_inventory, forecast) items with full lifecycle status (needed → ordered → received → loaded → used)
- `purchase_orders`: formal or checklist-mode POs with supplier tracking
- `po_line_items`: individual line items linked back to shopping list items

**barcode-catalog.ts** — one table:
- `barcode_catalog_links`: org-wide barcode registry with UPC lookup metadata

Modified existing schemas:
- `parts-catalog.ts`: added `qbo_item_id` column for QBO two-way sync
- `org-settings.ts`: added `next_po_number` column (same pattern as `next_invoice_number`)

Updated `index.ts` with Phase 13 exports and `relations.ts` with full relation graph for all 8 new tables.

Migration `0016_steady_hedge_knight.sql` generated via `drizzle-kit generate`.

### Task 2: Actions, Components, and Integration

**src/lib/unit-conversion.ts**: Conversion between dosing units (floz, lbs) and truck inventory units (gallon, quart, cup, oz). Handles incompatible unit groups gracefully (returns original amount with console.warn).

**src/actions/truck-inventory.ts**: Full truck inventory server action surface:
- `getTruckInventory`, `addTruckInventoryItem`, `updateTruckInventoryItem`, `deleteTruckInventoryItem`
- `decrementTruckInventoryFromDosing` — the critical auto-decrement function: matches by `chemical_product_id`, converts units, clamps to 0, logs to `truck_inventory_log`, fires reorder alerts via existing `alerts` table + `notifyUser`/`notifyOrgRole`
- `applyTruckLoadTemplate` — copies template items to tech's inventory, skips existing items
- `transferInventoryItem` — decrements source tech, creates/increments on target tech
- `getTruckLoadTemplates`, `createTruckLoadTemplate`, `updateTruckLoadTemplate`, `deleteTruckLoadTemplate`
- `resetReorderAlert`

**src/actions/barcode.ts**: Barcode resolution pipeline — org catalog first, then UPC API fallback via `upcitemdb.com`. `registerBarcode` upserts org-wide so all techs benefit from any single scan.

**src/components/field/barcode-scanner.tsx**: `BarcodeScannerDialog` (Dialog wrapper) and `BarcodeScanner` (raw component). Uses `useZxing` from react-zxing with `onResult` callback. Renders camera feed, corner bracket overlay, and scanning line animation. Must be loaded via `next/dynamic` with `ssr: false`.

**src/components/field/inventory-deduct-prompt.tsx**: Post-dosing confirmation card. Lists auto-deducted items with editable quantities. Uses local string state per MEMORY.md controlled decimal input pattern. Auto-dismisses after 10 seconds with no interaction. "Looks Good" dismisses without changes; "Confirm" flushes adjusted values.

**visits.ts integration**: Added non-blocking auto-decrement hook immediately after the visit upsert (step 9b). Uses dynamic import to avoid circular module issues. Full try/catch — inventory decrement failure never blocks stop completion.

**Dexie v5**: Added `inventoryUpdates` store with `++id, techId, itemId, status, createdAt` indexes. All prior v1–v4 stores carried forward unchanged.

**app-header.tsx**: Added `"/inventory": "Inventory"` to PAGE_TITLES.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] react-zxing API mismatch**
- **Found during:** Task 2 TypeScript compile
- **Issue:** Plan specified `onDecodeResult` callback but react-zxing v1.1.3 uses `onResult`
- **Fix:** Changed callback name to `onResult` to match actual package API
- **Files modified:** `src/components/field/barcode-scanner.tsx`
- **Commit:** a8f7e71

**2. [Rule 2 - Missing critical functionality] Dynamic import for visits.ts integration**
- **Found during:** Task 2 implementation
- **Issue:** Direct import of `decrementTruckInventoryFromDosing` in visits.ts would create a circular dependency (`visits.ts` → `truck-inventory.ts` → schema → circular)
- **Fix:** Used `await import("@/actions/truck-inventory")` dynamic import pattern inside the try/catch block
- **Files modified:** `src/actions/visits.ts`
- **Commit:** a8f7e71

## Self-Check: PASSED

All files verified present:
- FOUND: `src/lib/db/schema/truck-inventory.ts`
- FOUND: `src/lib/db/schema/shopping-lists.ts`
- FOUND: `src/lib/db/schema/barcode-catalog.ts`
- FOUND: `src/actions/truck-inventory.ts`
- FOUND: `src/actions/barcode.ts`
- FOUND: `src/lib/unit-conversion.ts`
- FOUND: `src/components/field/barcode-scanner.tsx`
- FOUND: `src/components/field/inventory-deduct-prompt.tsx`
- FOUND: `src/lib/db/migrations/0016_steady_hedge_knight.sql`

All commits verified:
- ee3cd6c: `feat(13-01): Phase 13 schema — truck inventory, shopping lists, barcode catalog`
- a8f7e71: `feat(13-01): truck inventory actions, barcode scanner, offline sync, and completeStop integration`

TypeScript: zero errors in source files (only pre-existing `.next/dev/types/` auto-generated errors from Next.js, unrelated to this plan).
