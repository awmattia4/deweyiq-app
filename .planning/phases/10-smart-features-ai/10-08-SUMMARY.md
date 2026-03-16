---
phase: 10-smart-features-ai
plan: "08"
subsystem: notifications
tags: [weather, notifications, resend, twilio, sms, email, templates, server-actions]

requires:
  - phase: 10-06
    provides: "approveProposal() returning affectedCustomerIds, weather_reschedule_proposals table, notify_customers/excluded_customer_ids fields"
  - phase: 10-09
    provides: "getResolvedTemplate(), notification template system, weather_delay_email/sms defaults"

provides:
  - "dispatchWeatherRescheduleNotifications(): fire-and-forget notification dispatch after proposal approval"
  - "Updated weather_delay_email template: richer body per plan spec with new sentence structure"
  - "Updated weather_delay_sms template: includes STOP opt-out per carrier compliance best practice"
  - "approveProposal() now dispatches customer notifications automatically on approval"

affects:
  - "10-09 (notification templates): weather_delay_email/sms templates are now used by real dispatch code"

tech-stack:
  added: []
  patterns:
    - "void promise.then() for fire-and-forget async tasks from synchronous server action return path"
    - "createSupabaseAdmin (service role) in weather.ts to invoke edge function for SMS when no user JWT in scope"
    - "Per-customer new-date map: iterate affected_stops joined with proposed_reschedules to build customerId->newDate"
    - "getResolvedTemplate() resolves merge tags (customer_name, company_name, weather_reason, original_date, new_date) per customer"

key-files:
  created: []
  modified:
    - src/actions/weather.ts
    - src/lib/notifications/default-templates.ts

key-decisions:
  - "Use existing weather_delay_email/weather_delay_sms template types (not new weather_reschedule_* names) — plan used different names but types already exist in the template system"
  - "Fire-and-forget with void + .then() logging: approveProposal returns before notifications complete — failure is logged but never surfaces to the caller"
  - "Email via Resend SDK directly in server action (consistent with invoices.ts pattern); SMS via send-invoice-sms edge function with customText parameter"
  - "Per-customer newDate: build customerNewDateMap from affected_stops+proposed_reschedules so each customer's notification shows their specific reschedule date, not a generic new date"
  - "Dev mode logging: if RESEND_API_KEY is not set, log to console instead of failing — mirrors invoices.ts DEV behavior"

patterns-established:
  - "Weather notification dispatch: fetch customer rows with adminDb, resolve templates per customer, dispatch email+SMS concurrently with Promise.allSettled"

requirements-completed:
  - SMART-07

duration: 4min
completed: 2026-03-16
---

# Phase 10 Plan 08: Weather Delay Customer Notifications Summary

**Fire-and-forget notification dispatch wired into proposal approval: customers receive email + SMS with weather reason, original date, and new scheduled date when office approves a weather reschedule.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-03-16T18:00:13Z
- **Completed:** 2026-03-16T18:00:39Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments

- `dispatchWeatherRescheduleNotifications()` sends email (Resend SDK) and SMS (send-invoice-sms edge function) to each affected non-excluded customer after proposal approval
- `approveProposal()` calls dispatch as fire-and-forget via `void promise.then()` — notification failure never rolls back the reschedule
- Each customer notification uses their specific new date (first proposed reschedule date) via `customerNewDateMap`
- Updated `weather_delay_email` and `weather_delay_sms` defaults: richer text, STOP opt-out in SMS per carrier best practice
- Templates resolve all required merge tags: `customer_name`, `company_name`, `weather_reason`, `original_date`, `new_date`

## Task Commits

1. **Task 1: Weather reschedule notification templates and dispatch** - `175b0e3` (feat)

**Plan metadata:** (see below in final commit)

## Files Created/Modified

- `src/actions/weather.ts` - Added `dispatchWeatherRescheduleNotifications()` helper, wired into `approveProposal()` as fire-and-forget; imports Resend, createSupabaseAdmin, getResolvedTemplate
- `src/lib/notifications/default-templates.ts` - Updated `weather_delay_email` subject/body and `weather_delay_sms` text to match plan spec

## Decisions Made

- **Template type naming**: Plan described `weather_reschedule_email`/`weather_reschedule_sms` but the template system already had `weather_delay_email`/`weather_delay_sms` from a prior plan. Using existing types avoids unnecessary TemplateType union expansion and schema confusion.
- **Fire-and-forget pattern**: `void dispatchWeatherRescheduleNotifications(...).then(({ notified }) => console.log(...))` — the void ensures Next.js server action doesn't hang waiting for notifications, and the .then logs the count for observability.
- **Resend direct + edge function for SMS**: Email uses Resend SDK directly (consistent with invoices.ts). SMS uses the `send-invoice-sms` edge function with `customText` parameter — avoids duplicating Twilio REST logic.
- **Per-customer new date**: Iterates `affected_stops` joined with `proposed_reschedules` by `stopId` to build `customerId -> newDate` map, using the first match per customer (customers with multiple pools get the earliest proposed date).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Used existing template type names instead of new ones**
- **Found during:** Task 1
- **Issue:** Plan specified `weather_reschedule_email`/`weather_reschedule_sms` but `TemplateType` union and defaults already had `weather_delay_email`/`weather_delay_sms` from a prior plan
- **Fix:** Used existing `weather_delay_*` types and updated their content to match plan spec
- **Files modified:** src/lib/notifications/default-templates.ts
- **Verification:** tsc --noEmit passes for both modified files
- **Committed in:** 175b0e3

---

**Total deviations:** 1 auto-fixed (Rule 1 - naming alignment)
**Impact on plan:** Template naming difference has zero functional impact. Weather notifications now dispatch correctly on approval.

## Issues Encountered

Pre-existing TypeScript build errors in `company-settings.ts`, `invoices.ts`, `quotes.ts`, `billing/page.tsx` unrelated to this plan's changes (documented in deferred-items.md). Modified files (`weather.ts`, `default-templates.ts`) have zero type errors.

## User Setup Required

None — no new environment variables or external service configuration required. Uses existing RESEND_API_KEY and Supabase edge function infrastructure already configured.

## Next Phase Readiness

- Weather reschedule notifications are fully wired. Customers receive email + SMS when office approves a weather proposal.
- The `send-invoice-sms` edge function is reused via `customText` parameter — no new edge function needed.
- Template customization works through the existing notification settings UI (Settings > Notifications > Weather Delay).

---
*Phase: 10-smart-features-ai*
*Completed: 2026-03-16*
