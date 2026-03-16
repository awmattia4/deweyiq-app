import { boolean, index, numeric, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core"
import { pgPolicy } from "drizzle-orm/pg-core"
import { authenticatedRole } from "drizzle-orm/supabase"
import { sql } from "drizzle-orm"
import { orgs } from "./orgs"
import { chartOfAccounts, journalEntries } from "./accounting"

/**
 * Bank accounts — Plaid-connected bank accounts for automated transaction import.
 *
 * SECURITY: plaid_access_token is stored here but NEVER returned to the client.
 * All Plaid API calls using this token must go through server-side actions only.
 *
 * plaid_cursor tracks the pagination state for /transactions/sync endpoint.
 * chart_of_accounts_id links this bank account to its corresponding asset account
 * in the chart of accounts (enables auto-matching of bank transactions to journal entries).
 *
 * account_type: 'checking' | 'savings' | 'credit' | 'loan'
 *
 * RLS: owner-only for ALL operations (access token security requires strict restriction).
 */
export const bankAccounts = pgTable(
  "bank_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    // Plaid item ID (one item = one financial institution connection)
    plaid_item_id: text("plaid_item_id").notNull(),
    // SENSITIVE: never returned to client — server-only for Plaid API calls
    plaid_access_token: text("plaid_access_token").notNull(),
    // Plaid transactions/sync cursor — tracks incremental sync position
    plaid_cursor: text("plaid_cursor"),
    // Plaid account_id within the item
    plaid_account_id: text("plaid_account_id").notNull(),
    account_name: text("account_name").notNull(),
    // 'checking' | 'savings' | 'credit' | 'loan'
    account_type: text("account_type").notNull(),
    // Last 4 digits of account number for display
    mask: text("mask"),
    institution_name: text("institution_name"),
    // Current balance from most recent Plaid sync
    current_balance: numeric("current_balance", { precision: 12, scale: 2 }),
    available_balance: numeric("available_balance", { precision: 12, scale: 2 }),
    // Links to the corresponding asset account in chart of accounts
    chart_of_accounts_id: uuid("chart_of_accounts_id").references(() => chartOfAccounts.id, {
      onDelete: "set null",
    }),
    last_synced_at: timestamp("last_synced_at", { withTimezone: true }),
    is_active: boolean("is_active").notNull().default(true),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("bank_accounts_org_idx").on(table.org_id),
    unique("bank_accounts_plaid_account_unique").on(table.plaid_account_id),

    // RLS: owner-only for ALL operations — access token security
    pgPolicy("bank_accounts_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      `,
    }),
    pgPolicy("bank_accounts_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      `,
    }),
    pgPolicy("bank_accounts_update_policy", {
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
    pgPolicy("bank_accounts_delete_policy", {
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
 * Bank transactions — imported transactions from Plaid.
 *
 * Each row is one transaction imported from a bank account via Plaid.
 * plaid_transaction_id is unique across all orgs (Plaid IDs are globally unique).
 *
 * status lifecycle: 'unmatched' → 'matched' (linked to journal entry) | 'excluded' (ignored)
 *
 * matched_entry_id links to the journal entry that accounts for this transaction,
 * enabling reconciliation (bank transaction = accounting entry).
 *
 * amount: positive = money in (deposit/credit), negative = money out (debit/withdrawal)
 *
 * RLS: owner + office read, owner write.
 */
export const bankTransactions = pgTable(
  "bank_transactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    bank_account_id: uuid("bank_account_id")
      .notNull()
      .references(() => bankAccounts.id, { onDelete: "cascade" }),
    // Globally unique Plaid transaction identifier
    plaid_transaction_id: text("plaid_transaction_id").notNull().unique(),
    // Positive = deposit/credit, negative = withdrawal/debit
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    // Transaction date from Plaid (YYYY-MM-DD)
    date: text("date").notNull(),
    // Merchant/payee name as returned by Plaid
    name: text("name"),
    merchant_name: text("merchant_name"),
    // Plaid category string (e.g. "Food and Drink > Restaurants")
    category: text("category"),
    // True while transaction is pending (may change or disappear)
    pending: boolean("pending").notNull().default(false),
    // 'unmatched' | 'matched' | 'excluded'
    status: text("status").notNull().default("unmatched"),
    // Set when this transaction is matched to a journal entry
    matched_entry_id: uuid("matched_entry_id").references(() => journalEntries.id, {
      onDelete: "set null",
    }),
    matched_at: timestamp("matched_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // Fast lookup by bank account (list all transactions for an account)
    index("bank_transactions_account_idx").on(table.bank_account_id),
    // Fast lookup by org + date (reconciliation date range queries)
    index("bank_transactions_org_date_idx").on(table.org_id, table.date),
    // Fast lookup by status (unmatched transactions needing review)
    index("bank_transactions_status_idx").on(table.org_id, table.status),

    pgPolicy("bank_transactions_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    pgPolicy("bank_transactions_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      `,
    }),
    pgPolicy("bank_transactions_update_policy", {
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
    pgPolicy("bank_transactions_delete_policy", {
      for: "delete",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      `,
    }),
  ]
).enableRLS()
