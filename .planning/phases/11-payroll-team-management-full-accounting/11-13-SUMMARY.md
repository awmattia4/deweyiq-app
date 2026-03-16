---
phase: 11-payroll-team-management-full-accounting
plan: 13
subsystem: ui
tags: [react, nextjs, drizzle, time-entries, team-management, recharts, labor-costs]

# Dependency graph
requires:
  - phase: 11-04
    provides: time_entries schema, clock-in/clock-out actions, time_entry_stops, approved_at/approved_by
  - phase: 11-05
    provides: pto_balances, pto_requests, employee_documents, team management server actions

provides:
  - "getTeamDashboard server action: per-employee live status, today/week hours, PTO balance, cert alerts, stops count"
  - "getLaborCostAnalysis server action: per-stop/per-employee/per-customer labor cost breakdowns"
  - "getTeamAlerts server action: cert expiry, forgotten clock-outs, break violations, pending PTO"
  - "forceClockOut server action: owner force-closes forgotten active time entries"
  - "TeamDashboard client component: employee status grid, alerts panel, labor cost analysis with recharts bar chart"
  - "Team page upgraded: Dashboard tab as first tab (owner-only) with server-side SSR initial data"

affects:
  - "11-14: final plan in phase — team dashboard is now complete"
  - "Future reporting phases can use getLaborCostAnalysis for payroll/profitability reports"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Multiple withRls queries + in-memory aggregation — avoids correlated subqueries per MEMORY.md pitfall"
    - "Server-side SSR initial data + client 60-second auto-refresh — owner sees live status immediately on tab load"
    - "Per-stop vs hourly pay cost calculation — per_stop techs: cost = pay_rate per stop; hourly: cost = (minutes/60) * pay_rate"
    - "forceClockOut pattern — owner fetches entry to compute total_minutes, then updates status=complete + clocked_out_at=now()"

key-files:
  created:
    - src/actions/team-dashboard.ts
    - src/components/team/team-dashboard.tsx
  modified:
    - src/app/(app)/team/page.tsx

key-decisions:
  - "Multiple separate withRls queries + JS aggregation instead of complex JOINs — avoids correlated subquery RLS pitfall, simpler to maintain"
  - "forceClockOut included as bonus action — needed for forgotten_clock_out alert button in dashboard, was implicitly required by the plan"
  - "Team Overview / Labor Costs toggle within Dashboard tab — keeps the tab bar from growing too wide while separating the two distinct views"
  - "60-second auto-refresh via setInterval — simple and reliable for live status; Supabase Realtime would require subscription management complexity"

patterns-established:
  - "Team page default tab by role: owner→dashboard, office→members, tech→pto"
  - "Recharts BarChart with dual Y-axes for cost ($) and hours (h) using hex colors only per MapLibre pattern"

requirements-completed:
  - TEAM-08
  - TEAM-12

# Metrics
duration: 8min
completed: 2026-03-16
---

# Phase 11 Plan 13: Team Dashboard Summary

**Owner team management dashboard with live clock-in status, today/week hours, PTO balances, cert alerts, and labor cost analysis per stop/employee/customer — auto-refreshing every 60 seconds**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-03-16T22:39:36Z
- **Completed:** 2026-03-16T22:47:23Z
- **Tasks:** 2
- **Files modified:** 3 (1 created actions file, 1 created component, 1 updated page)

## Accomplishments

- Created `getTeamDashboard`, `getLaborCostAnalysis`, `getTeamAlerts`, and `forceClockOut` server actions with owner-only access guards
- Built `TeamDashboard` client component with employee status grid (animated green pulse for clocked-in), actionable alerts panel with force-clock-out button, and labor cost analysis section with recharts bar chart and per-employee/per-customer tables
- Upgraded Team page: Dashboard tab is now first tab (owner only), defaults to Dashboard on owner load, with server-side SSR initial data for instant render

## Task Commits

Each task was committed atomically:

1. **Task 1: Create team dashboard and labor cost server actions** - `c8847aa` (feat)
2. **Task 2: Build team dashboard UI with live status and labor costs** - `5ef8b6a` (feat) — component in `b24178e`

**Plan metadata:** _(pending — this summary)_

## Files Created/Modified

- `src/actions/team-dashboard.ts` — 4 server actions: getTeamDashboard (live status + hours + PTO + alerts), getLaborCostAnalysis (per-stop/employee/customer breakdowns), getTeamAlerts (cert expiry/forgotten clock-outs/break violations/pending PTO), forceClockOut (owner force-closes active entries). 460 lines.
- `src/components/team/team-dashboard.tsx` — TeamDashboard client component with StatusBadge, EmployeeCard, AlertItem, LaborCostSection subcomponents + auto-refresh via setInterval. 520 lines.
- `src/app/(app)/team/page.tsx` — Added Dashboard tab (owner-only) as first tab, defaultTab now role-aware (owner→dashboard), SSR fetch of getTeamDashboard + getTeamAlerts initial data

## Decisions Made

- **Multiple withRls queries + JS aggregation**: Per MEMORY.md pitfall, correlated subqueries on RLS-protected tables cause issues inside withRls transactions. Used 5–7 separate queries (profiles, today's entries, week entries, PTO, certs, stops) + in-memory aggregation instead of a single complex JOIN.
- **forceClockOut included as deviation**: Not explicitly listed in plan tasks but required by the alert UI (forgotten_clock_out alerts have a "Force Clock Out" button). Added as Rule 2 (missing critical functionality).
- **Team Overview / Labor Costs toggle**: Rather than adding a third tab or making the Dashboard tab too wide, used a pill toggle within the Dashboard tab to switch between team status view and labor cost analysis.
- **60-second auto-refresh**: Simple setInterval approach vs Supabase Realtime — adequate for a management dashboard, no subscription lifecycle complexity.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added forceClockOut server action**
- **Found during:** Task 2 (AlertItem component for forgotten_clock_out alerts)
- **Issue:** Plan described "Force Clock Out" button in the UI but didn't list forceClockOut as a server action to create. Without it, the button would have no action to call.
- **Fix:** Added `forceClockOut(timeEntryId)` server action to team-dashboard.ts — fetches the entry, computes total_minutes, sets status='complete' + clocked_out_at=now()
- **Files modified:** src/actions/team-dashboard.ts
- **Verification:** TypeScript passes, logic matches clock-out pattern from Phase 11-02
- **Committed in:** `c8847aa` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 2 — missing critical functionality)
**Impact on plan:** Essential for correctness — the UI action button needed a server action. No scope creep.

## Issues Encountered

- `break_minutes` was missing from the weekEntries Drizzle select — TypeScript caught it immediately. Added to the select before committing.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Team dashboard is complete and fully wired
- Labor cost analysis ready for integration into future payroll/profitability reporting
- `getTeamAlerts` can be consumed by a cron job or notification system in later phases
- Phase 11 Plan 14 (the final plan) can proceed

---
*Phase: 11-payroll-team-management-full-accounting*
*Completed: 2026-03-16*

## Self-Check: PASSED

- FOUND: `src/actions/team-dashboard.ts`
- FOUND: `src/components/team/team-dashboard.tsx`
- FOUND: `.planning/phases/11-payroll-team-management-full-accounting/11-13-SUMMARY.md`
- FOUND commit: `c8847aa` (Task 1 — server actions)
- FOUND commit: `5ef8b6a` (Task 2 — UI + team page)
