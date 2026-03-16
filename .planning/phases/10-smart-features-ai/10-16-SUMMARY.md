---
phase: 10-smart-features-ai
plan: 16
subsystem: ui
tags: [resend, twilio, broadcast, messaging, settings, react]

# Dependency graph
requires:
  - phase: 10-09
    provides: notification dispatch infrastructure and push subscription setup
  - phase: 07-08
    provides: notification templates, Resend email pattern, Twilio SMS via Edge Functions
provides:
  - Broadcast messaging server actions (segmented customer targeting)
  - BroadcastMessaging compose UI in settings
  - Broadcast history tracking in org_settings JSONB
affects:
  - settings
  - customer communications
  - org_settings schema

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "JSONB broadcast history: last 10 broadcasts stored in org_settings.broadcast_history — no separate table needed"
    - "Two-query batch delivery: customers queried by segment, email via Resend SDK, SMS via send-invoice-sms Edge Function with customText"
    - "Segment count preview: getSegmentCount called on segment change for pre-send recipient count"

key-files:
  created:
    - src/actions/broadcast.ts
    - src/components/settings/broadcast-messaging.tsx
  modified:
    - src/lib/db/schema/org-settings.ts
    - src/components/settings/settings-tabs.tsx
    - src/app/(app)/settings/page.tsx

key-decisions:
  - "Broadcast history stored in org_settings.broadcast_history JSONB (last 10) — avoids a separate broadcasts table since no complex queries needed"
  - "adminDb for all broadcast queries — runs without user session context, explicit org_id filter enforces isolation"
  - "Batch size 50 with Promise.allSettled — limits concurrent requests while handling individual failures gracefully"
  - "Tech route segment uses last-30-days route_stop data — captures current routing state without needing a dedicated assignments table"
  - "SMS delivery via existing send-invoice-sms Edge Function with customText — reuses deployed infrastructure rather than new function"

patterns-established:
  - "Segment count preview pattern: preview before send using getSegmentCount to show email/phone reachability"
  - "AlertDialog confirmation for mass sends — prevents accidental blast with recipient count in confirmation message"
  - "Merge tag resolution per customer in broadcast — resolveTemplate called with customer-specific context per recipient"

requirements-completed:
  - NOTIF-16

# Metrics
duration: 8min
completed: 2026-03-16
---

# Phase 10 Plan 16: Broadcast Messaging Summary

**Owner-initiated bulk email/SMS to customer segments via Resend + Twilio, with merge tag resolution per customer and JSONB delivery history**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-16T17:33:16Z
- **Completed:** 2026-03-16T17:41:35Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Broadcast server actions with 4 segment types: all, active, tech_route, individual
- Email delivery via Resend SDK with per-customer merge tag resolution
- SMS delivery via existing send-invoice-sms Edge Function with customText override
- Batched delivery (50 per batch) with Promise.allSettled for fault tolerance
- BroadcastMessaging compose UI in Settings > Company tab with segment count preview
- Confirmation dialog showing recipient counts prevents accidental mass sends
- Broadcast history panel shows last 10 sends with sent/failed counts per channel

## Task Commits

Each task was committed atomically:

1. **Task 1: Broadcast messaging server actions** - `0a7ad7e` (feat)
2. **Task 2: Broadcast compose and send UI in Settings** - `d840856` (feat)

## Files Created/Modified
- `src/actions/broadcast.ts` - sendBroadcast, getSegmentCount, getBroadcastHistory, getTechProfilesForBroadcast
- `src/components/settings/broadcast-messaging.tsx` - Full compose UI with segment selector, channel picker, merge tag helpers, confirmation dialog, history
- `src/lib/db/schema/org-settings.ts` - Added broadcast_history JSONB column
- `src/components/settings/settings-tabs.tsx` - Added BroadcastMessaging card to Company tab, broadcast props
- `src/app/(app)/settings/page.tsx` - Fetch broadcastTechProfiles + broadcastHistory for owner

## Decisions Made
- JSONB storage for broadcast history: last 10 entries in org_settings avoids a dedicated broadcasts table. No complex queries needed on history — just display.
- adminDb for all broadcast actions: segment queries and history updates run as owner actions without requiring a user RLS session.
- SMS via send-invoice-sms Edge Function with customText field: reuses the deployed Twilio infrastructure rather than deploying a new broadcast-specific function.
- Tech route segment uses last-30-days route_stops: captures current tech routing state cleanly.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added broadcast_history column to org_settings schema**
- **Found during:** Task 1 (broadcast server actions)
- **Issue:** Plan specified storing broadcast history in org_settings JSONB, but the column didn't exist in the schema
- **Fix:** Added `broadcast_history` JSONB column with proper TypeScript type definition to org-settings.ts
- **Files modified:** src/lib/db/schema/org-settings.ts
- **Verification:** TypeScript compiles cleanly with no errors on broadcast.ts or org-settings.ts
- **Committed in:** 0a7ad7e (part of Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical schema column)
**Impact on plan:** Auto-fix necessary to implement plan as specified. No scope creep.

## Issues Encountered
- Pre-existing TypeScript errors in other files (company-settings.ts, invoices.ts, etc.) unrelated to this plan — out of scope per deviation rules, logged to deferred items.

## User Setup Required
None - no external service configuration required. Broadcast uses existing RESEND_API_KEY and Twilio Edge Function already deployed.

**Note:** The `broadcast_history` column needs to be added to the production DB. Run:
```sql
ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS broadcast_history jsonb;
```

## Next Phase Readiness
- Broadcast messaging complete and integrated into Settings
- Future enhancement: add customer multi-select picker for "Specific Customers" segment (currently supports all/active/tech_route)

## Self-Check: PASSED

- src/actions/broadcast.ts: FOUND
- src/components/settings/broadcast-messaging.tsx: FOUND
- .planning/phases/10-smart-features-ai/10-16-SUMMARY.md: FOUND
- Commit 0a7ad7e: FOUND (feat(10-16): broadcast messaging server actions)
- Commit d840856: FOUND (feat(10-16): broadcast compose UI and settings integration)

---
*Phase: 10-smart-features-ai*
*Completed: 2026-03-16*
