---
phase: 10-smart-features-ai
plan: "06"
subsystem: scheduling
tags: [weather, open-meteo, cron, reschedule, postgres, drizzle, rls, react, server-actions]

requires:
  - phase: 10-01
    provides: Open-Meteo client (fetchWeatherForecast, classifyWeatherDay) and WeatherType types
  - phase: 04-scheduling-routing
    provides: route_stops table, getStopsForDay pattern
  - phase: 05-office-operations-dispatch
    provides: alerts page pattern, cron endpoint pattern (dunning)

provides:
  - weather_reschedule_proposals table with RLS (owner+office only)
  - findRescheduleSlots() engine: scores candidates by tech load, geo proximity, preferred day
  - checkWeatherForOrg(): daily forecast check that creates proposals for severe weather days
  - approveProposal(): applies reschedules to route_stops, returns affected customer IDs for notification
  - denyProposal(): marks proposal denied, no route changes
  - getPendingProposals(): returns pending proposals for current org
  - manualWeatherCheck(startDate, endDate): office-initiated weather check (SMART-06)
  - GET /api/cron/weather-check: daily cron endpoint protected by CRON_SECRET
  - RescheduleProposalCard: expandable stops list, per-customer notification opt-out, approve/deny
  - WeatherProposalsSection: client wrapper on Alerts page
  - WeatherCheckTrigger: date-range popover on Schedule page header

affects:
  - "10-08 (notifications): approveProposal returns affectedCustomerIds — Plan 08 wires the actual customer notification send"
  - "10-07 (alerts): weather proposals shown above regular alerts on /alerts page"

tech-stack:
  added: []
  patterns:
    - "adminDb for weather cron operations (no user JWT context at cron runtime)"
    - "checkWeatherForOrg checks existing proposals to avoid duplicates (affected_date UNIQUE per org)"
    - "Haversine + centroid scoring for geographic proximity in reschedule engine"
    - "Client-side dismiss-on-action pattern: dismissed IDs in useState, router.refresh() for sidebar count"
    - "Inline popover pattern for action triggers (no shadcn Dialog needed for simple date range + button)"

key-files:
  created:
    - src/lib/db/schema/weather-proposals.ts
    - src/lib/db/migrations/0011_fresh_maginty.sql
    - src/lib/weather/reschedule-engine.ts
    - src/actions/weather.ts
    - src/app/api/cron/weather-check/route.ts
    - src/components/weather/reschedule-proposal-card.tsx
    - src/components/weather/weather-proposals-section.tsx
    - src/components/schedule/weather-check-trigger.tsx
  modified:
    - src/lib/db/schema/index.ts
    - src/lib/db/schema/relations.ts
    - src/app/(app)/alerts/page.tsx
    - src/app/(app)/schedule/page.tsx

key-decisions:
  - "adminDb for all weather cron operations — checkWeatherForOrg runs without user JWT context"
  - "Duplicate proposal guard: check existing proposals by (org_id, affected_date) before inserting — prevents re-runs from creating duplicate pending proposals"
  - "Reschedule engine uses haversine + centroid scoring with 3 weighted factors (load 40%, proximity 35%, preferred day 25%)"
  - "approveProposal returns affectedCustomerIds (notification send deferred to Plan 10-08)"
  - "notify_customers defaults to true with opt-out per user decision: auto-notify with opt-out"
  - "Rain type: shouldReschedule=false in open-meteo.ts — only storm/heat/wind trigger proposals"
  - "WeatherCheckTrigger uses inline popover (not Dialog) for minimal overhead"
  - "Client-side dismiss-on-action in WeatherProposalsSection avoids full page reload on approve/deny"

patterns-established:
  - "Weather cron: GET handler (not POST) consistent with external cron service calling pattern"
  - "Proposal dedup: query before insert to avoid unique constraint errors"

requirements-completed:
  - SMART-04
  - SMART-06

duration: 10min
completed: 2026-03-16
---

# Phase 10 Plan 06: Weather-Aware Scheduling Summary

**Daily weather cron + manual trigger that creates reschedule proposals for severe-weather service days, with office approve/deny workflow, per-customer notification opt-out, and smart slot finder using geo proximity + tech load scoring.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-16T17:28:20Z
- **Completed:** 2026-03-16T17:38:24Z
- **Tasks:** 2
- **Files modified:** 12 (8 created, 4 modified)

## Accomplishments

- Drizzle migration 0011 adds `weather_reschedule_proposals` table with JSONB columns for affected stops, proposed reschedules, and per-customer notification exclusions
- Reschedule engine scores candidate days by tech load (40%), geographic proximity (35%), and customer preferred day (25%) using haversine distance to stop centroid
- Manual weather check (SMART-06) allows office to trigger on-demand forecast checks from Schedule page for any date range — not just waiting for the daily 6am cron
- One-click approve applies all proposed reschedules to route_stops; per-customer notification opt-out list built into the approval UI

## Task Commits

1. **Task 1: Weather proposals schema, reschedule engine, and server actions** - `2484f66` (feat)
2. **Task 2: Weather cron, proposal UI, alerts integration, and schedule page trigger** - `370c06f` (feat)

## Files Created/Modified

- `src/lib/db/schema/weather-proposals.ts` - weather_reschedule_proposals table, RLS policies
- `src/lib/db/migrations/0011_fresh_maginty.sql` - Drizzle migration
- `src/lib/weather/reschedule-engine.ts` - findRescheduleSlots() with haversine + load scoring
- `src/actions/weather.ts` - checkWeatherForOrg, manualWeatherCheck, approveProposal, denyProposal, getPendingProposals, updateProposalNotifications
- `src/app/api/cron/weather-check/route.ts` - GET handler, CRON_SECRET auth, iterates all orgs
- `src/components/weather/reschedule-proposal-card.tsx` - weather icon, expandable stops, notification opt-out, approve/deny buttons
- `src/components/weather/weather-proposals-section.tsx` - client wrapper, dismiss-on-action, router.refresh()
- `src/components/schedule/weather-check-trigger.tsx` - date range popover, Check Forecast button, results summary
- `src/lib/db/schema/index.ts` - export weather-proposals
- `src/lib/db/schema/relations.ts` - weatherRescheduleProposalsRelations (org, approvedBy)
- `src/app/(app)/alerts/page.tsx` - WeatherProposalsSection above regular alerts, parallel fetch
- `src/app/(app)/schedule/page.tsx` - WeatherCheckTrigger in header alongside WorkloadBalancerTrigger

## Decisions Made

- **adminDb throughout**: weather cron and approveProposal run without user JWT context; explicit org_id param enforces data isolation
- **Duplicate proposal guard**: query existing proposals by (org_id, affected_date) before creating — prevents re-running cron from duplicating pending proposals
- **Rain shouldReschedule=false**: the open-meteo.ts classifier already marks heavy rain as `shouldReschedule: false` — only storm/heat/wind trigger proposals; this is by design per 10-RESEARCH.md thresholds
- **Notification opt-out fires separate action**: `updateProposalNotifications()` is called fire-and-forget when user toggles individual customers — doesn't block the UI
- **approveProposal returns affectedCustomerIds**: Plan 10-08 wires actual notification sends; this plan just identifies who to notify

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

Pre-existing TypeScript build errors in `company-settings.ts`, `invoices.ts`, `stop-workflow.tsx`, and `billing/page.tsx` exist from other Phase 10 plans. These errors are entirely out-of-scope (not caused by Plan 10-06 changes) and are documented in `.planning/phases/10-smart-features-ai/deferred-items.md`. All new Plan 10-06 files compile cleanly (`npx tsc --noEmit` shows 0 errors for weather-related files).

## Next Phase Readiness

- `approveProposal()` returns `affectedCustomerIds` — Plan 10-08 (push notifications) can wire in customer reschedule notifications
- Weather proposals table ready for Plan 10-07 alert integration if needed
- Cron URL to configure in external cron service: `GET https://your-domain.com/api/cron/weather-check` with `Authorization: Bearer $CRON_SECRET` header, schedule at 6am daily

---
*Phase: 10-smart-features-ai*
*Completed: 2026-03-16*
