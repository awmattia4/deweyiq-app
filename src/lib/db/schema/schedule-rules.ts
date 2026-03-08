import { boolean, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { pgPolicy } from "drizzle-orm/pg-core"
import { authenticatedRole } from "drizzle-orm/supabase"
import { sql } from "drizzle-orm"
import { orgs } from "./orgs"
import { profiles } from "./profiles"
import { customers } from "./customers"
import { pools } from "./pools"

/**
 * Schedule rules — recurring service schedule configuration per customer/pool.
 *
 * A schedule rule defines how often a pool is serviced and on what day.
 * The route stop generator reads active rules and creates route_stops rows
 * for each scheduled date, linking each stop back to its originating rule.
 *
 * Frequencies:
 * - weekly: every 7 days from anchor_date
 * - biweekly: every 14 days from anchor_date
 * - monthly: every ~30 days (first occurrence of preferred_day_of_week each month)
 * - custom: every custom_interval_days days from anchor_date
 *
 * RLS: SELECT all org members, INSERT/UPDATE/DELETE owner+office only
 */
export const scheduleRules = pgTable(
  "schedule_rules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    customer_id: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    pool_id: uuid("pool_id").references(() => pools.id, { onDelete: "set null" }),
    tech_id: uuid("tech_id").references(() => profiles.id, { onDelete: "set null" }),
    // Service frequency: weekly | biweekly | monthly | custom
    frequency: text("frequency").notNull(),
    // Only populated when frequency = 'custom'
    custom_interval_days: integer("custom_interval_days"),
    // 'YYYY-MM-DD' — first service date; all future dates are calculated from here
    anchor_date: text("anchor_date").notNull(),
    // 0=Sun, 1=Mon, ..., 6=Sat — used for monthly scheduling and day-of-week snapping
    preferred_day_of_week: integer("preferred_day_of_week"),
    active: boolean("active").notNull().default(true),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("schedule_rules_org_idx").on(table.org_id),
    index("schedule_rules_customer_idx").on(table.customer_id),
    index("schedule_rules_tech_idx").on(table.tech_id),

    // RLS: all org members can view schedule rules (tech may need to see their schedule config)
    pgPolicy("schedule_rules_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`org_id = (select auth.jwt() ->> 'org_id')::uuid`,
    }),
    // RLS: only owner+office can create schedule rules
    pgPolicy("schedule_rules_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    // RLS: only owner+office can update schedule rules
    pgPolicy("schedule_rules_update_policy", {
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
    // RLS: only owner+office can delete schedule rules
    pgPolicy("schedule_rules_delete_policy", {
      for: "delete",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
  ]
).enableRLS()
