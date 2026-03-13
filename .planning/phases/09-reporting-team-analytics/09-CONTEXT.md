# Phase 9: Reporting & Team Analytics - Context

**Gathered:** 2026-03-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Owner-facing reporting dashboards for financial and operational visibility — revenue, team performance, chemical costs, and profitability. The owner can see the full picture without exporting to a spreadsheet. Techs can see their own scorecard only. All data is derived from existing service visits, invoices, payments, and dosing logs from Phases 1-8.

**Important boundaries:**
- A `/reports` page already exists (added in Phase 7) with AR aging, revenue by customer, P&L, and CSV export. Phase 9 EXTENDS this page with new tabs/sections — do NOT rebuild what's there.
- Payroll (time tracking, gross-to-net, direct deposit, tax filing) is Phase 11. Phase 9 only provides a simple **payroll prep CSV export** (stop counts, hours, rates) for import into external payroll services. Do NOT build payroll infrastructure — just export the data.

</domain>

<decisions>
## Implementation Decisions

### Dashboard layout & data density
- Tabbed sections: Revenue, Operations, Team, Profitability — each tab is its own focused view
- Time period selection: preset ranges (this week, this month, last month, this quarter, this year, last year) PLUS custom date range picker
- Rich interactive charts with hover tooltips, click-to-drill-down, stacked bars, multiple series
- Revenue tab has both levels: summary KPI cards at top, ranked customer table below, clicking a customer opens a detailed revenue breakdown drawer/modal

### Technician scorecards
- Default view is a ranked leaderboard table; button to switch to side-by-side comparison mode (select 2-3 techs)
- Full metrics coverage — both speed/volume (stops per day, average stop time, on-time completion rate) AND quality (chemistry accuracy, checklist completion rate, photo rate)
- Techs can see their own scorecard (not other techs') — self-improvement tool for field staff
- Trend indicators on every metric — green up arrow, red down arrow comparing to previous period

### Chemical profitability
- Standard costs from dosing logs for Phase 9 — dosing quantities multiplied by cost-per-unit configured in settings (estimated but automatic); Phase 13 adds real purchase cost tracking
- Configurable margin threshold — owner sets a minimum profit margin %, pools below it get flagged
- Full visibility: flagged pools section at top of profitability tab, inline red/yellow highlighting on all pools, AND alerts on the alerts dashboard when a pool crosses the threshold
- Both per-pool AND per-tech chemical cost analysis — per-pool for profitability, per-tech for identifying over-dosing patterns compared to peers on similar pools

### Export & payroll prep
- Generic CSV export that works with most payroll services (Gusto, ADP, etc.) — standard columns (employee, hours/stops, rate, gross pay, period)
- Every report tab has a CSV export button — revenue, operations, tech scorecards, profitability
- Configurable pay structure per tech: hourly OR per-stop — payroll calculates accordingly (hours * rate OR stops * per-stop rate)
- Include upsell commissions — if a tech flagged a repair that became a completed work order, a configurable commission % is included in the payroll export
- **This is a simple CSV download, NOT payroll processing** — Phase 11 handles actual payroll (gross-to-net, tax withholding, direct deposit, etc.)

### Claude's Discretion
- Charting library choice (Recharts, Tremor, etc.)
- Exact KPI card layout and responsive grid breakpoints
- Chart color palette (aligned with existing dark-first design system)
- Operations tab metrics selection and grouping
- Exact CSV column naming conventions
- How to calculate "on-time completion rate" from existing data
- Alert threshold defaults for chemical profitability

</decisions>

<specifics>
## Specific Ideas

- Revenue tab should feel like a financial command center — owner opens it and immediately knows the business health
- Tech scorecard comparison mode should make it obvious at a glance who's performing well vs. who needs coaching
- Chemical profitability alerts should integrate with the existing Phase 5 alerts dashboard — same alert type system, just a new alert category
- Payroll export is a stopgap until Phase 11 builds native payroll — keep it simple (CSV download), don't over-engineer
- The existing `/reports` page from Phase 7 already has AR aging, revenue by customer, P&L, and CSV export — Phase 9 extends it with new tabs, don't duplicate or rebuild existing reports

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 09-reporting-team-analytics*
*Context gathered: 2026-03-13*
