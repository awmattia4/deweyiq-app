---
phase: 14-service-agreements-contracts
plan: 02
subsystem: ui-builder
tags: [ui, agreements, forms, settings, pricing-models]
dependency_graph:
  requires:
    - 14-01 (schema + server actions)
  provides:
    - /agreements/new creation page with multi-pool builder
    - PoolEntryForm per-pool config component
    - AgreementBuilder scrollable form component
    - AgreementTemplatesTab in Settings
  affects:
    - src/app/(app)/settings/page.tsx
    - src/components/settings/settings-tabs.tsx
    - src/actions/agreements.ts
    - src/actions/company-settings.ts
    - src/components/shell/app-header.tsx
tech_stack:
  added: []
  patterns:
    - Controlled decimal inputs with local useState<string> (MEMORY.md pattern)
    - Two-query RLS pattern for customers+pools (MEMORY.md)
    - Server actions return fresh data — setTemplates(result.data) directly
    - Plain React state validation (NOT zodResolver — incompatible with zod@4)
key_files:
  created:
    - src/app/(app)/agreements/new/page.tsx
    - src/components/agreements/agreement-builder.tsx
    - src/components/agreements/pool-entry-form.tsx
    - src/components/settings/agreement-templates-tab.tsx
  modified:
    - src/actions/agreements.ts (added getCustomersForAgreement, pools import)
    - src/actions/company-settings.ts (added Phase 14 OrgSettings fields + defaults)
    - src/app/(app)/settings/page.tsx (fetch agreement templates, pass to tab)
    - src/components/settings/settings-tabs.tsx (new Agreements tab + import)
    - src/components/shell/app-header.tsx (/agreements PAGE_TITLE)
decisions:
  - "AgreementBuilder is a scrollable single-page form (not wizard) — simpler for typical 2-3 minute creation flow"
  - "Default T&C/cancellation/liability waiver text provided in both builder and template dialog — companies get production-ready legal language out of the box"
  - "getCustomersForAgreement added to agreements.ts rather than reusing getCustomersForWo to keep import graph clean"
  - "PoolEntryForm emits changes via callback — parent AgreementBuilder holds all state, enabling cross-pool summary calculation"
  - "Pricing model estimate for per_visit in summary uses standard visit frequency multipliers (weekly=4.33, biweekly=2.17)"
metrics:
  duration: 7 minutes
  completed: 2026-03-25
  tasks: 2
  files: 9
---

# Phase 14 Plan 02: Agreement Builder UI and Templates Settings Summary

**One-liner:** Multi-pool agreement builder with three pricing models (monthly flat, per-visit, tiered) and full template CRUD in Settings with default pool-service legal text.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Build multi-pool agreement builder with pricing models | 9b5b6c2 | agreements/new/page.tsx, agreement-builder.tsx, pool-entry-form.tsx |
| 2 | Add agreement templates tab to Settings | eb37405 | agreement-templates-tab.tsx, settings-tabs.tsx, settings/page.tsx |

## What Was Built

### Task 1: Agreement Builder

**`/agreements/new`** — Server component that fetches customers (with pools via two-query RLS pattern), agreement templates, and checklist tasks. Passes all props to `AgreementBuilder`.

**`AgreementBuilder`** — Scrollable single-page form with 8 sections:
1. Template selection (dropdown pre-fills term, frequency, pricing, legal text)
2. Customer combobox with live search; pool checkboxes appear on selection
3. Pool configuration — one `PoolEntryForm` per selected pool
4. Agreement terms (term type, start date, auto-calculated end date, auto-renew)
5. Legal text — T&C, cancellation policy, liability waiver (all pre-filled with defaults)
6. Internal notes (office-only)
7. Summary card (pool count, term type, estimated monthly total)
8. Actions (Save as Draft, Save & Send — both call createAgreement, redirect to detail)

**`PoolEntryForm`** — Per-pool configuration with:
- Frequency selector (weekly/biweekly/monthly/custom) + custom interval days
- Preferred day of week
- Pricing model radio group (Monthly Flat Rate, Per Visit, Tiered) — each shows the correct input fields
- Controlled decimal inputs following MEMORY.md pattern (local string state, flush on complete values)
- Service checklist checkboxes from org's checklist tasks
- Pool-specific notes

### Task 2: Agreement Templates Settings Tab

**`AgreementTemplatesTab`** — Full CRUD tab:
- Template list with name, defaults summary, active/inactive badge
- Edit button per template; inline delete with confirm/cancel
- Create/Edit dialog with name, term type, frequency, pricing model, default amount, is_active toggle, and all three legal text fields
- Default legal text pre-filled in all new templates (pool-service industry standard)

**Agreement Defaults section** — Org-level config:
- Agreement number prefix (e.g. "SA" → "SA-0001")
- Cancellation notice period (days)
- Renewal reminder lead times (comma-separated days)
- All persisted via `updateOrgSettings`

**Settings integration:**
- "Agreements" tab added to `OWNER_TABS` and `TabId` type
- `getAgreementTemplates()` fetched in parallel with other settings data
- `OrgSettings` type extended with 4 Phase 14 agreement fields + DEFAULT_SETTINGS entries

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed unused variable referencing pool.pool_id**
- **Found during:** TypeScript check after Task 1
- **Issue:** `validate()` had `const pool = selectedCustomer?.pools.find((p) => p.pool_id === ...)` — pool objects use `.id` not `.pool_id`
- **Fix:** Removed the unused variable; error key still set correctly via `pool_${entry.pool_id}`
- **Files modified:** agreement-builder.tsx

None other — plan executed as written.

## Self-Check: PASSED

Files exist:
- FOUND: src/app/(app)/agreements/new/page.tsx
- FOUND: src/components/agreements/agreement-builder.tsx
- FOUND: src/components/agreements/pool-entry-form.tsx
- FOUND: src/components/settings/agreement-templates-tab.tsx

Commits exist:
- FOUND: 9b5b6c2 (Task 1)
- FOUND: eb37405 (Task 2)

TypeScript: clean (`npx tsc --noEmit` returns 0 errors)
