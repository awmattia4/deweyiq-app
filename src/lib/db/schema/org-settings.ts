import { boolean, jsonb, pgTable, timestamp, unique, uuid } from "drizzle-orm/pg-core"
import { pgPolicy } from "drizzle-orm/pg-core"
import { authenticatedRole } from "drizzle-orm/supabase"
import { sql } from "drizzle-orm"
import { orgs } from "./orgs"

/**
 * Org settings — one row per org, owner-managed configuration.
 *
 * Controls notification preferences and service enforcement requirements.
 * Techs need SELECT access to read requirements at stop completion time.
 *
 * Unique constraint on org_id ensures exactly one settings row per org.
 *
 * RLS:
 * - SELECT: all org members (owner, office, tech — tech reads requirements)
 * - INSERT: owner only (one-time creation on org setup)
 * - UPDATE: owner only (org-wide configuration)
 * - DELETE: owner only
 */
export const orgSettings = pgTable(
  "org_settings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    // Pre-arrival notification settings
    pre_arrival_sms_enabled: boolean("pre_arrival_sms_enabled").notNull().default(true),
    pre_arrival_email_enabled: boolean("pre_arrival_email_enabled").notNull().default(true),
    // Service report settings
    service_report_email_enabled: boolean("service_report_email_enabled").notNull().default(true),
    // Alert generation settings
    alert_missed_stop_enabled: boolean("alert_missed_stop_enabled").notNull().default(true),
    alert_declining_chemistry_enabled: boolean("alert_declining_chemistry_enabled").notNull().default(true),
    alert_incomplete_data_enabled: boolean("alert_incomplete_data_enabled").notNull().default(true),
    // Configurable service requirements
    // Record<sanitizerType, string[]> — e.g. { "salt": ["free_chlorine", "salt_ppm"], "chlorine": ["free_chlorine", "ph"] }
    required_chemistry_by_sanitizer: jsonb("required_chemistry_by_sanitizer").$type<Record<string, string[]>>(),
    // Array of checklist task IDs that must be completed at every stop
    required_checklist_task_ids: jsonb("required_checklist_task_ids").$type<string[]>(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // One settings row per org
    unique("org_settings_org_unique").on(table.org_id),

    // RLS: all org members can read settings (tech needs requirements for enforcement)
    pgPolicy("org_settings_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`org_id = (select auth.jwt() ->> 'org_id')::uuid`,
    }),
    // RLS: only owner can create org settings (one-time setup)
    pgPolicy("org_settings_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      `,
    }),
    // RLS: only owner can update org settings
    pgPolicy("org_settings_update_policy", {
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
    // RLS: only owner can delete org settings
    pgPolicy("org_settings_delete_policy", {
      for: "delete",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      `,
    }),
  ]
).enableRLS()
