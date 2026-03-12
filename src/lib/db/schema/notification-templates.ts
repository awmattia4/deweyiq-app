import { boolean, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core"
import { pgPolicy } from "drizzle-orm/pg-core"
import { authenticatedRole } from "drizzle-orm/supabase"
import { sql } from "drizzle-orm"
import { orgs } from "./orgs"

/**
 * Notification templates — customizable email/SMS templates per org.
 *
 * One template row per (org_id, template_type). Orgs that haven't customized
 * a template type will have no row — the application layer falls back to
 * hardcoded defaults in default-templates.ts.
 *
 * Template types:
 * - service_report_email
 * - pre_arrival_email
 * - pre_arrival_sms
 * - quote_email
 * - quote_sms
 * - invoice_email
 * - invoice_sms
 * - receipt_email
 * - dunning_email
 * - autopay_confirmation_email
 *
 * RLS:
 * - SELECT: all org members (owner, office, tech — tech needs to know if enabled)
 * - INSERT: owner + office
 * - UPDATE: owner + office
 * - DELETE: owner + office
 */
export const notificationTemplates = pgTable(
  "notification_templates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    template_type: text("template_type").notNull(),
    subject: text("subject"),            // email subject line (null for SMS types)
    body_html: text("body_html"),        // email body HTML with merge tags
    sms_text: text("sms_text"),          // SMS body text with merge tags (null for email types)
    enabled: boolean("enabled").notNull().default(true),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // One template per type per org
    unique("notification_templates_org_type_unique").on(table.org_id, table.template_type),

    // RLS: all org members can read templates
    pgPolicy("notification_templates_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`org_id = (select auth.jwt() ->> 'org_id')::uuid`,
    }),
    // RLS: owner + office can insert
    pgPolicy("notification_templates_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    // RLS: owner + office can update
    pgPolicy("notification_templates_update_policy", {
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
    // RLS: owner + office can delete (for reset-to-default)
    pgPolicy("notification_templates_delete_policy", {
      for: "delete",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
  ]
).enableRLS()
