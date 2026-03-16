---
phase: 10-smart-features-ai
plan: 02
subsystem: chemistry
tags: [chemistry, alerts, ols, linear-regression, prediction, dashboard, tech-ui]

requires:
  - phase: 10-smart-features-ai
    plan: 01
    provides: "OLS computeLinearTrend() and chemistry prediction infrastructure"
  - phase: 05-office-operations-dispatch
    provides: "Alert generation framework, generateAlerts, getActiveAlerts, alert schema"
  - phase: 03-field-tech-app
    provides: "StopCard, StopList, stop-card WeatherBadge pattern for tech UI badges"

provides:
  - "OLS regression-based predictive chemistry alert generation with R-squared confidence gate"
  - "getPredictiveAlerts() for office dashboard and alert feed"
  - "getPredictiveAlertsForPools() for tech stop-card badge integration (adminDb)"
  - "Predictive Trends filter chip and AlertCard rendering with trend icons + disclaimer"
  - "Dashboard predictive alert summary section (top 3 with customer links)"
  - "Tech stop cards show per-pool predictive alert badge before arrival"

affects:
  - 10-smart-features-ai plans that display chemistry trend data
  - Customer portal chemistry alert notification (Plan 10-10)

tech-stack:
  added: []
  patterns:
    - "adminDb for tech-facing predictive alert queries — bypasses owner+office RLS on alerts table"
    - "StopPredictiveAlert as serializable Record<poolId, alert> for client component prop"
    - "getPredictiveAlertsForPools Map-to-Record conversion for Next.js serialization"
    - "PredictiveChemistryDetail sub-component pattern in AlertCard for type-specific rendering"

key-files:
  created: []
  modified:
    - src/actions/alerts.ts
    - src/lib/alerts/constants.ts
    - src/components/alerts/alert-card.tsx
    - src/components/alerts/alert-feed.tsx
    - src/app/(app)/alerts/page.tsx
    - src/app/(app)/dashboard/page.tsx
    - src/components/field/stop-card.tsx
    - src/components/field/stop-list.tsx
    - src/app/(app)/routes/page.tsx

key-decisions:
  - "adminDb for getPredictiveAlertsForPools: techs have no SELECT on alerts table (owner+office RLS); server component calls adminDb to fetch pool-level alerts for display"
  - "R-squared >= 0.4 threshold: filters noisy trends before generating alerts — matches dosing engine history modifier threshold from Plan 10-01"
  - "MIN_VISITS_FOR_PREDICTION=6 (6-week minimum data), CONFIDENT_PREDICTION_THRESHOLD=12 (3-month mark for isEarlyPrediction flag)"
  - "10% margin past target bounds for alert trigger: projectedNext < targetMin * 0.9 and > targetMax * 1.1 — avoids borderline alerts"
  - "onConflictDoNothing on (org_id, alert_type, reference_id): one active predictive alert per pool — severity info for early, warning for confident"
  - "Record<poolId, StopPredictiveAlert> not Map: Next.js requires serializable server component props; Map cannot cross server→client boundary"

requirements-completed:
  - SMART-02

duration: 11min
completed: 2026-03-16
---

# Phase 10 Plan 02: Predictive Chemistry Alerts Summary

**OLS regression on per-pool chemistry reading history generates predictive trend alerts visible to office on Alerts page and Dashboard, and as compact badge on tech stop cards**

## Performance

- **Duration:** 11 min
- **Started:** 2026-03-16T17:32:35Z
- **Completed:** 2026-03-16T17:43:35Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- `_generatePredictiveChemistryAlerts()` queries 6 months of per-pool chemistry history, runs `computeLinearTrend` on each parameter, creates `predictive_chemistry` alerts when R² >= 0.4 and projected next value breaches target range by 10% margin
- Early prediction disclaimer (< 12 visits = < 3 months) stored in metadata as `isEarlyPrediction: true` with `severity: "info"` vs `"warning"` for confident predictions
- `getPredictiveAlerts()` for office/dashboard (withRls) and `getPredictiveAlertsForPools()` for tech stop-card display (adminDb — bypasses owner+office-only RLS)
- `AlertCard` extended with `PredictiveChemistryDetail` sub-component showing TrendingDown/TrendingUp icon, projected value vs target range, early-prediction disclaimer badge; card wraps in Link to customer profile
- Dashboard shows top 3 predictive alerts in additive section (hidden when no alerts); each row links to customer profile
- Tech stop cards show compact amber badge with trend icon and parameter name; "Early prediction" annotated for low-confidence alerts

## Task Commits

1. **Task 1: Extend generateAlerts with predictive chemistry analysis** - `9f08b25` (feat)
2. **Task 2: Display predictive alerts on Alerts page, Dashboard, and tech stop cards** - `f3df48b` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `src/actions/alerts.ts` - Added `_generatePredictiveChemistryAlerts`, `getPredictiveAlerts`, `getPredictiveAlertsForPools`; updated `generateAlerts` call chain and `getAlertCountByType`
- `src/lib/alerts/constants.ts` - Added `predictive_chemistry` to `AlertType` union and `AlertCounts` type
- `src/components/alerts/alert-card.tsx` - Added `PredictiveChemistryDetail` with trend icons + early-prediction disclaimer; Link wrapper for customer navigation
- `src/components/alerts/alert-feed.tsx` - Added Predictive Trends filter chip; added `predictive_chemistry` count in countByType
- `src/app/(app)/alerts/page.tsx` - No structural change; AlertFeed now handles predictive_chemistry via alert-card updates
- `src/app/(app)/dashboard/page.tsx` - Added `getPredictiveAlerts()` fetch; Predictive Chemistry Trends section with top 3
- `src/components/field/stop-card.tsx` - Added `StopPredictiveAlert` interface and `predictiveAlert` prop; Row 5 alert badge with trend icon
- `src/components/field/stop-list.tsx` - Added `predictiveAlerts: Record<string, StopPredictiveAlert>` prop; passed to each `SortableStopCard`
- `src/app/(app)/routes/page.tsx` - Fetch `getPredictiveAlertsForPools()`, convert Map to Record, pass to `StopList`

## Decisions Made

- **adminDb for tech predictive alerts**: RLS on alerts table restricts SELECT to owner+office only. Techs legitimately need to see trend badges for their pools. Server component fetches alerts via adminDb with explicit org_id filter — security equivalent to RLS scope.
- **Record not Map for client boundary**: Map is not JSON-serializable. Server component props must be plain JSON. Converted `Map<poolId, alert>` to `Record<poolId, alert>` before passing to `StopList`.
- **R² >= 0.4 (inherited from Plan 10-01)**: Matches the threshold already used by the dosing engine history modifier. Consistent threshold prevents inconsistency between alert generation and dose adjustment logic.
- **`onConflictDoNothing` per pool_id**: The unique constraint is `(org_id, alert_type, reference_id)`. Using pool_id as `reference_id` means one active predictive alert per pool — prevents alert flood if generateAlerts runs on every page load.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

Pre-existing TypeScript errors in `company-settings.ts`, `billing/page.tsx`, `wo-labor-section.tsx`, `stop-workflow.tsx` cause build failure. These are from incomplete schema migrations in prior phases — confirmed pre-existing before this plan (same errors in git stash test). Not introduced by our changes. Logged to deferred items.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `getPredictiveAlerts()` ready to be called from customer portal for Plan 10-10 (`chemistry_alert` notification type)
- `predictive_chemistry` AlertType added to constants — Plan 10-10 can filter on this type for customer-facing notifications
- Stop card badge pattern (`StopPredictiveAlert` prop) established — reusable for future stop-level badges (equipment alerts, overdue balance, etc.)

---
*Phase: 10-smart-features-ai*
*Completed: 2026-03-16*

## Self-Check: PASSED

- FOUND: src/actions/alerts.ts
- FOUND: src/lib/alerts/constants.ts
- FOUND: src/components/alerts/alert-card.tsx
- FOUND: src/components/alerts/alert-feed.tsx
- FOUND: src/app/(app)/dashboard/page.tsx
- FOUND: src/components/field/stop-card.tsx
- FOUND: src/components/field/stop-list.tsx
- FOUND: src/app/(app)/routes/page.tsx
- FOUND commit: 9f08b25 (Task 1)
- FOUND commit: f3df48b (Task 2)
