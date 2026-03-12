---
phase: 07-billing-payments
plan: "08"
subsystem: notifications
tags: [react-email, merge-tags, template-engine, resend, twilio, edge-functions, settings-ui]

# Dependency graph
requires:
  - phase: 07-02
    provides: sendInvoice email/SMS delivery, send-invoice-sms Edge Function
  - phase: 07-05
    provides: dunning scan, receipt email in webhook handler, AutoPay flow
  - phase: 05-03
    provides: pre-arrival notifications, send-pre-arrival Edge Function
  - phase: 05-02
    provides: service report email, send-service-report Edge Function
  - phase: 06-05
    provides: quote email/SMS delivery flow
provides:
  - notification_templates DB table with org-scoped customizable templates
  - Template engine with merge tag resolution (15 tag types)
  - Default templates for all 10 notification types
  - getResolvedTemplate action for all send functions
  - Template editor UI in Settings with live preview
  - Org-level merge tag settings (google_review_url, website_url, custom_email_footer, custom_sms_signature)
  - All send functions (6 server actions + 3 Edge Functions) wired to customizable templates
affects: [08-customer-portal, 12-subscription-billing]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "getResolvedTemplate(orgId, templateType, context) pattern for all send functions"
    - "Merge tag resolution with {{tag_name}} syntax and special section tags"
    - "Template enabled/disabled toggle controls whether notification is sent"
    - "Edge Functions accept customText/customSubject/customBody overrides"

key-files:
  created:
    - src/lib/db/schema/notification-templates.ts
    - src/lib/notifications/template-engine.ts
    - src/lib/notifications/default-templates.ts
    - src/actions/notification-templates.ts
    - src/components/settings/template-editor.tsx
    - src/components/ui/alert-dialog.tsx
  modified:
    - src/lib/db/schema/org-settings.ts
    - src/lib/db/schema/index.ts
    - src/lib/db/schema/relations.ts
    - src/actions/company-settings.ts
    - src/app/(app)/settings/page.tsx
    - src/components/settings/settings-tabs.tsx
    - src/lib/emails/invoice-email.tsx
    - src/lib/emails/quote-email.tsx
    - src/lib/emails/dunning-email.tsx
    - src/lib/emails/receipt-email.tsx
    - src/lib/emails/service-report-email.tsx
    - src/actions/invoices.ts
    - src/actions/quotes.ts
    - src/actions/dunning.ts
    - src/actions/visits.ts
    - src/actions/notifications.ts
    - src/lib/stripe/webhook-handlers.ts
    - supabase/functions/send-invoice-sms/index.ts
    - supabase/functions/send-pre-arrival/index.ts
    - supabase/functions/send-service-report/index.ts

key-decisions:
  - "getResolvedTemplate uses adminDb (not withRls) because send functions may run outside user session (dunning cron, webhook handlers)"
  - "Template disabled (enabled=false) returns null from getResolvedTemplate -- send functions skip delivery entirely"
  - "Dunning email has dual customization: step-level (subject/body per dunning step) overlaid with org-level template (footer, enabled toggle)"
  - "Edge Functions accept optional customText/customSubject/customBody fields for backward compatibility -- existing callers continue working unchanged"
  - "Org settings extended with 5 new columns (google_review_url, website_url, social_media_urls, custom_email_footer, custom_sms_signature) for merge tag sources"

patterns-established:
  - "getResolvedTemplate pattern: every send function calls getResolvedTemplate before sending, checks for null (disabled), uses resolved subject/body/sms_text"
  - "Template type union: 10 types covering all customer-facing notifications (service_report_email, pre_arrival_email/sms, quote_email/sms, invoice_email/sms, receipt_email, dunning_email, autopay_confirmation_email)"
  - "Merge tag resolution: {{tag_name}} replaced at send time from context + org settings; unresolved tags stripped as safety net"

requirements-completed:
  - BILL-01
  - BILL-02

# Metrics
duration: 25min
completed: 2026-03-12
---

# Phase 7 Plan 08: Customizable Notification Templates Summary

**Customizable email/SMS templates with merge tag engine, template editor UI, and all 10 notification types wired through getResolvedTemplate**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-03-12T18:30:00Z
- **Completed:** 2026-03-12T18:55:00Z
- **Tasks:** 2
- **Files modified:** 24

## Accomplishments

- Built notification_templates schema with RLS, template engine with 15 merge tags, and default templates for all 10 notification types
- Created template editor UI in Settings with type selector, edit/preview tabs, merge tag insertion, save/reset, and org-wide settings (Google Review URL, website, custom footer/signature)
- Retrofitted all 6 server-side send functions (sendInvoice, sendQuote, runDunningScan, handlePaymentSucceeded, completeStop, sendPreArrivalNotifications) to resolve templates before sending
- Updated all 3 Edge Functions (send-invoice-sms, send-pre-arrival, send-service-report) to accept custom text overrides
- Updated all 5 React Email templates to accept customSubject/customBody/customFooter props

## Task Commits

Each task was committed atomically:

1. **Task 1: Template schema, engine, default templates, and CRUD actions** - `1b3ae94` (feat)
2. **Task 2: Template editor UI and retrofit all send functions** - `e03a192` (feat)

## Files Created/Modified

- `src/lib/db/schema/notification-templates.ts` - New table: org_id, template_type, subject, body_html, sms_text, enabled, with RLS
- `src/lib/notifications/template-engine.ts` - MERGE_TAGS array (15 tags) + resolveTemplate function with special section handling
- `src/lib/notifications/default-templates.ts` - DEFAULT_TEMPLATES for all 10 types, TEMPLATE_TYPE_META labels/channels, TemplateType union
- `src/actions/notification-templates.ts` - getTemplates, updateTemplate, resetTemplate, getResolvedTemplate, getOrgTemplateSettings
- `src/components/settings/template-editor.tsx` - Full template editor with type selector, edit/preview tabs, merge tag buttons, org settings panel
- `src/components/ui/alert-dialog.tsx` - AlertDialog shadcn component for reset confirmation
- `src/lib/db/schema/org-settings.ts` - Added google_review_url, website_url, social_media_urls, custom_email_footer, custom_sms_signature columns
- `src/actions/invoices.ts` - sendInvoice resolves invoice_email/invoice_sms templates, custom subject, customText to SMS Edge Function
- `src/actions/quotes.ts` - sendQuote resolves quote_email/quote_sms templates, skips email if disabled
- `src/actions/dunning.ts` - runDunningScan resolves dunning_email template, overlays with step-level customization
- `src/lib/stripe/webhook-handlers.ts` - handlePaymentSucceeded resolves receipt_email template, skips if disabled
- `src/actions/visits.ts` - completeStop resolves service_report_email template, passes custom subject to Edge Function
- `src/actions/notifications.ts` - sendPreArrivalNotifications resolves pre_arrival_email/sms templates, passes to Edge Function
- `supabase/functions/send-invoice-sms/index.ts` - Accepts customText override for SMS body
- `supabase/functions/send-pre-arrival/index.ts` - Accepts customSmsText, customEmailSubject, customEmailBody, emailEnabled, smsEnabled
- `supabase/functions/send-service-report/index.ts` - Accepts customSubject override

## Decisions Made

- **getResolvedTemplate uses adminDb**: Send functions may run without a user session (dunning cron, Stripe webhook), so template resolution bypasses RLS
- **Template disabled = null return**: When getResolvedTemplate returns null (enabled=false), send functions skip delivery entirely -- clean opt-out mechanism
- **Dunning dual customization**: Step-level subject/body (from dunning_config) takes priority, but org-level dunning_email template provides fallback and enabled toggle
- **Edge Function backward compatibility**: New customText/customSubject/customBody fields are optional -- existing callers work unchanged
- **5 new org_settings columns**: google_review_url, website_url, social_media_urls (JSONB), custom_email_footer, custom_sms_signature for merge tag sources

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Created AlertDialog shadcn component manually**
- **Found during:** Task 2 (Template editor UI)
- **Issue:** template-editor.tsx imports AlertDialog from @/components/ui/alert-dialog which didn't exist, and `npx shadcn add` failed due to npm cache permission error
- **Fix:** Created alert-dialog.tsx manually matching the project's radix-ui import pattern from dialog.tsx
- **Files modified:** src/components/ui/alert-dialog.tsx
- **Verification:** `npx tsc --noEmit` passes, `npm run build` succeeds
- **Committed in:** e03a192 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Minor -- standard shadcn component created manually instead of via CLI. No scope creep.

## Issues Encountered

None beyond the shadcn CLI permission issue noted above.

## User Setup Required

After deploying, the owner must run `drizzle-kit push` (or generate + migrate) to create the `notification_templates` table and the 5 new `org_settings` columns. After migration, verify RLS policies are not NULL per MEMORY.md pitfall.

## Next Phase Readiness

- All notification channels now customizable via Settings
- Template system ready for Phase 8 customer portal notifications (autopay_confirmation_email template already has defaults)
- Phase 12 subscription billing can add new template types by extending ALL_TEMPLATE_TYPES and DEFAULT_TEMPLATES

## Self-Check: PASSED

- All 16 key files verified present on disk
- Commit 1b3ae94 (Task 1) verified in git log
- Commit e03a192 (Task 2) verified in git log
- `npx tsc --noEmit` passes (0 errors)
- `npm run build` succeeds (all routes compile)

---
*Phase: 07-billing-payments*
*Completed: 2026-03-12*
