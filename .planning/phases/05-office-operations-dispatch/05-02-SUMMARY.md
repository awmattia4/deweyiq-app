---
phase: 05-office-operations-dispatch
plan: 02
subsystem: api
tags: [react-email, jwt, jose, resend, email, reports, public-links]

# Dependency graph
requires:
  - phase: 05-01
    provides: alerts/org_settings schema + send-service-report Edge Function foundation
  - phase: 03-07
    provides: completeStop server action and service_visits table with report_html column
provides:
  - Branded React Email service report template (dark-themed, hex colors, chemistry summary, CTA button)
  - Pre-arrival text notification email template
  - JWT-based public report links via signReportToken/verifyReportToken (30-day expiry, HS256)
  - /api/reports/[token] public route serving report_html without login
  - completeStop now renders React Email and stores signed report URL in report_html
affects:
  - 05-03-05: notification flows that send emails to customers
  - future phases using customer-facing report links

# Tech tracking
tech-stack:
  added:
    - "@react-email/components": React Email component library for email templates
    - "@react-email/render": Server-side React Email rendering (render async function)
  patterns:
    - "React Email templates in src/lib/emails/ — named exports, hex colors only (no oklch)"
    - "Public report access via signed JWT token — token is authorization, no Supabase auth required"
    - "renderEmail() from @react-email/render — correct export name is `render`, not `renderAsync`"
    - "SNOOZE_OPTIONS and Alert types in @/lib/alerts/constants.ts — not in use server files"

key-files:
  created:
    - src/lib/emails/service-report-email.tsx
    - src/lib/emails/pre-arrival-email.tsx
    - src/lib/reports/report-token.ts
    - src/app/api/reports/[token]/route.ts
    - src/lib/alerts/constants.ts
  modified:
    - src/actions/visits.ts
    - src/actions/alerts.ts
    - src/components/alerts/alert-card.tsx

key-decisions:
  - "renderEmail from @react-email/render — correct export is `render` (not `renderAsync` as documented in older versions)"
  - "SNOOZE_OPTIONS moved to @/lib/alerts/constants.ts — Next.js use server files can only export async functions; non-async const exports cause build failure"
  - "Report token uses visitId (not report version) — old token still works after stop edits because visitId is stable"
  - "companyName fetched from orgs table per-request — replaces hardcoded 'Pool Company' placeholder"
  - "techName fetched from profiles.full_name — replaces hardcoded 'Tech' placeholder from Phase 3"

patterns-established:
  - "React Email template pattern: src/lib/emails/*.tsx, named exports, hex colors, dark-first palette"
  - "Public token route pattern: verify JWT -> adminDb query -> serve raw HTML"

requirements-completed: [NOTIF-02]

# Metrics
duration: 6min
completed: 2026-03-09
---

# Phase 5 Plan 02: React Email Service Reports Summary

**Branded React Email service report with 30-day signed public report link, replacing Phase 3 raw HTML string builder in completeStop**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-09T18:30:36Z
- **Completed:** 2026-03-09T18:36:36Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- ServiceReportEmail React Email template: dark-themed, chemistry 2-column grid, checklist summary line, "View Full Report" CTA button — all hex colors (no oklch)
- PreArrivalEmail minimal text notification template for customers without phone numbers
- signReportToken/verifyReportToken using jose (bundled with Next.js) — HS256, 30-day expiry
- /api/reports/[token] public route handler — 410 on expired/invalid, 404 on missing, serves raw HTML with 1h cache
- completeStop fetches real techName and companyName, generates signed reportUrl, renders React Email — old generateServiceReport() removed
- isUpdate guard intact: report_html updated on edits, email NOT resent

## Task Commits

Each task was committed atomically:

1. **Task 1: React Email templates, report token system, public report API route** - `84f5418` (feat)
2. **Task 2: Wire React Email report into completeStop action flow** - `ac47987` (feat)

**Plan metadata:** TBD (docs: complete plan)

## Files Created/Modified
- `src/lib/emails/service-report-email.tsx` - Branded React Email service report template (ServiceReportEmail component)
- `src/lib/emails/pre-arrival-email.tsx` - Minimal pre-arrival notification email template (PreArrivalEmail component)
- `src/lib/reports/report-token.ts` - JWT signing and verification for public report links (signReportToken, verifyReportToken)
- `src/app/api/reports/[token]/route.ts` - Public GET route handler serving report_html from signed token
- `src/lib/alerts/constants.ts` - Shared SNOOZE_OPTIONS and Alert types (moved from use server file)
- `src/actions/visits.ts` - completeStop updated: React Email rendering, signed report URL, real tech/org names
- `src/actions/alerts.ts` - SNOOZE_OPTIONS and types removed (moved to constants.ts to fix use server violation)
- `src/components/alerts/alert-card.tsx` - Updated SNOOZE_OPTIONS import to @/lib/alerts/constants

## Decisions Made
- `render` (not `renderAsync`) is the correct export from `@react-email/render` v1+ — older docs reference `renderAsync` which no longer exists
- Alert types and SNOOZE_OPTIONS moved to `@/lib/alerts/constants.ts` — Next.js "use server" files may only export async functions; non-async const/type exports cause `invalid-use-server-value` build errors
- Report token references visitId (not a content hash) — token stays valid across stop edits since visitId is stable; fresh content served on each public link visit
- techName and companyName are fetched at completeStop time using adminDb for real branding — replaces Phase 3 placeholder strings

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `renderAsync` does not exist in @react-email/render v1+**
- **Found during:** Task 2 (Wire React Email into completeStop)
- **Issue:** Plan specified `renderAsync` but @react-email/render exports `render` (returns Promise<string>). TypeScript error and build failure.
- **Fix:** Import corrected to `import { render as renderEmail } from "@react-email/render"`
- **Files modified:** src/actions/visits.ts
- **Verification:** `npm run build` passed
- **Committed in:** ac47987 (Task 2 commit)

**2. [Rule 3 - Blocker] SNOOZE_OPTIONS const in "use server" alerts.ts caused build failure**
- **Found during:** Task 2 (after first build attempt)
- **Issue:** `/alerts` page threw `"A 'use server' file can only export async functions, found object"` error — blocking build. SNOOZE_OPTIONS was a non-async const exported from alerts.ts.
- **Fix:** Moved SNOOZE_OPTIONS (and Alert types/AlertCounts type) to `src/lib/alerts/constants.ts`, updated alert-card.tsx import, removed from alerts.ts
- **Files modified:** src/actions/alerts.ts, src/components/alerts/alert-card.tsx, src/lib/alerts/constants.ts (created)
- **Verification:** `npm run build` passed with all 21 routes including `/alerts`
- **Committed in:** ac47987 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both auto-fixes required for build to succeed. No scope creep.

## Issues Encountered
- React Email package exports changed between versions — `renderAsync` was the legacy API. Current API is `render()` which returns `Promise<string>`. Confirmed by inspecting `node_modules/@react-email/render/dist/node/index.d.ts`.

## User Setup Required

**REPORT_TOKEN_SECRET must be set in production.** The development value added to `.env.local` is for local use only.

For production (Vercel/hosting), set:
```
REPORT_TOKEN_SECRET=<random 32+ character string>
```

Generate with: `openssl rand -base64 32`

No other external service configuration required — Resend integration was done in Phase 3.

## Next Phase Readiness
- React Email templates ready for pre-arrival notification wiring (Plan 05-03)
- Public report links work without login — customers can share/bookmark report URLs
- completeStop fully branded with real org/tech names
- Pre-existing alerts infrastructure (Plan 05-04 work) is unblocked — SNOOZE_OPTIONS build error resolved

---
*Phase: 05-office-operations-dispatch*
*Completed: 2026-03-09*
