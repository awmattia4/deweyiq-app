---
phase: 10-smart-features-ai
plan: 14
subsystem: safety
tags: [safety, cron, notifications, settings, escalation, lone-worker]

dependency_graph:
  requires:
    - phase: 10-09
      provides: notifyUser, notifyOrgRole, dispatch infrastructure
    - phase: 04-scheduling-routing
      provides: route_stops table with started_at, status, scheduled_date
    - phase: 05-office-operations-dispatch
      provides: org_settings table, alerts table
  provides:
    - checkUnresponsiveTechs function — scans active routes for inactive techs
    - dismissSafetyAlert function — tech dismisses false positive
    - GET /api/cron/safety-check — 5-minute cron endpoint
    - SafetySettings React component — owner-configurable escalation chain UI
    - safety_timeout_minutes + safety_escalation_chain in org_settings schema
  affects:
    - All cron integrations (same CRON_SECRET pattern)
    - Alerts page (safety_alert type now appears)

tech-stack:
  added: []
  patterns:
    - "safety_escalation_chain as JSONB array in org_settings — same JSONB pattern as dunning steps"
    - "cron GET handler pattern: CRON_SECRET Bearer auth, scan all orgs, sequential processing"
    - "escalation fan-out: resolve role or user-ID to profile IDs, then notifyUser per recipient"
    - "admin-only alert reads for tech dismiss: tech has no SELECT RLS on alerts; adminDb + org_id check"

key-files:
  created:
    - src/actions/safety.ts
    - src/app/api/cron/safety-check/route.ts
    - src/components/settings/safety-settings.tsx
  modified:
    - src/lib/db/schema/org-settings.ts (safety_timeout_minutes, safety_escalation_chain columns)
    - src/actions/company-settings.ts (OrgSettings interface + DEFAULT_SETTINGS)
    - src/components/settings/settings-tabs.tsx (SafetySettings card in Service tab)
    - src/app/(app)/settings/page.tsx (fetch safetyTeamMembers, pass to SettingsTabs)

key-decisions:
  - "Activity signal is MAX(updated_at WHERE status=complete) from route_stops — no GPS cache table; falls back to MIN(started_at) if no completions yet"
  - "safety_escalation_chain step.role accepts 'owner' | 'office' | specific user UUID — resolveEscalationRecipients fans out to all matching profiles"
  - "dismissSafetyAlert uses adminDb for alert read/write — tech has no RLS SELECT access to alerts table; org_id check in action code provides equivalent security"
  - "First escalation step locked at delay_minutes=0 in UI — normalized to 0 on save regardless of input"
  - "safetyTeamMembers fetched from all owner/office/tech profiles — owner row excluded from role dropdown (already in 'Owner' option) but included in individual member list"

requirements-completed:
  - NOTIF-23

duration: 8min
completed: "2026-03-16"
---

# Phase 10 Plan 14: Safety Alerts Summary

**Unresponsive tech detection with configurable escalation chain: 5-min cron detects inactive techs using stop completion timestamps and notifies escalation contacts in sequence with per-step delays.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-16T17:31:26Z
- **Completed:** 2026-03-16T17:39:07Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- `checkUnresponsiveTechs` detects techs with active routes who haven't completed any stop or started their route within the configured timeout (default 30 min). Activity signal is MAX(updated_at WHERE status='complete') with MIN(started_at) fallback — no GPS cache dependency.
- Configurable escalation chain stored as JSONB in org_settings: each step has a `role` (owner/office/user UUID) and `delay_minutes`. Steps fire when `alert_created_at + delay_minutes <= now`. Already-fired steps tracked in `alerts.metadata.escalation_steps_fired`.
- `dismissSafetyAlert` lets techs dismiss false positives (lunch break, phone battery died). Notifies the entire escalation chain with an "all clear" message.
- GET `/api/cron/safety-check` scans all orgs sequentially, protected by CRON_SECRET Bearer header. Returns `{ orgs, checked, alertsCreated, alertsEscalated }`.
- `SafetySettings` component in Settings > Service tab: timeout number input, drag-reorderable escalation chain with per-step role dropdown and delay input, plain-English preview of the alert sequence.

## Task Commits

1. **Task 1: Safety check logic and cron endpoint** — `a28301b` (feat, included in concurrent commit)
2. **Task 2: Safety escalation chain settings UI** — `8fba477` (feat)

## Files Created/Modified

- `src/actions/safety.ts` — checkUnresponsiveTechs, dismissSafetyAlert
- `src/app/api/cron/safety-check/route.ts` — GET cron handler, all-org scan
- `src/components/settings/safety-settings.tsx` — SafetySettings component
- `src/lib/db/schema/org-settings.ts` — safety_timeout_minutes (integer, default 30), safety_escalation_chain (JSONB)
- `src/actions/company-settings.ts` — OrgSettings interface + DEFAULT_SETTINGS updated
- `src/components/settings/settings-tabs.tsx` — Lone Worker Safety card in Service tab
- `src/app/(app)/settings/page.tsx` — fetch safetyTeamMembers for escalation dropdown

## Decisions Made

- Activity signal uses stop completion timestamps only — plan explicitly states "no GPS cache table exists." `MAX(updated_at WHERE status='complete')` is the primary signal; `MIN(started_at)` fallback handles techs in-progress on their first stop.
- `dismissSafetyAlert` uses `adminDb` for the alert SELECT/UPDATE because the `alerts` RLS policy restricts SELECT to owner/office only — a tech trying to dismiss their own safety alert would be blocked by RLS. The org_id check inside the action enforces the same security boundary.
- Task 1 files (`safety.ts`, `cron/safety-check/route.ts`, `org-settings.ts` schema, `company-settings.ts` types) were committed in an earlier concurrent execution (`a28301b`) under the "feat(10-17)" message alongside service worker push handler files. All files are on main at the expected paths.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

Task 1 files were already committed to `main` as part of a prior concurrent agent execution (`a28301b`). The files match what the plan specified. Task 2 (settings UI) was not yet created, so it was built fresh and committed as `8fba477`.

## User Setup Required

None — no external service configuration required. The cron should be triggered every 5 minutes by an external scheduler (pg_cron Edge Function or Vercel Cron) with `Authorization: Bearer $CRON_SECRET`.

## Next Phase Readiness

- Safety alert infrastructure is complete. The `alerts` table's `safety_alert` type is now populated by the cron.
- Alerts page (Phase 5) will surface `safety_alert` type alerts in the feed automatically since it queries all `alert_type` values.
- Techs need a UI path to dismiss safety alerts from their device (e.g., a notification action or alert in the tech routes view). This could be wired up in a future polish pass.

---
*Phase: 10-smart-features-ai*
*Completed: 2026-03-16*

## Self-Check: PASSED

Files created:
- src/actions/safety.ts: EXISTS (in commit a28301b)
- src/app/api/cron/safety-check/route.ts: EXISTS (in commit a28301b)
- src/components/settings/safety-settings.tsx: EXISTS (in commit 8fba477)

Commits:
- a28301b: EXISTS
- 8fba477: EXISTS
