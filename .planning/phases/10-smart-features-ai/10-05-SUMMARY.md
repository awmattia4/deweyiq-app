---
phase: 10-smart-features-ai
plan: 05
subsystem: ui
tags: [react, lucide-react, customer-creation, ux, suggestions]

requires:
  - phase: 02-customer-pool-data-model
    provides: pool schema with type/volume/sanitizer fields and AddPoolDialog component

provides:
  - Contextual smart suggestion banners in AddPoolDialog (multi-pool, frequency, equipment combos)
  - Gate code reminder banner in AddCustomerDialog when address is filled but gate code is empty
  - Dismissible suggestion UI with Lightbulb icon and X button, session-scoped dismiss state

affects:
  - any future phase touching customer/pool creation UX

tech-stack:
  added: []
  patterns:
    - "Suggestion engine as pure function returning Suggestion[] from form state + context — easy to extend without touching render logic"
    - "Dismissible banners using Set<string> state keyed by suggestion ID — O(1) lookups, no re-renders on unrelated form changes"

key-files:
  created: []
  modified:
    - src/components/customers/add-pool-dialog.tsx
    - src/components/customers/add-customer-dialog.tsx
    - src/components/customers/pool-list.tsx

key-decisions:
  - "ExistingPool type kept minimal (id, name, type, volume_gallons, sanitizer_type) — pool-list.tsx Pool type already has all these fields so no server-side query changes needed"
  - "Suggestions rebuild on every render from current form state — simple, no derived state needed; cheap pure function"
  - "Gate code hint placed between gate code input and access notes — contextually adjacent to the relevant field rather than at the bottom"

requirements-completed: []

duration: 10min
completed: 2026-03-16
---

# Phase 10 Plan 05: Smart Customer Creation Summary

**Contextual suggestion banners in AddPoolDialog (multi-pool detection, service frequency, equipment combos) and AddCustomerDialog (gate code reminder) — dismissible, non-blocking, session-scoped**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-03-16T00:00:00Z
- **Completed:** 2026-03-16T00:10:00Z
- **Tasks:** 1
- **Files modified:** 3

## Accomplishments
- AddPoolDialog now accepts `existingPools` prop and shows contextual suggestion banners: multi-pool note reminder, pool+spa combo frequency hint, service frequency recommendations by volume, equipment combo suggestions for salt pools and spas
- AddCustomerDialog shows a gate code reminder when address is filled but gate code is empty
- All suggestions are dismissible with an X button; dismissed state is stored per-session and reset when dialog closes
- PoolList passes its `pools` array to `AddPoolDialog` as `existingPools` — no server-side changes needed

## Task Commits

1. **Task 1: Smart suggestions in add-customer and add-pool dialogs** - `86990ee` (feat)

## Files Created/Modified
- `src/components/customers/add-pool-dialog.tsx` — Added `ExistingPool` type, `existingPools` prop, `buildSuggestions()` pure function, `SuggestionBanner` component, dismissed suggestion Set state
- `src/components/customers/add-customer-dialog.tsx` — Added `Lightbulb`/`X` imports, `gateCodeDismissed` state, `showGateCodeHint` derived boolean, gate code suggestion banner
- `src/components/customers/pool-list.tsx` — Passes `existingPools={pools}` to `AddPoolDialog`

## Decisions Made
- ExistingPool type kept minimal — only the fields needed for suggestion logic (type, volume_gallons, sanitizer_type). The Pool type in pool-list.tsx already contains these fields, so no API or query changes were needed.
- Gate code hint rendered between the gate code input and access notes textarea — contextually adjacent placement makes the relationship clear to the user.
- Suggestions rebuild from scratch on each render (pure function on form state) — avoids stale derived state complexity. The function is cheap (no async, no DB calls).

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

Pre-existing TypeScript error in `src/actions/company-settings.ts:333` (`logo_url` field missing from `orgs` schema type) caused `npm run build` to fail. This error was present before Plan 10-05 work began and is unrelated to customer creation dialogs. Logged to `deferred-items.md` in the phase directory. Our files (add-pool-dialog, add-customer-dialog, pool-list) have zero TypeScript errors — confirmed via `npx tsc --noEmit --skipLibCheck` filtering for our files.

## Next Phase Readiness
- Smart customer creation UX is complete; ready for Phase 10 Plan 06
- Pre-existing build error in company-settings.ts should be addressed before a production deploy

---
*Phase: 10-smart-features-ai*
*Completed: 2026-03-16*
