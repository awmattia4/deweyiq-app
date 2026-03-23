# Phase 13: Truck Inventory & Shopping Lists - Context

**Gathered:** 2026-03-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Full truck inventory management system — per-tech truck inventory with auto-decrement from chemical dosing logs, shopping lists with procurement lifecycle, barcode/QR scanning throughout, "What to Bring" pre-route summaries, purchasing dashboard with PO generation, and QBO item sync. The `/inventory` page is the operational hub; parts catalog definition stays in Settings.

</domain>

<decisions>
## Implementation Decisions

### Truck Inventory UX
- Tech can confirm/adjust auto-deducted amounts after dosing — a quick confirmation prompt shows what was deducted from inventory, tech can adjust if actual amount differed
- Reorder alerts use both push notifications (first alert when item drops below threshold) AND persistent badge on inventory section until restocked
- Barcode/QR scanning available everywhere — add items, mark received, mark loaded, log usage

### Shopping List Flow
- Barcode scanning integrated into all shopping list actions (add, receive, load, use)
- First-time barcode scan: attempt UPC lookup API to auto-fill product details; if not found, prompt manual entry (name, category, unit). Barcode-to-item mapping saved org-wide — once any tech identifies a barcode, all techs recognize it
- Full scanning integration: scan to add items, mark received, mark loaded on truck, log usage

### "What to Bring" Summary
- Located on a dedicated "Prep" tab on the routes page — tech taps into it before heading out
- Shortage highlighting: sorted by urgency (missing items first, low next, stocked last) AND color-coded (red for out of stock, yellow for low, neutral for stocked)
- Default view shows WO/stop requirements; expandable "Predicted Needs" section uses pool dosing history to estimate chemical needs
- Predictions toggle between explicit requirements and history-based estimates

### Purchasing Dashboard
- Two views: supplier grouping (for ordering) and urgency grouping (for prioritizing) — toggle between them
- PO generation supports both formal PDF/email to supplier AND simple checklist mode (mark as ordered with date/notes) — because some suppliers can't receive email POs
- Spending insights: time-based trends (monthly/weekly spend, cost per unit over time, spending by category) AND comparative breakdowns (by tech, by supplier, by route)

### QBO Integration
- Ongoing two-way sync between QuickBooks Online item catalog and DeweyIQ parts catalog — changes in either system reflect in the other

### Claude's Discretion
- Truck inventory layout style (categorized list vs card grid — match existing app patterns)
- Transfer mechanism between techs (peer-to-peer confirmation vs one-sided with office reconciliation — pick what's most practical)
- Shopping list scope (per-tech vs shared vs both — pick based on what works best operationally)
- Procurement lifecycle granularity (full lifecycle vs simplified — pick the right level of detail)
- Whether "What to Bring" summary is actionable (tap to mark loaded/add to list) or informational only

</decisions>

<specifics>
## Specific Ideas

- Barcode scanning should attempt online product database lookup (UPC API) before falling back to manual entry — the goal is "scan it once, know it forever" across the whole org
- PO generation needs two modes because real-world suppliers vary — some accept email POs, others just get a phone call with a list
- "What to Bring" should feel like a morning prep checklist — tech opens it, knows exactly what to load before leaving the shop
- Chemical predictions based on pool history help techs avoid under-loading but should be clearly separated from confirmed requirements
- **CRITICAL: Review existing commits and code before implementing.** This phase touches existing systems (parts catalog, dosing logs, route pages, work orders). Researchers and planners MUST read recent git history and existing code to understand current state — do NOT break or revert any existing functionality. Additive changes only; extend, don't replace.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 13-truck-inventory-shopping-lists*
*Context gathered: 2026-03-23*
