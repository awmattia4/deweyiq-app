import { index, integer, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { pgPolicy } from "drizzle-orm/pg-core"
import { authenticatedRole } from "drizzle-orm/supabase"
import { sql } from "drizzle-orm"
import { orgs } from "./orgs"
import { customers } from "./customers"

/**
 * Body-of-water types — pool, spa, and fountain share the same table,
 * differentiated by the type column. This avoids 3-table JOINs.
 */
export const poolTypeEnum = pgEnum("pool_type", ["pool", "spa", "fountain"])

/**
 * Surface types affect chemistry (plaster vs vinyl calcium hardness targets differ).
 */
export const poolSurfaceEnum = pgEnum("pool_surface", [
  "plaster",
  "pebble",
  "fiberglass",
  "vinyl",
  "tile",
])

/**
 * Sanitizer types affect chemistry dosing calculations (Phase 3: CYA for salt/chlorine,
 * no CYA for bromine/biguanide).
 */
export const sanitizerTypeEnum = pgEnum("sanitizer_type", [
  "chlorine",
  "salt",
  "bromine",
  "biguanide",
])

export const pools = pgTable(
  "pools",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    customer_id: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: poolTypeEnum("type").notNull().default("pool"),
    volume_gallons: integer("volume_gallons"),
    surface_type: poolSurfaceEnum("surface_type"),
    sanitizer_type: sanitizerTypeEnum("sanitizer_type"),
    notes: text("notes"),
    // Timestamps
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("pools_org_id_idx").on(table.org_id),
    index("pools_customer_id_idx").on(table.customer_id),

    // RLS: all org members can view pools
    pgPolicy("pools_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`org_id = (select auth.jwt() ->> 'org_id')::uuid`,
    }),
    // RLS: only owner+office can create pools
    pgPolicy("pools_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    // RLS: only owner+office can update pools
    pgPolicy("pools_update_policy", {
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
    // RLS: only owner+office can delete pools
    pgPolicy("pools_delete_policy", {
      for: "delete",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
  ]
).enableRLS()
