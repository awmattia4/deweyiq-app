---
phase: 10-smart-features-ai
plan: 01
subsystem: chemistry
tags: [chemistry, weather, open-meteo, machine-learning, ols, linear-regression, dosing]

requires:
  - phase: 03-field-tech-app
    provides: "Chemistry dosing engine (dosing.ts) and target ranges (targets.ts)"
  - phase: 09-reporting-team-analytics
    provides: "Chemistry reading history stored per service visit"
provides:
  - "Open-Meteo REST API client with weather classification"
  - "OLS linear regression for chemistry trend analysis"
  - "Weather and history modifiers on dosing engine with badge metadata"
affects:
  - 10-smart-features-ai plans that extend dosing or chemistry display
  - completion-modal.tsx (will eventually wire context.temperature_f from weather API)

tech-stack:
  added: []
  patterns:
    - "Open-Meteo fetch with next: { revalidate: 3600 } for 1-hour server-side cache"
    - "DosingContext optional parameter pattern — backward-compatible smart modifier injection"
    - "DoseModifier[] on DosingRecommendation for UI badge rendering"
    - "OLS regression with evenly-spaced x-axis (visit index, not timestamp)"

key-files:
  created:
    - src/lib/weather/open-meteo.ts
    - src/lib/chemistry/prediction.ts
    - src/lib/chemistry/__tests__/prediction.test.ts
  modified:
    - src/lib/chemistry/dosing.ts

key-decisions:
  - "OLS x-axis is visit index (0,1,2...) not timestamp — evenly-spaced visits; avoids need to parse date diffs"
  - "Modifiers stack additively (not multiplicatively) — avoids compounding effects (15% + 10% = 25%, not 26.5%)"
  - "History modifier requires R² >= 0.4 — filters noisy trends before applying preemptive adjustments"
  - "10% margin past target bounds for history modifier — avoids triggering on borderline projections"
  - "getTemperatureForToday convenience wrapper — dosing callers pass single float, not full forecast object"
  - "CHLORINE_CHEMICALS set pattern — weather modifier scope-limited without chemical-type enum"

requirements-completed:
  - SMART-01

duration: 4min
completed: 2026-03-16
---

# Phase 10 Plan 01: Smart Chemical Dosing Summary

**Open-Meteo weather client + OLS regression enabling weather- and history-aware chlorine dose adjustments with badge metadata for UI rendering**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-16T17:05:19Z
- **Completed:** 2026-03-16T17:09:07Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Open-Meteo API client fetches 7-day daily forecast (temp/precip/wind/WMO code) with 1-hour server cache
- WMO code classification into clear/rain/storm/heat/wind with shouldReschedule flag
- Pure TypeScript OLS regression (no deps) with outlier clamping, R², projected-next extrapolation
- Dosing engine extended with weather modifier (+25%/+15%/-10% chlorine at temp thresholds) and history modifier (±10% preemptive on confirmed trends)
- 9 new prediction tests + all 11 existing dosing tests still pass (39 total chemistry tests green)

## Task Commits

Each task was committed atomically:

1. **Task 1: Open-Meteo client and OLS regression function** - `bdec0e4` (feat)
2. **Task 2: Enhance dosing engine with weather and history modifiers** - `fa473bc` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `src/lib/weather/open-meteo.ts` - Open-Meteo API client; fetchWeatherForecast, classifyWeatherDay, getTemperatureForToday
- `src/lib/chemistry/prediction.ts` - OLS linear regression; computeLinearTrend + TrendResult type
- `src/lib/chemistry/__tests__/prediction.test.ts` - 9 tests covering known-linear, constant, noisy, negative, outlier-clamping, min-points cases
- `src/lib/chemistry/dosing.ts` - Enhanced with DosingContext, DoseModifier, weather + history modifier logic

## Decisions Made

- **OLS x-axis = visit index**: Avoids timestamp arithmetic; service visits are treated as evenly-spaced intervals. Simpler and adequate for trend detection in pool chemistry.
- **Additive modifier stacking**: Weather +15% and history +10% add to +25% total. Multiplicative stacking (1.15 × 1.10 = +26.5%) adds unnecessary compounding for marginal difference.
- **R² >= 0.4 threshold**: Below this, the trend is too noisy to be actionable. Prevents random fluctuations from triggering preemptive dose changes.
- **10% margin past bounds for history modifier**: `projectedNext < target.min * 0.9` (not just `< target.min`). Avoids triggering on projections that only narrowly miss the target range.
- **`CHLORINE_CHEMICALS` Set**: Contains sodiumHypochlorite_12pct and calciumHypochlorite_67pct. Clean way to scope weather modifier without adding a chemical-category enum to the schema.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Pre-existing TypeScript errors exist in `src/actions/company-settings.ts`, `invoices.ts`, `quotes.ts`, and `portal-auth.ts` relating to schema fields (`logo_url`, `labor_hours`, `is_default`, `requires_photo`) from incomplete migrations in prior phases. These are out of scope for this plan and logged to deferred items. No errors in any files this plan created or modified.

## User Setup Required

None - no external service configuration required. The Open-Meteo API is free and requires no API key.

## Next Phase Readiness

- `fetchWeatherForecast` + `getTemperatureForToday` ready to be called from completion-modal.tsx or a server action when a tech starts a stop
- `computeLinearTrend` ready to be fed historical `service_visits.chemistry_readings` data
- `generateDosingRecommendations` accepts `context.temperature_f` and `context.historyReadings` — wiring these in from the stop workflow is the natural next integration point
- Phase 10 Plan 02 (weather-based rescheduling alerts) can reuse `classifyWeatherDay` directly

---
*Phase: 10-smart-features-ai*
*Completed: 2026-03-16*
