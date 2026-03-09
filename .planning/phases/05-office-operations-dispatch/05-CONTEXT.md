# Phase 5: Office Operations & Dispatch - Context

**Gathered:** 2026-03-09
**Status:** Ready for planning

<domain>
## Phase Boundary

The office stays in the loop automatically — service reports are sent to customers the moment a stop completes, pre-arrival notifications go out before techs arrive, and the alerts dashboard surfaces problems that need human attention. Company owners can configure service requirements and notification preferences.

</domain>

<decisions>
## Implementation Decisions

### Pre-arrival notifications
- Trigger: Route-start based — notification fires when the tech starts their route for the day, not on a schedule timer
- Message content: Simple and short — "Hi [Name], your pool tech [Tech] is heading your way. You're stop #3 on today's route."
- Channel: SMS preferred (via Twilio), email fallback if no phone number on file
- Opt-out: Per-customer toggle on the customer profile, default enabled
- No ETA calculation needed — just route position info

### Service report delivery
- Email content: Summary in email body (tech name, date, pool status snapshot), full detailed report behind a "View Full Report" link
- Template: Replace Phase 3 HTML report with new React Email branded template — cleaner, more maintainable, better mobile rendering
- Timing: Immediate — report email fires within minutes of stop completion
- No email on file: Skip silently — report is still viewable in app. No error, no office alert for missing email

### Alerts dashboard
- Alert types (Phase 5): Missed stops, declining chemical trends (3+ visits), incomplete service data. NOT overdue invoices (Phase 7)
- Layout: Single priority-sorted feed with filter chips to narrow by alert type
- Alert actions: Dismiss (permanently remove from active list) or Snooze (reappear after configurable delay if unresolved)
- Visibility: Red badge count on sidebar Alerts nav item + summary card on main dashboard showing active alert count by type

### Service settings & requirements
- Chemistry requirements: Configurable per sanitizer type (e.g., salt pools require salt reading, chlorine pools require free chlorine + pH)
- Checklist requirements: Also configurable — owner sets which checklist items are required for stop completion
- Enforcement: Warn but allow — tech sees warning listing missing required items, can override and complete anyway. Override generates an "incomplete service data" alert for office
- Settings UI: Dedicated "Company Settings" page accessible from sidebar — sections for notifications, service requirements, and company profile

### Claude's Discretion
- Snooze duration options (1 hour, 1 day, 1 week, etc.)
- Chemical trend detection algorithm (simple slope, moving average, etc.)
- React Email component structure and layout details
- Alert priority scoring logic
- Settings page section ordering and form layout
- Twilio SMS integration specifics (number provisioning, message formatting)

</decisions>

<specifics>
## Specific Ideas

- Pre-arrival message tone should be friendly and informational, not formal — pool service is a casual industry
- The "View Full Report" link in service emails should work without requiring login (time-limited public link or portal link)
- Alert badge should only show for owner/office roles — techs don't need the alerts nav item
- The warn-but-allow pattern for incomplete data is critical — field conditions (broken test kit, equipment access issues) mean hard blocks would frustrate techs

</specifics>

<deferred>
## Deferred Ideas

- Overdue invoice alerts — Phase 7 (Billing & Payments)
- GPS-proximity-based pre-arrival (send when tech is X minutes away) — Phase 10 or future enhancement
- Customer-facing notification preferences portal — Phase 8 (Customer Portal)

</deferred>

---

*Phase: 05-office-operations-dispatch*
*Context gathered: 2026-03-09*
