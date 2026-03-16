# Phase 11: Payroll, Team Management & Full Accounting - Context

**Gathered:** 2026-03-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Complete QuickBooks replacement for pool service companies — embedded payroll processing (not built from scratch), time tracking with per-stop granularity, full double-entry accounting with simplified owner view, bank reconciliation via Plaid, payment reconciliation from Stripe/QBO, expense tracking, and financial reporting. Extends Phase 9's tech pay/commission tracking and payroll export — review and build on what exists, don't rebuild.

</domain>

<decisions>
## Implementation Decisions

### Payroll Approach
- Embedded payroll API provider (Check, Gusto Embedded, or similar) — NOT native payroll engine
- Claude's discretion on specific provider selection during research phase (evaluate Check vs Gusto Embedded vs alternatives based on API flexibility, white-label capability, pricing, and pool company fit)
- Support both W-2 employees AND 1099 contractors — pool companies commonly use both
- Tech self-service for pay stubs, YTD earnings, tax documents (W-2/1099), and direct deposit setup — accessible from the tech's app, reducing owner admin burden

### Time Tracking Experience
- Big "Clock In" / "Start Day" button prominently placed at top of the route page — explicit, one-tap, captures timestamp + GPS
- Per-stop granularity with drive time tracking — on-site time per stop AND drive time between stops, calculated from geofence arrival/departure at each address
- Break handling: manual "Take Break" button on route page AND auto-detection of idle gaps (configurable threshold) as safety net — both modes active simultaneously
- Live tech location map during work day — extends existing Phase 4 dispatch GPS broadcast with time-tracking context (clocked in, on break, at stop, driving)

### Accounting Depth
- Simplified owner view by default — owner sees income, expenses, profit, cash position, and reports (P&L, Balance Sheet, Cash Flow) without debit/credit terminology
- "Accountant Mode" toggle reveals full double-entry detail — journal entries, trial balance, chart of accounts with debit/credit columns — for power users or CPA handoff
- Chart of accounts pre-seeded specifically for pool service companies — Chemical Supplies, Vehicle/Fuel, Equipment Parts, Service Revenue, Repair Revenue, Subcontractor Expense, etc. — customizable by owner
- Expense tracking: quick receipt photo capture (with OCR amount extraction if possible) for day-to-day field expenses + full AP workflow (vendor bills, scheduled payments, bank matching) for recurring supplier relationships — different entry points, same ledger
- Mileage tracking: auto-calculated from GPS breadcrumbs during route work days + manual entry for non-route trips — produces IRS-ready mileage log

### Bank Feeds & Reconciliation
- Smart auto-match bank transactions to invoices/payments/expenses using amount, date, and description — owner reviews matches and handles unmatched items (QuickBooks bank feeds pattern)
- Multiple bank account support — checking, savings, credit cards, business loans — each connected via Plaid separately
- Fully automatic Stripe payout reconciliation — system auto-creates matching journal entry and reconciles against bank feed with no manual work
- Per-transaction Stripe fee tracking — each payment records gross amount, fee amount, and net deposit separately; fees auto-categorized as "Payment Processing Fees" expense

### Claude's Discretion
- Specific embedded payroll provider selection (Check vs Gusto Embedded vs alternatives)
- Geofence radius configuration defaults
- Break auto-detection threshold defaults
- Exact OCR approach for receipt scanning
- Timesheet approval workflow details
- Period close process details
- Exact chart of accounts line items

</decisions>

<specifics>
## Specific Ideas

- Clock-in button should be the first thing a tech sees in the morning — prominent, unmissable
- Accounting should never feel like "accounting software" to a pool company owner — simplified view is the default, accountant mode is opt-in
- Chart of accounts should use pool industry language (not generic accounting terms) in the simplified view
- Break tracking needs to be friction-free for techs — one tap to start, one tap to end, auto-detect as backup

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 11-payroll-team-management-full-accounting*
*Context gathered: 2026-03-16*
