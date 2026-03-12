/**
 * Phase 7: Billing & Payments — Expenses Schema
 *
 * Table: expenses
 *
 * Tracks business expenses for P&L reporting. Manual entry only in Phase 7.
 * Bank reconciliation requires Plaid integration (Phase 11 — ACCT-06, ACCT-07).
 *
 * RLS:
 * - SELECT/INSERT: owner+office
 * - UPDATE/DELETE: owner only
 */
import {
  date,
  index,
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
import { profiles } from "./profiles"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const EXPENSE_CATEGORIES = [
  "chemicals",
  "fuel",
  "equipment",
  "labor",
  "insurance",
  "marketing",
  "office",
  "vehicle",
  "other",
] as const

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]

// ---------------------------------------------------------------------------
// expenses
// ---------------------------------------------------------------------------

export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
    category: text("category").notNull(), // one of EXPENSE_CATEGORIES
    description: text("description"),
    date: date("date").notNull(),
    receipt_url: text("receipt_url"),
    created_by: uuid("created_by").references(() => profiles.id),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("expenses_org_id_idx").on(table.org_id),
    index("expenses_date_idx").on(table.date),
    index("expenses_category_idx").on(table.category),

    // RLS: owner+office can view expenses
    pgPolicy("expenses_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    // RLS: owner+office can create expenses
    pgPolicy("expenses_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    // RLS: only owner can update expenses
    pgPolicy("expenses_update_policy", {
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
    // RLS: only owner can delete expenses
    pgPolicy("expenses_delete_policy", {
      for: "delete",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      `,
    }),
  ]
).enableRLS()
