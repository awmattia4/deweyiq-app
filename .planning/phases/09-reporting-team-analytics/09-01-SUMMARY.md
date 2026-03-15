---
phase: 09-reporting-team-analytics
plan: 01
subsystem: database, ui
tags: [recharts, drizzle, postgres, reports, schema-migration]

# Dependency graph
requires:
  - phase: 07-billing-payments
    provides: AR aging, revenue, P&L reports page foundation (3-tab structure)
  - phase: 03-field-tech-app
    provides: service_visits table and completeStop action this plan extends
  - phase: 04-scheduling-routing
    provides: route_stops table this plan adds started_at to

provides:
  - recharts@3.8.0 installed and available for all Phase 9 chart components
  - 6 new schema columns for Phase 9 reporting (pay_type, pay_rate, cost_per_unit, chem_profit_margin_threshold_pct, wo_upsell_commission_pct, dosing_amounts, started_at)
  - report-shared.tsx with CHART_COLORS, TimePeriodSelector, KpiCard, downloadCsv, formatCurrency, formatPercent
  - Reports page restructured to 7 tabs with Revenue Dashboard, Operations, Team, Profitability shells
  - Tech users see "My Performance" view instead of redirect
  - markStopStarted action for recording started_at on route_stops

affects:
  - 09-02-PLAN (Revenue Dashboard — consumes TimePeriodSelector, KpiCard, CHART_COLORS)
  - 09-03-PLAN (Operations — consumes started_at from route_stops, report-shared components)
  - 09-04-PLAN (Team — consumes pay_type, pay_rate from profiles, report-shared components)
  - 09-05-PLAN (Profitability — consumes cost_per_unit, dosing_amounts, chem_profit_margin_threshold_pct)

# Tech tracking
tech-stack:
  added:
    - recharts@3.8.0 — charting library for all Phase 9 report visualizations
  patterns:
    - CHART_COLORS hex-only pattern — all chart colors in report-shared.tsx use hex (no oklch) per MapLibre/WebGL constraint
    - TimePeriodSelector uses toLocalDateString from date-utils — prevents UTC date bugs
    - KpiCard trend indicator — ArrowUpRight/Down with emerald/red color per positive/negative
    - Tab scroll pattern — 7 tabs use flex overflow-x-auto instead of grid-cols-N

key-files:
  created:
    - src/components/reports/report-shared.tsx
    - src/lib/db/migrations/0009_material_echo.sql
    - src/lib/db/migrations/meta/0009_snapshot.json
  modified:
    - src/lib/db/schema/profiles.ts
    - src/lib/db/schema/chemical-products.ts
    - src/lib/db/schema/org-settings.ts
    - src/lib/db/schema/service-visits.ts
    - src/lib/db/schema/route-stops.ts
    - src/actions/visits.ts
    - src/app/(app)/reports/page.tsx
    - package.json

key-decisions:
  - "Phase 9 tab naming: 'Revenue Dashboard' for the new revenue tab (not 'Dashboard') to distinguish from existing Revenue tab — matches user's locked decision"
  - "markStopStarted is a separate optional action — since no existing in_progress server transition exists, field workflow can call it on stop begin; failure is non-blocking"
  - "dosing_amounts in completeStop is optional (dosingAmounts?) — existing callers unchanged, stop-workflow.tsx wired in Plan 03"
  - "Tech users see My Performance placeholder view (not redirect) — Phase 9 Plan 04 fills in the scorecard"
  - "TimePeriodSelector presets trigger immediate onChange; custom preset shows date inputs inline"

patterns-established:
  - "CHART_COLORS constant: hex-only colors for recharts SVG rendering — no oklch"
  - "Scrollable tabs pattern: flex w-full overflow-x-auto + whitespace-nowrap for 6+ tab sets"

requirements-completed:
  - REPT-01
  - REPT-02
  - REPT-03
  - REPT-04
  - REPT-05
  - REPT-06

# Metrics
duration: 6min
completed: 2026-03-15
---

# Phase 9 Plan 01: Foundation — Schema, Recharts, Shared Infrastructure Summary

**Recharts installed, 7 schema columns added via migration, report-shared.tsx built with CHART_COLORS/TimePeriodSelector/KpiCard/CSV utilities, and reports page restructured to 7 tabs with Phase 9 shells**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-03-15T00:23:05Z
- **Completed:** 2026-03-15T00:29:00Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- Installed recharts@3.8.0 — charting library ready for Plans 02-05
- Applied migration `0009_material_echo.sql` adding 7 Phase 9 columns across 5 tables (profiles, chemical_products, org_settings, service_visits, route_stops)
- Created `report-shared.tsx` with all 6 shared exports: CHART_COLORS, TimePeriodSelector, KpiCard, downloadCsv, formatCurrency, formatPercent
- Restructured reports page from 3-tab grid to 7-tab scrollable layout with Phase 9 tab shells
- Updated `completeStop` to persist `dosing_amounts` and added `markStopStarted` for `started_at` tracking

## Task Commits

1. **Task 1: Install Recharts, add schema columns, update completeStop** - `1a68e3c` (feat)
2. **Task 2: Create shared report infrastructure and extend reports page with new tabs** - `a0f9581` (feat)

## Files Created/Modified

- `src/components/reports/report-shared.tsx` — CHART_COLORS, TimePeriodSelector, KpiCard, downloadCsv, formatCurrency, formatPercent
- `src/lib/db/migrations/0009_material_echo.sql` — 7 new schema columns migration
- `src/lib/db/schema/profiles.ts` — pay_type, pay_rate columns
- `src/lib/db/schema/chemical-products.ts` — cost_per_unit column
- `src/lib/db/schema/org-settings.ts` — chem_profit_margin_threshold_pct, wo_upsell_commission_pct columns
- `src/lib/db/schema/service-visits.ts` — dosing_amounts JSONB column
- `src/lib/db/schema/route-stops.ts` — started_at timestamp column
- `src/actions/visits.ts` — dosingAmounts on CompleteStopInput, markStopStarted action
- `src/app/(app)/reports/page.tsx` — 7 tabs, tech My Performance view, Phase 9 tab shells

## Decisions Made

- **Revenue Dashboard tab naming**: Used "Revenue Dashboard" (not "Dashboard") to distinguish from existing "Revenue" tab — matches user's locked decision to name it "Revenue Dashboard"
- **markStopStarted as separate action**: No existing in_progress server-side transition found. Added `markStopStarted(routeStopId)` as an optional call for the field workflow. Best-effort — failure doesn't block stop completion.
- **dosing_amounts optional**: `dosingAmounts?` is optional on CompleteStopInput so existing callers (including offline sync) are unaffected. Plan 03 wires up the actual dosing amount capture from stop-workflow.tsx.
- **Tab layout — flex overflow-x-auto**: 7 tabs don't fit in grid-cols-N on mobile. Changed to flex with overflow-x-auto and whitespace-nowrap on each trigger.
- **Tech view placeholder**: My Performance shows a placeholder div for now — Plan 04 builds the actual scorecard. Tech is no longer redirected away.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `psql` not on PATH — found at `/opt/homebrew/Cellar/libpq/18.2/bin/psql`. RLS verification ran successfully with full path.
- `drizzle-kit push` requires `DATABASE_URL` env var — loaded from `.env.local` via explicit env prefix for the push command.
- Pre-existing `.next/` TypeScript errors (duplicate LayoutProps) — not from our changes, pre-existing Next.js generated file issue.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **Plan 02 (Revenue Dashboard)**: TimePeriodSelector, KpiCard, CHART_COLORS all ready. The "revenue-dashboard" tab shell in reports page awaits the RevenueFlowReport component.
- **Plan 03 (Operations)**: `started_at` on route_stops and `dosing_amounts` on service_visits are in the DB. Operations tab shell ready.
- **Plan 04 (Team)**: `pay_type` and `pay_rate` on profiles ready. Team tab shell + My Performance placeholder ready.
- **Plan 05 (Profitability)**: `cost_per_unit`, `dosing_amounts`, `chem_profit_margin_threshold_pct`, `wo_upsell_commission_pct` all in DB.

---
*Phase: 09-reporting-team-analytics*
*Completed: 2026-03-15*
