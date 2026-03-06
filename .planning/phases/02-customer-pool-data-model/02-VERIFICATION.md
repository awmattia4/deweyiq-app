---
phase: 02-customer-pool-data-model
verified: 2026-03-06T00:00:00Z
status: gaps_found
score: 18/19 must-haves verified
re_verification: false
gaps:
  - truth: "Office staff can filter by Assigned Tech via dropdown filters above the table"
    status: partial
    reason: "The Assigned Tech dropdown renders in the UI and is populated from the techs prop, but selecting a tech value performs no filtering. The handleTechFilter function only clears globalFilter on '__all__' and has no logic for non-all values. The customer row type (CustomerRow) does not include assigned_tech_name, so filtering is structurally impossible with current data. The tech filter dropdown is a visual stub."
    artifacts:
      - path: "src/components/customers/customer-table.tsx"
        issue: "handleTechFilter function is empty for non-'__all__' values (lines 97-107). Comment in code explicitly acknowledges: 'Tech filter is limited without the tech name in the row.'"
      - path: "src/components/customers/customer-columns.tsx"
        issue: "CustomerRow type does not include assigned_tech_name or assigned_tech_id, making column-level filtering on tech impossible"
    missing:
      - "Add assigned_tech_name (or assigned_tech_id) to CustomerRow type and the server-side query in customers/page.tsx"
      - "Implement handleTechFilter logic to call table.getColumn('assigned_tech_id')?.setFilterValue(value) or filter via global filter on tech name"
human_verification:
  - test: "Visual UI review of customer list, customer profile, pool/equipment forms, service history timeline"
    expected: "All UI elements render correctly with proper dark-theme styling, correct badges/colors, responsive layout, and accessible form interactions"
    why_human: "Cannot verify visual correctness, color contrast, responsive behavior, or accessibility via static code analysis"
  - test: "End-to-end RLS enforcement: sign in as a tech role user and navigate to /customers"
    expected: "Tech is redirected to /routes and cannot access any customer data"
    why_human: "RLS policy correctness requires a live Supabase session with correct JWT claims to verify; static analysis cannot confirm policies enforced correctly after the drizzle-kit push null-condition bug was fixed"
  - test: "Create a customer, add 2 pools (one Pool, one Spa), add equipment to each — verify pool count on list page updates correctly"
    expected: "Pool count on /customers list shows 2 after adding pools; equipment appears under correct pool on Equipment tab"
    why_human: "Data persistence, revalidation, and LEFT JOIN pool count accuracy require live browser session"
---

# Phase 2: Customer & Pool Data Model Verification Report

**Phase Goal:** Office staff can create and manage the full customer record — contact info, pool profiles, equipment, and access notes — which becomes the shared data backbone for every downstream phase
**Verified:** 2026-03-06
**Status:** gaps_found
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | customers, pools, equipment, service_visits tables exist with correct columns and RLS | VERIFIED | `0001_even_yellow_claw.sql` contains CREATE TYPE x4, CREATE TABLE x4, ENABLE ROW LEVEL SECURITY x4; schema files match spec exactly |
| 2 | All four pgEnums exist and are usable | VERIFIED | `customer_status`, `pool_type`, `pool_surface`, `sanitizer_type` defined in schema files and migration SQL |
| 3 | Drizzle relational query graph works (customers -> pools -> equipment) | VERIFIED | `relations.ts` exports all four `xyzRelations`; barrel re-exports `./relations`; page.tsx uses `tx.query.customers.findFirst({ with: { pools: { with: { equipment: true } } } })` |
| 4 | TanStack Table, react-hook-form, zod, and shadcn Tabs/Table/Form installed | VERIFIED | `package.json` shows all four deps; `src/components/ui/tabs.tsx`, `table.tsx`, `form.tsx` all exist |
| 5 | Office staff can see a sortable, filterable data table with 6 required columns | VERIFIED | `customer-columns.tsx` defines 6 ColumnDef entries (full_name, address, phone, route_name, status, pool_count) all with `enableSorting: true` |
| 6 | Office staff can type in a search box and the table filters instantly | VERIFIED | `customer-table.tsx` uses `globalFilter` state wired to `onGlobalFilterChange` and an `Input` component that updates it `onChange` — no submit button |
| 7 | Office staff can filter by Route and Status via dropdown filters | VERIFIED | Route filter calls `table.getColumn("route_name")?.setFilterValue(value)`; Status filter calls `table.getColumn("status")?.setFilterValue(value)` — both functional |
| 8 | Office staff can filter by Assigned Tech via dropdown filter | FAILED | Tech dropdown renders and is populated from props, but `handleTechFilter` function is empty for non-"__all__" values — no actual filtering occurs |
| 9 | Office staff can create a new customer with all required fields | VERIFIED | `add-customer-dialog.tsx` has all CUST-01 fields (full_name, address, phone, email, gate_code, access_notes, status, route_name); calls `createCustomer` server action |
| 10 | Customers link in sidebar visible for owner and office roles, hidden from tech | VERIFIED | `app-sidebar.tsx` NAV_ITEMS has Customers with `roles: ["owner", "office"]`; TECH_NAV_ITEMS does not include it |
| 11 | Clicking a customer row navigates to /customers/[id] | VERIFIED | `handleRowClick` calls `router.push('/customers/${customerId}')` on `TableRow onClick` |
| 12 | Customer profile at /customers/[id] shows always-visible header with 4 tabs | VERIFIED | `page.tsx` renders `<CustomerHeader>` above `<Tabs>` with TabsTrigger for overview, pools, equipment, history |
| 13 | Inline edit on Overview tab works with Save/Cancel | VERIFIED | `customer-inline-edit.tsx` has `isEditing` useState toggle; Save calls `updateCustomer`; Cancel resets form to original values |
| 14 | Add Pool modal supports Pool/Spa/Fountain types with all fields | VERIFIED | `add-pool-dialog.tsx` has type Select (pool/spa/fountain), name, volume, surface_type, sanitizer_type, notes with three visual sections |
| 15 | Multiple bodies of water per customer supported | VERIFIED | Schema has `pool_type` enum with pool/spa/fountain; pool-list.tsx renders distinct type badges per pool; no single-pool constraint |
| 16 | Equipment tracked per pool with Add Equipment modal | VERIFIED | `equipment-list.tsx` groups by pool; `add-equipment-dialog.tsx` accepts type (datalist), brand, model, install_date, notes; calls `addEquipment` server action |
| 17 | History tab shows vertical timeline with filter chips and empty state | VERIFIED | `service-history-timeline.tsx` has vertical left-side timeline line, date section headers, FilterChips component (All/Routine/Repair/One-off), empty state with ClipboardList icon |
| 18 | Chemistry readings area and photo strip area exist ready for Phase 3 data | VERIFIED | Timeline card has inline chemistry readings row (pH/Cl/Alk with "--" placeholders) and a comment-marked photo strip area |
| 19 | ServiceHistoryTimeline is wired into /customers/[id] page replacing the placeholder | VERIFIED | `page.tsx` imports `ServiceHistoryTimeline` from `@/components/customers/service-history-timeline` and renders it in the History TabsContent with `allVisits` prop |

**Score: 18/19 truths verified**

---

## Required Artifacts

### Plan 02-01 Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `src/lib/db/schema/customers.ts` | VERIFIED | Contains `pgTable("customers"...)`, `customerStatusEnum`, RLS policies x4, FK to orgs.id |
| `src/lib/db/schema/pools.ts` | VERIFIED | Contains `pgTable("pools"...)`, poolTypeEnum, poolSurfaceEnum, sanitizerTypeEnum, FK to customers.id |
| `src/lib/db/schema/equipment.ts` | VERIFIED | Contains `pgTable("equipment"...)`, open-ended text type, FK to pools.id |
| `src/lib/db/schema/service-visits.ts` | VERIFIED | Contains `pgTable("service_visits"...)`, stub with RLS (tech write allowed) |
| `src/lib/db/schema/index.ts` | VERIFIED | Exports `./customers`, `./pools`, `./equipment`, `./service-visits`, `./relations` |
| `src/lib/db/schema/relations.ts` | VERIFIED (deviation) | Plan specified relations in each schema file; Claude moved all to dedicated `relations.ts` to avoid circular ESM imports — correct decision |

### Plan 02-02 Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `src/app/(app)/customers/page.tsx` | VERIFIED | Server component with `withRls` LEFT JOIN pool count query, fetches techs and distinct routes |
| `src/components/customers/customer-table.tsx` | VERIFIED | Uses `useReactTable` with getCoreRowModel/getSortedRowModel/getFilteredRowModel |
| `src/components/customers/customer-columns.tsx` | VERIFIED | 6 ColumnDef entries, exports `CustomerRow` type |
| `src/components/customers/add-customer-dialog.tsx` | VERIFIED | Dialog with all CUST-01 fields, calls `createCustomer` |
| `src/actions/customers.ts` | VERIFIED | Exports `createCustomer`, `updateCustomer`, `deleteCustomer` with withRls + role checks |
| `src/components/shell/app-sidebar.tsx` | VERIFIED | Customers nav item with ContactIcon, `roles: ["owner", "office"]` |

### Plan 02-03 Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `src/app/(app)/customers/[id]/page.tsx` | VERIFIED | Uses `withRls` relational `findFirst` with pools/equipment/serviceVisits |
| `src/components/customers/customer-header.tsx` | VERIFIED | Contains `Badge` component, displays name/address/phone/status/route/tech |
| `src/components/customers/customer-inline-edit.tsx` | VERIFIED | Contains `isEditing` useState, calls `updateCustomer` on Save |
| `src/components/customers/pool-list.tsx` | VERIFIED | Contains "Add Pool" button, renders pool cards with type badges |
| `src/components/customers/add-pool-dialog.tsx` | VERIFIED | Contains pool type select (pool/spa/fountain), three visual sections |
| `src/components/customers/equipment-list.tsx` | VERIFIED | Compact equipment list grouped by pool, "Add" button per pool section |
| `src/components/customers/add-equipment-dialog.tsx` | VERIFIED | Dialog with type datalist, brand, model, install_date, notes |
| `src/actions/pools.ts` | VERIFIED | Exports `addPool`, `updatePool`, `deletePool` with withRls |
| `src/actions/equipment.ts` | VERIFIED | Exports `addEquipment`, `updateEquipment`, `deleteEquipment` with withRls |

### Plan 02-04 Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `src/components/customers/service-history-timeline.tsx` | VERIFIED | Contains "timeline" layout, filter chips, date markers, chemistry area, photo strip comment |

---

## Key Link Verification

### Plan 02-01 Key Links

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `customers.ts` | `orgs.ts` | org_id FK reference | VERIFIED | `.references(() => orgs.id, { onDelete: "cascade" })` on line 26-28 |
| `pools.ts` | `customers.ts` | customer_id FK reference | VERIFIED | `.references(() => customers.id, { onDelete: "cascade" })` on line 44-46 |
| `equipment.ts` | `pools.ts` | pool_id FK reference | VERIFIED | `.references(() => pools.id, { onDelete: "cascade" })` on line 23-25 |
| `schema/index.ts` | all schema files | barrel re-export | VERIFIED | `export * from "./customers"`, `"./pools"`, `"./equipment"`, `"./service-visits"`, `"./relations"` |

### Plan 02-02 Key Links

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `customers/page.tsx` | `src/lib/db` | withRls query with pool count | VERIFIED | `withRls(token, (db) => db.select(...).from(customers).leftJoin(pools...).groupBy(...)` |
| `customer-table.tsx` | `customer-columns.tsx` | columns import | VERIFIED | `import { customerColumns } from "./customer-columns"` and passed to `useReactTable` |
| `add-customer-dialog.tsx` | `src/actions/customers.ts` | createCustomer call | VERIFIED | `import { createCustomer } from "@/actions/customers"` and `await createCustomer({...})` in startTransition |
| `customer-table.tsx` | `/customers/[id]` | row click navigation | VERIFIED | `router.push('/customers/${customerId}')` in `handleRowClick` |

### Plan 02-03 Key Links

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `customers/[id]/page.tsx` | `src/lib/db` | withRls relational query | VERIFIED | `withRls(token, (tx) => tx.query.customers.findFirst({ with: { pools: { with: { equipment: true, serviceVisits: true } } } }))` |
| `customer-inline-edit.tsx` | `src/actions/customers.ts` | updateCustomer call | VERIFIED | `import { updateCustomer } from "@/actions/customers"` and `await updateCustomer({...})` |
| `add-pool-dialog.tsx` | `src/actions/pools.ts` | addPool call | VERIFIED | `import { addPool } from "@/actions/pools"` and `await addPool({...})` |
| `add-equipment-dialog.tsx` | `src/actions/equipment.ts` | addEquipment call | VERIFIED | `import { addEquipment } from "@/actions/equipment"` and `await addEquipment({...})` |

### Plan 02-04 Key Links

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `service-history-timeline.tsx` | `service-visits.ts` | ServiceVisit type | VERIFIED | ServiceVisit type in component matches serviceVisits schema fields (id, visit_type, visited_at, notes, pool, tech) |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| CUST-01 | 02-01, 02-02 | Office can create customer profiles (name, address, phone, email, gate codes, access notes) | SATISFIED | `add-customer-dialog.tsx` has all 6 fields; `createCustomer` server action inserts all fields |
| CUST-02 | 02-01, 02-03 | Office can add pool profiles per customer (volume, surface type, sanitizer type, special notes) | SATISFIED | `add-pool-dialog.tsx` has volume, surface_type, sanitizer_type, notes; `addPool` server action persists all |
| CUST-03 | 02-01, 02-03 | System supports multiple bodies of water (pool, spa, fountain) with distinct configs | SATISFIED | `pool_type` enum with pool/spa/fountain; pool-list.tsx shows distinct type badges; no single-pool constraint in schema |
| CUST-04 | 02-01, 02-03 | Office can track equipment per pool (brand, model, install date) | SATISFIED | `add-equipment-dialog.tsx` has type, brand, model, install_date; equipment linked to pools via pool_id FK |
| CUST-05 | 02-02 | Office can search and filter customers by name, address, route, or status | PARTIAL | Global search (name/address/phone) and Route/Status dropdown filters work correctly. Assigned Tech filter is a non-functional stub — see gap below |
| CUST-06 | 02-01, 02-04 | System stores complete service history per customer accessible from their profile | SATISFIED | `service_visits` table exists with RLS; `service-history-timeline.tsx` renders on History tab with empty state and filter chips; Phase 3 adds actual visit data |

---

## Anti-Patterns Found

| File | Lines | Pattern | Severity | Impact |
|------|-------|---------|----------|--------|
| `src/components/customers/customer-table.tsx` | 97-107 | `handleTechFilter` function body is empty for non-"__all__" values. The function only calls `setGlobalFilter("")` when "All" is selected; all other values do nothing | Blocker | Assigned Tech filter appears functional in the UI but performs no filtering. CUST-05 is partially broken — tech filtering claim is false |

---

## Human Verification Required

### 1. Full UI/UX Review

**Test:** Navigate the complete customer CRM flow in a browser: /customers list, create a customer, use search and Route/Status filters, visit profile, inline edit, add pools (Pool and Spa types), add equipment, view History tab.
**Expected:** UI renders correctly with dark theme, badges have correct colors (active=default, paused=secondary, cancelled=destructive; pool=default, spa=secondary, fountain=outline), forms are responsive and accessible, empty states show correct messaging.
**Why human:** Visual appearance, color contrast, responsive behavior, and accessibility cannot be verified with static code analysis.

### 2. RLS Policy Enforcement

**Test:** Sign in as a tech role user and navigate to /customers directly.
**Expected:** Tech is redirected to /routes. Tech cannot access /customers/[id] or call createCustomer/addPool/addEquipment server actions.
**Why human:** The 02-04 SUMMARY documents that drizzle-kit push created RLS policies with NULL USING/WITH CHECK conditions, which were manually recreated. Cannot verify via static analysis that the recreated policies in the live Supabase instance are correct. Also cannot verify server-side role checks work against a real JWT without a live session.

### 3. Pool Count Accuracy on List Page

**Test:** Add two pools to a customer, then navigate back to /customers.
**Expected:** Pool count column shows 2 for that customer.
**Why human:** The 02-04 SUMMARY documents that the original correlated subquery was returning 0 under RLS and was replaced with a LEFT JOIN + GROUP BY. Cannot verify the fix works in production without a live database session.

---

## Gaps Summary

One gap is blocking a fraction of CUST-05.

The **Assigned Tech filter** (Plan 02-02 truth #3) is non-functional. The dropdown UI renders and is populated with real tech data from the server, but the `handleTechFilter` function in `customer-table.tsx` performs no filtering action when a tech is selected — the function body is effectively empty for non-"__all__" values. The root cause is that `CustomerRow` does not include `assigned_tech_name` or `assigned_tech_id`, so column-level filtering on tech is structurally impossible with the current data shape.

This is explicitly acknowledged in the code comments (lines 103-106) and flagged as deferred to Plan 03. The SUMMARY for 02-02 documented this as a "placeholder for the UX pattern." However, the plan's must-have truth states the filter should work, and the dropdown creates a false UX impression of functionality.

**Impact on phase goal:** The remaining CRM capabilities (create, view, search by name/address/phone/route/status, profile, edit, pools, equipment, history) are all fully functional. The Assigned Tech filter is the only incomplete piece. This is a low-severity gap that does not block Phase 3 from building on top of the Phase 2 backbone.

**Fix scope:** Small — add `assigned_tech_name` to `CustomerRow` type and the server-side SELECT in `customers/page.tsx`, then implement `handleTechFilter` to set a column filter.

---

_Verified: 2026-03-06_
_Verifier: Claude (gsd-verifier)_
