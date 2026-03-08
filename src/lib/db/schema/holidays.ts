import { index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core"
import { pgPolicy } from "drizzle-orm/pg-core"
import { authenticatedRole } from "drizzle-orm/supabase"
import { sql } from "drizzle-orm"
import { orgs } from "./orgs"

/**
 * Holidays — org-scoped dates on which service is not performed.
 *
 * When the route stop generator encounters a holiday date, it either
 * skips that date or creates stops with status='holiday' depending on
 * the org's configuration. Holidays are org-scoped so each pool company
 * can configure their own schedule (e.g., Christmas, Thanksgiving).
 *
 * The UNIQUE constraint on (org_id, date) prevents duplicate holiday entries
 * and enables idempotent upserts.
 *
 * RLS: SELECT all org members, INSERT/UPDATE/DELETE owner+office only
 */
export const holidays = pgTable(
  "holidays",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    // 'YYYY-MM-DD' string format, consistent with route_stops.scheduled_date
    date: text("date").notNull(),
    // Human-readable name, e.g. "Thanksgiving", "Christmas Day"
    name: text("name").notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("holidays_org_date_idx").on(table.org_id, table.date),
    // Prevent duplicate holiday entries for same org+date
    unique("holidays_org_date_unique").on(table.org_id, table.date),

    // RLS: all org members can view holidays (tech may need to know about holiday skips)
    pgPolicy("holidays_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`org_id = (select auth.jwt() ->> 'org_id')::uuid`,
    }),
    // RLS: only owner+office can create holidays
    pgPolicy("holidays_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    // RLS: only owner+office can update holidays
    pgPolicy("holidays_update_policy", {
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
    // RLS: only owner+office can delete holidays
    pgPolicy("holidays_delete_policy", {
      for: "delete",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
  ]
).enableRLS()
