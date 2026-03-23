# Phase 13: Truck Inventory & Shopping Lists - Research

**Researched:** 2026-03-23
**Domain:** Inventory management, barcode scanning, procurement lifecycle, PWA offline sync
**Confidence:** HIGH (existing codebase audit) / MEDIUM (barcode library selection)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Truck Inventory UX
- Tech can confirm/adjust auto-deducted amounts after dosing — a quick confirmation prompt shows what was deducted from inventory, tech can adjust if actual amount differed
- Reorder alerts use both push notifications (first alert when item drops below threshold) AND persistent badge on inventory section until restocked
- Barcode/QR scanning available everywhere — add items, mark received, mark loaded, log usage

#### Shopping List Flow
- Barcode scanning integrated into all shopping list actions (add, receive, load, use)
- First-time barcode scan: attempt UPC lookup API to auto-fill product details; if not found, prompt manual entry (name, category, unit). Barcode-to-item mapping saved org-wide — once any tech identifies a barcode, all techs recognize it
- Full scanning integration: scan to add items, mark received, mark loaded on truck, log usage

#### "What to Bring" Summary
- Located on a dedicated "Prep" tab on the routes page — tech taps into it before heading out
- Shortage highlighting: sorted by urgency (missing items first, low next, stocked last) AND color-coded (red for out of stock, yellow for low, neutral for stocked)
- Default view shows WO/stop requirements; expandable "Predicted Needs" section uses pool dosing history to estimate chemical needs
- Predictions toggle between explicit requirements and history-based estimates

#### Purchasing Dashboard
- Two views: supplier grouping (for ordering) and urgency grouping (for prioritizing) — toggle between them
- PO generation supports both formal PDF/email to supplier AND simple checklist mode (mark as ordered with date/notes) — because some suppliers can't receive email POs
- Spending insights: time-based trends (monthly/weekly spend, cost per unit over time, spending by category) AND comparative breakdowns (by tech, by supplier, by route)

#### QBO Integration
- Ongoing two-way sync between QuickBooks Online item catalog and DeweyIQ parts catalog — changes in either system reflect in the other

### Claude's Discretion
- Truck inventory layout style (categorized list vs card grid — match existing app patterns)
- Transfer mechanism between techs (peer-to-peer confirmation vs one-sided with office reconciliation — pick what's most practical)
- Shopping list scope (per-tech vs shared vs both — pick based on what works best operationally)
- Procurement lifecycle granularity (full lifecycle vs simplified — pick the right level of detail)
- Whether "What to Bring" summary is actionable (tap to mark loaded/add to list) or informational only

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INV-01 | Each tech has a truck inventory — persistent list of parts, chemicals, and equipment with quantity, unit, min threshold, on-truck status | New `truck_inventory` table per-tech, seeded from templates; units align with existing `chemical_products.unit` pattern |
| INV-02 | Office defines standard truck load templates per role/route type; new techs get template pre-loaded | New `truck_load_templates` + `truck_load_template_items` tables; admin UI in Settings under new "Inventory" tab |
| INV-03 | Tech updates truck inventory from field app — mark used, add loaded, damaged/returned, transfer; real-time sync to office | New field UI on `/inventory` page + Supabase Realtime for office visibility; transfers use peer-to-peer confirmation pattern |
| INV-04 | Auto-decrement chemicals from truck inventory when tech logs dosing at a stop | Hook into existing `completeStop` action (visits.ts:688) — after saving `dosing_amounts`, fire auto-decrement against `truck_inventory` |
| INV-05 | Reorder alerts when items drop below threshold — push to tech + persistent badge to office | Extend existing `notifyUser` / `notifyOrgRole` dispatch system + new alert type "low_inventory" in alerts table |
| INV-06 | Shopping lists from WO parts lists, project materials, low inventory alerts, forecasting, manual entry | New `shopping_list_items` table with source_type polymorphic link; aggregation queries across work_order_line_items + project_materials |
| INV-07 | Shopping list item statuses: needed → ordered → received → loaded → used | Status column with timestamped transitions + attribution on `shopping_list_items` |
| INV-08 | Tech views/manages shopping list from field app — scan to mark loaded, flag urgent | Field-facing component on `/inventory` or routes page; barcode scan triggers status transition |
| INV-09 | Shopping lists integrate with WOs and projects — WO parts auto-appear on tech's list; WO/project shows parts-ready status | `shopping_list_items.source_work_order_id` + `source_project_id` FKs; WO detail reads back parts readiness |
| INV-10 | Purchasing dashboard — aggregated fleet-wide items, supplier grouping, bulk PO generation, spending trends | Office-only page `/inventory`; reuse `projectPurchaseOrders` pattern for PO generation; recharts for spending trends (already in deps) |
| INV-11 | Chemical usage tracking per tech/route/customer/pool — feeds Phase 9 reporting, surfaces over/under-dosing | `service_visits.dosing_amounts` already stores per-visit data; new aggregation queries in reporting.ts |
| INV-12 | "What to Bring" pre-route summary on Prep tab — requirements vs inventory cross-reference, shortages highlighted | New "Prep" tab in `RoutesTabsClient`; server-side aggregation of WO line items + schedule + dosing history |
| INV-13 | Barcode/QR scanning for inventory management — optional but speeds up high-volume tasks | `react-zxing` library (ZXing-based, maintained, works in Next.js PWA); BarcodeDetector API not viable (no iOS Safari support) |
</phase_requirements>

---

## Summary

Phase 13 is a new system built on top of existing Phase 6 (parts catalog, work orders), Phase 3 (dosing logs, service visits), Phase 9 (reporting), and Phase 12 (project materials) infrastructure. The codebase has NO existing truck inventory tables — everything here is net-new schema. However, several key integration points are already wired and just need to be tapped.

The most critical architectural decision is the **dual catalog model**: `chemical_products` (dosing-engine products with concentration and unit) and `parts_catalog` (general parts/labor items with pricing) are two separate catalogs serving different purposes. Truck inventory items link to BOTH, plus allow free-text items not in either catalog. This three-way linkage must be handled carefully in the schema.

The **barcode scanning** decision requires a library choice since `BarcodeDetector` Web API has no iOS Safari support. `react-zxing` (wrapping the maintained `@zxing/browser`) is the right call for a cross-platform PWA. UPC lookup falls back gracefully to manual entry via `UPCitemdb` (free tier: 100 req/day) — chemical pool supplies rarely have UPCs; this mostly helps with parts/equipment.

The **QBO Item sync** is the most complex new territory. The existing `node-quickbooks` package already in deps supports `createItem`, `updateItem`, `getItem` and `findItems`. The parts catalog needs a `qbo_item_id` column added. Two-way sync needs webhook handling (QBO pushes changes via webhook) and a manual reconcile trigger in Settings.

**Primary recommendation:** Build schema-first (7 new tables), wire auto-decrement into `completeStop`, then layer the field UI, then the purchasing dashboard. Scope QBO sync as the final sub-task — it's a contained addition to the existing QBO infrastructure.

---

## Current State Audit (CRITICAL — Read Before Building)

### What EXISTS and must NOT be broken

| System | Location | What It Does |
|--------|----------|-------------|
| `parts_catalog` table | `schema/parts-catalog.ts` | Parts/labor items with name, SKU, cost, sell price, unit, is_labor |
| `chemical_products` table | `schema/chemical-products.ts` | Dosing products with chemical_type, concentration_pct, unit, cost_per_unit |
| `service_visits.dosing_amounts` | `schema/service-visits.ts` L52 | JSONB: `Array<{chemical, productId, amount, unit}>` saved on stop completion |
| `completeStop` action | `src/actions/visits.ts` L667 | Saves dosing_amounts on visit insert/upsert — Phase 13 hooks here |
| `ChemistryDosing` component | `src/components/field/chemistry-dosing.tsx` | Calculates dosing recs, fires `onDosingChange` to parent |
| `StopWorkflow` dosing ref | `src/components/field/stop-workflow.tsx` L185 | Captures dosing amounts in ref, passes to completeStop |
| `RoutesTabsClient` | `src/components/field/routes-tabs-client.tsx` | Routes \| Projects tabs — "Prep" becomes the 3rd tab here |
| QBO client + mappers | `src/lib/qbo/client.ts`, `mappers.ts` | QBO auth, token refresh, customer/invoice/payment mappers |
| `notifyUser` / `notifyOrgRole` | `src/lib/notifications/dispatch.ts` | Unified push + in-app notification delivery |
| `alerts` table | `schema/alerts.ts` | System alerts with deduplication on (org, type, ref) |
| `project_materials` + PO tables | `schema/project-materials.ts` | Full materials lifecycle pattern — mirror this for shopping lists |
| Dexie offline DB | `src/lib/offline/db.ts` | Currently v4 with visitDrafts, photoQueue, projectTaskDrafts |
| PAGE_TITLES map | `src/components/shell/app-header.tsx` L23 | Must add `/inventory` → "Inventory" when that route is created |

### What DOES NOT EXIST yet (all net-new for Phase 13)
- Truck inventory tables (`truck_inventory`, `truck_load_templates`, `truck_load_template_items`)
- Barcode registry table (`barcode_catalog_links`)
- Shopping list tables (`shopping_list_items`, `purchase_orders`, `po_line_items`)
- `/inventory` app route (for office purchasing dashboard)
- "Prep" tab on `/routes`
- QBO Item mapper + `qbo_item_id` on `parts_catalog`
- Inventory-specific reorder alert type

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Drizzle ORM | ^0.45.1 | New table schemas + migrations | Already in use; all existing tables use this pattern |
| `withRls()` / `adminDb` | project pattern | All queries | Established pattern — user queries via withRls, cron/webhooks via adminDb |
| Supabase Realtime | via @supabase/supabase-js ^2.98.0 | Live inventory updates to office | Already used for dispatch/GPS; channel per org for inventory |
| recharts | ^3.8.0 | Spending trend charts in purchasing dashboard | Already in deps, used in reporting |
| Dexie ^4.0 | ^4.3.0 | Offline inventory updates from field | Already installed; add v5 with new stores |
| react-zxing | ~2.0 | Barcode/QR scanning in browser | Maintained ZXing wrapper; works on iOS via WebRTC; no BarcodeDetector dependency |
| node-quickbooks | ^2.0.48 | QBO Item CRUD | Already in deps; supports createItem/updateItem/findItems |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| UPCitemdb API | Free tier (external) | UPC product lookup for first-time scans | Called server-side via fetch when barcode not in org's barcode_catalog_links |
| @react-pdf/renderer | ^4.3.2 | PO PDF generation | Already in deps; reuse pattern from invoices/quotes |
| sonner | ^2.0.7 | Toast for "deducted X from inventory" confirmation | Already in deps |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| react-zxing | html5-qrcode | html5-qrcode is unmaintained; react-zxing is actively maintained |
| react-zxing | BarcodeDetector Web API | BarcodeDetector has no iOS Safari support — unacceptable for mobile PWA |
| UPCitemdb | barcodelookup.com API | barcodelookup has better coverage but no free tier — UPCitemdb free tier is sufficient for first-scan lookups |

**Installation:**
```bash
npm install react-zxing
```

---

## Architecture Patterns

### Recommended Project Structure (new files for Phase 13)

```
src/
├── lib/db/schema/
│   ├── truck-inventory.ts       # truck_inventory, truck_load_templates, truck_load_template_items
│   ├── shopping-lists.ts        # shopping_list_items, purchase_orders, po_line_items
│   └── barcode-catalog.ts       # barcode_catalog_links
├── actions/
│   ├── truck-inventory.ts       # CRUD + auto-decrement trigger
│   ├── shopping-lists.ts        # shopping list CRUD + procurement transitions
│   ├── purchasing.ts            # purchasing dashboard + PO generation
│   ├── what-to-bring.ts         # route prep aggregation logic
│   └── qbo-items.ts             # QBO item catalog sync
├── components/
│   ├── field/
│   │   ├── prep-tab.tsx         # "What to Bring" Prep tab content
│   │   ├── inventory-deduct-prompt.tsx  # post-dosing confirmation prompt
│   │   └── barcode-scanner.tsx  # react-zxing wrapper component
│   └── inventory/
│       ├── truck-inventory-view.tsx     # tech's per-truck inventory list
│       ├── shopping-list-view.tsx       # tech's shopping list
│       ├── purchasing-dashboard.tsx     # office aggregate view
│       └── po-builder.tsx               # PO generation UI
└── app/(app)/
    └── inventory/
        └── page.tsx             # /inventory route (office purchasing hub)
```

### Pattern 1: Drizzle RLS Table with Tech Write Access
All new inventory tables follow the same RLS policy pattern as `service_visits`:
- SELECT: all org members (tech needs to read inventory)
- INSERT: owner + office + tech (tech loads items onto truck)
- UPDATE: owner + office + tech (tech adjusts quantities)
- DELETE: owner + office only

```typescript
// Source: existing pattern in schema/service-visits.ts
pgPolicy("truck_inventory_update_policy", {
  for: "update",
  to: authenticatedRole,
  using: sql`
    org_id = (select auth.jwt() ->> 'org_id')::uuid
    AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office', 'tech')
  `,
  withCheck: sql`
    org_id = (select auth.jwt() ->> 'org_id')::uuid
    AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office', 'tech')
  `,
})
```

### Pattern 2: Auto-Decrement Hook in completeStop

The auto-decrement trigger goes in `src/actions/visits.ts` AFTER the visit upsert (around line 710). It reads `dosingAmounts` from the completion payload, matches each chemical to the tech's truck inventory by `linked_chemical_product_id`, and decrements:

```typescript
// After the visit insert/upsert in completeStop (visits.ts ~L710)
// Auto-decrement truck inventory from dosing amounts (Phase 13)
if (input.dosingAmounts && input.dosingAmounts.length > 0) {
  try {
    await decrementTruckInventoryFromDosing(
      techId,
      orgId,
      input.dosingAmounts,
      token
    )
  } catch (invErr) {
    // Non-fatal: inventory decrement failure never blocks stop completion
    console.error("[completeStop] truck inventory decrement failed:", invErr)
  }
}
```

The `decrementTruckInventoryFromDosing` action:
1. Looks up truck inventory items for the tech where `linked_chemical_product_id IN (productIds from dosingAmounts)`
2. For each match, decrements quantity (clamped to 0)
3. Checks if new quantity is below `min_threshold` — if so, fires reorder alert via `notifyUser` + inserts into `alerts` table

### Pattern 3: Dexie v5 Store for Offline Inventory Updates

Add a new Dexie version increment for Phase 13 offline stores. NEVER modify existing version blocks:

```typescript
// In src/lib/offline/db.ts — add v5 (NEVER modify v1-v4)
this.version(5).stores({
  // Carry forward ALL v4 stores unchanged
  syncQueue: "++id, createdAt, retries, status",
  routeCache: "id, cachedAt, expiresAt",
  visitDrafts: "id, stopId, updatedAt, status",
  photoQueue: "++id, visitId, orgId, status, createdAt",
  projectTaskDrafts: "id, projectId, phaseId, updatedAt, status",
  projectPhotoQueue: "++id, projectId, phaseId, status, createdAt",
  // Phase 13: pending inventory updates (quantity adjustments made offline)
  inventoryUpdates: "++id, techId, itemId, status, createdAt",
})
```

### Pattern 4: RoutesTabsClient Extension for "Prep" Tab

The current `RoutesTabsClient` has "Routes" and "Projects" tabs with a hardcoded two-tab layout. Adding "Prep" as a third tab requires updating the component to accept a third slot and the tab state to `"routes" | "projects" | "prep"`. The tab bar uses full-width 50/50 split; with 3 tabs it becomes 33/33/33.

The Prep tab content is fetched server-side in `routes/page.tsx` (same pattern as `briefing` for projects) and passed as a prop to keep the page server-rendered with instant content.

### Pattern 5: QBO Item Sync Architecture

The existing QBO sync (`src/actions/qbo-sync.ts`) uses fire-and-forget writes: DeweyIQ changes push to QBO, QBO webhook pushes changes back. For items, the same pattern applies:

```typescript
// In src/actions/qbo-items.ts
// Push DeweyIQ catalog item -> QBO Item
export async function syncCatalogItemToQbo(itemId: string): Promise<void>

// Pull QBO Item -> DeweyIQ catalog (called from webhook handler)
export async function syncQboItemToDeweyIq(qboItemId: string, realmId: string): Promise<void>

// Bulk reconcile (called from Settings > Inventory > "Sync with QBO" button)
export async function reconcileCatalogWithQbo(orgId: string): Promise<{ created: number; updated: number; conflicts: number }>
```

The `parts_catalog` table needs a new column: `qbo_item_id text` (nullable). The QBO Item entity maps to parts_catalog as:
- QBO `Item.Name` → `parts_catalog.name`
- QBO `Item.Sku` → `parts_catalog.sku`
- QBO `Item.UnitPrice` → `parts_catalog.default_sell_price`
- QBO `Item.PurchaseCost` → `parts_catalog.default_cost_price`
- QBO `Item.Type` (NonInventory / Service) → `parts_catalog.is_labor` (Service = true)

### Anti-Patterns to Avoid

- **Don't use BarcodeDetector API directly** — no iOS Safari support, and this app's primary users are mobile techs. Always use react-zxing.
- **Don't run a full route re-render on every inventory update** — inventory decrment is fire-and-forget; use optimistic UI with silent background sync.
- **Don't block stop completion on inventory decrement failure** — inventory is non-critical path. Wrap in try/catch, log, move on.
- **Don't add inventory-write columns to service_visits** — `dosing_amounts` is the source of truth for what was applied. Inventory state lives in `truck_inventory`. These are intentionally separate tables.
- **Don't use correlated subqueries inside `withRls` transactions for fleet-wide aggregation** — use LEFT JOIN + GROUP BY (per MEMORY.md Drizzle RLS pitfall).
- **Don't run `drizzle-kit push`** — generates migrations with `drizzle-kit generate` then apply manually. Critical per MEMORY.md.

---

## Schema Design

### New Tables Required

#### `truck_inventory`
```
id uuid PK
org_id uuid FK orgs
tech_id uuid FK profiles (the tech who owns this truck)
-- Item identity (exactly one of these should be set; all nullable for free-text items)
catalog_item_id uuid FK parts_catalog (nullable)
chemical_product_id uuid FK chemical_products (nullable)
-- Free-text fallback (used when item isn't in either catalog)
item_name text NOT NULL
category text  -- 'chemical' | 'part' | 'tool' | 'equipment' | 'other'
-- Quantities
quantity numeric(10,3) NOT NULL DEFAULT 0
unit text NOT NULL  -- 'gallons' | 'lbs' | 'each' | 'case' | 'oz' | 'floz'
min_threshold numeric(10,3) NOT NULL DEFAULT 0
-- Status
on_truck boolean NOT NULL DEFAULT true
-- Barcode shortcut
barcode text  -- denormalized from barcode_catalog_links for fast scan lookup
-- Reorder alert control
reorder_alert_sent_at timestamptz  -- NULL = not yet sent; set when first alert fires
created_at timestamptz NOT NULL DEFAULT now()
updated_at timestamptz NOT NULL DEFAULT now()
```

#### `truck_inventory_log`
```
id uuid PK
org_id uuid FK orgs
truck_inventory_item_id uuid FK truck_inventory
tech_id uuid FK profiles (who performed the action)
-- Change details
change_type text NOT NULL  -- 'auto_decrement' | 'manual_use' | 'loaded' | 'damaged' | 'transfer_out' | 'transfer_in' | 'adjustment'
quantity_before numeric(10,3) NOT NULL
quantity_change numeric(10,3) NOT NULL  -- negative = decrement, positive = increment
quantity_after numeric(10,3) NOT NULL
-- Source reference (polymorphic)
source_type text  -- 'service_visit' | 'work_order' | 'transfer' | 'manual'
source_id uuid
-- Transfer details (when change_type = 'transfer_out' | 'transfer_in')
transfer_to_tech_id uuid FK profiles (nullable)
transfer_from_tech_id uuid FK profiles (nullable)
transfer_confirmed_at timestamptz  -- NULL = pending confirmation
notes text
created_at timestamptz NOT NULL DEFAULT now()
```

#### `truck_load_templates`
```
id uuid PK
org_id uuid FK orgs
name text NOT NULL  -- e.g. "Standard Residential Route", "Commercial Heavy"
target_role text  -- 'tech' | null (null = all roles)
is_active boolean NOT NULL DEFAULT true
created_at timestamptz NOT NULL DEFAULT now()
```

#### `truck_load_template_items`
```
id uuid PK
org_id uuid FK orgs
template_id uuid FK truck_load_templates
catalog_item_id uuid FK parts_catalog (nullable)
chemical_product_id uuid FK chemical_products (nullable)
item_name text NOT NULL
category text NOT NULL
default_quantity numeric(10,3) NOT NULL
unit text NOT NULL
min_threshold numeric(10,3) NOT NULL DEFAULT 0
sort_order integer NOT NULL DEFAULT 0
created_at timestamptz NOT NULL DEFAULT now()
```

#### `barcode_catalog_links`
```
id uuid PK
org_id uuid FK orgs
barcode text NOT NULL  -- UPC / EAN / QR content string
-- Resolved item (one of catalog_item_id or chemical_product_id)
catalog_item_id uuid FK parts_catalog (nullable)
chemical_product_id uuid FK chemical_products (nullable)
item_name text NOT NULL  -- denormalized for offline use
-- UPC lookup result cache
upc_lookup_ran_at timestamptz  -- when the lookup was attempted
upc_lookup_succeeded boolean  -- whether the API returned a result
created_by_id uuid FK profiles  -- tech who first scanned this barcode
created_at timestamptz NOT NULL DEFAULT now()
UNIQUE(org_id, barcode)
```

#### `shopping_list_items`
```
id uuid PK
org_id uuid FK orgs
-- Ownership: tech list OR shared org list (NULL tech_id = shared)
tech_id uuid FK profiles (nullable)
-- Item identity
catalog_item_id uuid FK parts_catalog (nullable)
chemical_product_id uuid FK chemical_products (nullable)
item_name text NOT NULL
category text NOT NULL
quantity_needed numeric(10,3) NOT NULL
unit text NOT NULL
-- Source (how this item appeared on the list)
source_type text  -- 'manual' | 'work_order' | 'project' | 'low_inventory' | 'forecast'
source_work_order_id uuid FK work_orders (nullable)
source_project_id uuid (nullable — no FK to avoid circular; project_id as plain uuid)
source_inventory_item_id uuid FK truck_inventory (nullable)
-- Status lifecycle
status text NOT NULL DEFAULT 'needed'
-- 'needed' | 'ordered' | 'received' | 'loaded' | 'used'
-- Timestamps for each transition
ordered_at timestamptz
ordered_by_id uuid FK profiles
vendor text  -- supplier name
po_reference text  -- PO number or notes
received_at timestamptz
received_by_id uuid FK profiles
loaded_at timestamptz
loaded_by_id uuid FK profiles
used_at timestamptz
used_by_id uuid FK profiles
-- Urgency
is_urgent boolean NOT NULL DEFAULT false
urgent_reason text  -- e.g. "Needed for tomorrow's route"
notes text
created_at timestamptz NOT NULL DEFAULT now()
updated_at timestamptz NOT NULL DEFAULT now()
```

#### `purchase_orders`
```
id uuid PK
org_id uuid FK orgs
po_number text  -- e.g. "PO-0001" (sequential per org)
supplier_name text NOT NULL
supplier_contact text
supplier_email text
-- Mode: 'formal' = PDF/email PO; 'checklist' = mark as ordered with notes
mode text NOT NULL DEFAULT 'checklist'
-- Status
status text NOT NULL DEFAULT 'draft'
-- 'draft' | 'sent' | 'partial' | 'complete' | 'cancelled'
total_amount numeric(12,2) NOT NULL DEFAULT 0
notes text
sent_at timestamptz
created_by_id uuid FK profiles
created_at timestamptz NOT NULL DEFAULT now()
updated_at timestamptz NOT NULL DEFAULT now()
```

#### `po_line_items`
```
id uuid PK
org_id uuid FK orgs
po_id uuid FK purchase_orders
shopping_list_item_id uuid FK shopping_list_items (nullable)
item_name text NOT NULL
quantity numeric(10,3) NOT NULL DEFAULT 1
unit text NOT NULL DEFAULT 'each'
unit_price numeric(12,2) NOT NULL DEFAULT 0
total numeric(12,2) NOT NULL DEFAULT 0
created_at timestamptz NOT NULL DEFAULT now()
```

### Schema Index (new entry in schema/index.ts)
```typescript
// Phase 13 tables
export * from "./truck-inventory"
export * from "./shopping-lists"
export * from "./barcode-catalog"
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Barcode/QR camera parsing | Custom camera loop with BarcodeDetector | `react-zxing` | BarcodeDetector has no iOS Safari support; ZXing handles all formats cross-platform |
| UPC product data | Scrape UPC sites | UPCitemdb REST API | Free tier (100/day) is enough for "scan once, remember forever"; their database has 100M+ items |
| Spending trend charts | Custom SVG charts | `recharts` (already installed) | Already in the project and used in reporting page |
| PO PDF generation | Custom HTML-to-PDF | `@react-pdf/renderer` (already installed) | Same library used for invoice/quote PDFs |
| Push notifications | Custom push | Existing `notifyUser`/`notifyOrgRole` dispatch | Already handles preferences, push subscriptions, in-app notifications |
| Sequential PO numbers | Manual counter | PostgreSQL `next_po_number integer` in `org_settings` | Same pattern as `next_invoice_number` already in org_settings |
| Optimistic UI state | React useState | Dexie + useLiveQuery | Per MEMORY.md: Dexie-derived state survives re-renders; React state set alongside async Dexie writes gets lost |

---

## Common Pitfalls

### Pitfall 1: Blocking Stop Completion on Inventory Decrement
**What goes wrong:** If `decrementTruckInventoryFromDosing` throws and is awaited without try/catch, the entire `completeStop` action fails — the tech's work data is lost.
**Why it happens:** Inventory is a non-critical side-effect of stop completion, not the primary purpose.
**How to avoid:** Always wrap inventory decrement in a non-fatal try/catch after the visit upsert. Log errors, never rethrow.
**Warning signs:** Any `await` to inventory code inside the main stop completion block without error isolation.

### Pitfall 2: Wrong Unit Matching for Dosing Decrement
**What goes wrong:** `dosing_amounts` stores amounts in `floz` or `lbs` (from the chemistry dosing engine). Truck inventory may store in `gallons` or `oz`. Unit mismatch causes wrong decrement.
**Why it happens:** `chemical_products.unit` is "floz" | "lbs" (dosing engine units), but trucks load in gallons. The dosing amounts inherit the product unit.
**How to avoid:** Implement a unit conversion table. When auto-decrementing, check `truck_inventory.unit` vs `dosing_amounts[].unit` and convert (128 floz = 1 gallon, 16 oz = 1 lb).
**Warning signs:** Truck inventory showing 1 gallon drop when 128 fl oz was used — or 0.0625 gallon drop when 8 fl oz was used.

### Pitfall 3: Dexie Immutable Versioning
**What goes wrong:** Modifying an existing Dexie version block (v1-v4) breaks existing users' offline databases.
**Why it happens:** Dexie's IndexedDB versioning is immutable once published.
**How to avoid:** Always add a new version block (v5) carrying forward ALL previous store definitions unchanged.
**Warning signs:** Existing offline data disappears after a deploy.

### Pitfall 4: drizzle-kit push Wiping RLS Policies
**What goes wrong:** Running `drizzle-kit push` for new schema wipes ALL existing RLS policy conditions (294 policies wiped in 2026-03-17 incident).
**Why it happens:** drizzle-kit push replaces the entire schema; RLS policy `USING`/`WITH CHECK` conditions become NULL.
**How to avoid:** ONLY run `drizzle-kit generate` to get migration SQL, then manually apply only the new table DDL. Verify with: `SELECT count(*) FROM pg_policies WHERE qual IS NULL AND with_check IS NULL;` — must return 0.

### Pitfall 5: Correlated Subqueries in withRls Transactions
**What goes wrong:** Fleet-wide aggregation queries (all techs' low inventory, total spend) using correlated subqueries inside `withRls` cause RLS policy evaluation on each row, making them extremely slow or failing entirely.
**Why it happens:** Per MEMORY.md: correlated SQL subqueries on RLS-protected tables inside `withRls` are forbidden.
**How to avoid:** Use LEFT JOIN + GROUP BY for all aggregation. Purchasing dashboard queries should JOIN truck_inventory to profiles, not subquery per-tech.

### Pitfall 6: BarcodeDetector Web API on iOS
**What goes wrong:** Code using `window.BarcodeDetector` throws `ReferenceError` or silently fails on iOS Safari.
**Why it happens:** BarcodeDetector API is only implemented in Chromium-based browsers as of 2025.
**How to avoid:** Never use `window.BarcodeDetector`. Always use `react-zxing` which uses WebRTC camera access + ZXing WASM for cross-platform support.

### Pitfall 7: Shopping List Scope Confusion
**What goes wrong:** Tech-specific shopping list items leak into other techs' views, or shared items don't aggregate correctly on the purchasing dashboard.
**Why it happens:** `shopping_list_items.tech_id` is nullable (NULL = shared org list). Queries that don't filter properly show all items to all users.
**How to avoid:** Field-facing queries filter `WHERE tech_id = current_user_id OR tech_id IS NULL`. Purchasing dashboard shows all items regardless of tech_id.

### Pitfall 8: Decimal Input for Quantity Adjustments
**What goes wrong:** `parseFloat("2.")` returns `2`, eating the decimal point when tech types "2.5 gallons."
**Why it happens:** Per MEMORY.md: direct parseFloat on input change destroys in-progress decimal entry.
**How to avoid:** Use local `useState<string>` for all quantity inputs. Only parse on blur or on "." check (`!value.endsWith(".")`).

---

## Code Examples

### Barcode Scanner Component (react-zxing)
```typescript
// Source: react-zxing docs + Next.js dynamic import pattern
// src/components/field/barcode-scanner.tsx
"use client"
import { useZxing } from "react-zxing"

interface BarcodeScannerProps {
  onScan: (barcode: string) => void
  onError?: (err: Error) => void
}

export function BarcodeScanner({ onScan, onError }: BarcodeScannerProps) {
  const { ref } = useZxing({
    onDecodeResult(result) {
      onScan(result.getText())
    },
    onError,
  })

  return (
    <video
      ref={ref}
      className="w-full rounded-xl"
      style={{ maxHeight: "280px", objectFit: "cover" }}
    />
  )
}
```

Import via `next/dynamic` with `ssr: false` (camera API is browser-only):
```typescript
const BarcodeScanner = dynamic(
  () => import("@/components/field/barcode-scanner").then(m => m.BarcodeScanner),
  { ssr: false }
)
```

### UPC Lookup (server action)
```typescript
// src/actions/barcode.ts
export async function lookupBarcode(barcode: string): Promise<{
  name: string | null
  category: string | null
  found: boolean
}> {
  try {
    const res = await fetch(
      `https://api.upcitemdb.com/prod/trial/lookup?upc=${barcode}`,
      { next: { revalidate: 86400 } }  // Cache for 24h — same barcode won't be re-fetched
    )
    if (!res.ok) return { name: null, category: null, found: false }
    const data = await res.json()
    const item = data.items?.[0]
    if (!item) return { name: null, category: null, found: false }
    return { name: item.title ?? null, category: item.category ?? null, found: true }
  } catch {
    return { name: null, category: null, found: false }
  }
}
```

### Auto-Decrement Action Pattern
```typescript
// src/actions/truck-inventory.ts
export async function decrementTruckInventoryFromDosing(
  techId: string,
  orgId: string,
  dosingAmounts: Array<{ chemical: string; productId: string; amount: number; unit: string }>,
  token: SupabaseToken
): Promise<void> {
  // 1. Load tech's truck inventory items linked to these product IDs
  const productIds = dosingAmounts.map(d => d.productId)
  const items = await withRls(token, db =>
    db.select().from(truckInventory)
      .where(and(
        eq(truckInventory.org_id, orgId),
        eq(truckInventory.tech_id, techId),
        inArray(truckInventory.chemical_product_id, productIds)
      ))
  )
  // 2. For each match, convert units + decrement
  for (const dose of dosingAmounts) {
    const item = items.find(i => i.chemical_product_id === dose.productId)
    if (!item) continue
    const deductAmount = convertUnits(dose.amount, dose.unit, item.unit)
    const newQty = Math.max(0, parseFloat(item.quantity as string) - deductAmount)
    await withRls(token, db =>
      db.update(truckInventory)
        .set({ quantity: String(newQty), updated_at: new Date() })
        .where(eq(truckInventory.id, item.id))
    )
    // 3. Check threshold + fire alert if needed
    if (newQty <= parseFloat(item.min_threshold as string) && !item.reorder_alert_sent_at) {
      await fireReorderAlert(item, techId, orgId, newQty)
    }
  }
}
```

### Reorder Alert Pattern (uses existing alert infrastructure)
```typescript
// Extend existing alerts.ts pattern — new alert_type 'low_inventory'
await adminDb.insert(alerts).values({
  org_id: orgId,
  alert_type: "low_inventory",
  severity: "warning",
  reference_id: item.id,
  reference_type: "truck_inventory",
  title: `Low inventory: ${item.item_name} (${newQty} ${item.unit} remaining)`,
  description: `Tech ${techName}'s truck is low on ${item.item_name}. Threshold: ${item.min_threshold} ${item.unit}`,
  metadata: { techId, itemId: item.id, currentQty: newQty, threshold: item.min_threshold },
})
// Push to tech
await notifyUser(techId, orgId, {
  type: "low_inventory",
  title: `Low: ${item.item_name}`,
  body: `${newQty} ${item.unit} remaining on your truck`,
})
// Push to office roles
await notifyOrgRole(orgId, "owner+office", {
  type: "low_inventory",
  title: `Tech low on ${item.item_name}`,
  body: `${techName} has ${newQty} ${item.unit} remaining`,
})
```

### RoutesTabsClient Extended for "Prep" Tab
```typescript
// Extended tab state — 3 tabs
const [activeTab, setActiveTab] = useState<"routes" | "projects" | "prep">("routes")
// Tab bar changes from 50/50 to 33/33/33 flex layout
// Prep tab content rendered conditionally with <PrepTab data={prepData} />
```

### QBO Item Mapper (new addition to mappers.ts)
```typescript
// To be added to src/lib/qbo/mappers.ts
export interface PoolCoCatalogItem {
  id: string
  name: string
  sku: string | null
  default_cost_price: string | null
  default_sell_price: string | null
  is_labor: boolean
  qbo_item_id: string | null
}

export function mapCatalogItemToQboItem(item: PoolCoCatalogItem): Record<string, any> {
  return {
    Name: item.name,
    Type: item.is_labor ? "Service" : "NonInventory",
    Sku: item.sku ?? undefined,
    UnitPrice: parseFloat(item.default_sell_price ?? "0"),
    PurchaseCost: parseFloat(item.default_cost_price ?? "0"),
    IncomeAccountRef: { value: "1", name: "Services" },  // org must configure
  }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| BarcodeDetector Web API | react-zxing (ZXing WASM) | BarcodeDetector still not in iOS Safari as of 2025 | Must use react-zxing for cross-platform support |
| html5-qrcode | react-zxing | html5-qrcode unmaintained | react-zxing is the maintained ZXing wrapper |
| QBO free unlimited API | Intuit tiered pricing model | 2025 | CorePlus (read) calls are now metered; for item catalog sync, reads should be batched/webhooks preferred |

**Deprecated/outdated:**
- `html5-qrcode`: Last maintained release was 2022. Do not use.
- `BarcodeDetector` for this project: Not viable until iOS Safari ships it.

---

## Key Integration Points

### 1. Stop Completion → Auto-Decrement (INV-04)
**Touch point:** `src/actions/visits.ts` around line 710 (after visit upsert)
**What to add:** Non-fatal call to `decrementTruckInventoryFromDosing()`
**Data flow:** `completeStop` input has `dosingAmounts` → match to `truck_inventory.chemical_product_id` → decrement qty + check threshold

### 2. RoutesTabsClient → "Prep" Tab (INV-12)
**Touch point:** `src/components/field/routes-tabs-client.tsx` (full rewrite of tab state + layout)
**Touch point:** `src/app/(app)/routes/page.tsx` (add `getPrepData()` to the parallel Promise.all fetch)
**Data flow:** Server fetches today's WO line items + schedule chemistry estimates + tech's current inventory → passes as prop → PrepTab renders shortage-sorted list

### 3. QBO Webhook → Item Sync (INV-13 / QBO)
**Touch point:** `src/app/api/webhooks/` — add QBO webhook handler for `Item` entity events
**Touch point:** `src/lib/qbo/mappers.ts` — add `mapCatalogItemToQboItem` + `mapQboItemToCatalogItem`
**Touch point:** `src/lib/db/schema/parts-catalog.ts` — add `qbo_item_id` column

### 4. Work Order Line Items → Shopping List (INV-09)
**Touch point:** `src/actions/work-orders.ts` — when a WO is assigned to a tech, auto-create `shopping_list_items` for `item_type = 'part'` line items
**Data flow:** WO assignment → check if parts line items exist → insert shopping_list_items with `source_type='work_order'`, `source_work_order_id`, `tech_id=assigned_tech`

### 5. Supabase Realtime → Office Inventory View (INV-03)
**Pattern:** Channel `inventory:${orgId}` — broadcast on any truck inventory update so the office purchasing dashboard refreshes without polling.
**Implementation:** Same pattern as `dispatch:${orgId}` channel in dispatch/page.tsx

### 6. PAGE_TITLES Map (Critical)
**Touch point:** `src/components/shell/app-header.tsx` line 23
**What to add:** `"/inventory": "Inventory"` to the PAGE_TITLES object

---

## Open Questions

1. **Transfer confirmation flow**
   - What we know: CONTEXT.md says "peer-to-peer confirmation vs one-sided with office reconciliation — Claude's discretion"
   - What's unclear: Does the receiving tech need to actively confirm, or does the sending tech mark it and the system reconciles later?
   - Recommendation: Use one-sided transfer with office reconciliation — simpler for field use. Tech A marks "transferred 2 gallons to Tech B," creates a `transfer_pending` log. Tech B sees a notification "Tech A transferred 2 gallons to you — confirm?" next time they open inventory. Office can see unconfirmed transfers and manually reconcile.

2. **Shopping list scope: per-tech vs shared**
   - What we know: CONTEXT.md says "per-tech vs shared vs both — pick based on what works best operationally"
   - Recommendation: Support both. Shopping list items have a nullable `tech_id`. Items sourced from WO assignments are per-tech (tech_id set). Items sourced from office/purchasing are shared (tech_id NULL). The purchasing dashboard shows all items. The tech's field view shows their items + shared items.

3. **Chemical prediction algorithm for "What to Bring"**
   - What we know: The existing dosing engine (`src/lib/chemistry/dosing.ts`) calculates exact amounts given readings. For prediction, we don't have readings yet — we use pool size + historical average.
   - Recommendation: For each pool on tomorrow's route, average the last 8 visits' `dosing_amounts` per chemical. This is a pure aggregation query on `service_visits`. Show as "estimated" with a different visual treatment from confirmed WO requirements.

4. **PO number sequencing**
   - What we know: `org_settings` already has `next_invoice_number` and `next_quote_number` patterns.
   - Recommendation: Add `next_po_number integer DEFAULT 1` and `po_number_prefix text DEFAULT 'PO'` to `org_settings` to match the existing pattern. Increment in the same transaction as PO insert.

5. **QBO Item type mapping for chemicals**
   - What we know: Pool chemicals aren't typically in QBO as "Inventory" items (QBO Inventory tracks COGS). They're usually "NonInventory" since pool companies buy-and-use rather than resell as a standalone item.
   - What's unclear: Does the owner want QBO Inventory-type items (with quantity tracking in QBO) or NonInventory?
   - Recommendation: Default to `NonInventory` with `PurchaseCost` filled. Let the owner override per item. Don't try to sync QBO inventory quantities — that would create a dual-tracking nightmare. DeweyIQ is the source of truth for truck quantities; QBO tracks spend/COGS.

---

## Sources

### Primary (HIGH confidence)
- Codebase audit (2026-03-23) — schema files, actions, components examined directly
  - `src/lib/db/schema/parts-catalog.ts` — parts catalog schema
  - `src/lib/db/schema/chemical-products.ts` — chemical products schema
  - `src/lib/db/schema/service-visits.ts` — dosing_amounts JSONB field
  - `src/lib/db/schema/project-materials.ts` — procurement lifecycle pattern to mirror
  - `src/lib/db/schema/alerts.ts` — alert table structure
  - `src/lib/offline/db.ts` — Dexie versioning (currently v4)
  - `src/components/field/stop-workflow.tsx` — dosingAmounts ref + completeStop integration point
  - `src/components/field/routes-tabs-client.tsx` — current tab structure
  - `src/lib/qbo/client.ts`, `src/lib/qbo/mappers.ts` — QBO integration patterns
  - `src/components/shell/app-header.tsx` — PAGE_TITLES map
  - `package.json` — confirmed react-zxing NOT yet installed; recharts + @react-pdf/renderer already present

### Secondary (MEDIUM confidence)
- [BarcodeDetector API — Can I Use](https://caniuse.com/mdn-api_barcodedetector) — confirmed no iOS Safari support as of 2025
- [react-zxing npm / GitHub](https://github.com/mebjas/html5-qrcode) — confirmed actively maintained, React wrapper for ZXing
- [UPCitemdb API](https://devs.upcitemdb.com/) — free tier 100 req/day; confirmed REST API for UPC lookup
- [node-quickbooks GitHub](https://github.com/mcohen01/node-quickbooks) — confirmed createItem/updateItem/findItems methods exist
- [Intuit QBO Item API Reference](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/item) — Item entity fields confirmed

### Tertiary (LOW confidence — needs validation)
- QBO 2025 tiered pricing model (CorePlus read calls metered) — WebSearch result, not verified against Intuit's current pricing page. Validate before building heavy read-polling QBO sync.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries verified against package.json and existing codebase
- Architecture: HIGH — schema patterns copied from existing code, integration points precisely located
- Auto-decrement hook: HIGH — exact line numbers located in visits.ts
- Barcode scanning: MEDIUM — react-zxing recommended based on current ecosystem state; library not yet validated in this specific Next.js 16 + Turbopack combination
- QBO item sync: MEDIUM — node-quickbooks methods confirmed to exist but specific Item entity field mapping needs validation against live QBO sandbox
- Chemical usage predictions: MEDIUM — algorithm is straightforward aggregation but column types need verification at implementation time

**Research date:** 2026-03-23
**Valid until:** 2026-04-23 (stable stack; barcode library check closer to implementation)
