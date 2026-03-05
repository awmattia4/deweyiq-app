import { date, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { pgPolicy } from "drizzle-orm/pg-core"
import { authenticatedRole } from "drizzle-orm/supabase"
import { sql } from "drizzle-orm"
import { orgs } from "./orgs"
import { pools } from "./pools"

/**
 * Equipment per pool (CUST-04).
 *
 * `type` is text (not a pgEnum) because equipment categories grow over time.
 * Common values: 'pump', 'filter', 'heater', 'cleaner', 'light', 'other'.
 * A check constraint can be added later if enforcement is needed.
 */
export const equipment = pgTable(
  "equipment",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    pool_id: uuid("pool_id")
      .notNull()
      .references(() => pools.id, { onDelete: "cascade" }),
    // Open-ended text type — not a pgEnum (categories expand over time)
    type: text("type").notNull(),
    brand: text("brand"),
    model: text("model"),
    install_date: date("install_date"),
    notes: text("notes"),
    // Timestamps
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("equipment_org_id_idx").on(table.org_id),
    index("equipment_pool_id_idx").on(table.pool_id),

    // RLS: all org members can view equipment
    pgPolicy("equipment_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`org_id = (select auth.jwt() ->> 'org_id')::uuid`,
    }),
    // RLS: only owner+office can create equipment
    pgPolicy("equipment_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    // RLS: only owner+office can update equipment
    pgPolicy("equipment_update_policy", {
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
    // RLS: only owner+office can delete equipment
    pgPolicy("equipment_delete_policy", {
      for: "delete",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
  ]
).enableRLS()
