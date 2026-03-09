---
phase: 05-office-operations-dispatch
plan: 01
subsystem: database
tags: [drizzle, postgres, rls, supabase, edge-function, twilio, sms, resend, email, notifications]

# Dependency graph
requires:
  - phase: 04-scheduling-routing
    provides: route_stops table (pre_arrival_sent_at column added here)
  - phase: 02-customer-pool-data-model
    provides: customers table (notifications_enabled column added here)
  - phase: 01-foundation
    provides: orgs table (FK anchor for alerts/org_settings), withRls pattern, Edge Function pattern

provides:
  - alerts table with dismiss/snooze lifecycle and dedup unique constraint
  - org_settings table with notification toggles and configurable service requirements
  - customers.notifications_enabled column (per-customer pre-arrival opt-out)
  - route_stops.pre_arrival_sent_at column (idempotency for pre-arrival sends)
  - send-pre-arrival Edge Function (Twilio SMS + Resend email fallback)

affects: [05-02, 05-03, 05-04, 05-05, 05-06]

# Tech tracking
tech-stack:
  added: [Twilio REST API via raw fetch (no npm package), send-pre-arrival Edge Function]
  patterns:
    - Raw fetch + URLSearchParams + btoa HTTP Basic auth for Twilio in Deno
    - Same Edge Function structure as send-service-report (CORS, admin client, idempotency)
    - Per-customer notification opt-out via notifications_enabled column
    - Per-stop idempotency via pre_arrival_sent_at timestamp

key-files:
  created:
    - src/lib/db/schema/alerts.ts
    - src/lib/db/schema/org-settings.ts
    - supabase/functions/send-pre-arrival/index.ts
    - src/lib/db/migrations/0002_chunky_princess_powerful.sql
  modified:
    - src/lib/db/schema/customers.ts
    - src/lib/db/schema/route-stops.ts
    - src/lib/db/schema/index.ts
    - src/lib/db/schema/relations.ts

key-decisions:
  - "Twilio via raw fetch + URLSearchParams + btoa in Deno — Twilio npm package does not work in Deno runtime; verified community pattern"
  - "drizzle-kit push creates NULL RLS policies (confirmed again Phase 5) — manually recreated all 8 policies for alerts and org_settings via psql after push"
  - "org_settings SELECT allows all org members (owner, office, tech) — tech needs to read required chemistry/checklist config at stop completion time"
  - "Edge Function processes per-stop loop and updates pre_arrival_sent_at after each send — calling server action pre-filters, function adds safety net check"

requirements-completed: [NOTIF-01, NOTIF-03, NOTIF-04]

# Metrics
duration: 6min
completed: 2026-03-09
---

# Phase 05 Plan 01: Foundation Schema and Pre-Arrival Edge Function Summary

**alerts + org_settings tables with RLS, customers/route_stops extended, and Twilio SMS + Resend email Edge Function for pre-arrival notifications**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-03-09T00:02:20Z
- **Completed:** 2026-03-09T00:07:49Z
- **Tasks:** 2
- **Files modified:** 8 (4 created, 4 modified)

## Accomplishments

- alerts table with alert_type/severity lifecycle, dismiss/snooze timestamps, dedup unique constraint on (org_id, alert_type, reference_id), and owner+office-only RLS
- org_settings table with all notification toggles and configurable required_chemistry_by_sanitizer + required_checklist_task_ids JSONB columns, unique-per-org constraint, and all-members SELECT / owner-only write RLS
- customers.notifications_enabled boolean column (default true) for per-customer pre-arrival opt-out
- route_stops.pre_arrival_sent_at timestamp column for idempotency on notification sends
- send-pre-arrival Edge Function: Twilio SMS primary, Resend email fallback, per-stop pre_arrival_sent_at update, same structural pattern as send-service-report

## Task Commits

Each task was committed atomically:

1. **Task 1: Create alerts and org_settings schema tables with RLS, extend customers and route_stops** - `c7e4bac` (feat)
2. **Task 2: Create send-pre-arrival Supabase Edge Function with Twilio SMS and Resend email fallback** - `f7168ba` (feat)

**Plan metadata:** _(docs commit follows)_

## Files Created/Modified

- `src/lib/db/schema/alerts.ts` - alerts table with lifecycle columns, dedup unique constraint, RLS policies for owner+office
- `src/lib/db/schema/org-settings.ts` - org_settings table with notification/service requirement config, one-row-per-org unique constraint, RLS all-members SELECT
- `src/lib/db/schema/customers.ts` - Added notifications_enabled boolean column (default true)
- `src/lib/db/schema/route-stops.ts` - Added pre_arrival_sent_at timestamp column (nullable)
- `src/lib/db/schema/index.ts` - Added Phase 5 barrel exports for alerts and org-settings
- `src/lib/db/schema/relations.ts` - Added alertsRelations and orgSettingsRelations (both belong-to orgs)
- `src/lib/db/migrations/0002_chunky_princess_powerful.sql` - Full migration SQL for Phase 5 schema additions
- `supabase/functions/send-pre-arrival/index.ts` - Deno Edge Function: Twilio SMS primary, Resend email fallback, pre_arrival_sent_at idempotency update

## Decisions Made

- **Twilio via raw fetch in Deno:** The Twilio npm package does not work in Deno/Edge runtime. Used raw `fetch` with `URLSearchParams` body and `btoa()` for HTTP Basic auth — this is the verified community pattern for Twilio in Deno.
- **drizzle-kit NULL RLS policy pitfall (confirmed again):** After `drizzle-kit push`, all 8 policies on `alerts` and `org_settings` had NULL qual/with_check. Manually dropped and recreated all 8 policies via psql using the migration SQL conditions.
- **org_settings SELECT for all org members:** Tech role needs SELECT on org_settings to read required chemistry readings and checklist task IDs at stop completion time. Owner/office still have exclusive write access.

## Deviations from Plan

None — plan executed exactly as written.

Note: The drizzle-kit NULL RLS policy pitfall was anticipated in the plan (explicit verification step with recreate instructions). This is standard procedure, not a deviation.

## Issues Encountered

- drizzle-kit push without explicit DATABASE_URL env var in shell: had to prefix command with `DATABASE_URL=...` since dotenv is not loaded automatically for CLI tools
- drizzle-kit NULL RLS policy pitfall confirmed: 8 policies recreated via psql. Both expected per project memory.

## User Setup Required

Before `send-pre-arrival` Edge Function will deliver notifications in production:

1. **Twilio account:** Get Account SID, Auth Token, and buy a phone number
   ```bash
   supabase secrets set TWILIO_ACCOUNT_SID=ACxxxx TWILIO_AUTH_TOKEN=xxxx TWILIO_PHONE_NUMBER=+1xxxxxxxxxx
   ```
2. **Resend domain verification:** Verify sending domain in Resend Dashboard -> Domains
3. **Deploy function:**
   ```bash
   supabase functions deploy send-pre-arrival
   ```

## Next Phase Readiness

- All Phase 5 schema tables are in place: alerts, org_settings, with new columns on customers and route_stops
- send-pre-arrival Edge Function is complete and follows project patterns
- Plans 05-02 through 05-06 can now build server actions and UI on top of this foundation
- Twilio + Resend secrets must be configured in production before notifications will actually send

---
*Phase: 05-office-operations-dispatch*
*Completed: 2026-03-09*
