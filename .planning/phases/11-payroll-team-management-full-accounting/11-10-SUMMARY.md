---
phase: 11-payroll-team-management-full-accounting
plan: "10"
subsystem: ui
tags: [expenses, mileage, receipts, irs-export, recharts, supabase-storage, browser-image-compression]

# Dependency graph
requires:
  - phase: 11-payroll-team-management-full-accounting
    provides: expenses.ts schema and actions (createExpense, getExpenses, etc.)
  - phase: 11-payroll-team-management-full-accounting
    provides: mileage.ts actions (getMileageLog, exportMileageLog, getMileageSummary)
  - phase: 11-payroll-team-management-full-accounting
    provides: time-tracking.ts clockOut with mileage trigger
provides:
  - ExpenseTracker component with category bar chart, AP vendor grouping, receipt upload, category filter
  - MileageLog component with IRS CSV export, tech filter, manual entry form, auto vs manual badges
  - QuickExpenseButton field component on routes page for rapid zero-friction expense capture
  - Reports page Expenses and Mileage tabs wired with parallel server-side data fetch
affects:
  - future billing and payroll phases that consume expense data
  - accounting page / reports if tabs are reorganized

# Tech tracking
tech-stack:
  added: [browser-image-compression (dynamic import), recharts BarChart/Tooltip/Cell]
  patterns:
    - Dynamic import for heavy libraries (browser-image-compression) to keep initial bundle small
    - Recharts hex colors (not oklch) for chart paint properties
    - Fire-and-forget receipt upload pattern — receipt failure never blocks expense save
    - Owner-only mileage tab gated at server component level (no data fetched for non-owners)

key-files:
  created:
    - src/components/accounting/expense-tracker.tsx
    - src/components/accounting/mileage-log.tsx
    - src/components/field/quick-expense.tsx
  modified:
    - src/app/(app)/reports/page.tsx
    - src/app/(app)/routes/page.tsx

key-decisions:
  - "Recharts hex colors only — oklch colors crash WebGL-backed chart renders"
  - "QuickExpenseButton toggles inline panel (not modal) — keeps routes page clean, avoids z-index stacking with map"
  - "Mileage tab is owner-only; data fetch is skipped for non-owner roles at the server component level to avoid exposing all-tech mileage data to office role"
  - "Receipt upload failure is non-blocking — expense saves first, receipt upload attempted second"
  - "browser-image-compression loaded via dynamic import to avoid bloating the initial bundle"

patterns-established:
  - "Field quick-action pattern: minimal input (amount + category chips) + optional photo, expanded inline panel below trigger button"
  - "IRS export pattern: server action returns {success, csv, filename}, client triggers Blob URL download"

requirements-completed: []

# Metrics
duration: 90min
completed: 2026-03-16
---

# Phase 11 Plan 10: Expense Tracker and Mileage Log Summary

**Receipt-backed expense tracking and IRS-compliant mileage log UI with Recharts category breakdown, tech-filtered log, CSV export, and zero-friction field expense capture from the routes page.**

## Performance

- **Duration:** ~90 min (across two conversation sessions)
- **Started:** 2026-03-16T00:00:00Z
- **Completed:** 2026-03-16
- **Tasks:** 2
- **Files modified:** 5 (3 created, 2 modified)

## Accomplishments

- ExpenseTracker with Recharts BarChart (hex colors), AP vendor grouping, receipt photo upload via Supabase Storage with browser-image-compression, category filter, date-range refresh
- MileageLog with IRS CSV export (Date, Origin, Destination, Purpose, Miles, Rate, Deduction columns), tech filter dropdown (owner sees all techs), manual entry form, auto vs manual badge (MapPin vs Pencil icon)
- QuickExpenseButton on routes page: inline expandable panel with amount input, 4 category chips (Chemicals/Parts/Fuel/Other), optional receipt camera capture — no modal, no friction
- Reports page Expenses and Mileage tabs with all data fetched in parallel on server; mileage data skipped entirely for non-owner roles

## Task Commits

1. **Task 1: Extend expense tracking with receipt upload and mileage actions** - `eeb7927` (feat)
2. **Task 2: Build expense tracker and mileage log UI** - `432ab1b` (feat)

**Plan metadata:** (pending — created in this SUMMARY step)

## Files Created/Modified

- `src/components/accounting/expense-tracker.tsx` — Full expense management UI with Recharts chart, receipt upload, AP view, category filter
- `src/components/accounting/mileage-log.tsx` — Mileage log with summary cards, IRS CSV export, manual entry, tech filter
- `src/components/field/quick-expense.tsx` — QuickExpense and QuickExpenseButton components for field use
- `src/app/(app)/reports/page.tsx` — Added Expenses and Mileage tabs, parallel data fetching, tech profiles for mileage filter
- `src/app/(app)/routes/page.tsx` — Added QuickExpenseButton for isFieldUser (tech/owner)

## Decisions Made

- Recharts hex colors (`#60a5fa`, `#34d399`, etc.) — Tailwind oklch design tokens cannot be used in Recharts paint props (same MapLibre constraint from memory)
- QuickExpenseButton uses inline panel toggle rather than a modal to stay consistent with routes page layout and avoid z-index issues with GPS broadcaster
- Receipt failure is non-blocking: `createExpense` returns `expenseId`, receipt upload runs after and any error is caught silently — expense record always saves first
- Mileage tab gated as owner-only at the server component level so data fetches are skipped for office role (no `Promise.resolve([])` branching needed for this tab's render)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added `getPredictiveAlertsForPools` to alerts.ts**
- **Found during:** Task 1 (when verifying routes page wiring)
- **Issue:** `src/app/(app)/routes/page.tsx` (from a prior stash pop) imported `getPredictiveAlertsForPools(orgId, poolIds)` which did not exist in `alerts.ts` — only `getPredictiveAlerts()` with no arguments existed
- **Fix:** Added `getPredictiveAlertsForPools(orgId: string, poolIds: string[]): Promise<Map<string, StopPredictiveAlert>>` to alerts.ts using `adminDb` for tech visibility without RLS restrictions; filters to `alert_type = "predictive_chemistry"` scoped to provided pool IDs
- **Files modified:** `src/actions/alerts.ts`
- **Verification:** Routes page TypeScript check passed, no import errors
- **Committed in:** `eeb7927` (Task 1 commit)

**2. [Rule 1 - Bug] Fixed `adminDb.execute()` return type cast in mileage.ts**
- **Found during:** Task 1 (mileage actions)
- **Issue:** `adminDb.execute(sql\`...\`)` returns Drizzle `RowList`, not `{rows: ...}`. Accessing `.rows` caused a TypeScript type error
- **Fix:** Cast result `as unknown as Array<{id: string; geocoded_lat: number; geocoded_lng: number}>`
- **Files modified:** `src/actions/mileage.ts`
- **Verification:** TypeScript check passed
- **Committed in:** `eeb7927` (Task 1 commit)

**3. [Rule 1 - Bug] Fixed Recharts Tooltip formatter type mismatch in expense-tracker.tsx**
- **Found during:** Task 2 (expense tracker component)
- **Issue:** `formatter={(value: number) => [...]}` was incompatible with Recharts' `Formatter` generic type signature
- **Fix:** Removed explicit type annotation: `formatter={(value) => [\`$\{(Number(value)).toFixed(2)}\`, "Amount"]}`
- **Files modified:** `src/components/accounting/expense-tracker.tsx`
- **Verification:** TypeScript check passed with no errors in component files
- **Committed in:** `432ab1b` (Task 2 commit)

**4. [Rule 1 - Bug] Fixed Lucide icon prop — `title` to `aria-label` in mileage-log.tsx**
- **Found during:** Task 2 (mileage log component)
- **Issue:** `MapPinIcon title="..."` and `PencilIcon title="..."` caused TypeScript type errors — Lucide icon components don't accept a `title` prop
- **Fix:** Changed both to `aria-label="..."` which Lucide forwards to the SVG element
- **Files modified:** `src/components/accounting/mileage-log.tsx`
- **Verification:** TypeScript check passed
- **Committed in:** `432ab1b` (Task 2 commit)

---

**Total deviations:** 4 auto-fixed (1 Rule 3 blocking, 3 Rule 1 bugs)
**Impact on plan:** All fixes necessary for build correctness. No scope creep beyond plan intent.

## Issues Encountered

- **Git stash state conflict**: Prior conversation had a stash (`stash@{0}`) containing intermediate versions of `expenses.ts` and other files. Some files in HEAD were already updated from previous plan commits (11-07 through 11-11). Required careful verification of which files needed changes vs which were already in the correct state.
- **zsh parentheses glob expansion**: `git add src/app/(app)/reports/page.tsx` failed in zsh due to `(app)` being treated as a glob. Fixed by quoting paths: `git add "src/app/(app)/reports/page.tsx"`.
- **Stuck build lock**: `.next/lock` left by a previous stuck build process. Fixed by `rm -f .next/lock`.

## User Setup Required

None — expense receipts use the existing Supabase Storage bucket (`expense-receipts`) configured in prior plans. No new environment variables required.

## Next Phase Readiness

- Expense tracker and mileage log are fully wired — owner/office can log expenses, upload receipts, and export IRS mileage CSV
- Field techs can log expenses directly from the routes page with one tap
- Auto-mileage entries are created at clockOut via the time-tracking integration (Plan 10 Task 1)
- Ready for Phase 11 Plan 11 (final plan in phase) or any subsequent phase

## Self-Check: PASSED

All files verified present on disk. Both task commits confirmed in git log.

| Check | Result |
|-------|--------|
| `src/components/accounting/expense-tracker.tsx` | FOUND |
| `src/components/accounting/mileage-log.tsx` | FOUND |
| `src/components/field/quick-expense.tsx` | FOUND |
| `src/actions/mileage.ts` | FOUND |
| `.planning/phases/11-payroll-team-management-full-accounting/11-10-SUMMARY.md` | FOUND |
| Commit `eeb7927` (Task 1) | FOUND |
| Commit `432ab1b` (Task 2) | FOUND |

---
*Phase: 11-payroll-team-management-full-accounting*
*Completed: 2026-03-16*
