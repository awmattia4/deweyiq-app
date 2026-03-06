---
phase: 03-field-tech-app
plan: "07"
subsystem: ui
tags: [react, dexie, supabase, edge-functions, resend, email, offline-sync, sonner]

# Dependency graph
requires:
  - phase: 03-field-tech-app
    plan: "05"
    provides: checklist system with Dexie draft integration
  - phase: 03-field-tech-app
    plan: "06"
    provides: photo capture with offline blob queue and Supabase Storage

provides:
  - CompletionModal bottom Sheet with chemistry/checklist/photo/notes summary
  - SkipStopDialog with required reason input
  - completeStop server action (online + offline paths)
  - skipStop server action
  - generateServiceReport HTML email template generator
  - send-service-report Supabase Edge Function (Deno/Resend)
  - POST /api/visits/complete offline sync replay endpoint
  - StopWorkflow wired with completion + skip + toast feedback

affects:
  - 03-08-and-beyond (visits now saved to service_visits with full data)
  - phase-04 (route management can check visit status from service_visits.status)
  - phase-09 (report portal can render stored report_html)

# Tech tracking
tech-stack:
  added:
    - sonner@2.0.7 (toast notifications)
  patterns:
    - Bottom Sheet for mobile completion summaries (more natural than Dialog)
    - Best-effort Edge Function invocation (failures logged, never block UI)
    - completeStop uses onConflictDoUpdate for offline-sync idempotency
    - Deno Edge Function excluded from Node.js tsconfig compilation

key-files:
  created:
    - src/components/field/completion-modal.tsx
    - src/lib/reports/service-report.ts
    - supabase/functions/send-service-report/index.ts
    - src/app/api/visits/complete/route.ts
  modified:
    - src/components/field/stop-workflow.tsx
    - src/actions/visits.ts
    - src/app/layout.tsx
    - tsconfig.json
    - package.json

key-decisions:
  - "completeStop uses onConflictDoUpdate — same visitId can be submitted multiple times (offline sync idempotency)"
  - "email_reports preference not yet per-customer — Phase 4 adds toggle; Phase 7 sends to any customer with email for now"
  - "techName hardcoded to 'Tech' in report — Phase 4 fetches from profiles table when tech relational query is active"
  - "Deno Edge Function excluded from Node.js tsconfig via supabase/functions in exclude list"
  - "sonner installed for toast notifications — root layout Toaster with dark theme + richColors"
  - "Skip stop offline path: skipStop requires connectivity (not enqueued) — skip is rare, informational only"

patterns-established:
  - "Completion bottom Sheet pattern: summary → confirm → server action → Dexie cleanup → navigate"
  - "Best-effort Edge Function: invoke inside try/catch, log error, never throw to caller"
  - "API route for offline sync: thin wrapper around server action, same auth path"

requirements-completed:
  - FIELD-09
  - FIELD-12
  - FIELD-13

# Metrics
duration: 76min
completed: 2026-03-06
---

# Phase 3 Plan 07: Stop Completion Flow Summary

**One-tap stop completion with summary modal, service_visits write, branded HTML report generation, and Resend email delivery via Supabase Edge Function with idempotency.**

## Performance

- **Duration:** 76 min
- **Started:** 2026-03-06T16:18:59Z
- **Completed:** 2026-03-06T17:35:00Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments

- CompletionModal bottom Sheet shows chemistry readings, CSI water balance, checklist progress, photo count, and notes truncated to 100 chars before tech confirms
- completeStop server action inserts/upserts service_visits with chemistry JSONB, checklist JSONB, photo_urls, report_html, status="complete", completed_at
- generateServiceReport produces inline-CSS email HTML with chemistry table (status badges), checklist rows, notes, and conditional photo grid
- send-service-report Deno Edge Function sends via Resend API with idempotency check (email_sent_at prevents duplicate sends)
- SkipStopDialog requires non-empty reason text before allowing skip — creates skipped visit record
- StopWorkflow updated with Skip + Complete bottom bar, online/offline completion paths, auto-navigate to /routes with sonner success toast
- POST /api/visits/complete route enables offline sync queue replay via enqueueWrite

## Task Commits

1. **Task 1 + Task 2: Completion modal, server actions, service report, Edge Function** — `ddd6b3f` (feat)

**Plan metadata:** (pending)

## Files Created/Modified

- `src/components/field/completion-modal.tsx` — CompletionModal (bottom Sheet summary) + SkipStopDialog (required reason input)
- `src/lib/reports/service-report.ts` — generateServiceReport HTML email template with inline CSS
- `supabase/functions/send-service-report/index.ts` — Deno Edge Function for Resend email + idempotency via email_sent_at
- `src/app/api/visits/complete/route.ts` — POST endpoint for offline sync queue replay
- `src/components/field/stop-workflow.tsx` — Wired completion/skip flow, online+offline paths, sonner toast
- `src/actions/visits.ts` — Added completeStop and skipStop server actions
- `src/app/layout.tsx` — Added sonner Toaster (dark theme)
- `tsconfig.json` — Excluded supabase/functions/ from Node.js TypeScript compilation

## Decisions Made

- **onConflictDoUpdate on visitId:** completeStop can be called multiple times with the same visitId safely. Critical for the offline sync replay path where the enqueued item might be processed after a successful online call.

- **email_reports as "any customer with email" for Phase 7:** The plan mentioned a per-customer `email_reports` toggle but the customers table doesn't have this column yet. Rather than add a migration (Rule 4 territory — new column on an existing table that changes data model), the server action sends to any customer with an email address. Per-customer preference is deferred to Phase 4/7 when the customer settings screen is built.

- **techName hardcoded:** Phase 3 doesn't have a profile join in the stop context. The report shows "Tech" as the name. Phase 4 adds `with: { tech: true }` to visit queries.

- **Skip stop is online-only:** Skip doesn't use enqueueWrite. Skipped stops are rare administrative actions (gate locked, dog in yard) that rarely happen offline. Simplified the implementation significantly.

- **sonner installed as auto-add (Rule 2):** Completion feedback is critical UX — silently navigating away after tap would feel broken. Sonner is the standard shadcn/ui toast solution.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Installed sonner for toast notifications**
- **Found during:** Task 1 (stop workflow wiring)
- **Issue:** Completion UX requires a success toast per locked decision; no toast library was installed
- **Fix:** `npm install sonner`, added `<Toaster />` to root layout
- **Files modified:** package.json, src/app/layout.tsx
- **Verification:** Build successful, Toaster renders in layout
- **Committed in:** ddd6b3f

**2. [Rule 1 - Bug] Excluded supabase/functions/ from Node.js tsconfig**
- **Found during:** Task 2 (Edge Function creation)
- **Issue:** tsconfig included all \`**/*.ts\` which picked up Deno Edge Function file, causing Deno.serve / jsr: import errors in Node.js compiler
- **Fix:** Added `"supabase/functions"` to tsconfig.json exclude array
- **Files modified:** tsconfig.json
- **Verification:** `npx tsc --noEmit` clean (excluding pre-existing test errors)
- **Committed in:** ddd6b3f

---

**Total deviations:** 2 auto-fixed (1 missing critical, 1 bug)
**Impact on plan:** Both fixes essential. No scope creep.

## Issues Encountered

- `isNull` was imported but unused in visits.ts — cleaned up in the same commit.
- Pre-existing TypeScript errors in `dosing.test.ts` (missing `borate` and `temperatureF` in test fixtures) — out of scope, not fixed, noted in deferred items.

## User Setup Required

**External services require manual configuration for email delivery:**

### Resend (Email Delivery)

1. Create account at [resend.com](https://resend.com)
2. Create API key: Resend Dashboard → API Keys → Create API Key
3. Add to Supabase Edge Function secrets:
   ```bash
   supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxx
   ```
4. Verify sending domain: Resend Dashboard → Domains → Add domain → add DNS records

### Supabase Edge Function Deployment

```bash
# Deploy the Edge Function
supabase functions deploy send-service-report

# Verify it's deployed
supabase functions list
```

**Until the Edge Function is deployed:** `completeStop` will log a best-effort email failure but still saves the visit successfully. Email delivery is non-blocking.

## Next Phase Readiness

- service_visits table now has real data: chemistry_readings, checklist_completion, photo_urls, report_html, status, completed_at
- Phase 4 route management can query visit status from service_visits.status
- Phase 7 customer portal can render report_html for self-service access
- Phase 9 reporting can aggregate chemistry data from chemistry_readings JSONB column
- Deferred: per-customer email_reports preference (Phase 4 customer settings), tech name in report (Phase 4 profile join)

## Self-Check: PASSED

- FOUND: src/components/field/completion-modal.tsx
- FOUND: src/lib/reports/service-report.ts
- FOUND: supabase/functions/send-service-report/index.ts
- FOUND: src/app/api/visits/complete/route.ts
- FOUND: .planning/phases/03-field-tech-app/03-07-SUMMARY.md
- FOUND commit: ddd6b3f (feat(03-07): stop completion flow, service report, and email edge function)
- TypeScript: clean (excluding pre-existing test fixture errors in dosing.test.ts)
- Build: PASSED (all 18 routes compiled successfully)

---
*Phase: 03-field-tech-app*
*Completed: 2026-03-06*
