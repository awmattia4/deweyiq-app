# Phase 14: Service Agreements & Contracts - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Create, send, and manage formal recurring service agreements. Customers e-sign from a secure link, acceptance auto-creates the schedule rule and billing setup, and agreements track the full lifecycle (active, paused, renewed, cancelled). Reuses existing infrastructure: PDF generation (Phase 6 pattern), token-based approval pages (quote pattern), email delivery (Resend), schedule rules (Phase 4), and billing models (Phase 7).

This is NOT about quotes (Phase 6) or invoicing (Phase 7) — this is the formal agreement that governs the ongoing service relationship.

</domain>

<decisions>
## Implementation Decisions

### Agreement builder UX
- Claude's discretion on form layout (wizard vs single form vs hybrid)
- Can start from a reusable template OR build from scratch — templates are optional time-savers
- Agreement templates managed in Settings (e.g. "Standard Weekly Service", "Premium Monthly")
- Multi-pool per agreement — one agreement can cover multiple pools for the same customer, each with its own frequency and services
- Three pricing models supported: monthly flat rate, per-visit, and tiered (e.g. first 4 visits at $X, additional at $Y) — selectable per pool within the agreement

### Agreement document & terms
- Claude's discretion on section structure — determine appropriate sections based on pool service industry standards
- DeweyIQ provides default terms/conditions text out of the box — companies customize from there
- Terms editable at both levels: template sets defaults, office can override on individual agreements
- Agreement includes a detailed service checklist showing exactly what's included per visit (skim, vacuum, brush, chemicals, etc.)

### Customer approval flow
- Approval page shows key terms summary (services, price, term) at top with a link to download the full PDF — not the entire agreement inline
- E-signature supports both options: type full name OR draw signature on canvas — both legally valid, system captures name, timestamp, IP, user agent
- Decline flow: one-click decline with optional text field for feedback — office gets notified of decline and can see reason if provided
- Claude's discretion on link expiration policy

### Lifecycle management
- Claude's discretion on pause behavior (stop suspension + billing handling based on industry norms)
- Cancellation notice period: company-wide default in settings (applied to all agreements, can be 0 for immediate)
- Auto-renew by default — agreements auto-renew unless office or customer opts out, renewal reminders sent before expiry
- Amendments depend on change type: price/term changes require customer re-sign, minor service adjustments (e.g. adding a brush step) take effect with notification only

### Claude's Discretion
- Agreement builder form layout (wizard vs scrollable vs hybrid)
- PDF section structure and legal language depth
- Approval link expiration policy
- Pause behavior (stops + billing suspension approach)
- Auto-provisioning logic details (how schedule rules and billing models are created on acceptance)
- Amendment change-type classification (what's "major" requiring re-sign vs "minor" requiring notification only)
- Renewal reminder lead times and notification cadence
- Agreement compliance tracking approach (missed stops vs. agreed frequency)

</decisions>

<specifics>
## Specific Ideas

- Reuse the quote approval page pattern (token-based, no auth required, branded) — same infrastructure, different content
- Reuse @react-pdf/renderer for agreement PDF generation — same approach as quote PDFs
- Service checklist in the agreement should pull from the existing service requirements system (Phase 3)
- Agreement manager page should live under a top-level nav item (not buried in settings) — it's a core workflow
- Customer portal (Phase 17+ / AGREE-10) shows active agreements — but customer portal is a future phase, so just ensure the data model supports it

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 14-service-agreements-contracts*
*Context gathered: 2026-03-24*
