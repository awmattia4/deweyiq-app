import { date, index, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { pgPolicy } from "drizzle-orm/pg-core"
import { authenticatedRole } from "drizzle-orm/supabase"
import { sql } from "drizzle-orm"
import { orgs } from "./orgs"
import { vendors } from "./team-management"
import { profiles } from "./profiles"
import { chartOfAccounts } from "./accounting"

/**
 * Vendor bills — accounts payable workflow for recurring supplier invoices.
 *
 * Tracks supplier bills from entry through payment. Auto-generates a
 * double-entry journal on creation (Dr Expense, Cr AP 2000) and on
 * payment (Dr AP 2000, Cr Bank 1000).
 *
 * status values:
 *   'unpaid'    — received, not yet paid (default)
 *   'scheduled' — payment scheduled for a future date
 *   'paid'      — paid in full
 *   'void'      — cancelled/voided
 *
 * Due-date-based overdue detection is done at query time (not stored).
 * Bills with status='unpaid' and due_date < today are returned as 'overdue'.
 *
 * RLS: owner only (AP is a financial control function).
 */
export const vendorBills = pgTable(
  "vendor_bills",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    // Supplier who issued the bill
    vendor_id: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "restrict" }),
    // Optional bill/invoice number from the supplier
    bill_number: text("bill_number"),
    // Date printed on the bill
    bill_date: date("bill_date").notNull(),
    // Payment due date (used for aging buckets and overdue detection)
    due_date: date("due_date").notNull(),
    // Description of what the bill is for
    description: text("description").notNull(),
    // Total amount owed
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    // Expense category account (references chart_of_accounts.id for the debit side)
    // Defaults to general expense if not specified
    category_account_id: uuid("category_account_id").references(
      () => chartOfAccounts.id,
      { onDelete: "set null" }
    ),
    // 'unpaid' | 'scheduled' | 'paid' | 'void'
    status: text("status").notNull().default("unpaid"),
    // Scheduled payment date (set when status='scheduled')
    scheduled_date: date("scheduled_date"),
    // Payment details (populated when status='paid')
    // 'check' | 'bank_transfer' | 'cash'
    payment_method: text("payment_method"),
    payment_reference: text("payment_reference"),
    paid_at: timestamp("paid_at", { withTimezone: true }),
    paid_by: uuid("paid_by").references(() => profiles.id, { onDelete: "set null" }),
    // Journal entry IDs (for audit trail linking)
    journal_entry_id: uuid("journal_entry_id"), // Bill creation entry (Dr Expense, Cr AP)
    payment_journal_entry_id: uuid("payment_journal_entry_id"), // Payment entry (Dr AP, Cr Bank)
    created_by: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // Fast lookup by org + status (bill list, aging report)
    index("vendor_bills_org_status_idx").on(table.org_id, table.status),
    // Fast lookup by vendor (all bills from a vendor)
    index("vendor_bills_vendor_idx").on(table.vendor_id),
    // Fast lookup by due date (overdue detection, aging buckets)
    index("vendor_bills_due_date_idx").on(table.org_id, table.due_date),

    // RLS: owner only (financial control)
    pgPolicy("vendor_bills_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      `,
    }),
    pgPolicy("vendor_bills_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      `,
    }),
    pgPolicy("vendor_bills_update_policy", {
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
    pgPolicy("vendor_bills_delete_policy", {
      for: "delete",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      `,
    }),
  ]
).enableRLS()
