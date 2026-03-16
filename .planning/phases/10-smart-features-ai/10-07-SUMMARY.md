---
phase: 10-smart-features-ai
plan: 07
subsystem: ui
tags: [weather, open-meteo, field-tech, route-view, badges, stop-card]

requires:
  - phase: 10-smart-features-ai
    provides: "Open-Meteo weather client (fetchWeatherForecast, classifyWeatherDay, WeatherType)"

provides:
  - "WeatherBadge component for rain/storm/heat/wind/clear conditions"
  - "getRouteAreaCoordinates() helper — single lat/lng lookup for daily route forecast"
  - "Weather prop threading from routes page through StopList to StopCard"

affects:
  - "Any future plan extending StopCard or the tech route view"

tech-stack:
  added: []
  patterns:
    - "Daily route-area weather fetch — one forecast call per page load, shared across all stop cards"
    - "Null-as-clear pattern — weather=null means no badge; only non-clear conditions pass a non-null value"
    - "getRouteAreaCoordinates uses first geocoded customer in org — fast single query, good-enough area approximation"

key-files:
  created:
    - src/components/weather/weather-badge.tsx
  modified:
    - src/actions/routes.ts
    - src/components/field/stop-card.tsx
    - src/components/field/stop-list.tsx
    - src/app/(app)/routes/page.tsx

key-decisions:
  - "Daily forecast per route (not per-stop hourly) — all stops share one badge; pool routes are <30mi radius so one point is adequate"
  - "null-as-clear propagation — routes page sets todayWeather=null for clear days so StopCard renders nothing; no 'Clear' badge clutters the UI"
  - "getRouteAreaCoordinates queries first geocoded customer in org — stops' customer IDs passed in but query just gets any geocoded customer; intentional approximation"
  - "WeatherBadge uses hex rgba colors (not oklch) — consistent with design system rule for small decorative elements"
  - "weather prop optional on StopCard — backward compatible; other usages of StopCard outside the route list don't need to pass it"

requirements-completed:
  - SMART-05

duration: 7min
completed: 2026-03-16
---

# Phase 10 Plan 07: Weather Badges on Tech Route View Summary

**WeatherBadge component + daily Open-Meteo forecast integration showing rain/storm/heat/wind alerts on each stop card in the tech's route view**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-16T17:32:31Z
- **Completed:** 2026-03-16T17:39:16Z
- **Tasks:** 1
- **Files modified:** 5

## Accomplishments
- WeatherBadge pill component with CloudRain/CloudLightning/Thermometer/Wind icons and color-coded hex backgrounds per weather type
- getRouteAreaCoordinates() server action helper fetches first geocoded customer for route area lat/lng
- Routes page fetches one daily forecast after stop list loads; clear weather skips the weather fetch result (no badge)
- StopList and StopCard threaded with weather prop — all stops share the same badge since this is a daily area forecast
- Clear days show zero badge clutter; only rain/storm/heat/wind conditions display

## Task Commits

Each task was committed atomically:

1. **Task 1: Weather badge component and route view integration** - `c09f217` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `src/components/weather/weather-badge.tsx` - WeatherBadge component; renders pill badge for rain/storm/heat/wind; returns null for clear
- `src/actions/routes.ts` - Added getRouteAreaCoordinates() helper; queries first geocoded customer for route area coordinates
- `src/components/field/stop-card.tsx` - Added optional weather prop; renders WeatherBadge in header row next to customer name
- `src/components/field/stop-list.tsx` - Added weather prop; passes through to each SortableStopCard and StopCard
- `src/app/(app)/routes/page.tsx` - Fetches route area coordinates + daily forecast after stop list loads; passes todayWeather to StopList

## Decisions Made

- **Daily forecast, not per-stop hourly**: Per-stop hourly forecasts would require one API call per stop coordinate — excessive and unnecessary. Pool service routes are typically within a 20-30 mile radius, so one daily forecast for the area is accurate enough and practical.
- **null-as-clear pattern**: The routes page only sets `todayWeather` when the classification is non-clear. StopCard checks `weather && weather.type !== 'clear'` as a double-guard. Clean days render nothing — no badge noise when conditions are fine.
- **Hex rgba for badge colors**: WeatherBadge uses `rgba(...)` hex-derived colors, not oklch, consistent with the project convention that small decorative elements use hex fallbacks for broad CSS/WebGL compatibility.
- **Optional weather prop on StopCard**: Makes the prop optional (`weather?`) so existing usages of StopCard outside the route list (if any) remain backward compatible without passing weather.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Pre-existing TypeScript build failures in `company-settings.ts`, `invoices.ts`, `quotes.ts`, and `portal-auth.ts` (logo_url, labor_hours, getBillingInsights errors from incomplete migrations in prior phases) — documented in Phase 10-01 SUMMARY and in deferred items. Zero TypeScript errors in any files this plan created or modified.

## User Setup Required

None - Open-Meteo API requires no key. Weather fetch gracefully skips when no geocoded customer coordinates exist in the org.

## Next Phase Readiness

- WeatherBadge component ready for reuse anywhere in the app (e.g., schedule page, dispatch view)
- getRouteAreaCoordinates() can be called before any weather-related feature needing a route's location
- classifyWeatherDay from 10-01 is now consumed in production — the full weather pipeline (API → classify → badge) is live

---
*Phase: 10-smart-features-ai*
*Completed: 2026-03-16*
