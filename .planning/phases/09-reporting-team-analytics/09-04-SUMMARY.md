---
phase: 09-reporting-team-analytics
plan: 04
subsystem: ui
tags: [recharts, reporting, payroll, team-analytics, drizzle, jsonb]

# Dependency graph
requires:
  - phase: 09-03
    provides: Operations Dashboard tab and reporting.ts server action file
  - phase: 09-01
    provides: report-shared.tsx with TimePeriodSelector, KpiCard, CHART_COLORS
  - phase: 07
    provides: invoices schema with JSONB work_order_ids, profiles.pay_type/pay_rate columns
provides:
  - Team Dashboard tab (leaderboard + comparison mode with trend arrows)
  - Payroll Prep section with per-tech pay + CSV export
  - Tech self-scorecard view (role-guarded, no other-tech data)
  - TeamPaySettings component in Settings > Billing tab
  - getTeamMetrics, getTechScorecard, getPayrollPrep, exportPayrollCsv, exportTeamCsv server actions
  - updateTechPayConfig action for per-tech pay configuration
affects: [09-05-profitability, 11-payroll]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Chemistry accuracy computed in JS via classifyReading() — avoids correlated subquery on RLS-protected service_visits
    - JSONB @> containment operator for commission query on invoices.work_order_ids
    - Two-step fetch for visit metrics: DB query → JS merge (MEMORY.md anti-correlated-subquery pattern)
    - CSS bar charts for comparison view (no Recharts needed for simple horizontal bars)

key-files:
  created:
    - src/components/reports/team-dashboard.tsx
    - src/components/reports/tech-self-scorecard.tsx
    - src/components/settings/team-pay-settings.tsx
  modified:
    - src/actions/reporting.ts
    - src/actions/company-settings.ts
    - src/components/settings/settings-tabs.tsx
    - src/app/(app)/settings/page.tsx
    - src/app/(app)/reports/page.tsx

key-decisions:
  - "Chemistry accuracy computed in application JS (classifyReading) — not SQL — to avoid correlated subquery on RLS-protected service_visits table"
  - "Commission query uses JSONB @> containment on invoices.work_order_ids — NOT a naive JOIN (JSONB array has no FK column to join on)"
  - "Avg stop time trend: lower = better, so avgStopMinutesTrend positive means time went down (improvement) — inverted display in TrendBadge"
  - "Comparison view uses CSS horizontal bars (not Recharts) — simpler, no dependency, works at all zoom levels"
  - "settings/page.tsx fetches tech profiles via adminDb with explicit org_id filter (RLS bypass requires app-layer org check)"
  - "wo_upsell_commission_pct added to OrgSettings type and DEFAULT_SETTINGS — was in DB schema (Phase 9 migration) but missing from TS interface"

patterns-established:
  - "TrendBadge with inversed flag: stops/day/onTime = higher is better; avgStopMinutes = lower is better"
  - "LeaderboardView: configurable sort metric with ArrowUpRight trophy for top performer"

requirements-completed:
  - REPT-03
  - REPT-04

# Metrics
duration: 8min
completed: 2026-03-15
---

# Phase 9 Plan 04: Team Dashboard Summary

**Team Dashboard with leaderboard/comparison scorecards, trend indicators, JSONB-based commission payroll, and per-tech pay configuration in Settings**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-15T00:43:43Z
- **Completed:** 2026-03-15T00:51:16Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- Owner can view ranked leaderboard of all techs with every metric (stops/day, avg stop time, on-time rate, chemistry accuracy, checklist rate, photo rate) and green/red trend arrows comparing to previous period
- Owner can switch to side-by-side comparison mode selecting 2-3 techs with CSS horizontal bar charts for at-a-glance coaching decisions
- Owner can export payroll-ready CSV (Gusto/ADP format) with per-tech stops, hours, pay rate, commissions, and gross pay
- Tech users see only their own performance scorecard ("My Performance") with no access to other tech data or financial information
- Owner can configure per-tech pay type (per-stop/hourly) and pay rate from Settings > Billing tab

## Task Commits

1. **Task 1: Team metrics, scorecard, and payroll server actions** - `922b5fd` (feat)
2. **Task 2: Team Dashboard UI, tech self-scorecard, pay settings, and wiring** - `41dd08d` (feat)

## Files Created/Modified

- `src/actions/reporting.ts` — Added getTeamMetrics, getTechScorecard, getPayrollPrep, exportPayrollCsv, exportTeamCsv + helpers
- `src/actions/company-settings.ts` — Added updateTechPayConfig, wo_upsell_commission_pct to OrgSettings type + DEFAULT_SETTINGS
- `src/components/reports/team-dashboard.tsx` — Team Dashboard with leaderboard, comparison, and payroll views
- `src/components/reports/tech-self-scorecard.tsx` — Stripped-down personal performance view for techs
- `src/components/settings/team-pay-settings.tsx` — Per-tech pay configuration UI
- `src/components/settings/settings-tabs.tsx` — Added TeamPaySettings to Billing tab, techProfiles prop
- `src/app/(app)/settings/page.tsx` — Fetches tech profiles (org-scoped adminDb), passes to SettingsTabs
- `src/app/(app)/reports/page.tsx` — Replaced tech placeholder with TechSelfScorecard; added TeamDashboard to Team tab

## Decisions Made

- **Chemistry accuracy in JS**: Used `classifyReading()` from targets.ts in application code, not SQL. Fetches service_visits rows in a two-step pattern then processes in JS. Avoids correlated subquery on RLS-protected table (MEMORY.md critical pitfall).
- **JSONB commission query**: Commission calculation uses `@>` containment: `${invoices.work_order_ids} @> ${JSON.stringify([woId])}::jsonb`. This is the only correct approach — `work_order_ids` is a JSONB `string[]` column with no FK, so a naive JOIN is impossible.
- **Inverted trend for avg stop time**: Lower avg stop time is better. `avgStopMinutesTrend = prevAvgMinutes - avgStopMinutes` so positive = improvement. TrendBadge uses `inversed` flag to show green for improvement.
- **wo_upsell_commission_pct was missing from OrgSettings type**: The column existed in the DB schema and migration but hadn't been added to the TypeScript `OrgSettings` interface in company-settings.ts. Added as a Rule 1 auto-fix during Task 1.
- **adminDb for settings page tech profile fetch**: Settings page uses adminDb with explicit `org_id` filter. Needed because the RLS token from `withRls` would work, but the settings page already has `user.org_id` available — using adminDb + explicit filter is the established pattern for page-level data fetching in this codebase.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added wo_upsell_commission_pct to OrgSettings TypeScript interface**
- **Found during:** Task 1 (server actions)
- **Issue:** `wo_upsell_commission_pct` column exists in DB schema (org-settings.ts) and migration, but was not in the `OrgSettings` TypeScript interface in company-settings.ts. Accessing it via `orgSettings.wo_upsell_commission_pct` would cause TypeScript errors and runtime undefined.
- **Fix:** Added field to OrgSettings interface and DEFAULT_SETTINGS constant
- **Files modified:** src/actions/company-settings.ts
- **Verification:** TypeScript compiles cleanly; field available in TeamPaySettings CommissionRateRow
- **Committed in:** 922b5fd (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug — missing TypeScript type for existing DB column)
**Impact on plan:** Necessary correctness fix. No scope creep.

## Issues Encountered

None — plan executed as specified.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Team Dashboard fully functional for Plan 04 requirements
- Ready for Phase 9 Plan 05: Profitability Dashboard
- Payroll CSV export is prep-only (Gusto/ADP import) — Phase 11 adds native payroll processing integration

---
*Phase: 09-reporting-team-analytics*
*Completed: 2026-03-15*
