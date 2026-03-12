/**
 * Phase 7: Billing & Payments — Payment Records Schema
 *
 * Table: payment_records
 *
 * Tracks individual payment attempts and settlements against invoices.
 * Supports multiple payment methods (card, ACH, check, cash, QBO).
 *
 * RLS:
 * - SELECT/INSERT/UPDATE: owner+office
 * - DELETE: owner only
 */
import {
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"
import { pgPolicy } from "drizzle-orm/pg-core"
import { authenticatedRole } from "drizzle-orm/supabase"
import { sql } from "drizzle-orm"
import { orgs } from "./orgs"
import { invoices } from "./invoices"

// ---------------------------------------------------------------------------
// payment_records
// ---------------------------------------------------------------------------

export const paymentRecords = pgTable(
  "payment_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    invoice_id: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
    // 'card' | 'ach' | 'check' | 'cash' | 'qbo'
    method: text("method").notNull(),
    // 'pending' | 'settled' | 'failed' | 'refunded'
    status: text("status").notNull().default("pending"),
    stripe_payment_intent_id: text("stripe_payment_intent_id"),
    qbo_payment_id: text("qbo_payment_id"),
    settled_at: timestamp("settled_at", { withTimezone: true }),
    failure_reason: text("failure_reason"),
    attempt_count: integer("attempt_count").notNull().default(1),
    next_retry_at: timestamp("next_retry_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("payment_records_org_id_idx").on(table.org_id),
    index("payment_records_invoice_id_idx").on(table.invoice_id),
    index("payment_records_status_idx").on(table.status),

    // RLS: owner+office can view payment records
    pgPolicy("payment_records_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    // RLS: owner+office can create payment records
    pgPolicy("payment_records_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    // RLS: owner+office can update payment records
    pgPolicy("payment_records_update_policy", {
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
    // RLS: only owner can delete payment records
    pgPolicy("payment_records_delete_policy", {
      for: "delete",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      `,
    }),
  ]
).enableRLS()
