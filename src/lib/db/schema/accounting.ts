import { boolean, date, index, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core"
import { pgPolicy } from "drizzle-orm/pg-core"
import { authenticatedRole } from "drizzle-orm/supabase"
import { sql } from "drizzle-orm"
import { orgs } from "./orgs"
import { profiles } from "./profiles"

/**
 * Chart of accounts — the account structure for double-entry bookkeeping.
 *
 * Pool service companies get a pre-seeded set of accounts via seedChartOfAccounts().
 * is_system=true accounts cannot be deleted (enforced at application layer).
 * display_name is the user-friendly label shown in the simplified UI
 * (e.g. "Pool Revenue" instead of "Revenue from Pool Maintenance Services").
 *
 * Self-referencing parent_id enables sub-account grouping
 * (e.g. Revenue → Pool Service Revenue, Repair Revenue).
 *
 * account_type values: 'asset' | 'liability' | 'equity' | 'income' | 'expense'
 *
 * RLS:
 * - SELECT: owner + office (accountant mode is office-or-owner)
 * - INSERT/UPDATE/DELETE: owner only
 */
export const chartOfAccounts = pgTable(
  "chart_of_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    // e.g. '4000', '5100' — string to allow leading zeros and sub-numbering
    account_number: text("account_number").notNull(),
    // Formal accounting name (e.g. "Pool Maintenance Revenue")
    account_name: text("account_name").notNull(),
    // 'asset' | 'liability' | 'equity' | 'income' | 'expense'
    account_type: text("account_type").notNull(),
    // User-friendly label for simplified view (e.g. "Pool Revenue")
    display_name: text("display_name").notNull(),
    // Self-referencing for sub-account grouping (nullable = top-level account)
    parent_id: uuid("parent_id"),
    // System accounts cannot be deleted (enforced at app layer)
    is_system: boolean("is_system").notNull().default(false),
    is_active: boolean("is_active").notNull().default(true),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // Fast lookup by org (list all accounts for org)
    index("chart_of_accounts_org_idx").on(table.org_id),
    // Unique constraint on (org_id, account_number) — required for idempotent seeding
    uniqueIndex("chart_of_accounts_org_number_idx").on(table.org_id, table.account_number),

    // RLS: owner + office can view (accountant mode is owner/office only)
    pgPolicy("chart_of_accounts_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    pgPolicy("chart_of_accounts_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      `,
    }),
    pgPolicy("chart_of_accounts_update_policy", {
      for: "update",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      `,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      `,
    }),
    pgPolicy("chart_of_accounts_delete_policy", {
      for: "delete",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      `,
    }),
  ]
).enableRLS()

/**
 * Journal entries — the immutable record of financial events.
 *
 * Every financial event (invoice created, payment received, expense logged)
 * generates a journal entry with balanced debit/credit lines.
 *
 * IMMUTABLE PATTERN: Once is_posted=true, entries must not be edited.
 * This is enforced at the application layer (not RLS) — app validates
 * is_posted=false before allowing any update. To correct a posted entry,
 * create a reversal entry (is_reversed=true, reversal_of=original_id).
 *
 * source_type links the entry to its originating document:
 * 'invoice' | 'payment' | 'expense' | 'payout' | 'manual' | 'refund'
 *
 * RLS: owner + office read/write.
 */
export const journalEntries = pgTable(
  "journal_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    entry_date: date("entry_date").notNull(),
    description: text("description").notNull(),
    // 'invoice' | 'payment' | 'expense' | 'payout' | 'manual' | 'refund'
    source_type: text("source_type").notNull(),
    // The ID of the source document (invoice_id, payment_id, etc.)
    source_id: text("source_id"),
    // Posted entries are immutable — all auto-generated entries are posted immediately
    is_posted: boolean("is_posted").notNull().default(true),
    // True if this entry reverses another entry
    is_reversed: boolean("is_reversed").notNull().default(false),
    // The journal_entry_id this entry reverses (for reversal tracking)
    reversal_of: uuid("reversal_of"),
    created_by: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // Fast lookup by org + date (P&L report, date range queries)
    index("journal_entries_org_date_idx").on(table.org_id, table.entry_date),
    // Fast lookup by source (find entry for a given invoice/payment)
    index("journal_entries_source_idx").on(table.org_id, table.source_type, table.source_id),

    pgPolicy("journal_entries_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    pgPolicy("journal_entries_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    pgPolicy("journal_entries_update_policy", {
      for: "update",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    pgPolicy("journal_entries_delete_policy", {
      for: "delete",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      `,
    }),
  ]
).enableRLS()

/**
 * Journal entry lines — the individual debit/credit lines of a journal entry.
 *
 * Every journal entry must have balanced lines: sum(amount) = 0 when
 * positive = debit and negative = credit (enforced at application layer).
 *
 * Each line references an account in chart_of_accounts.
 *
 * RLS: same as journal_entries (owner + office read/write).
 */
export const journalEntryLines = pgTable(
  "journal_entry_lines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    journal_entry_id: uuid("journal_entry_id")
      .notNull()
      .references(() => journalEntries.id, { onDelete: "cascade" }),
    account_id: uuid("account_id")
      .notNull()
      .references(() => chartOfAccounts.id, { onDelete: "restrict" }),
    // Positive = debit, negative = credit (double-entry bookkeeping convention)
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    description: text("description"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // Fast lookup by journal entry (list all lines for an entry)
    index("journal_entry_lines_entry_idx").on(table.journal_entry_id),
    // Fast lookup by account (account ledger view — all activity for an account)
    index("journal_entry_lines_account_idx").on(table.account_id),

    pgPolicy("journal_entry_lines_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    pgPolicy("journal_entry_lines_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    pgPolicy("journal_entry_lines_update_policy", {
      for: "update",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    pgPolicy("journal_entry_lines_delete_policy", {
      for: "delete",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      `,
    }),
  ]
).enableRLS()

/**
 * Accounting periods — tracks open/closed fiscal periods.
 *
 * When an owner closes a period, no new journal entries should be backdated
 * into it. This is enforced at the application layer (not RLS).
 *
 * RLS: owner-only (finance control function).
 */
export const accountingPeriods = pgTable(
  "accounting_periods",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    period_start: date("period_start").notNull(),
    period_end: date("period_end").notNull(),
    // 'open' | 'closed'
    status: text("status").notNull().default("open"),
    closed_at: timestamp("closed_at", { withTimezone: true }),
    closed_by: uuid("closed_by").references(() => profiles.id, { onDelete: "set null" }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("accounting_periods_org_idx").on(table.org_id),

    pgPolicy("accounting_periods_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      `,
    }),
    pgPolicy("accounting_periods_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      `,
    }),
    pgPolicy("accounting_periods_update_policy", {
      for: "update",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      `,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      `,
    }),
    pgPolicy("accounting_periods_delete_policy", {
      for: "delete",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      `,
    }),
  ]
).enableRLS()
