import { boolean, doublePrecision, integer, jsonb, numeric, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core"
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
    // Service report content toggles — control what appears in the customer email
    report_include_chemistry: boolean("report_include_chemistry").notNull().default(true),
    report_include_checklist: boolean("report_include_checklist").notNull().default(true),
    report_include_photos: boolean("report_include_photos").notNull().default(true),
    report_include_tech_name: boolean("report_include_tech_name").notNull().default(true),
    // Custom chemistry target ranges — overrides per sanitizer type
    // Record<sanitizerType, Record<param, { min: number; max: number }>>
    custom_chemistry_targets: jsonb("custom_chemistry_targets").$type<Record<string, Record<string, { min: number; max: number }>>>(),
    // Home base / office address — used as route optimization start/end point
    home_base_address: text("home_base_address"),
    home_base_lat: doublePrecision("home_base_lat"),
    home_base_lng: doublePrecision("home_base_lng"),
    // Phase 6: Work Orders & Quoting settings
    default_hourly_rate: numeric("default_hourly_rate", { precision: 10, scale: 2 }),
    default_parts_markup_pct: numeric("default_parts_markup_pct", { precision: 5, scale: 2 }).default("30"),
    default_tax_rate: numeric("default_tax_rate", { precision: 5, scale: 4 }).default("0.0875"),
    default_quote_expiry_days: integer("default_quote_expiry_days").default(30),
    invoice_number_prefix: text("invoice_number_prefix").default("INV"),
    next_invoice_number: integer("next_invoice_number").notNull().default(1),
    quote_number_prefix: text("quote_number_prefix").default("Q"),
    next_quote_number: integer("next_quote_number").notNull().default(1),
    quote_terms_and_conditions: text("quote_terms_and_conditions"),
    wo_notify_office_on_flag: boolean("wo_notify_office_on_flag").notNull().default(true),
    wo_notify_customer_on_scheduled: boolean("wo_notify_customer_on_scheduled").notNull().default(true),
    wo_notify_customer_on_complete: boolean("wo_notify_customer_on_complete").notNull().default(true),
    // Phase 7: Stripe Connect
    stripe_account_id: text("stripe_account_id"),
    stripe_onboarding_done: boolean("stripe_onboarding_done").notNull().default(false),
    // Phase 7: QuickBooks Online integration
    qbo_realm_id: text("qbo_realm_id"),
    qbo_access_token: text("qbo_access_token"),
    qbo_refresh_token: text("qbo_refresh_token"),
    qbo_token_expires_at: timestamp("qbo_token_expires_at", { withTimezone: true }),
    qbo_last_sync_at: timestamp("qbo_last_sync_at", { withTimezone: true }),
    qbo_connected: boolean("qbo_connected").notNull().default(false),
    // Phase 7: Payment & billing settings
    payment_provider: text("payment_provider").notNull().default("none"), // 'none' | 'stripe' | 'qbo' | 'both'
    cc_surcharge_pct: numeric("cc_surcharge_pct", { precision: 5, scale: 4 }),
    cc_surcharge_enabled: boolean("cc_surcharge_enabled").notNull().default(false),
    default_payment_terms_days: integer("default_payment_terms_days").notNull().default(30),
    invoice_footer_text: text("invoice_footer_text"),
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
