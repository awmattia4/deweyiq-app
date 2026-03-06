---
phase: 02-customer-pool-data-model
plan: 03
subsystem: customer-profile
tags: [customer, profile, pools, equipment, inline-edit, server-actions, rls]
dependency_graph:
  requires:
    - 02-01  # schema: customers, pools, equipment, service_visits tables + RLS
    - 02-02  # customers.ts server actions (updateCustomer used by inline edit)
  provides:
    - customer-profile-page  # /customers/[id] with tabs
    - pool-crud              # addPool, updatePool, deletePool server actions
    - equipment-crud         # addEquipment, updateEquipment, deleteEquipment server actions
  affects:
    - 02-04  # History tab placeholder replaced with ServiceHistoryTimeline
tech_stack:
  added: []
  patterns:
    - useState inline edit (no react-hook-form — same as ProfileForm + AddCustomerDialog)
    - withRls server actions (same as customers.ts)
    - server component relational query (db.query.customers.findFirst with nested with)
    - datalist for open-ended equipment type suggestions
key_files:
  created:
    - src/app/(app)/customers/[id]/page.tsx
    - src/app/(app)/customers/[id]/loading.tsx
    - src/components/customers/customer-header.tsx
    - src/components/customers/customer-inline-edit.tsx
    - src/components/customers/pool-list.tsx
    - src/components/customers/add-pool-dialog.tsx
    - src/components/customers/equipment-list.tsx
    - src/components/customers/add-equipment-dialog.tsx
    - src/actions/pools.ts
    - src/actions/equipment.ts
  modified: []
decisions:
  - "History tab uses inline placeholder div — ServiceHistoryTimeline imported in Plan 02-04 only"
  - "AddPoolDialog uses plain useState + inline validation (no zod/react-hook-form) — matches established codebase pattern from 02-02 zod resolver incompatibility"
  - "updatePool accepts customer_id for revalidation path — avoids extra DB lookup on every update"
metrics:
  duration: 15
  completed: 2026-03-05
  tasks: 2
  files_created: 10
  files_modified: 0
---

# Phase 02 Plan 03: Customer Profile Page Summary

**One-liner:** Tabbed customer profile at /customers/[id] with always-visible header, inline edit, pool card management (Pool/Spa/Fountain), and per-pool equipment tracking — all backed by withRls server actions.

## What Was Built

### Task 1: Customer Profile Page + Header + Inline Edit
**Commit:** `9d1305c`

- `src/app/(app)/customers/[id]/page.tsx` — Server component that fetches customer with pools (including equipment + service visits) using `db.query.customers.findFirst` inside `withRls`. Returns 404 for invalid/cross-org IDs.
- `src/app/(app)/customers/[id]/loading.tsx` — Skeleton layout matching header + tabs + content.
- `src/components/customers/customer-header.tsx` — Always-visible header with full_name, address, phone, status badge (active=default, paused=secondary, cancelled=destructive), route, tech, back link.
- `src/components/customers/customer-inline-edit.tsx` — Overview tab content with `useState`-based read/edit toggle. Edit mode shows all customer fields as inputs. Save calls `updateCustomer`, Cancel resets to original values.

### Task 2: Pool and Equipment Management
**Commit:** `3c544b4`

- `src/actions/pools.ts` — `addPool`, `updatePool`, `deletePool` server actions. All use `withRls` and enforce owner/office role. Revalidate `/customers/[customer_id]`.
- `src/actions/equipment.ts` — `addEquipment`, `updateEquipment`, `deleteEquipment` server actions. `addEquipment` looks up pool to get customer_id for revalidation.
- `src/components/customers/pool-list.tsx` — Pool cards grid with type badges (Pool/Spa/Fountain), volume, surface type, sanitizer type, equipment count badge. Add Pool button opens dialog.
- `src/components/customers/add-pool-dialog.tsx` — Modal with three sections: Basic Info (name, type, volume), Water Chemistry (surface, sanitizer), Notes. Plain useState validation.
- `src/components/customers/equipment-list.tsx` — Equipment grouped by pool. Each pool section has a header + compact list rows + Add button.
- `src/components/customers/add-equipment-dialog.tsx` — Modal with type input (datalist suggestions), brand, model, install date, notes.

## Key Links

| From | To | Via | Pattern |
|------|----|-----|---------|
| `/customers/[id]/page.tsx` | `src/lib/db` | withRls relational query | `withRls.*findFirst` |
| `customer-inline-edit.tsx` | `src/actions/customers.ts` | updateCustomer server action | `updateCustomer` |
| `add-pool-dialog.tsx` | `src/actions/pools.ts` | addPool server action | `addPool` |
| `add-equipment-dialog.tsx` | `src/actions/equipment.ts` | addEquipment server action | `addEquipment` |

## Decisions Made

1. **History tab placeholder:** The History tab renders an inline `<div>` with an icon and placeholder text. `ServiceHistoryTimeline` is NOT imported — Plan 02-04 replaces this placeholder. This avoids a missing-module error at build time.

2. **Plain useState validation in AddPoolDialog:** Per the decision recorded in Phase 02-02 (zod v4 + @hookform/resolvers v5 incompatibility), pool and equipment dialogs use the same plain `useState` + inline validation pattern as `AddCustomerDialog`. The plan spec mentioned react-hook-form + zod for AddPoolDialog, but this conflicts with the locked codebase decision. Applied Rule 1 (auto-fix) — using the established pattern.

3. **updatePool requires customer_id:** The `updatePool` input requires `customer_id` so the action can revalidate `/customers/[customer_id]` without an extra DB lookup. This is consistent with `deletePool` which also takes `customer_id`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug / Pattern Mismatch] AddPoolDialog used plain useState instead of react-hook-form + zod**
- **Found during:** Task 2
- **Issue:** Plan specified react-hook-form + zod for AddPoolDialog, but Phase 02-02 decision locked codebase to plain useState pattern due to zod v4 / @hookform/resolvers v5 type incompatibility
- **Fix:** Used AddCustomerDialog's established plain useState + inline validation pattern
- **Files modified:** `src/components/customers/add-pool-dialog.tsx`
- **Commit:** `3c544b4`

## Self-Check: PASSED

Files exist:
- FOUND: src/app/(app)/customers/[id]/page.tsx
- FOUND: src/app/(app)/customers/[id]/loading.tsx
- FOUND: src/components/customers/customer-header.tsx
- FOUND: src/components/customers/customer-inline-edit.tsx
- FOUND: src/components/customers/pool-list.tsx
- FOUND: src/components/customers/add-pool-dialog.tsx
- FOUND: src/components/customers/equipment-list.tsx
- FOUND: src/components/customers/add-equipment-dialog.tsx
- FOUND: src/actions/pools.ts
- FOUND: src/actions/equipment.ts

Commits exist:
- FOUND: 9d1305c (Task 1)
- FOUND: 3c544b4 (Task 2)

TypeScript: `npx tsc --noEmit` passed with 0 errors.
