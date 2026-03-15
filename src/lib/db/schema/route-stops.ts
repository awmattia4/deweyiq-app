import { boolean, index, integer, pgTable, text, time, timestamp, unique, uuid } from "drizzle-orm/pg-core"
import { pgPolicy } from "drizzle-orm/pg-core"
import { authenticatedRole } from "drizzle-orm/supabase"
import { sql } from "drizzle-orm"
import { orgs } from "./orgs"
import { profiles } from "./profiles"
import { customers } from "./customers"
import { pools } from "./pools"
import { scheduleRules } from "./schedule-rules"
import { workOrders } from "./work-orders"
import { checklistTemplates } from "./checklists"

/**
 * Route stops — one row per stop on a tech's daily route.
 *
 * Phase 4 replaces the Phase 3 route_days.stop_order JSONB array with
 * relational rows. Each stop references a customer, pool, schedule rule,
 * and tech, enabling route optimization, time windows, and drag-and-drop
 * reordering that persists to the server.
 *
 * The UNIQUE constraint on (org_id, customer_id, pool_id, scheduled_date)
 * enables idempotent upserts when generating stops from schedule rules.
 *
 * RLS:
 * - SELECT: all org members (tech needs to read their own stops)
 * - INSERT: owner + office only (dispatchers create routes)
 * - UPDATE: owner + office + tech (tech updates status to in_progress/complete;
 *           application layer enforces which fields tech can change)
 * - DELETE: owner + office only
 */
export const routeStops = pgTable(
  "route_stops",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    tech_id: uuid("tech_id").references(() => profiles.id, { onDelete: "set null" }),
    customer_id: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    pool_id: uuid("pool_id").references(() => pools.id, { onDelete: "set null" }),
    schedule_rule_id: uuid("schedule_rule_id").references(() => scheduleRules.id, { onDelete: "set null" }),
    // Links this stop to a work order (NULL for regular service stops)
    work_order_id: uuid("work_order_id").references(() => workOrders.id, { onDelete: "set null" }),
    // Service type — links to checklist template (null = org's default template)
    checklist_template_id: uuid("checklist_template_id").references(
      () => checklistTemplates.id,
      { onDelete: "set null" }
    ),
    // 'YYYY-MM-DD' string — matches Phase 3 date pattern used in route_days
    scheduled_date: text("scheduled_date").notNull(),
    // Position in the day's route, 1-based. Updated on drag-and-drop reorder.
    sort_index: integer("sort_index").notNull(),
    // Locked stops are excluded from the optimizer — must stay in place
    position_locked: boolean("position_locked").notNull().default(false),
    // Optional time window constraints for time-critical stops (e.g., commercial accounts)
    window_start: time("window_start"),
    window_end: time("window_end"),
    // Stop status lifecycle: scheduled → in_progress → complete | skipped | holiday
    status: text("status").notNull().default("scheduled"),
    // Phase 5: idempotency for pre-arrival notifications — set after first successful send
    pre_arrival_sent_at: timestamp("pre_arrival_sent_at", { withTimezone: true }),
    // Phase 9: Set when tech marks stop in_progress; used for stop duration calculation
    started_at: timestamp("started_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // Fast "day's route" lookup by org + date (dispatcher view)
    index("route_stops_org_date_idx").on(table.org_id, table.scheduled_date),
    // Fast "my route today" lookup by tech (most common query pattern)
    index("route_stops_tech_date_idx").on(table.tech_id, table.scheduled_date),
    // Fast lookup by schedule rule (for regenerating stops from rules)
    index("route_stops_schedule_rule_idx").on(table.schedule_rule_id),
    // Upsert idempotency: one stop per customer+pool per day per org
    unique("route_stops_org_customer_pool_date_unique").on(
      table.org_id,
      table.customer_id,
      table.pool_id,
      table.scheduled_date
    ),

    // RLS: all org members can view route stops (tech reads own stops)
    pgPolicy("route_stops_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`org_id = (select auth.jwt() ->> 'org_id')::uuid`,
    }),
    // RLS: only owner+office can create stops (dispatchers build routes)
    pgPolicy("route_stops_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    // RLS: owner+office+tech can update stops (tech updates status in the field)
    pgPolicy("route_stops_update_policy", {
      for: "update",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office', 'tech')
      `,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office', 'tech')
      `,
    }),
    // RLS: only owner+office can delete stops
    pgPolicy("route_stops_delete_policy", {
      for: "delete",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
  ]
).enableRLS()
