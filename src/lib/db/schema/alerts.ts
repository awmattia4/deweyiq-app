import { index, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core"
import { pgPolicy } from "drizzle-orm/pg-core"
import { authenticatedRole } from "drizzle-orm/supabase"
import { sql } from "drizzle-orm"
import { orgs } from "./orgs"

/**
 * Alerts — system-generated notifications for office/owner review.
 *
 * Alert types:
 * - missed_stop: A stop was not completed and not skipped
 * - declining_chemistry: Chemistry readings trending out of range
 * - incomplete_data: Stop completed with missing required readings
 *
 * Lifecycle:
 * - Active: dismissed_at IS NULL AND (snoozed_until IS NULL OR snoozed_until < now())
 * - Snoozed: snoozed_until IS NOT NULL AND snoozed_until > now()
 * - Dismissed: dismissed_at IS NOT NULL
 *
 * Deduplication:
 * - UNIQUE on (org_id, alert_type, reference_id) — one alert per event per org
 *
 * RLS:
 * - SELECT: owner + office only
 * - INSERT: owner + office only
 * - UPDATE: owner + office only (dismiss/snooze actions)
 * - DELETE: owner only
 */
export const alerts = pgTable(
  "alerts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    // Alert classification
    alert_type: text("alert_type").notNull(), // "missed_stop" | "declining_chemistry" | "incomplete_data"
    severity: text("severity").notNull().default("warning"), // "info" | "warning" | "critical"
    // Polymorphic reference to the triggering entity
    reference_id: uuid("reference_id"), // nullable — FK to service_visit or route_stop
    reference_type: text("reference_type"), // nullable — "service_visit" | "route_stop"
    // Display content
    title: text("title").notNull(),
    description: text("description"),
    // Lifecycle timestamps
    generated_at: timestamp("generated_at", { withTimezone: true }).defaultNow().notNull(),
    dismissed_at: timestamp("dismissed_at", { withTimezone: true }),
    snoozed_until: timestamp("snoozed_until", { withTimezone: true }),
    // Additional structured data for rendering
    metadata: jsonb("metadata"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // Deduplication: one alert per (org, type, reference)
    unique("alerts_org_type_ref_unique").on(table.org_id, table.alert_type, table.reference_id),
    // Fast "active alerts for org" query (filter dismissed_at IS NULL)
    index("alerts_org_dismissed_idx").on(table.org_id, table.dismissed_at),

    // RLS: owner + office can view alerts
    pgPolicy("alerts_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    // RLS: owner + office can create alerts
    pgPolicy("alerts_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    // RLS: owner + office can update alerts (dismiss/snooze)
    pgPolicy("alerts_update_policy", {
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
    // RLS: only owner can delete alerts
    pgPolicy("alerts_delete_policy", {
      for: "delete",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      `,
    }),
  ]
).enableRLS()
