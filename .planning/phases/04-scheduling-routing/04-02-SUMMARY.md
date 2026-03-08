---
phase: 04-scheduling-routing
plan: "02"
subsystem: scheduling
tags: [schedule-rules, holidays, drizzle, edge-functions, deno, server-actions, shadcn]

requires:
  - phase: 04-01
    provides: "route_stops, schedule_rules, holidays schema tables with RLS"

provides:
  - "Schedule rule CRUD server actions with automatic 4-week stop generation"
  - "Holiday management server actions with route_stop status sync"
  - "ScheduleRuleDialog component for creating/editing rules"
  - "HolidayCalendar component with US holiday suggestions"
  - "generate-schedule Deno Edge Function for pg_cron weekly trigger"
  - "/schedule placeholder page with rules list and holiday calendar"
  - "/dispatch placeholder page for future map"

affects: [04-03, 04-04, 04-05, 04-06, 04-07]

tech-stack:
  added: []
  patterns:
    - "generateDatesForRule: date algo computing weekly/biweekly/monthly/custom service dates from anchor"
    - "Batch fetch pattern: gather unique IDs, single inArray() query per table, build Map for O(1) lookups"
    - "Destructive regeneration on frequency change: delete future stops, regenerate from today"
    - "Edge Function uses jsr:@supabase/supabase-js@2 (matches existing send-service-report pattern)"

key-files:
  created:
    - "src/actions/schedule.ts — Full schedule CRUD + holiday CRUD + route stop helpers + migration"
    - "src/components/schedule/schedule-rule-dialog.tsx — Create/edit dialog with customer/pool/tech/freq selectors"
    - "src/components/schedule/holiday-calendar.tsx — Holiday list with US suggestions and add/delete flow"
    - "supabase/functions/generate-schedule/index.ts — Deno Edge Function for rolling 4-week generation"
    - "src/app/(app)/schedule/page.tsx — Schedule rules list page with dialog and holiday section"
    - "src/app/(app)/schedule/loading.tsx — Skeleton matching schedule table layout"
    - "src/app/(app)/dispatch/page.tsx — Dispatch placeholder page"
    - "src/app/(app)/dispatch/loading.tsx — Skeleton with map area + sidebar"
  modified:
    - "src/lib/db/schema/relations.ts — Phase 4 relations already present (04-01 added them)"

key-decisions:
  - "generateDatesForRule uses fast-forward from anchor: advance in N-day steps from anchor until >= windowStart, then collect until windowEnd — avoids day-by-day iteration across large gaps"
  - "Monthly frequency: advance by calendar month steps (not 30-day steps) to respect month boundaries; clamp to month-end for short months (Feb 28/29)"
  - "Destructive frequency change: delete future stops and regenerate from today on frequency update — simpler than surgical diff; data loss is intentional and communicated in UI with warning"
  - "Holiday status sync: createHoliday marks existing 'scheduled' stops as 'holiday'; deleteHoliday resets 'holiday' stops to 'scheduled' — bidirectional sync maintains stop visibility"
  - "ScheduleRuleDialog receives customers/pools/techs as props from server component — avoids client-side data fetching, consistent with project pattern"
  - "Edge Function uses jsr:@supabase/supabase-js@2 not esm.sh — matches existing send-service-report pattern in the project"
  - "schedule.ts created from scratch (not extended) — 04-01 had not run yet when 04-02 executed; both are wave 1 plans"

patterns-established:
  - "Schedule actions pattern: getRlsToken() + userRole/orgId guard + withRls(token, ...) + revalidatePath"
  - "HolidayCalendar optimistic updates: setHolidays on client before server confirms, toast on result"
  - "ScheduleRuleDialog: plain useState + inline validation, no zod/hookform (project-wide decision)"

requirements-completed:
  - SCHED-02
  - SCHED-03

duration: 10min
completed: 2026-03-08
---

# Phase 04 Plan 02: Recurring Schedule System Summary

**Schedule rule CRUD with 4-week rolling stop generation, holiday calendar management, and a Deno Edge Function for pg_cron-triggered weekly generation**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-08T23:31:49Z
- **Completed:** 2026-03-08T23:42:28Z
- **Tasks:** 2
- **Files modified:** 8 created, 0 modified

## Accomplishments

- Built complete schedule rule CRUD with automatic stop generation on create and destructive regeneration on frequency change
- Built holiday management with bidirectional route_stop status sync (add holiday marks stops as 'holiday', remove resets to 'scheduled')
- Created generate-schedule Deno Edge Function using the same date algorithm as server actions for consistency
- Placeholder /schedule and /dispatch pages render correctly for owner/office roles

## Task Commits

1. **Task 1: Build schedule rule CRUD, holiday management, and generation logic** - `1da6d08` (feat)
2. **Task 2: Create Edge Function for rolling schedule generation and placeholder pages** - `0d38d58` (feat)

**Plan metadata:** (docs commit to follow)

## Files Created/Modified

- `src/actions/schedule.ts` — Schedule rule CRUD (create/update/delete with stop generation), holiday CRUD, route stop helpers, migration action
- `src/components/schedule/schedule-rule-dialog.tsx` — Dialog for creating/editing schedule rules with customer/pool/tech/frequency selectors
- `src/components/schedule/holiday-calendar.tsx` — Holiday list with year selector, US holiday suggestions panel, add form, delete with confirmation
- `supabase/functions/generate-schedule/index.ts` — Deno Edge Function: fetches all active rules + holidays, generates stops for next 28 days, idempotent upsert
- `src/app/(app)/schedule/page.tsx` — Schedule rules list with Add Rule button, desktop table, mobile stacked rows, HolidayCalendar card
- `src/app/(app)/schedule/loading.tsx` — Skeleton loading state matching schedule table
- `src/app/(app)/dispatch/page.tsx` — Placeholder dispatch page with "coming soon" map area
- `src/app/(app)/dispatch/loading.tsx` — Skeleton with map rectangle and sidebar tech list

## Decisions Made

- **Date algorithm**: Fast-forward from anchor using modular arithmetic (not day-by-day iteration) for efficiency with distant anchors
- **Monthly frequency**: Calendar month advancement instead of 30-day steps; clamps to month-end for short months (Feb edge case handled)
- **Destructive frequency change**: Deletes all future stops and regenerates rather than diffing — simpler, predictable, communicated with UI warning in dialog
- **Edge Function import**: Uses `jsr:@supabase/supabase-js@2` to match existing send-service-report pattern rather than esm.sh from plan template
- **schedule.ts created fresh**: 04-01 and 04-02 are wave 1 (parallel) plans; 04-01 had not run when 04-02 executed, so schedule.ts was created from scratch per the plan's parallel-execution note

## Deviations from Plan

None — plan executed exactly as written. The schema files (route-stops.ts, schedule-rules.ts, holidays.ts) and relations.ts already existed from plan 04-01, which was in the same wave.

## User Setup Required

**pg_cron configuration required for automatic weekly generation.**

The generate-schedule Edge Function must be triggered via pg_cron for automated weekly stop generation. Setup instructions are in the Edge Function file header comment. Manual steps:

1. Enable `pg_cron` extension: Supabase Dashboard > Database > Extensions > pg_cron
2. Enable `pg_net` extension (for HTTP calls from cron)
3. Run in SQL Editor:
   ```sql
   SELECT cron.schedule(
     'generate-weekly-schedule',
     '0 2 * * 1',
     $$ SELECT net.http_post(
       url := current_setting('app.supabase_url') || '/functions/v1/generate-schedule',
       headers := jsonb_build_object(
         'Content-Type', 'application/json',
         'Authorization', 'Bearer ' || current_setting('app.service_role_key')
       )
     ); $$
   );
   ```

## Next Phase Readiness

- Schedule rule CRUD and stop generation are ready for plan 04-03 (route builder)
- `getScheduleRules()` and `getStopsForDay()` are available for the split-view calendar
- `updateStopOrder()` and `assignStopToRoute()` are ready for drag-and-drop reordering
- Edge Function exists and is deployable: `supabase functions deploy generate-schedule`
- /schedule and /dispatch routes are accessible; sidebar nav activation depends on 04-01 execution

---
## Self-Check: PASSED

All 8 files created and found. Both task commits verified (1da6d08, 0d38d58). SUMMARY.md present.

*Phase: 04-scheduling-routing*
*Completed: 2026-03-08*
