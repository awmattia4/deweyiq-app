---
phase: 10-smart-features-ai
plan: 13
subsystem: database, ui, alerts
tags: [drizzle, equipment, health-monitoring, rls, react, typescript]

requires:
  - phase: 05-office-operations-dispatch
    provides: alerts table and alert generation patterns (adminDb + onConflictDoNothing)
  - phase: 03-field-tech-app
    provides: completion-modal.tsx, stop-workflow.tsx, ChemInput decimal input pattern
  - phase: 02-customer-pool-data-model
    provides: equipment table and schema structure

provides:
  - equipment_readings table with JSONB metrics and RLS policies
  - logEquipmentReading, getEquipmentReadings, getEquipmentHealth, checkDegradation server actions
  - EquipmentReadingsSection component (collapsible, per-type metric inputs)
  - Health badges on customer profile equipment tab (Healthy/Degraded/Critical)
  - equipment_degradation alert type with createWoLink metadata

affects:
  - alerts page (new equipment_degradation filter chip)
  - stop-workflow (equipment readings logged after completion)
  - customer profile equipment tab (health badge display)

tech-stack:
  added: []
  patterns:
    - "Equipment health scoring: baseline (avg first 4) vs current (avg last 2) of 8-reading window"
    - "EquipmentMetrics as JSONB — equipment-type-specific fields in one flexible column"
    - "logEquipmentReading fire-and-forget after stop completion — non-fatal, non-blocking"

key-files:
  created:
    - src/lib/db/schema/equipment-readings.ts
    - src/actions/equipment-readings.ts
    - src/components/field/equipment-readings-section.tsx
    - src/lib/db/migrations/0010_married_swordsman.sql
  modified:
    - src/lib/db/schema/index.ts
    - src/lib/db/schema/relations.ts
    - src/actions/visits.ts
    - src/components/field/completion-modal.tsx
    - src/components/field/stop-workflow.tsx
    - src/components/customers/equipment-list.tsx
    - src/app/(app)/customers/[id]/page.tsx
    - src/lib/alerts/constants.ts
    - src/components/alerts/alert-feed.tsx

key-decisions:
  - "JSONB metrics column (not separate columns) — equipment types vary too widely for fixed schema"
  - "8-reading window for health scoring: baseline=avg first 4, current=avg last 2"
  - "30% drop = degraded, 50% drop = critical — matches plan spec"
  - "No health badge when <6 readings exist — avoids placeholder UI (MEMORY.md rule)"
  - "logEquipmentReading called fire-and-forget after stop completes — failure never blocks tech"
  - "checkDegradation uses adminDb (no RLS) — runs as cron/system context without user session"
  - "CompletionModal onConfirm signature changed to pass Record<equipmentId, EquipmentMetrics>"
  - "EquipmentReadingsSection starts collapsed — keeps tech stop view clean per success criteria"

requirements-completed:
  - SMART-08

duration: 11min
completed: 2026-03-16
---

# Phase 10 Plan 13: Equipment Performance Monitoring Summary

**equipment_readings table, health scoring with 30%/50% degradation thresholds, collapsible tech capture UI in stop completion, and clickable health badges on customer profile equipment tab**

## Performance

- **Duration:** 11 min
- **Started:** 2026-03-16T17:05:48Z
- **Completed:** 2026-03-16T17:17:15Z
- **Tasks:** 2
- **Files modified:** 9 modified, 4 created

## Accomplishments

- Created `equipment_readings` table with JSONB `metrics` column, full RLS policies (all org members read/insert, owner+office update/delete), and Drizzle migration
- Built health scoring algorithm using rolling 8-reading window — baseline = avg first 4 readings, current = avg last 2; 30% drop = degraded, 50% drop = critical
- Added `EquipmentReadingsSection` collapsible component with per-type metric fields (salt_ppm, flow_gpm/rpm, psi, delta_f) using ChemInput decimal-safe pattern
- Integrated equipment readings into stop completion flow — readings logged fire-and-forget after successful stop
- Added health badges (Healthy/Degraded/Critical) to customer profile equipment tab with expandable metric detail panel showing baseline vs current values
- Added `equipment_degradation` alert type with "Create Work Order" link in alert metadata

## Task Commits

1. **Task 1: Equipment readings schema and server actions** — `62010b8` (feat)
2. **Task 2: Equipment readings capture UI and health badges** — `177709f` (feat)

**Plan metadata:** (created in this step)

## Files Created/Modified

- `src/lib/db/schema/equipment-readings.ts` — New table with JSONB metrics, 4 RLS policies, 4 indexes
- `src/lib/db/migrations/0010_married_swordsman.sql` — Generated migration for equipment_readings
- `src/actions/equipment-readings.ts` — logEquipmentReading, getEquipmentReadings, getEquipmentHealth, checkDegradation
- `src/components/field/equipment-readings-section.tsx` — Collapsible section with MetricInput (ChemInput pattern)
- `src/actions/visits.ts` — Added poolEquipment to StopContext, equipment query in getStopContext
- `src/components/field/completion-modal.tsx` — EquipmentReadingsSection integrated, onConfirm passes readings
- `src/components/field/stop-workflow.tsx` — equipmentReadingsRef, logs readings after completion
- `src/components/customers/equipment-list.tsx` — Health badges with expandable metric detail
- `src/app/(app)/customers/[id]/page.tsx` — Parallel equipment health fetch, passes to EquipmentList
- `src/lib/alerts/constants.ts` — Added equipment_degradation to AlertType union
- `src/components/alerts/alert-feed.tsx` — Added Equipment filter chip and countByType entry
- `src/lib/db/schema/index.ts` — Export equipment-readings
- `src/lib/db/schema/relations.ts` — equipmentReadingsRelations and updated equipmentRelations

## Decisions Made

- JSONB for metrics rather than typed columns — salt cells, pumps, filters, and heaters each have different measurable values; a single flexible column avoids schema changes when new equipment types are added
- No health badge when fewer than 6 readings exist — per MEMORY.md "no placeholder UI" rule; showing "Unknown" would be misleading
- Fire-and-forget equipment logging — stop completion is the primary action; a failed reading log should never block or confuse the tech
- `checkDegradation` uses `adminDb` (bypasses RLS) since it runs as a background cron scanning all org equipment without a user session
- CompletionModal `onConfirm` signature changed from `() => void` to `(equipmentReadings: Record<string, EquipmentMetrics>) => void` — cleanest way to pass readings from the modal back to the stop workflow

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added equipment_degradation to AlertType union and alert-feed**
- **Found during:** Task 1 (server actions)
- **Issue:** `checkDegradation` inserts alerts with `alert_type: "equipment_degradation"` but the `AlertType` union only had 5 types — TypeScript error at assignment
- **Fix:** Added `"equipment_degradation"` to `AlertType` in `src/lib/alerts/constants.ts`; added filter chip and countByType entry in `alert-feed.tsx` (required to satisfy `Record<FilterValue, number>` type)
- **Files modified:** src/lib/alerts/constants.ts, src/components/alerts/alert-feed.tsx
- **Committed in:** `62010b8` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 2 — missing critical type definition)
**Impact on plan:** Necessary correctness fix. No scope creep — the alert-feed update is required by the new alert type.

## Issues Encountered

- Pre-existing TypeScript errors in other Phase 10 files (logo_url, labor_hours, is_default, suppresses_task_id, requires_photo) — these are from other Phase 10 plans not yet executed. Out-of-scope per deviation rules, documented in deferred-items.
- Build fails due to pre-existing missing exports in billing/labor pages from other Phase 10 plans — same out-of-scope situation.

## User Setup Required

After running the migration, RLS policies must be verified per the known pitfall pattern:

```sql
SELECT policyname, qual, with_check
FROM pg_catalog.pg_policies
WHERE tablename = 'equipment_readings';
```

If any `qual` or `with_check` values are NULL, recreate from migration SQL. This is the same pitfall documented in multiple prior phases.

## Next Phase Readiness

- Equipment readings infrastructure is complete and ready for use
- `checkDegradation(orgId)` can be called from the alerts cron job (same pattern as `generateAlerts`)
- Health badges appear automatically once techs log enough readings (6+ per equipment piece)
- Equipment filter chip on alerts page shows degradation alerts immediately once data accumulates

---
*Phase: 10-smart-features-ai*
*Completed: 2026-03-16*

## Self-Check: PASSED

All created files verified present:
- src/lib/db/schema/equipment-readings.ts — FOUND
- src/actions/equipment-readings.ts — FOUND
- src/components/field/equipment-readings-section.tsx — FOUND
- src/lib/db/migrations/0010_married_swordsman.sql — FOUND

All commits verified:
- 62010b8 (Task 1: schema + server actions) — FOUND
- 177709f (Task 2: UI + health badges) — FOUND
