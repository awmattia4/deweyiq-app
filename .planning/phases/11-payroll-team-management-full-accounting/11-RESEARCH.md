# Phase 11: Payroll, Team Management & Full Accounting - Research

**Researched:** 2026-03-16
**Domain:** Time tracking, QBO time entry push, Plaid bank feeds, double-entry accounting, geofence-based stop timing, receipt OCR, mileage tracking
**Confidence:** MEDIUM-HIGH (core stack verified; some external APIs require integration validation)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Payroll Approach
- Payroll runs entirely through QuickBooks Online (QBO Payroll or owner's connected provider like Gusto/ADP). DeweyIQ's only job is pushing **time entries** to QBO — hours worked, per-stop times, drive time, breaks. All pay rates, deductions, tax withholding, direct deposit, pay stubs, W-2/1099 generation live in QBO. DeweyIQ does NOT manage pay rates, commission structures, or any payroll processing.
- Tech self-service limited to viewing their logged hours and timesheet history in the DeweyIQ app. Everything else (pay stubs, tax docs, direct deposit) is accessed through QBO/payroll provider.

#### Time Tracking Experience
- Time clock is an **org-level toggle** in Settings — optional, not forced on every company. When disabled, no clock-in/out UI appears and time tracking features are hidden entirely.
- Big "Clock In" / "Start Day" button prominently placed at top of the route page — explicit, one-tap, captures timestamp + GPS
- **Clock In and Start Route are visually separate actions** — clock-in is a shift/payroll action, Start Route triggers pre-arrival notifications and route tracking. Must not conflict or confuse. Clock In could be a persistent banner/bar above the route list; Start Route stays as the existing button on the first stop or route header. A tech might clock in before driving to their first stop, then start route when they arrive.
- Per-stop granularity with drive time tracking — on-site time per stop AND drive time between stops, calculated from geofence arrival/departure at each address
- Break handling: manual "Take Break" button on route page AND auto-detection of idle gaps (configurable threshold) as safety net — both modes active simultaneously
- Live tech location map during work day — extends existing Phase 4 dispatch GPS broadcast with time-tracking context (clocked in, on break, at stop, driving)

#### Accounting Depth
- Simplified owner view by default — owner sees income, expenses, profit, cash position, and reports (P&L, Balance Sheet, Cash Flow) without debit/credit terminology
- "Accountant Mode" toggle reveals full double-entry detail — journal entries, trial balance, chart of accounts with debit/credit columns — for power users or CPA handoff
- Chart of accounts pre-seeded specifically for pool service companies — Chemical Supplies, Vehicle/Fuel, Equipment Parts, Service Revenue, Repair Revenue, Subcontractor Expense, etc. — customizable by owner
- Expense tracking: quick receipt photo capture (with OCR amount extraction if possible) for day-to-day field expenses + full AP workflow (vendor bills, scheduled payments, bank matching) for recurring supplier relationships — different entry points, same ledger
- Mileage tracking: auto-calculated from GPS breadcrumbs during route work days + manual entry for non-route trips — produces IRS-ready mileage log

#### Bank Feeds & Reconciliation
- Smart auto-match bank transactions to invoices/payments/expenses using amount, date, and description — owner reviews matches and handles unmatched items (QuickBooks bank feeds pattern)
- Multiple bank account support — checking, savings, credit cards, business loans — each connected via Plaid separately
- Fully automatic Stripe payout reconciliation — system auto-creates matching journal entry and reconciles against bank feed with no manual work
- Per-transaction Stripe fee tracking — each payment records gross amount, fee amount, and net deposit separately; fees auto-categorized as "Payment Processing Fees" expense

### Claude's Discretion
- Geofence radius configuration defaults
- Break auto-detection threshold defaults
- Exact OCR approach for receipt scanning
- Timesheet approval workflow details
- Period close process details
- Exact chart of accounts line items

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TEAM-01 | Owner can define pay rates per employee — hourly base rate, per-stop rate, overtime multiplier, and effective date | **CONTEXT OVERRIDE**: DeweyIQ does NOT manage pay rates — this lives in QBO. DeweyIQ only tracks events (stops completed, hours clocked) and pushes time entries. Rate history is a QBO concern. |
| TEAM-02 | System auto-tracks employee clock-in/clock-out times with GPS stamp | New `time_entries` table with `clock_in_at`, `clock_out_at`, `clock_in_lat`, `clock_in_lng`. Org-level toggle in `org_settings.time_tracking_enabled`. Tech taps Clock In button on routes page. |
| TEAM-03 | System auto-logs drive time vs. on-site time per stop using route start, arrival, departure, and next-stop timestamps | Derives from GPS watch: when tech enters geofence radius of stop address, record `arrived_at`; when leaves, record `departed_at`. Store on `time_entry_stops` table linked to `route_stops`. |
| TEAM-04 | Owner can view and edit weekly timesheets per employee — with auto-calculated regular hours, overtime hours (configurable threshold, default 40hr/week), and PTO/sick time entries | New timesheet review page at `/settings/team/timesheets` (owner only). Overtime calculation: total clocked hours > 40/week = overtime (configurable threshold in org_settings). |
| TEAM-05 | Owner can manage PTO balances per employee — accrual rules, manual adjustments, request/approval workflow, balance tracking | New `pto_balances` + `pto_requests` tables. Simple accrual: hours per pay period. Approval flow: tech requests → owner approves/denies. |
| TEAM-06 | Owner can set and manage employee schedules — availability windows per day of week, blocked dates | New `employee_availability` table with day_of_week + time windows. Blocked dates in a separate `employee_blocked_dates` table. Schedule assignment respects these. |
| TEAM-07 | System tracks commission and bonus per employee | **CONTEXT OVERRIDE**: DeweyIQ does NOT manage commission structures. Phase 9 already tracks upsell commission events. DeweyIQ logs the events (stop completions, WO flags) that QBO uses. |
| TEAM-08 | Owner can view a team management dashboard — all employees with current status, today's hours, weekly hours, PTO balance, and alerts | New `/settings/team` page (owner only). Live status via Supabase Realtime on `time_entries` table. Shows clocked_in, on_break, at_stop, driving states derived from time_entry events. |
| TEAM-09 | Owner can store and track employee certifications and documents — CPO certification, driver's license, insurance, with expiration date alerts | New `employee_documents` table with `doc_type`, `expires_at`, `file_url` (Supabase Storage). Alert when within 30 days of expiry. |
| TEAM-10 | Owner can configure pay periods (weekly, bi-weekly, semi-monthly) and the system auto-generates pay period summaries at close | `org_settings.pay_period_type` enum. Pay period summary at close = aggregate `time_entries` and push to QBO. |
| TEAM-11 | System enforces break compliance — configurable rules, alerts if employee skips required break | Auto-detect idle gap > threshold (configurable in org_settings, recommend default 4 hours on shift = required break). Alert via `notifyOrgRole('owner')` if break skipped. |
| TEAM-12 | Owner can view labor cost analysis — labor cost per stop, per route, per customer | Derives from `time_entry_stops.onsite_minutes` × profile.pay_rate (stored in QBO, but DeweyIQ tracks hours; cost = hours × rate if rate configured locally for reporting). Phase 9's `getPayrollPrep` already calculates per-tech totals — extend to per-stop. |
| TEAM-13 | Geofence-based automatic per-stop time tracking — configurable geofence radius, background mode, arrival/departure logging, real-time map | Geofence detection must be foreground-only in PWA (confirmed: Web Geolocation API stops in background). Implement as enhanced GPS watch within `GpsBroadcaster` that compares current coords to stop addresses. Default radius: 100m. |
| TEAM-14 | Traditional punch in/out clock — manual clock in/out with GPS, independent of geofence tracking | Clock In button on routes page + Clock Out button in same position. GPS stamp on tap. Both exist simultaneously with geofence auto-detection. |
| PAYRL-01 through PAYRL-15 | Full payroll processing (gross-to-net, tax, direct deposit, W-2/1099, etc.) | **CONTEXT OVERRIDE - OUT OF SCOPE for DeweyIQ**: These live entirely in QBO. DeweyIQ's payroll job = push `TimeActivity` records to QBO Accounting API with Hours, Minutes, TxnDate, EmployeeRef. QBO Payroll runs from there. |
| ACCT-01 | Chart of accounts — pre-seeded for pool service, customizable | New `chart_of_accounts` table with `account_number`, `account_name`, `account_type` (asset/liability/equity/income/expense), `parent_id` (tree structure), `is_system` (cannot delete), `display_name` (pool-friendly label). |
| ACCT-02 | Double-entry bookkeeping | New `journal_entries` + `journal_entry_lines` tables. Every financial event (invoice, payment, expense, payout) auto-generates a balanced journal entry. Balance constraint: sum of all line amounts = 0 per entry. |
| ACCT-03 | P&L, Balance Sheet, Cash Flow reports | Build on Phase 9's P&L queries — extend with Balance Sheet (assets vs liabilities+equity) and Cash Flow (operating/investing/financing buckets) using journal_entry_lines queries. |
| ACCT-04 | Financial dashboard | New `/accounting` page with simplified view (income, expenses, profit, cash position) and Accountant Mode toggle in org_settings. |
| ACCT-05 | Manual journal entries | Owner (Accountant Mode only) can create manual journal entries with debit/credit lines. |
| ACCT-06 | Plaid bank feeds — multiple accounts | New `bank_accounts` + `bank_transactions` tables. Plaid Link flow (server: `/link/token/create` → client: `usePlaidLink` → server: exchange public_token → store access_token). Use `plaid` npm package. |
| ACCT-07 | Bank reconciliation — smart auto-match | Auto-match `bank_transactions` to `journal_entries` / `payment_records` / `expenses` by amount + date proximity (±3 days) + description similarity. Unmatched items queue for owner review. |
| ACCT-08 | Expense tracking — quick receipt photo + full AP workflow | Extend existing `expenses` table: add `bank_transaction_id` FK, `receipt_url` (already exists), `ocr_extracted_amount`, `vendor_id`. New `vendors` table for AP. OCR via Google Cloud Vision DOCUMENT_TEXT_DETECTION. |
| ACCT-09 | AR/AP aging | Phase 7 already has `getArAging()` — extend with AP aging (bills overdue). |
| ACCT-10 | Sales tax tracking | Extend invoice schema — already has `tax_amount`. New `sales_tax_rates` table per jurisdiction. Reconcile via journal entries. |
| ACCT-11 | Financial dashboard (already in ACCT-04) | Same as ACCT-04. |
| ACCT-12 | Manual journal entries (already in ACCT-05) | Same as ACCT-05. |
| ACCT-13 | Audit trail | All journal entries are immutable — reversal entries only (no UPDATE/DELETE on posted entries). Track `created_by`, `posted_at`. |
| ACCT-14 | Period close | New `accounting_periods` table. Owner closes period → marks `closed_at` → prevents posting to closed periods. |
| ACCT-15 | Mileage tracking | New `mileage_logs` table. Auto-calculate from GPS breadcrumbs stored on `time_entries` during route day. Manual entry for non-route trips. IRS-compliant export (date, origin, destination, purpose, miles, rate). 2026 rate: $0.725/mile. |
| PAY-01 | Stripe Connect payment processing | Already implemented in Phase 7. |
| PAY-02 | Payment reconciliation (Stripe payouts) | Stripe `payout.paid` webhook → auto-create journal entry (Dr: Bank, Cr: Stripe Clearing) + auto-match to Plaid bank transaction. Per-payment fee tracking: gross, fee, net. |
| PAY-03 | QBO payment reconciliation | QBO webhook already implemented in Phase 7. Extend: auto-generate journal entry on QBO payment receipt. |
| PAY-04 | Payment plans | New `payment_plans` table with installment schedule. Split invoice total across payment milestones. |
| PAY-05 | Customer credits | New `customer_credits` table. Apply credit as a line item offset on invoices. Journal: Dr: AR, Cr: Customer Credits. |
| PAY-06 | Collections dashboard | New section in `/billing` page. Filters: overdue > 60 days, failed autopay, multiple missed payments. Owner-only view. |
| PAY-07 | Refund entries | Journal entry on refund: Dr: Service Revenue (or appropriate income), Cr: Bank/Stripe. Reversal of original payment journal entry. |
</phase_requirements>

---

## Summary

Phase 11 is fundamentally a **data integration and accounting infrastructure phase**, not a UI-heavy feature phase. The three major technical domains are: (1) time tracking with QBO time entry push, (2) double-entry accounting ledger with a pool-company-specific chart of accounts, and (3) Plaid bank feed integration with smart reconciliation. Each domain requires new database tables, new server actions, and new UI pages.

The most critical architectural decision (already made in CONTEXT.md): DeweyIQ does NOT run payroll. It is a data collection and push layer. Time entries are collected here and pushed to QBO's `TimeActivity` entity using the existing `node-quickbooks` library (already at v2.0.48 in package.json). Pay rates, taxes, and pay stubs are QBO's responsibility. This dramatically reduces scope for the PAYRL-* requirements — they are QBO's job, DeweyIQ just feeds them data.

Phase 9 already built the payroll prep foundation: `getPayrollPrep()` and `exportPayrollCsv()` in `src/actions/reporting.ts`, `pay_type`/`pay_rate` on the `profiles` table, and the tech scorecard. Phase 11 upgrades this from "CSV export for Gusto/ADP" to "direct QBO time entry push with real clock-in timestamps." The geofence-based per-stop timing is foreground-only in PWA (confirmed critical limitation — background geolocation is not available in web apps without native wrappers).

**Primary recommendation:** Build the phase in clear domain tracks: (A) time tracking + QBO push first as it unblocks payroll, (B) accounting ledger infrastructure, (C) Plaid bank feeds + reconciliation, (D) expense/mileage enhancements, (E) team management UI (PTO, certs, availability). Plaid is a new external dependency requiring a Plaid developer account and `plaid` npm package install.

---

## Standard Stack

### Core (New Dependencies)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `plaid` | latest (~29.x) | Plaid Node SDK for bank feeds | Official Plaid SDK; handles Link token, public token exchange, transactions/sync |
| `react-plaid-link` | latest (~3.x) | React hook for Plaid Link UI flow | Official Plaid React bindings; `usePlaidLink` returns `open`, `ready`, `error` |

### Existing Stack (No New Dependencies for Most Features)
| Library | Already In | Purpose | Phase 11 Use |
|---------|-----------|---------|--------------|
| `node-quickbooks` | v2.0.48 | QBO API client | Push TimeActivity records; already has `createTimeActivity()` |
| `intuit-oauth` | v4.2.2 | QBO OAuth token management | Token refresh (already implemented in `lib/qbo/client.ts`) |
| `stripe` | v20.4.1 | Stripe webhook processing | `payout.paid` webhook for auto-reconciliation |
| `drizzle-orm` | v0.45.1 | DB ORM | New tables: time_entries, journal_entries, chart_of_accounts, bank_accounts, etc. |
| Supabase Storage | existing | File storage | Receipt photos for OCR, employee documents |
| `recharts` | v3.8.0 | Charts | Financial dashboards (P&L trend, cash flow) |

### Optional (Claude's Discretion — OCR)
| Library | Version | Purpose | Recommendation |
|---------|---------|---------|----------------|
| `@google-cloud/vision` | ^4.x | Receipt OCR | Use Google Cloud Vision DOCUMENT_TEXT_DETECTION for receipt amount extraction. Alternative: Claude Vision API via Anthropic SDK (already likely available). Recommended: start without OCR (manual entry fallback), add as a discrete task. |

**Installation (new dependencies only):**
```bash
npm install plaid react-plaid-link
```

---

## Architecture Patterns

### Recommended New File Structure
```
src/
├── actions/
│   ├── time-tracking.ts          # clock-in/out, break events, per-stop timing, QBO push
│   ├── accounting.ts             # chart of accounts, journal entries, period close
│   ├── bank-feeds.ts             # Plaid link token, token exchange, sync
│   └── reconciliation.ts        # auto-match bank txns, manual match/unmatch
├── lib/
│   ├── qbo/
│   │   ├── client.ts             # existing — no changes
│   │   ├── mappers.ts            # existing — extend with mapTimeActivityToQbo
│   │   └── time-sync.ts          # NEW: pushTimeEntriesToQbo batch function
│   ├── accounting/
│   │   ├── journal.ts            # createJournalEntry(), postEntry(), reverseEntry()
│   │   ├── chart-of-accounts.ts  # seedPoolCompanyAccounts(), account type helpers
│   │   └── reconciliation.ts     # matchBankTransaction(), score-based matching algorithm
│   └── plaid/
│       └── client.ts             # plaidClient factory, link token helpers
├── components/
│   ├── field/
│   │   ├── clock-in-banner.tsx   # Persistent clock-in/out strip on routes page
│   │   └── break-button.tsx      # One-tap break start/end on routes page
│   ├── team/
│   │   ├── timesheet-view.tsx    # Owner weekly timesheet table with edit
│   │   ├── pto-manager.tsx       # PTO balance + request/approval
│   │   ├── employee-docs.tsx     # Cert/doc upload with expiry alerts
│   │   └── team-dashboard.tsx    # Live status map + today's hours
│   ├── accounting/
│   │   ├── financial-dashboard.tsx # P&L, Balance Sheet, Cash Flow (simplified view)
│   │   ├── journal-entry-list.tsx  # Accountant Mode: full double-entry ledger
│   │   ├── bank-feed.tsx           # Bank transactions + match interface
│   │   └── reconcile-panel.tsx     # Unmatch queue + match confirmation
│   └── settings/
│       ├── plaid-connect.tsx     # Bank account connection via Plaid Link
│       └── time-tracking-settings.tsx  # Org toggle, geofence radius, break threshold
└── app/(app)/
    ├── accounting/page.tsx       # Financial dashboard (owner/office)
    ├── team/page.tsx             # Team management (owner only)
    └── routes/page.tsx           # extend: add ClockInBanner when time_tracking_enabled
```

### Pattern 1: Clock-In/Clock-Out State Machine
**What:** Tech shifts have a clear state: `off_shift → clocked_in → on_break → clocked_in → clocked_out`. Store state in a `time_entries` table row per shift, not in React state.
**When to use:** All time tracking UI. State must survive page navigation and re-renders (Dexie pattern from MEMORY.md).
**Key insight:** Clock-in state must be readable server-side (for owner dashboard) AND client-side (for tech UI). Use `time_entries` DB row as source of truth, not React state.

```typescript
// src/lib/db/schema/time-entries.ts (NEW)
export const timeEntries = pgTable("time_entries", {
  id: uuid("id").defaultRandom().primaryKey(),
  org_id: uuid("org_id").notNull().references(() => orgs.id),
  tech_id: uuid("tech_id").notNull().references(() => profiles.id),
  // Shift-level fields
  clocked_in_at: timestamp("clocked_in_at", { withTimezone: true }).notNull(),
  clocked_out_at: timestamp("clocked_out_at", { withTimezone: true }),
  clock_in_lat: doublePrecision("clock_in_lat"),
  clock_in_lng: doublePrecision("clock_in_lng"),
  clock_out_lat: doublePrecision("clock_out_lat"),
  clock_out_lng: doublePrecision("clock_out_lng"),
  // State: 'active' | 'on_break' | 'complete'
  status: text("status").notNull().default("active"),
  total_minutes: integer("total_minutes"),      // filled on clock-out
  break_minutes: integer("break_minutes"),      // filled on clock-out
  // QBO sync
  qbo_time_activity_id: text("qbo_time_activity_id"),
  qbo_synced_at: timestamp("qbo_synced_at", { withTimezone: true }),
  // Work date (local date of the shift, not UTC clock-in)
  work_date: text("work_date").notNull(),  // YYYY-MM-DD, use toLocalDateString()
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
})

// Break events — separate table for fine granularity
export const breakEvents = pgTable("break_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  time_entry_id: uuid("time_entry_id").notNull().references(() => timeEntries.id),
  started_at: timestamp("started_at", { withTimezone: true }).notNull(),
  ended_at: timestamp("ended_at", { withTimezone: true }),
  is_auto_detected: boolean("is_auto_detected").notNull().default(false),
})

// Per-stop timing derived from geofence
export const timeEntryStops = pgTable("time_entry_stops", {
  id: uuid("id").defaultRandom().primaryKey(),
  time_entry_id: uuid("time_entry_id").notNull().references(() => timeEntries.id),
  route_stop_id: uuid("route_stop_id").notNull().references(() => routeStops.id),
  arrived_at: timestamp("arrived_at", { withTimezone: true }),
  departed_at: timestamp("departed_at", { withTimezone: true }),
  onsite_minutes: integer("onsite_minutes"),
  drive_minutes_to_stop: integer("drive_minutes_to_stop"),
})
```

### Pattern 2: QBO TimeActivity Push
**What:** After clock-out (or at pay period close), push a `TimeActivity` to QBO for each shift. The existing `node-quickbooks` library already has `createTimeActivity()`.
**When to use:** After tech clocks out, on pay period close action by owner.
**Shape required by QBO TimeActivity API:**

```typescript
// Source: developer.intuit.com TimeActivity entity
// Confirmed via WebSearch: node-quickbooks v2.0.48 has createTimeActivity()
export function mapTimeEntryToQboTimeActivity(
  entry: TimeEntry,
  qboEmployeeRef: string,
  txnDate: string
): Record<string, any> {
  const totalMinutes = entry.total_minutes ?? 0
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  return {
    TxnDate: txnDate,                     // YYYY-MM-DD — use work_date not UTC
    NameOf: "Employee",
    EmployeeRef: { value: qboEmployeeRef },
    Hours: hours,
    Minutes: minutes,
    Description: `Field route — ${entry.work_date}`,
    // BillableStatus: "NotBillable" — time is internal labor, not billable to customer
    BillableStatus: "NotBillable",
  }
}

// Push flow (in src/lib/qbo/time-sync.ts):
export async function pushTimeEntryToQbo(timeEntryId: string): Promise<void> {
  // 1. Fetch time_entry with tech profile (needs qbo_employee_ref)
  // 2. Check org has QBO connected
  // 3. Build TimeActivity object
  // 4. qboPromise(cb => qbo.createTimeActivity(payload, cb))
  // 5. Store qbo_time_activity_id + qbo_synced_at on time_entries row
  // Fire-and-forget pattern — same as syncPaymentToQbo
}
```

**CRITICAL: QBO requires Employee entities** — each tech must have a corresponding QBO Employee record linked via `profiles.qbo_employee_id`. Need `syncEmployeeToQbo()` function that creates/updates QBO Employee records, similar to existing `syncCustomerToQbo()`.

### Pattern 3: Double-Entry Ledger Schema
**What:** Every financial event auto-generates a balanced journal entry. The PostgreSQL constraint is sum(line amounts) = 0 per entry (debits = +, credits = -).
**When to use:** On invoice issue, payment receipt, expense record, payout, refund.
**Schema:**

```typescript
// Account types follow standard 5-group structure
export const ACCOUNT_TYPES = [
  "asset", "liability", "equity", "income", "expense"
] as const

// Pool service chart of accounts seed (simplified display names)
export const POOL_COMPANY_ACCOUNTS = [
  // Assets (1xxx)
  { number: "1000", name: "Checking Account",         type: "asset",     display: "Checking" },
  { number: "1010", name: "Savings Account",           type: "asset",     display: "Savings" },
  { number: "1020", name: "Stripe Clearing",           type: "asset",     display: "Payments Clearing" },
  { number: "1100", name: "Accounts Receivable",       type: "asset",     display: "Customers Owe Us" },
  { number: "1200", name: "Chemical Inventory",        type: "asset",     display: "Chemical Inventory" },
  // Liabilities (2xxx)
  { number: "2000", name: "Accounts Payable",          type: "liability", display: "Bills We Owe" },
  { number: "2100", name: "Sales Tax Payable",         type: "liability", display: "Sales Tax Owed" },
  { number: "2200", name: "Customer Credits",          type: "liability", display: "Customer Credits" },
  // Equity (3xxx)
  { number: "3000", name: "Owner Equity",              type: "equity",    display: "Owner Equity" },
  { number: "3100", name: "Retained Earnings",         type: "equity",    display: "Retained Earnings" },
  // Income (4xxx)
  { number: "4000", name: "Service Revenue",           type: "income",    display: "Pool Service Revenue" },
  { number: "4100", name: "Repair Revenue",            type: "income",    display: "Repair & WO Revenue" },
  { number: "4200", name: "Chemical Revenue",          type: "income",    display: "Chemical Sales" },
  { number: "4300", name: "Misc Revenue",              type: "income",    display: "Other Revenue" },
  // Expenses (5xxx-6xxx)
  { number: "5000", name: "Chemical Supplies",         type: "expense",   display: "Chemicals" },
  { number: "5100", name: "Equipment Parts",           type: "expense",   display: "Parts & Equipment" },
  { number: "5200", name: "Vehicle Fuel",              type: "expense",   display: "Fuel" },
  { number: "5300", name: "Vehicle Maintenance",       type: "expense",   display: "Vehicle Maintenance" },
  { number: "5400", name: "Subcontractor Expense",     type: "expense",   display: "Subcontractors" },
  { number: "5500", name: "Labor Expense",             type: "expense",   display: "Labor" },
  { number: "5600", name: "Payment Processing Fees",   type: "expense",   display: "Stripe Fees" },
  { number: "6000", name: "Insurance",                 type: "expense",   display: "Insurance" },
  { number: "6100", name: "Marketing",                 type: "expense",   display: "Marketing" },
  { number: "6200", name: "Office Supplies",           type: "expense",   display: "Office" },
  { number: "6300", name: "Mileage",                   type: "expense",   display: "Mileage" },
] as const
```

```typescript
// Journal entry tables
export const journalEntries = pgTable("journal_entries", {
  id: uuid("id").defaultRandom().primaryKey(),
  org_id: uuid("org_id").notNull().references(() => orgs.id),
  entry_date: date("entry_date").notNull(),
  description: text("description").notNull(),
  // Source reference — what triggered this entry
  source_type: text("source_type"),  // 'invoice' | 'payment' | 'expense' | 'payout' | 'manual'
  source_id: text("source_id"),      // UUID of the source record
  is_posted: boolean("is_posted").notNull().default(true),
  is_reversed: boolean("is_reversed").notNull().default(false),
  reversal_of: uuid("reversal_of"),  // FK to original entry (for reversals)
  created_by: uuid("created_by").references(() => profiles.id),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
})

export const journalEntryLines = pgTable("journal_entry_lines", {
  id: uuid("id").defaultRandom().primaryKey(),
  journal_entry_id: uuid("journal_entry_id").notNull().references(() => journalEntries.id),
  account_id: uuid("account_id").notNull().references(() => chartOfAccounts.id),
  // Positive = debit, negative = credit. All lines per entry must sum to 0.
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  description: text("description"),
})
```

### Pattern 4: Plaid Bank Feed Integration
**What:** Use `plaid` npm package + `react-plaid-link` for the bank connection UI. Store Plaid `access_token` per bank account. Use `/transactions/sync` with cursor pagination for ongoing updates.
**Flow:**
1. Owner opens Settings > Bank Accounts
2. Click "Connect Bank" → server action creates a Plaid `link_token`
3. Client renders `usePlaidLink({ token: linkToken, onSuccess })`
4. `onSuccess` receives `public_token` → POST to server action → exchange for `access_token`
5. Store `access_token` + `item_id` in new `bank_accounts` table (encrypted at rest via Supabase RLS)
6. On `SYNC_UPDATES_AVAILABLE` webhook → call `/transactions/sync` with stored cursor → upsert into `bank_transactions` table

```typescript
// src/lib/plaid/client.ts
import { Configuration, PlaidApi, PlaidEnvironments } from "plaid"

const configuration = new Configuration({
  basePath: process.env.PLAID_ENV === "production"
    ? PlaidEnvironments.production
    : PlaidEnvironments.sandbox,
  baseOptions: {
    headers: {
      "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID!,
      "PLAID-SECRET": process.env.PLAID_SECRET!,
    },
  },
})

export const plaidClient = new PlaidApi(configuration)
```

```typescript
// New tables
export const bankAccounts = pgTable("bank_accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  org_id: uuid("org_id").notNull().references(() => orgs.id),
  plaid_item_id: text("plaid_item_id").notNull(),
  plaid_access_token: text("plaid_access_token").notNull(),  // store encrypted
  plaid_cursor: text("plaid_cursor"),   // for /transactions/sync pagination
  account_name: text("account_name").notNull(),
  account_type: text("account_type"),  // checking | savings | credit | loan
  mask: text("mask"),                  // last 4 digits for display
  institution_name: text("institution_name"),
  current_balance: numeric("current_balance", { precision: 12, scale: 2 }),
  available_balance: numeric("available_balance", { precision: 12, scale: 2 }),
  chart_of_accounts_id: uuid("chart_of_accounts_id").references(() => chartOfAccounts.id),
  last_synced_at: timestamp("last_synced_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
})

export const bankTransactions = pgTable("bank_transactions", {
  id: uuid("id").defaultRandom().primaryKey(),
  org_id: uuid("org_id").notNull().references(() => orgs.id),
  bank_account_id: uuid("bank_account_id").notNull().references(() => bankAccounts.id),
  plaid_transaction_id: text("plaid_transaction_id").notNull().unique(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),  // positive = debit from account
  date: date("date").notNull(),
  name: text("name"),            // merchant/payee name from Plaid
  merchant_name: text("merchant_name"),
  category: text("category"),   // Plaid personal_finance_category
  pending: boolean("pending").notNull().default(false),
  // Reconciliation state
  status: text("status").notNull().default("unmatched"),  // 'unmatched' | 'matched' | 'excluded'
  matched_entry_id: uuid("matched_entry_id").references(() => journalEntries.id),
  matched_at: timestamp("matched_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
})
```

### Pattern 5: Geofence Arrival Detection (Foreground Only)
**What:** Extend the existing `useGpsBroadcast` hook to also detect when the tech enters/leaves a stop's address geofence. Store arrival/departure timestamps on `time_entry_stops`.
**CRITICAL LIMITATION:** True background geofencing is NOT available in PWAs — the Web Geolocation API stops when the app is backgrounded or minimized. The geofence detection only works while the routes page is open and in the foreground. This is acceptable: techs use the app while servicing stops.

```typescript
// Extend useGpsBroadcast to add geofence detection
// src/hooks/use-gps-broadcast.ts (extend, not rewrite)
//
// Geofence check on each position update:
function isInsideGeofence(
  userLat: number,
  userLng: number,
  stopLat: number,
  stopLng: number,
  radiusMeters: number = 100  // default 100m (Claude's discretion)
): boolean {
  // Haversine distance formula
  const R = 6371000  // Earth radius in meters
  const dLat = (stopLat - userLat) * Math.PI / 180
  const dLng = (stopLng - userLng) * Math.PI / 180
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(userLat * Math.PI / 180) * Math.cos(stopLat * Math.PI / 180) *
    Math.sin(dLng/2) * Math.sin(dLng/2)
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)) <= radiusMeters
}
// State: Map<stopId, { inside: boolean, arrivedAt: number | null }>
// On each GPS update: check all upcoming stops; if newly inside → recordArrival(); if newly outside → recordDeparture()
```

### Pattern 6: Auto-Break Detection
**What:** If a tech is clocked in but no GPS movement has been detected for > threshold minutes (default: 30 min), auto-create a break event.
**Implementation:** Scheduled check via Supabase Edge Function cron (or client-side timer in the routes page). Compare last GPS broadcast timestamp to now. If gap > threshold: call `autoDetectBreak(timeEntryId)` server action.
**Default threshold (Claude's discretion):** 30 minutes of GPS inactivity = suspected break. Configurable in `org_settings.break_auto_detect_minutes`.

### Pattern 7: Smart Bank Transaction Matching
**What:** Match bank transactions to journal entries using a scoring algorithm.
**Score components:**
- Amount exact match: +50 points
- Amount within ±$0.01: +45 points
- Date within 1 day: +30 points; within 3 days: +20 points; within 7 days: +10 points
- Description contains invoice number: +40 points
- Description contains merchant name from expense: +20 points
**Auto-match threshold:** Score ≥ 80 → auto-match. Score 50-79 → suggest for owner review. Score < 50 → unmatched.
**Never auto-match:** Already matched transactions (idempotent).

### Anti-Patterns to Avoid

- **Don't use UTC dates for work_date on time entries** — a tech clocking in at 11pm local time would show as the next day in UTC. Use `toLocalDateString()` from `@/lib/date-utils` (established MEMORY.md pattern).
- **Don't post journal entries as UPDATEable** — accounting integrity requires immutable posted entries. Use reversal entries for corrections. Never UPDATE/DELETE posted journal_entry rows.
- **Don't store Plaid access tokens in plain org_settings JSONB** — store in `bank_accounts` table with proper RLS (owner-only read). Never log or return in client responses.
- **Don't re-implement Phase 9 payroll CSV** — Phase 9 already has `getPayrollPrep()` and `exportPayrollCsv()`. Phase 11 adds real clock-in data on top of the same function, extending it rather than replacing.
- **Don't block primary operations on QBO time push** — same fire-and-forget pattern as `syncPaymentToQbo`. QBO failure must never prevent clock-out.
- **Don't assume geofencing works in the background** — confirmed limitation. Arrival/departure is detected only while routes page is open. Make this explicit in UI: "Auto-detection works when app is open."

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Plaid bank connection UI | Custom OAuth bank auth flow | `react-plaid-link` + `usePlaidLink` | Plaid Link handles bank selection, login, MFA, consent across 12,000+ institutions |
| QBO API client | Custom HTTP client for QBO REST | `node-quickbooks` v2.0.48 (already installed) | Already in use for customer/invoice/payment sync; has `createTimeActivity()` method |
| QBO OAuth token refresh | Custom refresh logic | Existing `lib/qbo/client.ts` with advisory lock | Already handles concurrent refresh race conditions |
| Haversine distance calculation | Latitude/longitude math library | Inline haversine (6 lines of JS) | Simple enough to inline; no dependency needed |
| Accounting balance validation | Custom constraint checking | PostgreSQL CHECK constraint on `journal_entry_lines` via trigger, or app-layer validation before insert | Critical financial integrity; enforce at both DB and app layer |
| Financial report period comparison | Custom date arithmetic | Extend existing `getRevenueDashboard()` period logic in `reporting.ts` | Pattern already established in Phase 9 |
| Receipt image compression | Custom canvas resize | Existing `browser-image-compression` (already installed) | Already used for visit photos in `photo-capture.tsx` |

**Key insight:** The QBO and Stripe integrations are already partially built. Phase 11 extends them (time entries, payouts) rather than starting fresh. Plaid is the only genuinely new third-party integration.

---

## Common Pitfalls

### Pitfall 1: Clock-Out Forgetting (Most Common UX Issue)
**What goes wrong:** Techs clock in but forget to clock out at end of day. Shift duration becomes unbounded.
**Why it happens:** End-of-day is less memorable than start-of-day; app is typically closed after last stop.
**How to avoid:** Auto-close at midnight if still active (Supabase cron Edge Function). Push notification reminder at 6pm if still clocked in. Show "You're still clocked in" banner on next app open.
**Warning signs:** Any `time_entries` row with `clocked_out_at = null` and `work_date < today`.

### Pitfall 2: QBO Employee Reference Missing
**What goes wrong:** `createTimeActivity()` fails because the QBO `EmployeeRef` doesn't exist — the tech has no corresponding QBO Employee record.
**Why it happens:** New tech added in DeweyIQ, not yet synced to QBO.
**How to avoid:** Add `profiles.qbo_employee_id` column. Implement `syncEmployeeToQbo()` similar to `syncCustomerToQbo()`. Call it when a new tech is created or when pushing time entries (upsert pattern).
**Warning signs:** QBO push silently fails — the fire-and-forget pattern means you won't see errors. Log all QBO errors to a `qbo_sync_errors` table or similar.

### Pitfall 3: Plaid Webhook Verification Skip
**What goes wrong:** Plaid webhooks processed without JWT verification — allows spoofed payout/transaction data injection.
**Why it happens:** Webhook verification requires checking the `Plaid-Verification` JWT header using Plaid's published JWKs. Easy to skip during development.
**How to avoid:** Always verify Plaid webhook JWTs before processing. Use Plaid's webhook verification flow (fetch JWK from `/webhook_verification_key/get`, verify JWT signature).
**Warning signs:** Processing `SYNC_UPDATES_AVAILABLE` without checking `x-plaid-env` header matches your environment.

### Pitfall 4: Journal Entry Imbalance
**What goes wrong:** An auto-generated journal entry has lines that don't sum to zero, corrupting the ledger.
**Why it happens:** Rounding errors in floating point, or a code path that only generates one side of the entry.
**How to avoid:** Use `numeric` (not float) for all amounts. Validate sum = 0 before insert (throw, never silently skip). Add a PostgreSQL CHECK constraint at the trigger level: `CONSTRAINT je_must_balance CHECK (...)`.
**Warning signs:** Trial balance doesn't balance. Cash position differs from bank statement by small amounts.

### Pitfall 5: Geofence Fires Repeatedly at Stop Address
**What goes wrong:** Tech is servicing a stop and the GPS keeps triggering arrival/departure events as position oscillates around the 100m radius boundary.
**Why it happens:** GPS accuracy is typically 5-20m on phones but can bounce. Combined with a 100m radius, the tech may repeatedly enter and exit the geofence within a few seconds.
**How to avoid:** Require the tech to be inside the geofence for ≥30 seconds before recording arrival. Only record departure after being outside for ≥60 seconds. Use a state machine: `outside → entering (timer) → inside → leaving (timer) → outside`.
**Warning signs:** Multiple `time_entry_stops` rows for the same stop on the same shift.

### Pitfall 6: Plaid Access Token Leakage
**What goes wrong:** Plaid `access_token` is returned to the client or logged in console.
**Why it happens:** Debugging, or accidentally including it in a server action return value.
**How to avoid:** `access_token` should ONLY be stored in `bank_accounts.plaid_access_token` and read server-side. Never return it from any server action. The `bank_accounts` RLS policy must restrict to owner-only.
**Warning signs:** Any client-side code that has access to `plaid_access_token` as a value.

### Pitfall 7: PAYRL-* Requirements Scope Confusion
**What goes wrong:** Planner tries to implement gross-to-net payroll processing, tax withholding, W-2 generation inside DeweyIQ.
**Why it happens:** Requirements document says "Owner can run payroll" — CONTEXT.md overrides this.
**How to avoid:** CONTEXT.md is authoritative. DeweyIQ = time entry collection + QBO push. Everything payroll-computation lives in QBO. The only implementation for PAYRL-01 through PAYRL-15 is: "ensure the time data pushed to QBO is complete and accurate."
**Warning signs:** Any code that calculates gross pay, net pay, tax withholding, or generates pay stubs.

### Pitfall 8: Double-Entry for Existing Phase 7 Transactions
**What goes wrong:** Adding journal entries for Phase 11 but not backfilling for existing Phase 7 payments/invoices, leaving an incomplete ledger.
**Why it happens:** Phase 11 adds journal entry generation to new events; old events have no journal entries.
**How to avoid:** On Phase 11 activation (when owner enables accounting features), run a one-time migration function that generates journal entries for all existing paid invoices and payments. Flag this clearly as a required setup step.
**Warning signs:** Balance sheet shows equity not matching the sum of all net income since account creation.

---

## Code Examples

### Clock In Server Action Pattern
```typescript
// src/actions/time-tracking.ts
export async function clockIn(): Promise<{ success: boolean; entryId?: string; error?: string }> {
  const token = await getRlsToken()
  if (!token) return { success: false, error: "Not authenticated" }

  const role = token["user_role"] as string
  if (!["tech", "owner"].includes(role)) return { success: false, error: "Unauthorized" }

  const orgId = token["org_id"] as string
  const techId = token["sub"] as string

  // Check time tracking is enabled for this org
  const [settings] = await adminDb
    .select({ time_tracking_enabled: orgSettings.time_tracking_enabled })
    .from(orgSettings)
    .where(eq(orgSettings.org_id, orgId))
    .limit(1)

  if (!settings?.time_tracking_enabled) {
    return { success: false, error: "Time tracking not enabled for your organization" }
  }

  // Check for open shift (prevent double clock-in)
  const existing = await adminDb
    .select({ id: timeEntries.id })
    .from(timeEntries)
    .where(and(
      eq(timeEntries.tech_id, techId),
      isNull(timeEntries.clocked_out_at),
      eq(timeEntries.status, "active")
    ))
    .limit(1)

  if (existing.length > 0) {
    return { success: false, error: "Already clocked in" }
  }

  const workDate = toLocalDateString(new Date())  // CRITICAL: use local date helper

  const [entry] = await withRls(token, (db) =>
    db.insert(timeEntries).values({
      org_id: orgId,
      tech_id: techId,
      clocked_in_at: new Date(),
      status: "active",
      work_date: workDate,
    }).returning({ id: timeEntries.id })
  )

  revalidatePath("/routes")
  return { success: true, entryId: entry.id }
}
```

### QBO TimeActivity Push
```typescript
// src/lib/qbo/time-sync.ts
export async function pushTimeEntryToQbo(timeEntryId: string): Promise<void> {
  try {
    const [entry] = await adminDb
      .select({
        id: timeEntries.id,
        org_id: timeEntries.org_id,
        tech_id: timeEntries.tech_id,
        work_date: timeEntries.work_date,
        total_minutes: timeEntries.total_minutes,
        qbo_time_activity_id: timeEntries.qbo_time_activity_id,
      })
      .from(timeEntries)
      .where(eq(timeEntries.id, timeEntryId))
      .limit(1)

    if (!entry || entry.qbo_time_activity_id) return  // Already synced or not found

    // Get tech's QBO employee ref
    const [profile] = await adminDb
      .select({ qbo_employee_id: profiles.qbo_employee_id })
      .from(profiles)
      .where(eq(profiles.id, entry.tech_id))
      .limit(1)

    if (!profile?.qbo_employee_id) {
      // Sync employee to QBO first, then retry
      await syncEmployeeToQbo(entry.tech_id)
      return
    }

    const connected = await isQboConnected(entry.org_id)
    if (!connected) return

    const qbo = await getQboClient(entry.org_id)

    const totalMinutes = entry.total_minutes ?? 0
    const payload = {
      TxnDate: entry.work_date,  // YYYY-MM-DD local date
      NameOf: "Employee",
      EmployeeRef: { value: profile.qbo_employee_id },
      Hours: Math.floor(totalMinutes / 60),
      Minutes: totalMinutes % 60,
      Description: `Field route — ${entry.work_date}`,
      BillableStatus: "NotBillable",
    }

    const created = await qboPromise<any>((cb) => qbo.createTimeActivity(payload, cb))

    if (created?.Id) {
      await adminDb
        .update(timeEntries)
        .set({
          qbo_time_activity_id: String(created.Id),
          qbo_synced_at: new Date(),
        })
        .where(eq(timeEntries.id, timeEntryId))
    }
  } catch (err) {
    console.error("[pushTimeEntryToQbo] Error:", err)
    // Fire-and-forget — never throw
  }
}
```

### Plaid Link Token Creation (Server Action)
```typescript
// src/actions/bank-feeds.ts
export async function createPlaidLinkToken(): Promise<{ linkToken?: string; error?: string }> {
  const token = await getRlsToken()
  if (!token || token["user_role"] !== "owner") {
    return { error: "Owner only" }
  }

  const userId = token["sub"] as string

  const response = await plaidClient.linkTokenCreate({
    user: { client_user_id: userId },
    client_name: "DeweyIQ",
    products: ["transactions"],
    country_codes: ["US"],
    language: "en",
    webhook: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/plaid`,
  })

  return { linkToken: response.data.link_token }
}
```

### Journal Entry Auto-Generation (Invoice Issued)
```typescript
// src/lib/accounting/journal.ts
export async function createInvoiceJournalEntry(invoiceId: string): Promise<void> {
  const invoice = await fetchInvoice(invoiceId)
  if (!invoice) return

  const [arAccount] = await getAccountByNumber(invoice.org_id, "1100")  // Accounts Receivable
  const [revenueAccount] = await getAccountByNumber(invoice.org_id, "4000")  // Service Revenue
  const [taxPayableAccount] = await getAccountByNumber(invoice.org_id, "2100")  // Sales Tax Payable

  const subtotal = parseFloat(invoice.subtotal)
  const taxAmount = parseFloat(invoice.tax_amount ?? "0")
  const total = parseFloat(invoice.total)

  // Journal entry: Dr AR, Cr Revenue, Cr Tax Payable
  // Amounts: positive = debit, negative = credit. Sum must = 0.
  await createJournalEntry({
    org_id: invoice.org_id,
    entry_date: invoice.issued_at ?? new Date(),
    description: `Invoice ${invoice.invoice_number} issued`,
    source_type: "invoice",
    source_id: invoice.id,
    lines: [
      { account_id: arAccount.id, amount: total.toFixed(2) },         // Dr AR (positive)
      { account_id: revenueAccount.id, amount: (-subtotal).toFixed(2) }, // Cr Revenue (negative)
      { account_id: taxPayableAccount.id, amount: (-taxAmount).toFixed(2) }, // Cr Tax (negative)
    ]
  })
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Phase 9 payroll: CSV export for Gusto/ADP | Phase 11: Direct QBO TimeActivity push with real clock timestamps | Phase 11 | Eliminates manual CSV → Gusto import step |
| Manual expense entry only | Receipt OCR + AP workflow | Phase 11 | Reduces friction for field expense capture |
| Plaid `/transactions/get` (legacy) | Plaid `/transactions/sync` with cursor | Plaid deprecated /get for new integrations | Simpler state management, webhook-driven |
| Phase 7 P&L: invoice revenue + manual expenses only | Full double-entry ledger with auto-generated journal entries | Phase 11 | Balance Sheet and Cash Flow become possible |
| Phase 4 GPS broadcast (position only) | GPS broadcast + geofence arrival detection + time tracking context | Phase 11 | Per-stop time data without manual input |

**Deprecated/outdated:**
- Phase 9 `getPayrollPrep()` hours calculation using `route_stops.started_at` to `updated_at` delta: This was a proxy for hours. Phase 11 replaces with actual clock-in/out timestamps from `time_entries`. The `getPayrollPrep()` function should be updated to use `time_entries` data when time tracking is enabled, with the old calculation as fallback for orgs with time tracking disabled.
- `profiles.pay_type` / `profiles.pay_rate`: CONTEXT says pay rates live in QBO. However, these columns already exist and are used in `getPayrollPrep()` for the CSV export fallback. Keep them for orgs without QBO connected; they remain useful for the reporting dashboard's estimated pay view.

---

## Open Questions

1. **QBO Employee sync: does `node-quickbooks` support `createEmployee()`?**
   - What we know: `node-quickbooks` v2.0.48 is installed; `createCustomer()` is used. The QBO REST API has an Employee entity.
   - What's unclear: Whether `node-quickbooks` exposes `createEmployee()` or whether it requires raw HTTP.
   - Recommendation: Check `node-quickbooks` GitHub README for `getEmployee`, `createEmployee`, `updateEmployee` methods. If missing, use `qbo.makeAPICall()` directly (raw HTTP wrapper present in the library). Flag for executor agent to validate before writing `syncEmployeeToQbo()`.

2. **Plaid sandbox availability and credential setup**
   - What we know: `plaid` npm package is not yet installed; requires `PLAID_CLIENT_ID` and `PLAID_SECRET` env vars; sandbox available for testing.
   - What's unclear: Whether the user already has a Plaid developer account.
   - Recommendation: Mark as **user setup required** — owner must create a Plaid developer account at dashboard.plaid.com and add PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV to .env.local before Plaid-dependent plans can be executed.

3. **Plaid access token encryption**
   - What we know: Plaid access tokens should be stored encrypted. Supabase column-level encryption is available but complex.
   - What's unclear: The current codebase stores QBO tokens in plaintext in `org_settings` (protected only by RLS). Plaid should follow the same approach for consistency unless there's a security requirement to encrypt at rest.
   - Recommendation: Store Plaid access tokens in `bank_accounts` table protected by strict RLS (owner-only) — same pattern as QBO tokens. Flag for review if SOC2/PCI compliance becomes a requirement.

4. **Mileage: GPS breadcrumbs storage**
   - What we know: The GPS broadcaster fires `watchPosition` while the routes page is open. Breadcrumbs are broadcast via Supabase Realtime but not persisted.
   - What's unclear: Need to decide whether to persist GPS breadcrumbs to calculate mileage, or calculate mileage at route-end from stop lat/lng sequence.
   - Recommendation (Claude's discretion): Calculate mileage at clock-out from the known stop sequence coordinates (stop addresses geocoded via existing Mapbox integration), not raw GPS breadcrumbs. Avoids storing potentially thousands of GPS points. Use straight-line distance between stops × 1.2 (average road distance multiplier) as mileage estimate. Allow manual override. This is sufficient for IRS compliance which only requires date, destination, purpose, and miles.

5. **Accounting feature rollout: backfill existing transactions?**
   - What we know: Phase 7 has existing payments, invoices, expenses with no journal entries.
   - What's unclear: Whether the user wants to backfill historical transactions or start the ledger fresh from a given date.
   - Recommendation: Provide a "Start Accounting From" date setting. Journal entries only auto-generate for events on or after that date. Historical data before the start date is imported as an opening balance entry. This is how QBO itself handles migration from another system.

---

## Sources

### Primary (HIGH confidence)
- Codebase `src/lib/qbo/client.ts` — existing QBO client, token refresh pattern, advisory lock
- Codebase `src/actions/qbo-sync.ts` — fire-and-forget sync pattern for financial entities
- Codebase `src/actions/reporting.ts` — `getPayrollPrep()`, `exportPayrollCsv()`, Phase 9 payroll foundation
- Codebase `src/lib/db/schema/profiles.ts` — `pay_type`, `pay_rate` columns already exist
- Codebase `src/hooks/use-gps-broadcast.ts` — GPS broadcast pattern to extend for geofence
- Codebase `src/lib/offline/db.ts` — Dexie versioning pattern for adding new stores
- Codebase `package.json` — confirmed: `node-quickbooks` v2.0.48, `plaid` NOT installed, `recharts` v3.8.0 available
- Codebase `src/lib/db/schema/org-settings.ts` — existing structure to add `time_tracking_enabled`, `break_auto_detect_minutes`, `pay_period_type`

### Secondary (MEDIUM confidence)
- [QBO TimeActivity API Reference](https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/timeactivity) — confirmed fields: `TxnDate`, `NameOf`, `EmployeeRef`, `Hours`, `Minutes`, `BillableStatus`, `Description`
- [Plaid Transactions Documentation](https://plaid.com/docs/transactions/add-to-app/) — confirmed: `plaid` npm package, `/link/token/create`, `/item/public_token/exchange`, `/transactions/sync` with cursor
- [Plaid Link Web Documentation](https://plaid.com/docs/link/web/) — confirmed: `react-plaid-link`, `usePlaidLink` returns `open`, `ready`, `error`
- [Plaid Transactions API](https://plaid.com/docs/api/products/transactions/) — confirmed: `added`, `modified`, `removed`, `next_cursor` fields in sync response
- [PWA Geolocation limitations](https://progressier.com/pwa-capabilities/geofencing) — confirmed: background geofencing NOT available in PWA; geolocation stops when app backgrounded
- [IRS Mileage Rate 2026](https://www.irs.gov/tax-professionals/standard-mileage-rates) — confirmed: $0.725/mile for 2026
- [PostgreSQL double-entry accounting](https://gist.github.com/NYKevin/9433376) — reference schema for journal entries with balance constraint

### Tertiary (LOW confidence — flag for validation)
- `node-quickbooks createTimeActivity` method: WebSearch confirms method exists, but exact signature/parameters not verified against current library version. Executor must validate `qbo.createTimeActivity(payload, callback)` works with node-quickbooks v2.0.48 before writing the QBO time sync module.
- Google Cloud Vision DOCUMENT_TEXT_DETECTION for receipt OCR: Confirmed approach is standard; exact API setup and pricing need validation if OCR is implemented.

---

## Metadata

**Confidence breakdown:**
- Time tracking (clock-in/out, break events): HIGH — Drizzle schema patterns well established in codebase; server action patterns clear
- QBO time entry push: MEDIUM — TimeActivity API shape confirmed via official docs; `createTimeActivity()` in node-quickbooks needs executor validation
- Plaid bank feeds: MEDIUM — library API confirmed via official docs; requires new npm install and Plaid developer account setup
- Double-entry accounting schema: HIGH — well-established PostgreSQL patterns, amounts as `numeric` type
- Auto-reconciliation matching algorithm: MEDIUM — scoring approach is standard accounting software pattern; exact thresholds are heuristic
- Geofence detection: HIGH — confirmed foreground-only limitation is a hard constraint; haversine calculation is simple and verifiable
- OCR receipt scanning: LOW — approach identified (Google Vision) but not validated for integration complexity; marked as optional/Claude's discretion

**Research date:** 2026-03-16
**Valid until:** 2026-04-16 (Plaid and QBO APIs are relatively stable; 30 days safe)
