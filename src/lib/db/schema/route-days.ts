import { date, index, jsonb, pgTable, timestamp, unique, uuid } from "drizzle-orm/pg-core"
import { pgPolicy } from "drizzle-orm/pg-core"
import { authenticatedRole } from "drizzle-orm/supabase"
import { sql } from "drizzle-orm"
import { orgs } from "./orgs"
import { profiles } from "./profiles"

/**
 * Route days — one entry per tech per day, containing an ordered list of stop objects.
 * This is a minimal Phase 3 table. Phase 4 replaces this with a full scheduling system
 * (routes table with separate stop rows, time windows, etc.).
 *
 * stop_order is a JSONB array of { customer_id, pool_id, sort_index } objects.
 * Phase 3 reads this to display today's stop list; Phase 4 migrates it to relational rows.
 *
 * RLS: techs can SELECT their own routes; only owner+office can INSERT/UPDATE/DELETE.
 * Techs cannot self-schedule (Phase 4 adds that capability).
 */
export const routeDays = pgTable(
  "route_days",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    tech_id: uuid("tech_id").references(() => profiles.id, { onDelete: "set null" }),
    date: date("date").notNull(),
    stop_order: jsonb("stop_order").notNull().$type<
      Array<{ customer_id: string; pool_id: string; sort_index: number }>
    >(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // Fast "today's route" lookup by tech
    index("route_days_tech_date_idx").on(table.tech_id, table.date),

    // One route per tech per day
    unique("route_days_org_tech_date_unique").on(table.org_id, table.tech_id, table.date),

    // RLS: all org members can view route days
    pgPolicy("route_days_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`org_id = (select auth.jwt() ->> 'org_id')::uuid`,
    }),
    // RLS: only owner+office can create route days (techs cannot self-schedule in Phase 3)
    pgPolicy("route_days_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    // RLS: only owner+office can update route days
    pgPolicy("route_days_update_policy", {
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
    // RLS: only owner+office can delete route days
    pgPolicy("route_days_delete_policy", {
      for: "delete",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
  ]
).enableRLS()
