# Phase 6: Work Orders & Quoting - Context

**Gathered:** 2026-03-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Office and field staff can create, quote, approve, and dispatch repair jobs — and completed jobs generate invoices automatically. This phase covers the full work order lifecycle from creation through invoice generation. Payment processing, dunning, and QBO sync are Phase 7.

</domain>

<decisions>
## Implementation Decisions

### Work Order Lifecycle
- **Creation sources:** Office staff create WOs directly; techs can flag issues during service stops that become WO drafts for office review
- **Tech field flagging:** Quick flag — select category (pump, filter, leak, etc.), snap a photo, add a one-line note. Must take ~10 seconds. Creates a draft WO attached to the customer/pool
- **Status flow:** Draft → Quoted → Approved → Scheduled → In Progress → Complete (+ Cancelled at any point before Complete)
- **Cancellation:** Any status except Complete can be cancelled — cancelled WOs require a reason field
- **One visit per WO:** Each work order = one dispatch. Multi-day repairs use follow-up WOs
- **Completion notification:** Auto-notify customer via email/SMS when WO is marked complete (same pattern as service report auto-send)

### Quote Presentation & Approval
- **Delivery:** Email with PDF attachment (for records) + link to branded web approval page
- **Customer response options:** Three-way — Approve, Decline, or Request Changes (with a note back to office)
- **Quote detail level:** Full line-item breakdown — description, quantity, unit price, line total per item, plus tax and grand total
- **Expiration:** Configurable default expiration (e.g. 30 days) — expired quotes show a message and cannot be approved
- **Change requests:** Customer adds a note requesting modifications; office gets notified and revises the quote (creates a new version)

### Line Items & Pricing
- **Parts entry:** Saved catalog with preset prices + free-form custom items. Catalog builds over time as items are added
- **Labor pricing:** Both hourly rate and flat rate available per line item — choose per item based on job type
- **Parts markup:** Configurable default markup percentage — cost price and customer price tracked separately (enables profitability reporting in Phase 9)
- **Tax handling:** Per-item taxability — each line item marked as taxable or not. Tax calculated only on taxable items (labor often tax-exempt depending on state)

### WO-to-Invoice Conversion
- **Conversion flow:** "Prepare Invoice" opens a review screen where office can adjust line items, add discounts, or modify before finalizing — not one-click auto-generate
- **Invoice scope:** Phase 6 creates the invoice table and stores the invoice record — Phase 7 adds payment processing, dunning, and QBO sync on top
- **Invoice data:** Carries forward all line items, tax, markup, and totals from the finalized WO

### Claude's Discretion
- Work order list page layout and filtering approach
- Quote PDF template design and branding integration
- Parts catalog management UI (add/edit/delete items)
- Invoice number generation scheme
- WO assignment UI (how office assigns a tech to a WO)
- Notification email templates for completion and quote delivery

</decisions>

<specifics>
## Specific Ideas

- Tech field flagging should feel as fast as taking a photo — minimal form fields, category picker + camera + one-line note
- Quote approval page should be clean and professional — customer sees company branding, not platform branding
- The "Request Changes" flow on quotes should feel like a conversation, not a formal process — customer writes a note, office gets it, revises, resends
- Invoice review step before finalizing prevents billing errors — office should see a clear diff of what's on the WO vs what the invoice will show

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 06-work-orders-quoting*
*Context gathered: 2026-03-10*
