# Phase 9: Reporting & Team Analytics - Research

**Researched:** 2026-03-13
**Domain:** Analytics dashboards, charting, payroll prep, chemical profitability
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Dashboard layout & data density**
- Tabbed sections: Revenue, Operations, Team, Profitability — each tab is its own focused view
- Time period selection: preset ranges (this week, this month, last month, this quarter, this year, last year) PLUS custom date range picker
- Rich interactive charts with hover tooltips, click-to-drill-down, stacked bars, multiple series
- Revenue tab has both levels: summary KPI cards at top, ranked customer table below, clicking a customer opens a detailed revenue breakdown drawer/modal

**Technician scorecards**
- Default view is a ranked leaderboard table; button to switch to side-by-side comparison mode (select 2-3 techs)
- Full metrics coverage — both speed/volume (stops per day, average stop time, on-time completion rate) AND quality (chemistry accuracy, checklist completion rate, photo rate)
- Techs can see their own scorecard (not other techs') — self-improvement tool for field staff
- Trend indicators on every metric — green up arrow, red down arrow comparing to previous period

**Chemical profitability**
- Standard costs from dosing logs for Phase 9 — dosing quantities multiplied by cost-per-unit configured in settings (estimated but automatic); Phase 13 adds real purchase cost tracking
- Configurable margin threshold — owner sets a minimum profit margin %, pools below it get flagged
- Full visibility: flagged pools section at top of profitability tab, inline red/yellow highlighting on all pools, AND alerts on the alerts dashboard when a pool crosses the threshold
- Both per-pool AND per-tech chemical cost analysis — per-pool for profitability, per-tech for identifying over-dosing patterns compared to peers on similar pools

**Export & payroll prep**
- Generic CSV export that works with most payroll services (Gusto, ADP, etc.) — standard columns (employee, hours/stops, rate, gross pay, period)
- Every report tab has a CSV export button — revenue, operations, tech scorecards, profitability
- Configurable pay structure per tech: hourly OR per-stop — payroll calculates accordingly (hours * rate OR stops * per-stop rate)
- Include upsell commissions — if a tech flagged a repair that became a completed work order, a configurable commission % is included in the payroll export
- This is a simple CSV download, NOT payroll processing — Phase 11 handles actual payroll

### Claude's Discretion
- Charting library choice (Recharts, Tremor, etc.)
- Exact KPI card layout and responsive grid breakpoints
- Chart color palette (aligned with existing dark-first design system)
- Operations tab metrics selection and grouping
- Exact CSV column naming conventions
- How to calculate "on-time completion rate" from existing data
- Alert threshold defaults for chemical profitability

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| REPT-01 | Owner can view revenue dashboard (total revenue, by customer, by tech, trends) | Existing `invoices` table with `customer_id`, `paid_at`, `total`; existing `getRevenueByCustomer` action to extend; `billing_model` on invoices for breakdown |
| REPT-02 | Owner can view route completion rates and operational metrics | `route_stops` table with `status` ("complete"/"skipped"/"scheduled"), `tech_id`, `scheduled_date`; query counts complete vs missed per tech |
| REPT-03 | Owner can track technician pay and commission per stop and per upsell | Requires NEW `pay_rate`, `pay_type`, `commission_pct` fields on `profiles`; `work_orders.flagged_by_tech_id` + `assigned_tech_id` for upsell tracking |
| REPT-04 | Owner can view technician scorecards (stops/day, avg stop time, chemical efficiency, customer ratings) | `route_stops` + `service_visits` data available; stop time = `completed_at` vs route start (no explicit start time — proxy via `updated_at` transitions); chemistry accuracy derived from readings vs target ranges |
| REPT-05 | Owner can view chemical cost per pool profitability analysis (chemical spend vs recurring revenue) | Requires re-deriving dosing amounts from `chemistry_readings` JSONB + pool volume + product catalog; needs NEW `cost_per_unit` field on `chemical_products`; recurring revenue from `invoices` filtered by `billing_model` |
| REPT-06 | System flags unprofitable pools based on chemical cost vs revenue | Extends existing alert system (`alerts` table, `generateAlerts` pattern); new `alert_type = "unprofitable_pool"`; needs NEW `chem_profit_margin_threshold_pct` on `org_settings` |
</phase_requirements>

---

## Summary

Phase 9 extends the existing `/reports` page (which already has AR Aging, Revenue by Customer, and P&L tabs built in Phase 7) with four new tabs: Revenue (enhanced with charts and per-tech breakdown), Operations (route completion metrics), Team (scorecards and payroll prep), and Profitability (chemical cost vs revenue analysis). No new top-level page is created — all work happens within the existing `/reports` tabbed layout.

The primary technical decision is the charting library. Recharts 3.8.0 is the clear choice: it is the current stable version, has explicit React 19 peer dependency support, has zero competing dependencies with the existing stack, and is the library shadcn/ui's chart examples are built around. Tremor is a secondary option but requires its own design system which conflicts with the existing dark-first shadcn/ui setup.

The three hardest technical challenges are: (1) chemical cost calculation requires re-deriving dosing amounts from stored chemistry readings at query time — dosing amounts are not currently persisted to the database, so the Phase 9 solution is to add a `dosing_amounts` JSONB field to `service_visits` that the field completion flow populates going forward, with a fallback re-derivation path for historical data; (2) payroll prep requires new `pay_rate`, `pay_type`, and `commission_pct` fields on the `profiles` table that do not exist yet; (3) the chemical profitability alert requires a new `alert_type = "unprofitable_pool"` in `AlertType` and a new `chem_profit_margin_threshold_pct` field on `org_settings`.

**Primary recommendation:** Install Recharts 3.8.0, add three schema columns (two on `profiles`, one on `chemical_products`, two on `org_settings`), extend the existing `/reports` page with new tabs, and follow the established `generateAlerts` / `adminDb.insert` pattern for profitability alerts.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| recharts | 3.8.0 | Interactive charts (bar, line, area, pie) | Latest stable, explicit React 19 support, shadcn/ui example alignment, zero stack conflicts |
| @tanstack/react-table | 8.21.3 (already installed) | Sortable leaderboard and scorecard tables | Already in package.json, established pattern in WO/invoice lists |
| lucide-react | ^0.576.0 (already installed) | Trend arrows, KPI icons | Already in project |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| shadcn/ui Tabs | already installed | Tab navigation between Revenue/Ops/Team/Profitability | Extends existing /reports page structure |
| shadcn/ui Sheet/Dialog | already installed | Revenue drill-down drawer for customer detail | Click-to-drill-down on customer rows |
| shadcn/ui Select | already installed | Time period preset selector | Period picker dropdown |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| recharts | Tremor | Tremor has its own design system; conflicts with existing dark-first shadcn/ui setup; Tremor v3+ changed API significantly |
| recharts | nivo | Heavier bundle, less common in Next.js ecosystem, SSR complications |
| recharts | victory | Less maintained, fewer community examples |

**Installation:**
```bash
npm install recharts
```

---

## Architecture Patterns

### Recommended Project Structure
```
src/
├── app/(app)/reports/
│   └── page.tsx                  # EXTENDS existing — add 4 new tabs, don't rebuild
├── components/reports/
│   ├── ar-aging-view.tsx         # EXISTING — do not modify
│   ├── revenue-report.tsx        # EXISTING — do not modify
│   ├── pnl-report.tsx            # EXISTING — do not modify
│   ├── expense-entry-form.tsx    # EXISTING — do not modify
│   ├── revenue-dashboard.tsx     # NEW — Plan 09-01 (KPI cards + chart + customer table)
│   ├── operations-dashboard.tsx  # NEW — Plan 09-02 (completion rate, missed stops)
│   ├── team-dashboard.tsx        # NEW — Plan 09-03 + 09-04 (scorecards + payroll)
│   └── profitability-dashboard.tsx # NEW — Plan 09-05 (chemical cost analysis)
├── actions/
│   └── reporting.ts              # NEW — all new query server actions for Phase 9
└── lib/db/schema/
    ├── profiles.ts               # ADD: pay_rate, pay_type, commission_pct
    ├── chemical-products.ts      # ADD: cost_per_unit
    ├── org-settings.ts           # ADD: chem_profit_margin_threshold_pct, chem_commission_pct
    └── service-visits.ts         # ADD: dosing_amounts JSONB
```

### Pattern 1: Extending the Existing Reports Page

The current `reports/page.tsx` has 3 tabs. Phase 9 adds 4 more tabs. The approach is additive:

```typescript
// Source: existing src/app/(app)/reports/page.tsx pattern
export default async function ReportsPage() {
  // ... existing auth and data fetching ...

  // Add Phase 9 initial data fetches in parallel with existing
  const [arAging, revenueData, pnlData, expensesData,
         revenueDashboardData, operationsData, teamData, profitabilityData] =
    await Promise.all([
      getArAging(),
      getRevenueByCustomer(defaultStartDate, defaultEndDate),
      getPnlReport(defaultStartDate, defaultEndDate),
      getExpenses(defaultStartDate, defaultEndDate),
      // Phase 9 additions:
      getRevenueDashboard(defaultStartDate, defaultEndDate),
      getOperationsMetrics(defaultStartDate, defaultEndDate),
      getTeamMetrics(defaultStartDate, defaultEndDate),
      getProfitabilityAnalysis(defaultStartDate, defaultEndDate),
    ])

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
      <Tabs defaultValue="ar-aging" className="w-full">
        <TabsList className="grid w-full grid-cols-7"> {/* was 3, now 7 */}
          <TabsTrigger value="ar-aging">AR Aging</TabsTrigger>
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
          <TabsTrigger value="pnl">P&L</TabsTrigger>
          {/* New Phase 9 tabs: */}
          <TabsTrigger value="revenue-dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="operations">Operations</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="profitability">Profitability</TabsTrigger>
        </TabsList>
        {/* ... existing tab content ... */}
        {/* New tab content: */}
      </Tabs>
    </div>
  )
}
```

### Pattern 2: Recharts with Dark Mode Safe Colors

Recharts SVG paint properties (`fill`, `stroke`) CANNOT use `oklch()` CSS values or `var(--chart-1)` — SVG/canvas cannot parse oklch. Use hardcoded hex values that correspond to the design system chart palette.

```typescript
// Source: globals.css dark mode chart tokens mapped to hex
// --chart-1: oklch(0.65 0.19 231) ≈ sky-500 → #0ea5e9
// --chart-2: oklch(0.64 0.18 196) ≈ cyan-400 → #22d3ee
// --chart-3: oklch(0.72 0.16 162) ≈ teal-400 → #2dd4bf
// --chart-4: oklch(0.8 0.19 84)   ≈ amber-300 → #fcd34d
// --chart-5: oklch(0.7 0.2 27)    ≈ red-400   → #f87171

const CHART_COLORS = {
  primary:   "#0ea5e9",  // sky-500
  secondary: "#22d3ee",  // cyan-400
  tertiary:  "#2dd4bf",  // teal-400
  warning:   "#fcd34d",  // amber-300
  danger:    "#f87171",  // red-400
  muted:     "#475569",  // slate-600 (for grid lines, axis text)
} as const

// Usage in Recharts:
<BarChart data={data}>
  <XAxis dataKey="name" tick={{ fill: "#94a3b8" }} axisLine={false} tickLine={false} />
  <YAxis tick={{ fill: "#94a3b8" }} axisLine={false} tickLine={false} />
  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
  <Tooltip
    contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b" }}
    labelStyle={{ color: "#f8fafc" }}
    itemStyle={{ color: "#94a3b8" }}
  />
  <Bar dataKey="revenue" fill={CHART_COLORS.primary} radius={[4, 4, 0, 0]} />
</BarChart>
```

### Pattern 3: Recharts ResponsiveContainer

All Recharts charts MUST be wrapped in `ResponsiveContainer` for responsive behavior. The parent must have an explicit height.

```typescript
// Source: recharts.github.io docs pattern
"use client"
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts"

export function RevenueChart({ data }: { data: Array<{ month: string; revenue: number }> }) {
  return (
    <div style={{ height: 280 }}>  {/* Explicit pixel height required */}
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
          <XAxis dataKey="month" />
          <YAxis />
          <CartesianGrid strokeDasharray="3 3" />
          <Tooltip />
          <Bar dataKey="revenue" fill="#0ea5e9" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
```

### Pattern 4: Time Period Selector

The preset + custom range picker is a client component pattern. Use `useTransition` for async refetches, same as existing `revenue-report.tsx`.

```typescript
// Source: established pattern in src/components/reports/revenue-report.tsx
const PRESETS = [
  { label: "This week",   getDates: () => ({ start: startOfWeek(), end: today() }) },
  { label: "This month",  getDates: () => ({ start: startOfMonth(), end: today() }) },
  { label: "Last month",  getDates: () => ({ start: startOfLastMonth(), end: endOfLastMonth() }) },
  { label: "This quarter",getDates: () => ({ start: startOfQuarter(), end: today() }) },
  { label: "This year",   getDates: () => ({ start: startOfYear(), end: today() }) },
  { label: "Last year",   getDates: () => ({ start: startOfLastYear(), end: endOfLastYear() }) },
  { label: "Custom",      getDates: null }, // show date inputs when selected
] as const
```

### Pattern 5: Alert Integration (Unprofitable Pool)

Add a new `alert_type` to the existing system. The pattern is established in `src/actions/alerts.ts` and `src/lib/alerts/constants.ts`.

```typescript
// src/lib/alerts/constants.ts — extend AlertType union:
export type AlertType =
  | "missed_stop"
  | "declining_chemistry"
  | "incomplete_data"
  | "work_order_flagged"
  | "unprofitable_pool"   // NEW Phase 9

// src/actions/alerts.ts — add new generator function following the adminDb pattern:
async function _generateUnprofitablePoolAlerts(orgId: string): Promise<void> {
  // Query: pools where (chem_cost / invoice_revenue) exceeds threshold
  // Uses adminDb (not withRls) per existing pattern
  // ON CONFLICT DO NOTHING on unique(org_id, alert_type, reference_id)
}
```

### Pattern 6: Payroll Tech Configuration

New fields on `profiles` (pay structure) and `org_settings` (commission rate). Migration required.

```sql
-- New Drizzle migration needed:
ALTER TABLE profiles ADD COLUMN pay_type text DEFAULT 'per_stop'; -- 'per_stop' | 'hourly'
ALTER TABLE profiles ADD COLUMN pay_rate numeric(10,2);           -- per-stop rate OR hourly rate
ALTER TABLE org_settings ADD COLUMN chem_profit_margin_threshold_pct numeric(5,2) DEFAULT 20;
ALTER TABLE org_settings ADD COLUMN wo_upsell_commission_pct numeric(5,2) DEFAULT 0;
```

### Pattern 7: Chemical Cost Calculation

**Critical finding:** Dosing amounts are NOT currently persisted. The field workflow calculates recommendations at render time but does not store what was actually applied. Phase 9 has two paths:

**Path A (recommended — for future visits):** Add `dosing_amounts` JSONB column to `service_visits`. Populate during `completeStop` in `src/actions/visits.ts` — store the dosing recommendations array alongside chemistry readings.

**Path B (for historical data):** Re-derive dosing amounts from `chemistry_readings` at query time using the existing `generateDosingRecommendations()` function. This is approximate (uses current product catalog, not historical products).

Phase 9 must implement Path A going forward AND use Path B for historical reporting with a "estimated" label in the UI.

```typescript
// Chemical cost per visit calculation:
// 1. Get chemistry_readings from service_visits
// 2. Get pool volume from pools.volume_gallons
// 3. Get chemical products with cost_per_unit from chemical_products
// 4. Re-derive dosing via generateDosingRecommendations() OR use stored dosing_amounts
// 5. cost = sum(dose.amount * product.cost_per_unit)
```

**New required field:** `cost_per_unit` on `chemical_products` table — currently missing. Owner configures this in Settings > Chemical Products.

### Pattern 8: Tech Scorecard Self-View Route

Techs must be able to see their own scorecard only. The scorecard route is `/reports` but techs currently get redirected away (`if (user.role === "tech") redirect("/routes")`). This redirect must be modified to allow tech access with a filtered view — tech sees only their own data, no other techs, no financial data.

```typescript
// reports/page.tsx — updated access control:
const isTech = user.role === "tech"

// Techs see only the Team tab, scoped to their own ID
// Owner/office see all tabs
if (isTech) {
  // Fetch only the requesting tech's own scorecard data
  const techScorecard = await getTechScorecard(user.id, defaultStartDate, defaultEndDate)
  return <TechSelfScorecard data={techScorecard} />
}
```

### Anti-Patterns to Avoid

- **Using `var(--chart-1)` in Recharts props:** SVG/WebGL cannot parse CSS custom properties referencing oklch. Always use hex constants.
- **Nested queries in withRls for complex aggregations:** Use LEFT JOIN + GROUP BY in a single query. All MEMORY.md RLS warnings apply.
- **Rebuilding existing reports:** Do NOT replace AR Aging, Revenue by Customer, P&L, or CSV export. Add new tabs only.
- **Storing dosing cost inline in the report query:** Chemical cost involves joining visits → pools → products and running dosing calculations. This is a complex derived value — pre-compute it in the server action and cache the result, do not recalculate in component render.
- **Hardcoded redirect away from /reports for techs:** Current code redirects all techs to /routes. This must be changed to allow tech access to their own scorecard only.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Interactive charts | Custom SVG charts | recharts | Tooltips, responsive sizing, animations are non-trivial; recharts handles all of it |
| Sortable tables | Custom sort logic | @tanstack/react-table (already installed) | Already used in WO/invoice lists, consistent pattern |
| Date range math | Custom date utilities | Use existing `toLocalDateString` + manual arithmetic | The `date-utils.ts` already handles the critical timezone issue |
| CSV generation | Custom streaming | `Array.join(',')` pattern from existing `exportFinancialCsv` | Already established, no library needed for simple CSV |
| Trend calculation | Custom slope detection | Plain JS array arithmetic | Two-period comparison is just `(current - previous) / previous * 100` |

**Key insight:** The biggest complexity is SQL aggregations, not UI. The queries joining visits → pools → profiles → products are where engineering effort goes. Charts are declarative once data is shaped correctly.

---

## Common Pitfalls

### Pitfall 1: oklch Chart Colors in Recharts
**What goes wrong:** Passing CSS variable strings or oklch values to `fill`, `stroke`, `color` props in Recharts causes invisible or broken charts.
**Why it happens:** SVG rendering does not parse `oklch()` color functions. The design system uses oklch throughout.
**How to avoid:** Define a `CHART_COLORS` constant object with hex values in a shared file. Never pass `var(--chart-1)` to Recharts.
**Warning signs:** Charts render but series are invisible, or browser console shows SVG color parse errors.

### Pitfall 2: Dosing Amount Data Gap
**What goes wrong:** Historical service visits have chemistry readings but no stored dosing amounts. Chemical cost reports show $0 for all historical visits.
**Why it happens:** The dosing recommendations are calculated at render time and not persisted. The `chemistry_readings` JSONB stores readings, not doses.
**How to avoid:** (a) Add `dosing_amounts` JSONB to service_visits; (b) populate it in `completeStop`; (c) for historical data, re-derive with a "estimated" label; (d) document the data gap clearly in the UI.
**Warning signs:** Query returns visits with chemistry_readings but zero chemical cost.

### Pitfall 3: Tech Redirect Breaking Scorecard Access
**What goes wrong:** Techs navigate to `/reports` expecting to see their scorecard and get redirected to `/routes`.
**Why it happens:** Current `reports/page.tsx` has `if (user.role === "tech") redirect("/routes")`.
**How to avoid:** Replace blanket redirect with role-branched rendering — techs see a stripped-down scorecard-only view, not the full financial dashboard.
**Warning signs:** Tech users cannot access their own scorecard at all.

### Pitfall 4: Missing pay_rate / cost_per_unit Schema Fields
**What goes wrong:** Payroll CSV export produces $0 for all techs. Chemical cost shows $0 for all products.
**Why it happens:** `profiles.pay_rate` and `chemical_products.cost_per_unit` columns do not exist in the current schema.
**How to avoid:** The migration plan must add these fields FIRST, before building the reporting queries. The UI must handle the null/zero case gracefully ("Configure pay rate in team settings").
**Warning signs:** NULL values in payroll calculations or divide-by-zero in margin math.

### Pitfall 5: correlated Subqueries in Complex Aggregations
**What goes wrong:** Performance degradation or RLS policy failures when using subqueries that reference the outer row inside withRls.
**Why it happens:** MEMORY.md documents this as a critical Drizzle + Supabase RLS pitfall.
**How to avoid:** Use LEFT JOIN + GROUP BY for all multi-table aggregations. See existing `getArAging` and `getRevenueByCustomer` as correct patterns.
**Warning signs:** Queries that work in development fail in production, or unexpectedly return empty results.

### Pitfall 6: Stale Initial Data for Client-Side Tab Switching
**What goes wrong:** User switches to a tab, changes the date range, then switches back — the old server-fetched data renders briefly.
**Why it happens:** Server-fetched initial props are static; client-side refetches replace them via `useState`.
**How to avoid:** Follow the same `useState(initialData)` + `useTransition` + server action refetch pattern as `revenue-report.tsx`. Don't rely on Next.js `router.refresh()` for updating tab data.

---

## Code Examples

### Revenue by Tech Query (new — for REPT-01)
```typescript
// Source: extends existing pattern from src/actions/reports.ts
// Drizzle LEFT JOIN per MEMORY.md (no correlated subqueries on RLS tables)
const revenueByTech = await db
  .select({
    techId: invoices.customer_id,  // NOTE: need to join through invoices → customers → assigned_tech
    techName: profiles.full_name,
    totalRevenue: sql<string>`COALESCE(SUM(${invoices.total}::numeric), 0)::text`,
    invoiceCount: sql<number>`COUNT(*)::int`,
  })
  .from(invoices)
  .leftJoin(customers, eq(invoices.customer_id, customers.id))
  .leftJoin(profiles, eq(customers.assigned_tech_id, profiles.id))
  .where(
    and(
      eq(invoices.status, "paid"),
      sql`${invoices.paid_at} >= ${startDate}::timestamptz`,
      sql`${invoices.paid_at} < (${endDate}::date + interval '1 day')::timestamptz`
    )
  )
  .groupBy(customers.assigned_tech_id, profiles.full_name)
  .orderBy(sql`SUM(${invoices.total}::numeric) DESC`)
```

### Route Completion Rate Query (new — for REPT-02)
```typescript
// Completion rate = complete stops / (complete + scheduled-past + in_progress-past)
// "on-time" = completed on the scheduled_date (no cross-day definition available)
const completionStats = await db
  .select({
    techId: routeStops.tech_id,
    techName: profiles.full_name,
    totalStops: sql<number>`COUNT(*)::int`,
    completedStops: sql<number>`COUNT(*) FILTER (WHERE ${routeStops.status} = 'complete')::int`,
    skippedStops: sql<number>`COUNT(*) FILTER (WHERE ${routeStops.status} = 'skipped')::int`,
    missedStops: sql<number>`COUNT(*) FILTER (WHERE ${routeStops.status} NOT IN ('complete', 'skipped', 'holiday'))::int`,
  })
  .from(routeStops)
  .leftJoin(profiles, eq(routeStops.tech_id, profiles.id))
  .where(
    and(
      eq(routeStops.org_id, orgId),
      sql`${routeStops.scheduled_date} >= ${startDate}`,
      sql`${routeStops.scheduled_date} <= ${endDate}`,
      sql`${routeStops.scheduled_date} < ${today}`  // only past stops
    )
  )
  .groupBy(routeStops.tech_id, profiles.full_name)
```

### Stops Per Day Calculation (for REPT-04 scorecard)
```typescript
// stops_per_day = total completed stops / distinct days worked
const stopsPerDay = await db
  .select({
    techId: routeStops.tech_id,
    techName: profiles.full_name,
    completedStops: sql<number>`COUNT(*) FILTER (WHERE ${routeStops.status} = 'complete')::int`,
    daysWorked: sql<number>`COUNT(DISTINCT ${routeStops.scheduled_date}) FILTER (WHERE ${routeStops.status} = 'complete')::int`,
  })
  .from(routeStops)
  .leftJoin(profiles, eq(routeStops.tech_id, profiles.id))
  .where(/* date range + org filter */)
  .groupBy(routeStops.tech_id, profiles.full_name)
// stopsPerDay = completedStops / daysWorked (handle division by zero)
```

### Payroll CSV Generation (for REPT-03)
```typescript
// Source: extends pattern from exportFinancialCsv in src/actions/reports.ts
function generatePayrollCsv(rows: PayrollRow[]): string {
  const header = [
    "Employee Name", "Employee Email", "Pay Type", "Period Start", "Period End",
    "Completed Stops", "Hours Worked", "Pay Rate", "Base Pay",
    "Upsell Commissions", "Total Gross Pay"
  ].join(",")

  const lines = rows.map(r => [
    `"${r.name}"`,
    `"${r.email}"`,
    r.payType,               // 'per_stop' | 'hourly'
    r.periodStart,
    r.periodEnd,
    r.completedStops,
    r.hoursWorked ?? "",
    r.payRate,
    r.basePay.toFixed(2),
    r.commissions.toFixed(2),
    r.totalGross.toFixed(2),
  ].join(","))

  return [header, ...lines].join("\n")
}
```

### Recharts AreaChart Example (Revenue trend)
```typescript
// Source: recharts.github.io docs — responsive area chart pattern
"use client"
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts"

export function RevenueTrendChart({ data }: { data: Array<{ month: string; revenue: number }> }) {
  return (
    <div style={{ height: 240 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
          <defs>
            <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis dataKey="month" tick={{ fill: "#94a3b8", fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "#94a3b8", fontSize: 12 }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: 8 }}
            labelStyle={{ color: "#f8fafc" }}
          />
          <Area
            type="monotone"
            dataKey="revenue"
            stroke="#0ea5e9"
            strokeWidth={2}
            fill="url(#revenueGradient)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Recharts 2.x (React 18 only) | Recharts 3.8.0 (React 19 support) | Late 2024 | Full React 19 peer dep; some prop changes in v3 |
| Tremor v2 (premium components) | Tremor v3 (open source, Tailwind-based) | 2024 | Tremor changed API; not worth switching |
| Manual tooltip styling | Recharts Tooltip portal prop | v3.0 | Tooltip can now render outside SVG container |

**Deprecated/outdated:**
- Recharts 2.x: Works but lacks official React 19 peer dep declaration. Use 3.x.
- Tremor React charts: Conflicting design system; skip for this project.
- `CategoricalChartState` (Recharts internal): Removed in v3 — not relevant since we're not using `<Customized />`.

---

## Open Questions

1. **Average stop time calculation**
   - What we know: `route_stops` has `updated_at` and `status`; `service_visits` has `completed_at`. There is no explicit "started_at" timestamp on stops.
   - What's unclear: Can we derive stop duration? The `updated_at` on the stop when it transitions to "in_progress" is a proxy, but it's overwritten when the stop completes. No clean "time-on-site" field exists.
   - Recommendation: Track `started_at` in the stop workflow — add a timestamp when a tech marks a stop "in_progress" — OR approximate stop time as `service_visits.completed_at - route_stops.updated_at` with a note that it's approximate. The planner should decide whether to add `started_at` to `route_stops` as part of Phase 9.

2. **Chemistry accuracy metric**
   - What we know: `service_visits.chemistry_readings` stores actual readings. Target ranges are in `lib/chemistry/targets.ts`.
   - What's unclear: "Chemistry accuracy" = % of readings that fall within target range. This requires re-running `classifyReading()` on stored data at report time.
   - Recommendation: Calculate chemistry accuracy server-side in the scoring action. Fetch visits, pull readings JSONB, run `classifyReading()` per parameter, report % in-range. Performance concern for large orgs — may need to limit to last N visits per tech.

3. **Per-stop revenue for Revenue by Tech**
   - What we know: Invoices link to `customer_id`. Customers link to `assigned_tech_id`. But revenue is per-invoice, not per-stop.
   - What's unclear: A customer could have multiple techs over time (re-assignment). Revenue by tech could be ambiguous.
   - Recommendation: "Revenue by tech" = paid invoices for customers currently assigned to that tech. Clearly label this assumption in the UI ("Based on current tech assignment").

---

## Schema Changes Required

This section is critical for the planner — these migrations MUST be included in the plan.

### 1. `profiles` table — new pay structure fields
```typescript
// Add to src/lib/db/schema/profiles.ts:
pay_type: text("pay_type").default("per_stop"),  // 'per_stop' | 'hourly'
pay_rate: numeric("pay_rate", { precision: 10, scale: 2 }),
```

### 2. `chemical_products` table — new cost field
```typescript
// Add to src/lib/db/schema/chemical-products.ts:
cost_per_unit: numeric("cost_per_unit", { precision: 10, scale: 4 }),
// Unit is the same as the product's `unit` field (floz or lbs)
// e.g., $0.05 per fl oz of liquid chlorine
```

### 3. `org_settings` table — profitability threshold + commission config
```typescript
// Add to src/lib/db/schema/org-settings.ts:
chem_profit_margin_threshold_pct: numeric("chem_profit_margin_threshold_pct", { precision: 5, scale: 2 }).default("20"),
// Minimum % margin on chemical service revenue. Pools below this % are flagged.
wo_upsell_commission_pct: numeric("wo_upsell_commission_pct", { precision: 5, scale: 2 }).default("0"),
// % of completed WO total paid as commission to the tech who flagged it
```

### 4. `service_visits` table — store applied dosing amounts
```typescript
// Add to src/lib/db/schema/service-visits.ts:
dosing_amounts: jsonb("dosing_amounts"),
// Structure: Array<{ chemical: ChemicalKey; productId: string; amount: number; unit: string }>
// Populated by completeStop() action going forward
```

### 5. `alerts` — no schema change needed
The `alert_type` column is plain `text` — no enum constraint. Adding `"unprofitable_pool"` only requires:
- Adding to `AlertType` union in `src/lib/alerts/constants.ts`
- Adding to `AlertCounts` type if count display is needed
- Adding the new generator function in `src/actions/alerts.ts`

---

## Sources

### Primary (HIGH confidence)
- Codebase direct read — `src/actions/reports.ts`: Full existing reports action patterns
- Codebase direct read — `src/lib/db/schema/`: All table schemas and column definitions
- Codebase direct read — `src/lib/alerts/constants.ts` + `src/actions/alerts.ts`: Alert system patterns
- Codebase direct read — `src/app/globals.css`: Chart color tokens and design system
- `npm info recharts@3.8.0 peerDependencies`: React 19 explicit support confirmed
- GitHub recharts/recharts releases (WebFetch): v3.8.0 is March 2025 stable

### Secondary (MEDIUM confidence)
- GitHub recharts/recharts wiki 3.0-migration-guide (WebFetch): Breaking changes documented
- recharts.github.io (partial): API structure for LineChart/BarChart/AreaChart
- npm info recharts version: 3.8.0 confirmed as latest stable

### Tertiary (LOW confidence)
- WebSearch Recharts React 19 ecosystem discussion: General community patterns

---

## Metadata

**Confidence breakdown:**
- Standard stack (Recharts): HIGH — npm info confirmed version and React 19 peer deps
- Schema gaps identified: HIGH — direct codebase read confirmed missing fields
- Architecture patterns: HIGH — derived from existing code patterns in project
- Recharts v3 API specifics: MEDIUM — wiki migration guide read; full API docs partially inaccessible
- Chemical cost calculation approach: HIGH — confirmed dosing amounts not persisted by reading field workflow code
- Alert integration pattern: HIGH — read full alerts.ts and constants.ts

**Research date:** 2026-03-13
**Valid until:** 2026-04-13 (recharts stable releases; existing codebase patterns stable until schema changes)
