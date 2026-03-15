---
phase: 09-reporting-team-analytics
plan: 05
subsystem: reporting
tags: [profitability, chemical-costs, alerts, settings]
dependency_graph:
  requires: ["09-04", "07-billing-payments", "phase-03-chemistry-engine"]
  provides: ["profitability-dashboard", "chemical-cost-config", "unprofitable-pool-alerts"]
  affects: ["/reports", "/settings", "/alerts"]
tech_stack:
  added: []
  patterns: ["adminDb for cost aggregation", "LEFT JOIN revenue distribution", "controlled decimal inputs per MEMORY.md"]
key_files:
  created:
    - src/components/reports/profitability-dashboard.tsx
    - src/components/settings/chemistry-cost-settings.tsx
  modified:
    - src/actions/reporting.ts
    - src/actions/alerts.ts
    - src/lib/alerts/constants.ts
    - src/components/alerts/alert-feed.tsx
    - src/components/settings/settings-tabs.tsx
    - src/app/(app)/settings/page.tsx
    - src/app/(app)/reports/page.tsx
    - src/actions/company-settings.ts
decisions:
  - "Revenue distributed evenly across customer's pools — simpler than visit-count proportional, avoids per-pool revenue tracking"
  - "Profitability tab owner-only — chemical cost per pool is sensitive financial data, not shown to office"
  - "Historical visits without dosing_amounts use generateDosingRecommendations() estimation — marked Est. in UI"
  - "Alert generation for unprofitable pools scoped to last 30 days with dosing_amounts only — avoids huge re-derivation cost in alert generator"
  - "chem_profit_margin_threshold_pct added to OrgSettings TS interface and DEFAULT_SETTINGS — was in DB schema but missing from TS type"
metrics:
  duration: 8 min
  completed_date: "2026-03-15"
  tasks: 2
  files: 9
---

# Phase 9 Plan 05: Profitability Dashboard Summary

Per-pool chemical cost vs revenue analysis with flagged pools, per-tech dosing cost comparison, unprofitable pool alerts, and chemistry cost configuration in Settings.

## What Was Built

### Task 1: Profitability analysis server actions and alert integration

**`src/actions/reporting.ts`** — appended:
- `getProfitabilityAnalysis(startDate, endDate)` — full per-pool chemical cost vs revenue analysis. Fetches org settings for margin threshold, chemical products with costs, service visits with dosing data (LEFT JOIN pools + customers), re-derives historical costs using `generateDosingRecommendations()` for visits without `dosing_amounts`, aggregates per pool and per tech, distributes customer revenue evenly across pools, calculates margin and flagging, returns `ProfitabilityData`.
- `exportProfitabilityCsv(startDate, endDate)` — owner-only CSV with all pool data.
- `updateChemicalProductCost(productId, costPerUnit)` — withRls update on `chemical_products.cost_per_unit`.
- `updateProfitMarginThreshold(thresholdPct)` — withRls update on `org_settings.chem_profit_margin_threshold_pct`.

**`src/lib/alerts/constants.ts`**:
- Added `"unprofitable_pool"` to `AlertType` union.
- Added `unprofitable_pool: number` to `AlertCounts` type.

**`src/actions/alerts.ts`**:
- Added `_generateUnprofitablePoolAlerts(orgId)` — uses adminDb, computes per-pool chemical cost from `dosing_amounts` (last 30 days), distributes revenue, flags pools below threshold, bulk inserts with `onConflictDoNothing()`.
- Wired into `generateAlerts()` after other generators.
- Updated `getAlertCountByType()` to count and return `unprofitable_pool`.

### Task 2: Profitability Dashboard UI, chemistry cost settings, settings wiring

**`src/components/reports/profitability-dashboard.tsx`** (new, 390 lines):
- `TimePeriodSelector` at top with period-change re-fetch via `useTransition`.
- 4 KPI cards: Total Chemical Cost, Service Revenue, Overall Margin (color-coded), Flagged Pools (red if > 0).
- Flagged Pools section at TOP (per locked decision) — red/yellow left-border cards per pool with severity badges. Green "all above threshold" message when none flagged.
- Per-Pool Profitability Table — sorted worst margin first, inline red/yellow/green margin % badges, Est. badge for estimated costs with tooltip.
- Threshold inline editor (pencil icon → number input → save/cancel) that calls `updateProfitMarginThreshold`.
- Per-Tech Chemical Cost section — Recharts horizontal BarChart + expandable rows showing per-chemical breakdown.
- CSV Export button (owner-only).

**`src/components/settings/chemistry-cost-settings.tsx`** (new, 140 lines):
- Table of active chemical products with editable cost-per-unit inputs.
- Uses controlled `string` state for decimal inputs per MEMORY.md critical pattern.
- Per-row Save button that calls `updateChemicalProductCost`.
- References Reports > Profitability tab in description text.

**`src/components/settings/settings-tabs.tsx`**:
- Added `ChemistryCostSettings` import and `chemicalProducts` prop.
- New "Chemical Costs" card in Service tab after Chemistry Targets.

**`src/app/(app)/settings/page.tsx`**:
- Fetches active chemical products via adminDb (org-scoped), passes as `chemicalProducts` to `SettingsTabs`.

**`src/app/(app)/reports/page.tsx`**:
- Added `getProfitabilityAnalysis` to `Promise.all` (owner-only, empty default for office).
- Replaced placeholder tab with `<ProfitabilityDashboard>`.
- Profitability tab trigger hidden for non-owner roles.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] alert-feed.tsx: `unprofitable_pool` missing from countByType record**
- **Found during:** Task 1 TypeScript check
- **Issue:** `countByType` used `Record<FilterValue, number>` where `FilterValue = "all" | AlertType`. Adding `unprofitable_pool` to `AlertType` made the existing record incomplete.
- **Fix:** Added `unprofitable_pool` to `FILTER_CHIPS` array and `countByType` record.
- **Files modified:** `src/components/alerts/alert-feed.tsx`
- **Commit:** 57bcf4c

**2. [Rule 2 - Missing field] `chem_profit_margin_threshold_pct` missing from OrgSettings TS interface**
- **Found during:** Task 2 — settings-tabs.tsx accessed `orgSettings?.chem_profit_margin_threshold_pct`
- **Issue:** The field exists in the DB schema but was not in the `OrgSettings` TypeScript interface or `DEFAULT_SETTINGS` in `company-settings.ts`.
- **Fix:** Added `chem_profit_margin_threshold_pct: string | null` to `OrgSettings`, added `"20"` default to `DEFAULT_SETTINGS`.
- **Files modified:** `src/actions/company-settings.ts`
- **Commit:** ecf7e29

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| `src/components/reports/profitability-dashboard.tsx` | FOUND |
| `src/components/settings/chemistry-cost-settings.tsx` | FOUND |
| Commit 57bcf4c (Task 1) | FOUND |
| Commit ecf7e29 (Task 2) | FOUND |
| `npm run build` | PASSED (clean, no errors or warnings) |
| `npx tsc --noEmit` | PASSED |
