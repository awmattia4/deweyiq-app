import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { pgPolicy } from "drizzle-orm/pg-core"
import { authenticatedRole } from "drizzle-orm/supabase"
import { sql } from "drizzle-orm"
import { orgs } from "./orgs"
import { profiles } from "./profiles"

/**
 * Weather reschedule proposals — one row per severe-weather day that the system
 * (or office) has flagged for potential service rescheduling.
 *
 * Created by: daily cron job OR manual "Check Weather" trigger from Schedule page.
 *
 * Lifecycle:
 * - pending: just created, awaiting office review
 * - approved: office approved, route stops have been updated
 * - denied: office declined, no route changes made
 * - expired: proposal was not acted on before the affected date passed
 *
 * RLS:
 * - SELECT: owner + office (techs don't need to see proposals)
 * - INSERT: any org member (cron uses adminDb, but keeping policy inclusive)
 * - UPDATE: owner + office (approve/deny)
 * - DELETE: owner + office
 */
export const weatherRescheduleProposals = pgTable(
  "weather_reschedule_proposals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    // The day with bad forecast weather
    affected_date: text("affected_date").notNull(), // YYYY-MM-DD
    // Primary weather condition driving this proposal
    weather_type: text("weather_type").notNull(), // 'rain' | 'storm' | 'heat' | 'wind'
    // Human-readable label from the classifier, e.g. "Thunderstorm" or "Heavy Rain (80% chance)"
    weather_label: text("weather_label").notNull(),
    // Snapshot of the raw forecast data at time of proposal creation (for audit trail)
    forecast_data: jsonb("forecast_data").$type<Record<string, unknown>>(),
    // Serialized list of stops that are scheduled on the affected date
    // Array of: { stopId, customerId, customerName, poolName, techId, techName, originalDate }
    affected_stops: jsonb("affected_stops")
      .notNull()
      .$type<
        Array<{
          stopId: string
          customerId: string
          customerName: string
          poolName: string | null
          techId: string | null
          techName: string | null
          originalDate: string
        }>
      >()
      .default(sql`'[]'::jsonb`),
    // Proposed new schedule for each affected stop (output from reschedule engine)
    // Array of: { stopId, newDate, newTechId, reason }
    proposed_reschedules: jsonb("proposed_reschedules")
      .notNull()
      .$type<
        Array<{
          stopId: string
          newDate: string
          newTechId: string | null
          reason: string
        }>
      >()
      .default(sql`'[]'::jsonb`),
    // Proposal lifecycle status
    status: text("status").notNull().default("pending"), // 'pending' | 'approved' | 'denied' | 'expired'
    // Whether to notify affected customers when the proposal is approved
    // Defaults to true per user decision: auto-notify with opt-out
    notify_customers: boolean("notify_customers").notNull().default(true),
    // Customer IDs that should NOT receive notifications (unchecked in UI)
    excluded_customer_ids: jsonb("excluded_customer_ids")
      .notNull()
      .$type<string[]>()
      .default(sql`'[]'::jsonb`),
    // Audit trail for approval/denial
    approved_at: timestamp("approved_at", { withTimezone: true }),
    approved_by_id: uuid("approved_by_id").references(() => profiles.id, {
      onDelete: "set null",
    }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // Fast lookup by org + status (most common query: all pending proposals for org)
    index("weather_proposals_org_status_idx").on(table.org_id, table.status),
    // Fast lookup by org + affected_date (check if proposal already exists for a day)
    index("weather_proposals_org_date_idx").on(table.org_id, table.affected_date),

    // RLS: owner + office can view proposals
    pgPolicy("weather_proposals_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    // RLS: owner + office can create proposals (cron uses adminDb which bypasses RLS)
    pgPolicy("weather_proposals_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    // RLS: owner + office can approve/deny proposals
    pgPolicy("weather_proposals_update_policy", {
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
    // RLS: owner + office can delete proposals
    pgPolicy("weather_proposals_delete_policy", {
      for: "delete",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
  ]
).enableRLS()
