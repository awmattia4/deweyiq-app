# Phase 8: Customer Portal - Context

**Gathered:** 2026-03-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Self-service portal where customers can view their service history, pay invoices, request one-off jobs, and message the company — branded per pool company. Customers log in via magic link, see their company's branding, and manage everything without calling the office.

</domain>

<decisions>
## Implementation Decisions

### Portal access & branding
- Magic link (email) authentication — no password, customer enters email and gets a one-time login link
- Multi-company customers see a company picker after login — select which company's portal to enter
- Full white-label branding — logo, colors, custom subdomain (bluewavepools.poolco.app), custom favicon
- Company subdomains — each company gets their own subdomain; customer navigates directly to their company's URL

### Service history view
- Per-pool tabs with timeline — if customer has multiple pools, each pool gets its own tab with a dedicated timeline
- Summary cards that expand for detail — each visit is a compact card (date, status, chem summary); tap to expand full readings, checklist, photos, notes
- Chemistry shown as full numbers + color-coded status — actual values (pH 7.4, Cl 3.0) with green/amber/red indicators
- Photos: inline thumbnails per visit AND a separate photo gallery tab per pool — most complete view

### Service request flow
- Guided form: select pool -> pick category -> describe issue -> add photos -> preferred date + time window -> submit
- Date + time window picker — customer picks date and window (Morning, Afternoon, Anytime); office has final say on scheduling
- Simple "This is urgent" toggle — urgent requests get flagged/highlighted in the office queue
- Status tracker with chat — request shows status badges (Submitted -> Reviewed -> Scheduled -> Complete) plus customer can add messages/photos to the request thread

### Messaging experience
- Chat-style real-time messaging — iMessage/WhatsApp feel with bubbles, timestamps, real-time delivery via Supabase Realtime
- Photo attachments in messages — customer can send photos (no other file types)
- Office sees messages in both a dedicated inbox page AND on the customer profile tab — unified inbox for overview, profile tab for customer-specific context
- In-app alert + email notifications — sidebar badge for new messages + email to office; customer gets email when office replies

### Claude's Discretion
- Portal shell layout and navigation structure
- Magic link token expiry and session duration
- Subdomain routing implementation (middleware vs DNS)
- Message read receipts and typing indicators
- Service request category list (predefined set)
- Photo gallery grid layout and lightbox implementation
- Empty states for new customers with no history

</decisions>

<specifics>
## Specific Ideas

- Portal should feel like the company's own app — not a generic SaaS platform with a logo slapped on
- Service requests with status + chat thread makes them feel like tracked tickets, not fire-and-forget forms
- Chemistry numbers shown because many pool owners are knowledgeable and want to see exact values, not just "good/bad"
- Photo gallery tab gives customers visual proof-of-work across all visits — important for trust

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 08-customer-portal*
*Context gathered: 2026-03-13*
