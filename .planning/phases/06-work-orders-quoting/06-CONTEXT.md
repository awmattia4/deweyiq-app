# Phase 6: Work Orders & Quoting - Context

**Gathered:** 2026-03-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Office and field staff can create, quote, approve, and dispatch repair jobs — and completed jobs generate invoices automatically. This phase covers the full work order lifecycle from creation through invoice generation. Payment processing, dunning, and QBO sync are Phase 7. Customer portal self-service requests are Phase 8.

</domain>

<decisions>
## Implementation Decisions

### Work Order Lifecycle

**Creation sources:**
- Office staff create WOs directly from the dashboard (full form)
- Techs quick-flag issues during service stops → creates a Draft WO for office review
- Future: Phase 8 adds customer portal service requests that become Draft WOs

**Tech field flagging (must take ~10 seconds):**
- Category picker: pump, filter, heater, plumbing/leak, surface, electrical, other
- Snap one or more photos (reuses Phase 3 camera/compression pipeline)
- One-line note field (voice dictation hint like Phase 3 notes)
- Severity: routine / urgent / emergency (affects office triage)
- Auto-attaches to current customer + pool context from the stop
- Appears in office WO inbox as a draft with "Flagged by [Tech Name]" badge

**Status flow:**
```
Draft → Quoted → Approved → Scheduled → In Progress → Complete
                                                         ↓
                                                     Invoiced
  ↕ (any status except Complete/Invoiced can be Cancelled)
```
- **Draft:** Created but not yet quoted. Office reviews, adds line items, assigns priority
- **Quoted:** Quote sent to customer, awaiting response
- **Approved:** Customer approved the quote (or office skipped quoting for small jobs)
- **Scheduled:** Assigned to a tech with a target date
- **In Progress:** Tech has started the work (marked on arrival)
- **Complete:** Work finished, photos/notes captured, ready to invoice
- **Invoiced:** Invoice generated from this WO (terminal state)
- **Cancelled:** Cancelled at any point before Complete — requires reason field, tracks who cancelled and when

**Skip-quote shortcut:**
- For small/warranty/goodwill jobs, office can move Draft → Approved directly without generating a quote
- "Skip Quote" button on draft WOs — requires confirmation ("This job will proceed without customer approval")

**Priority levels:**
- Low (routine — schedule when convenient)
- Normal (standard turnaround)
- High (needs attention this week)
- Emergency (same-day/next-day — surfaces at top of office dashboard with visual urgency)

**Assignment:**
- Office assigns a tech + target date when moving to Scheduled
- If the assigned tech is unavailable, office can reassign to another tech (tracks reassignment history)
- Unassigned WOs appear in an "Unassigned" queue on the WO list page

**Follow-up WOs:**
- One visit per WO. Multi-day repairs use linked follow-up WOs
- "Create Follow-Up" button on a completed WO pre-fills customer, pool, category, and references the parent WO
- Follow-up chain visible on customer profile — shows the full repair history as a linked sequence

**Completion flow (tech side):**
- Tech marks "Arrived" (→ In Progress)
- Tech does the work
- Tech captures completion photos + notes describing what was done
- Tech marks "Complete" — triggers auto-notification to customer
- If parts were used that weren't on the original WO, tech can add them at completion (office reviews before invoicing)

**Auto-notifications throughout lifecycle:**
- Draft created from tech flag → office gets in-app alert + optional email
- Quote sent → customer gets email with PDF + approval link
- Customer approves/declines/requests changes → office gets in-app alert + email
- WO scheduled → customer gets "Your repair is scheduled for [date]" notification
- WO complete → customer gets "Your repair is complete" summary with photos
- Invoice generated → feeds into Phase 7 delivery

### Quote Presentation & Approval

**Delivery:**
- Email with branded PDF attachment (for records) + link to branded web approval page
- PDF and web page show identical information — web page adds interactive approve/decline/change buttons
- Signed JWT token in the approval link (same pattern as service report tokens from Phase 5)

**Quote detail shown to customer:**
- Company logo + branding (pulled from org settings)
- Quote number + date + expiration date
- Customer name + property address
- Job description / scope of work (rich text — what will be done and why)
- Full line-item breakdown: description, quantity, unit price, line total per item
- Subtotal, tax (itemized), grand total
- Terms and conditions (configurable in company settings)
- Tech who identified the issue (if flagged from field) — builds trust ("Your technician Aaron noticed...")

**Customer response options:**
- **Approve** — one-tap, optionally with e-signature capture (name + date, not drawn signature)
- **Decline** — requires selecting a reason: too expensive, getting other quotes, not needed, other (free text)
- **Request Changes** — customer writes a note describing what they want modified; office gets notified and revises

**Decline reasons matter:**
- "Too expensive" → office can follow up with a discount or alternative approach
- "Getting other quotes" → office knows to follow up in a few days
- "Not needed" → closes the loop, no follow-up needed
- Decline analytics visible in Phase 9 reporting (conversion rate, common decline reasons)

**Quote versioning:**
- Each revision creates a new version (v1, v2, v3...) — previous versions preserved for audit trail
- Customer always sees the latest version on the approval page
- Office can see version history with diff of what changed between versions
- Only the latest version can be approved

**Expiration:**
- Configurable default expiration (e.g. 30 days) — set per company in org settings
- Can be overridden per quote (e.g. 7 days for emergency pricing)
- 7 days before expiration: auto-reminder email to customer ("Your quote expires soon")
- Expired quotes: approval page shows "This quote has expired — contact [company] for an updated quote"
- Office can "Extend" an expired quote (resets expiration, optionally sends re-notification)

**Optional line items:**
- Individual line items can be marked as "optional" — customer can include or exclude them when approving
- Example: "Replace pump ($800) + Optional: upgrade to variable speed ($400 additional)"
- Approved total adjusts based on which optional items the customer selected
- Helps upsell without making the base quote feel inflated

### Line Items & Pricing

**Parts entry:**
- Saved parts/materials catalog with: name, description, default cost price, default sell price, category, SKU (optional)
- Catalog builds organically — when adding a custom item to a WO, option to "Save to catalog" for future use
- Search/filter catalog by name or category when adding items
- Quantity + unit (each, foot, gallon, hour, etc.)
- Free-form custom items always available for one-off entries

**Labor pricing (per line item):**
- **Hourly:** Set rate (per tech or company default) × hours. Tech can log actual hours at completion
- **Flat rate:** Fixed price for the job type. Common flat rates saveable as templates
- Each line item independently chooses hourly or flat rate
- Company default hourly rate configurable in org settings; can be overridden per tech (Phase 9 tracks pay vs bill rate)

**Parts markup:**
- Configurable default markup percentage in org settings (e.g. 30%)
- Override per item if needed (some items have standard MSRP)
- Cost price never shown to customer — only the customer-facing sell price
- Markup tracked for profitability reporting in Phase 9 (margin per WO, per job type, per tech)

**Tax handling:**
- Per-item taxability flag (default: parts taxable, labor not taxable — configurable)
- Company tax rate configured in org settings (single rate for Phase 6; multi-rate in Phase 7 if needed)
- Tax line shown separately on quotes and invoices
- "Tax exempt" flag per customer (e.g. commercial accounts) — overrides per-item taxability

**Discounts:**
- Per-item discount (percentage or fixed amount)
- Whole-order discount (percentage or fixed amount) — shown as a separate line
- Discount reason field (optional) — "repeat customer", "seasonal promo", "warranty goodwill"
- Discounts visible on quote and invoice

**WO templates for common jobs:**
- Save a WO as a template: pre-filled line items, descriptions, typical labor hours
- Examples: "Green Pool Cleanup", "Filter Clean & Inspect", "Pump Replacement", "Pool Opening", "Pool Closing"
- Template selection when creating a new WO pre-populates everything — office just adjusts quantities/prices
- Templates managed in company settings

### WO-to-Invoice Conversion

**Conversion flow:**
- "Prepare Invoice" button on completed WOs opens a review/edit screen
- Review screen shows all line items from the WO, pre-filled
- Office can: adjust quantities, modify prices, add/remove line items, apply additional discounts, add notes
- "Finalize Invoice" creates the invoice record and assigns an invoice number
- Side-by-side or diff view: original WO line items vs final invoice (highlights any modifications)

**Invoice record (Phase 6 scope):**
- Invoice number: auto-incrementing, configurable prefix (e.g. "INV-0001" or "2026-0001")
- Stores: all line items, tax, discounts, subtotal, total, customer info, WO reference, dates
- Status: Draft → Sent → Paid (Phase 7 manages Sent → Paid transition and payment methods)
- PDF generation: branded invoice PDF matching quote PDF style
- Invoice list page: filterable by status, customer, date range, amount

**What Phase 6 does NOT do (Phase 7):**
- Payment processing (Stripe, ACH)
- Send invoice to customer (Phase 7 adds email delivery + payment link)
- Dunning / payment reminders
- QuickBooks sync
- Batch invoicing for recurring service

**Multi-WO invoicing:**
- Multiple completed WOs for the same customer can be combined into a single invoice
- "Select WOs to invoice" on customer profile → review combined line items → finalize as one invoice
- Each line item section shows which WO it came from

**Credit notes / adjustments:**
- If a completed invoice needs adjustment, create a credit note (not edit the original)
- Credit note references the original invoice, shows the adjustment amount and reason
- Maintains clean audit trail

### Work Order Dashboard & List

**Office WO inbox:**
- Default view: all open WOs sorted by priority then date
- Filter chips: by status, priority, tech, customer, date range
- "Needs Attention" badge count: draft WOs from tech flags + customer change requests on quotes + overdue WOs
- Quick-action buttons on each row: Assign, Quote, Schedule (contextual based on current status)

**WO detail page:**
- Header: customer name, pool, category, priority badge, current status with progress indicator
- Timeline/activity log: every status change, note, photo, quote sent, customer response — chronological
- Line items section (editable until invoiced)
- Photos section (from tech flag + completion photos)
- Linked quotes (with version history)
- Linked invoice (if invoiced)
- Follow-up WOs (if any)
- Assignment history (who was assigned, when, reassignments)

**Customer profile integration:**
- Customer profile shows a "Work Orders" tab with all WOs for that customer
- WO count badge on customer card in the list view (open WOs only)
- Service history timeline (Phase 2) includes WO completions alongside regular service visits

### Edge Cases & Scenarios

**Customer declines a quote:**
- WO stays in Draft status (not deleted)
- Office can: revise and resend, cancel the WO, or close with "Customer declined" reason
- If "too expensive" decline → suggest office follow up with alternative scope

**Quote expires without response:**
- WO stays in Quoted status
- Office gets an alert: "Quote #X expired without response"
- Office can: extend expiration, resend, revise, or cancel

**Tech adds unexpected parts at completion:**
- Parts added by tech at completion are flagged as "Added at completion — review before invoicing"
- Office sees these highlighted in the invoice review step
- Prevents surprise charges on invoices without office awareness

**WO cancelled after parts were quoted:**
- Cancellation reason captures context
- No financial impact (nothing invoiced yet)
- Parts catalog items remain unchanged

**Duplicate/related WOs:**
- When creating a WO for a customer/pool that already has an open WO, show a warning: "This customer has [N] open work orders"
- Link related WOs manually if needed (e.g. "pump replacement" related to "leak investigation")

**WO overdue:**
- If a Scheduled WO's target date passes without moving to In Progress, it's flagged as overdue
- Overdue WOs surface in the alerts dashboard (Phase 5 integration)
- Office gets daily summary of overdue WOs

### Claude's Discretion
- Work order list page layout details (table vs card layout, column choices)
- Quote PDF template exact design and typography
- Parts catalog management UI specifics (modal vs page, bulk import)
- Invoice number generation scheme and prefix format
- WO assignment UI interaction pattern (dropdown vs modal vs inline)
- Notification email template designs
- Activity timeline component styling
- Mobile-responsive layout decisions for WO detail page
- Search/autocomplete behavior in parts catalog
- How "Save as Template" flow works in the UI

</decisions>

<specifics>
## Specific Ideas

- Tech field flagging should feel as fast as taking a photo — minimal form fields, category picker + camera + one-line note. Think "Instagram story" speed, not "fill out a form"
- Quote approval page should be clean and professional — customer sees company branding, not platform branding. Should feel like receiving a quote from a premium service company
- The "Request Changes" flow on quotes should feel like a conversation, not a formal process — customer writes a note, office gets it, revises, resends
- Invoice review step before finalizing prevents billing errors — office should see a clear diff of what's on the WO vs what the invoice will show
- Optional line items on quotes are a competitive differentiator — most pool software doesn't let customers pick/choose services. This enables upselling without price pressure
- WO templates save massive time for common jobs — a "Green Pool Cleanup" template with pre-filled chemical costs, labor hours, and description means office sends a quote in 30 seconds instead of 10 minutes
- The activity timeline on WO detail should tell the full story — anyone in the office should be able to open a WO and understand exactly what happened, when, and why without asking anyone
- Decline reason analytics are gold — knowing WHY customers say no lets the owner adjust pricing, service offerings, and follow-up strategy

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 06-work-orders-quoting*
*Context gathered: 2026-03-10*
