/**
 * Phase 7: Billing & Payments — Expenses Schema
 *
 * Table: expenses
 *
 * Tracks business expenses for P&L reporting. Manual entry only in Phase 7.
 * Bank reconciliation requires Plaid integration (Phase 11 — ACCT-06, ACCT-07).
 *
 * Phase 11 (Plan 10): Extended categories to pool-industry specifics,
 *   added vendor_name column for AP workflow grouping, and EXPENSE_CATEGORY_LABELS map.
 *
 * RLS:
 * - SELECT/INSERT: owner+office+tech (tech can log field expenses)
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
  "parts",
  "fuel",
  "vehicle_maintenance",
  "subcontractor",
  "insurance",
  "marketing",
  "office",
  "other",
] as const

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  chemicals: "Chemicals",
  parts: "Parts & Equipment",
  fuel: "Fuel",
  vehicle_maintenance: "Vehicle Maintenance",
  subcontractor: "Subcontractor",
  insurance: "Insurance",
  marketing: "Marketing",
  office: "Office",
  other: "Other",
}

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
    // Optional vendor name for AP workflow grouping (free-text)
    vendor_name: text("vendor_name"),
    created_by: uuid("created_by").references(() => profiles.id),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("expenses_org_id_idx").on(table.org_id),
    index("expenses_date_idx").on(table.date),
    index("expenses_category_idx").on(table.category),

    // RLS: owner+office+tech can view/create expenses
    pgPolicy("expenses_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office', 'tech')
      `,
    }),
    // RLS: owner+office+tech can create expenses
    pgPolicy("expenses_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office', 'tech')
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
