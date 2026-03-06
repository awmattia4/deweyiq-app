import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { pgPolicy } from "drizzle-orm/pg-core"
import { authenticatedRole } from "drizzle-orm/supabase"
import { sql } from "drizzle-orm"
import { orgs } from "./orgs"
import { customers } from "./customers"
import { pools } from "./pools"
import { profiles } from "./profiles"

/**
 * Service visits stub table — Phase 3 populates this with full chemistry readings,
 * checklists, and photo references. Defined in Phase 2 to avoid a destructive
 * migration when customers already exist.
 *
 * Phase 2 reads from this table (history tab will show empty state).
 * Phase 3 adds migrations to append chemistry_readings, checklist_completion,
 * and photo_urls columns.
 */
export const serviceVisits = pgTable(
  "service_visits",
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
    // 'routine' | 'repair' | 'one_off' — text not enum for Phase 3 flexibility
    visit_type: text("visit_type"),
    visited_at: timestamp("visited_at", { withTimezone: true }).notNull(),
    notes: text("notes"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),

    // Phase 3 columns — added to existing stub table
    // All nullable so visits created before Phase 3 remain valid
    chemistry_readings: jsonb("chemistry_readings"),
    checklist_completion: jsonb("checklist_completion"),
    photo_urls: jsonb("photo_urls").$type<string[]>(),
    // "scheduled" | "in_progress" | "complete" | "skipped"
    status: text("status"),
    // Required when status = "skipped"
    skip_reason: text("skip_reason"),
    // Generated HTML service report (for email and customer portal)
    report_html: text("report_html"),
    completed_at: timestamp("completed_at", { withTimezone: true }),
    // When the post-visit report email was sent
    email_sent_at: timestamp("email_sent_at", { withTimezone: true }),
  },
  (table) => [
    index("service_visits_org_id_idx").on(table.org_id),
    index("service_visits_customer_id_idx").on(table.customer_id),
    index("service_visits_pool_id_idx").on(table.pool_id),

    // RLS: all org members can view service history
    pgPolicy("service_visits_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`org_id = (select auth.jwt() ->> 'org_id')::uuid`,
    }),
    // RLS: owner, office, and techs can create service records (Phase 3 techs write)
    pgPolicy("service_visits_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office', 'tech')
      `,
    }),
    // RLS: owner, office, and techs can update service records
    pgPolicy("service_visits_update_policy", {
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
    // RLS: only owner+office can delete service records
    pgPolicy("service_visits_delete_policy", {
      for: "delete",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
  ]
).enableRLS()
