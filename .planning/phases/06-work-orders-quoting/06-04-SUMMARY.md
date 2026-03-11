---
phase: 06-work-orders-quoting
plan: "04"
subsystem: ui
tags: [react, nextjs, work-orders, line-items, parts-catalog, settings, tailwind]

# Dependency graph
requires:
  - phase: 06-01
    provides: work_orders, work_order_line_items, parts_catalog, wo_templates DB tables and server actions

provides:
  - LineItemEditor component with catalog search, add/edit/delete, labor/parts/other types, per-item discounts, markup calculation, running totals
  - PartsCatalogManager settings component with full CRUD, search, category filter, soft-delete
  - WoTemplateManager settings component with create/delete templates
  - WorkOrderSettings component for Phase 6 org settings (rates, markup, tax, quote settings, WO notifications)
  - addLineItemToWorkOrder, updateLineItem, deleteLineItem, reorderLineItems server actions
  - OrgSettings type extended with Phase 6 fields

affects:
  - 06-02 (WO detail page — uses LineItemEditor)
  - 06-03 (Quote builder — uses LineItemEditor)
  - 06-05 (Invoice builder — uses line items)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Local string state for all decimal inputs (never parseFloat on change) per MEMORY.md
    - Optimistic updates on add/edit/delete with server action confirmation
    - Pick<OrgSettings, "field1" | "field2"> for component prop typing
    - Debounced catalog search with 300ms timeout via useRef

key-files:
  created:
    - src/components/work-orders/line-item-editor.tsx
    - src/components/settings/parts-catalog-manager.tsx
    - src/components/settings/wo-template-manager.tsx
    - src/components/settings/work-order-settings.tsx
  modified:
    - src/actions/work-orders.ts
    - src/actions/company-settings.ts
    - src/app/(app)/settings/page.tsx

key-decisions:
  - "No @radix-ui/react-icons — lucide-react only (not installed in project)"
  - "workOrderLineItems schema has no updated_at column — removed from updateLineItem and reorderLineItems calls"
  - "OrgSettings Phase 6 fields typed as string | null (numeric DB columns return strings via Drizzle numeric type)"
  - "WoTemplateManager line items note: line items added via WO detail page after template creation, not in template dialog itself"

patterns-established:
  - "LineItemEditor: catalog search with 300ms debounce, optimistic UI, parseFloat-safe decimal inputs"
  - "Settings components: fetch data server-side, pass as initialXxx props, optimistic client updates"

requirements-completed:
  - WORK-02
  - WORK-03

# Metrics
duration: 14min
completed: 2026-03-11
---

# Phase 06 Plan 04: Line Item Editor, Parts Catalog & WO Templates Summary

**LineItemEditor component with catalog search + markup calculation, PartsCatalogManager and WoTemplateManager in settings, and Phase 6 org settings (rates, tax, quote config, WO notifications)**

## Performance

- **Duration:** 14 min
- **Started:** 2026-03-11T00:13:47Z
- **Completed:** 2026-03-11T00:27:47Z
- **Tasks:** 2
- **Files modified/created:** 7

## Accomplishments

- LineItemEditor component: add/edit/delete line items with catalog search auto-fill, part/labor/other types, hourly/flat labor, per-item discounts, taxability toggle, optional flag, parts markup calculation (cost + markup % = sell price), running totals (subtotal + tax + total). All decimal inputs use local string state per MEMORY.md.
- PartsCatalogManager: full CRUD with live search, 8 category filter tabs, show/hide inactive items toggle. Optimistic updates on all mutations.
- WoTemplateManager: create templates with name, category, priority. Delete with confirmation. Empty state with contextual guidance.
- WorkOrderSettings: Phase 6 org config — hourly labor rate, parts markup %, tax rate (stored as decimal, displayed as %), quote expiry days, invoice/quote number prefixes, terms & conditions textarea, three WO notification toggles. Decimal inputs use MEMORY.md pattern.
- Extended OrgSettings type and DEFAULT_SETTINGS with all Phase 6 fields. Settings page updated with three new owner-only cards.
- Added addLineItemToWorkOrder, updateLineItem, deleteLineItem, reorderLineItems server actions to work-orders.ts.

## Task Commits

1. **Task 1: Line item editor component with catalog integration** - `bdcb282` (feat)
2. **Task 2: Parts catalog and WO templates management in settings** - `5afef14` (feat)

## Files Created/Modified

- `src/components/work-orders/line-item-editor.tsx` - Full line item editor with catalog search, labor/parts/other, discounts, totals
- `src/components/settings/parts-catalog-manager.tsx` - Parts catalog CRUD with search and category filter
- `src/components/settings/wo-template-manager.tsx` - WO template create/delete management
- `src/components/settings/work-order-settings.tsx` - Phase 6 org settings (rates, markup, tax, quote config, WO notification toggles)
- `src/actions/work-orders.ts` - Added AddLineItemInput type + 4 line item server actions
- `src/actions/company-settings.ts` - Extended OrgSettings type and DEFAULT_SETTINGS with Phase 6 fields
- `src/app/(app)/settings/page.tsx` - Added WorkOrderSettings, PartsCatalogManager, WoTemplateManager sections

## Decisions Made

- No `@radix-ui/react-icons` in project — used `lucide-react` throughout. The plan referenced `Pencil1Icon`, `TrashIcon`, `MagnifyingGlassIcon`, `Cross2Icon` which don't exist in lucide-react; mapped to equivalents.
- `workOrderLineItems` schema lacks `updated_at` column (only `created_at`). Removed `updated_at: new Date()` from `updateLineItem` and `reorderLineItems` server actions.
- OrgSettings Phase 6 fields (numeric DB columns) return `string | null` via Drizzle — typed accordingly; cast with `as string` where TypeScript infers `{}` for `Pick<>` intersection.
- WoTemplateManager line items: complex "create from existing WO" flow deferred — the plan's note about line items being added after template creation via WO detail page is documented in the UI with an inline hint.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed updated_at references from workOrderLineItems mutations**
- **Found during:** Task 1 (line item server actions)
- **Issue:** `workOrderLineItems` schema only has `created_at`, no `updated_at`. Using `updated_at: new Date()` in update/reorder would cause a DB column-not-found error.
- **Fix:** Removed `updated_at` from `updateLineItem` and `reorderLineItems` update payloads
- **Files modified:** `src/actions/work-orders.ts`
- **Verification:** TypeScript type check passes, no `updated_at` on workOrderLineItems schema
- **Committed in:** bdcb282 (Task 1 commit)

**2. [Rule 3 - Blocking] Replaced @radix-ui/react-icons with lucide-react**
- **Found during:** Task 1 (line item editor component)
- **Issue:** `@radix-ui/react-icons` not installed; TypeScript error TS2307 "Cannot find module '@radix-ui/react-icons'"
- **Fix:** Replaced all icon imports with lucide-react equivalents (PencilIcon, Trash2Icon, SearchIcon, XIcon, PlusIcon)
- **Files modified:** `src/components/work-orders/line-item-editor.tsx`
- **Verification:** TypeScript type check passes, build succeeds
- **Committed in:** bdcb282 (Task 1 commit)

**3. [Rule 1 - Bug] Fixed OrgSettings type inference for Phase 6 fields**
- **Found during:** Task 1 (line item editor component)
- **Issue:** TypeScript inferred `{}` (not `string`) for `Pick<OrgSettings, "default_hourly_rate" | ...>` fields because OrgSettings type didn't include Phase 6 fields. Caused `Type '{}' is not assignable to type 'string'` errors.
- **Fix:** Extended OrgSettings interface and DEFAULT_SETTINGS in company-settings.ts with all Phase 6 numeric/text/boolean fields. Added explicit `as string` casts for nullish coalescing patterns.
- **Files modified:** `src/actions/company-settings.ts`, `src/components/work-orders/line-item-editor.tsx`
- **Verification:** TypeScript type check passes with no new errors
- **Committed in:** bdcb282 (Task 1 commit)

---

**Total deviations:** 3 auto-fixed (1 bug, 1 blocking dependency, 1 type bug)
**Impact on plan:** All auto-fixes necessary for correctness and build success. No scope creep.

## Issues Encountered

None beyond the deviations documented above.

## User Setup Required

None - no external service configuration required for this plan.

## Next Phase Readiness

- LineItemEditor is ready to be imported by the WO detail page (06-02) and quote builder (06-03)
- Parts catalog and WO template management fully functional in settings
- Phase 6 org settings (rates, markup, tax, quote config) available via `getOrgSettings()` for all downstream components
- Server actions for line item CRUD are stable and tested via type system

---
*Phase: 06-work-orders-quoting*
*Completed: 2026-03-11*
