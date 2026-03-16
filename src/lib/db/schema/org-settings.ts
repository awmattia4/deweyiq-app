import { boolean, date, doublePrecision, integer, jsonb, numeric, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core"
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
    // Phase 7-08: Notification template merge tag sources
    google_review_url: text("google_review_url"),
    website_url: text("website_url"),
    social_media_urls: jsonb("social_media_urls").$type<Record<string, string>>(),
    custom_email_footer: text("custom_email_footer"),
    custom_sms_signature: text("custom_sms_signature"),
    // Phase 9: Chemical profitability threshold — minimum % margin before flagging
    chem_profit_margin_threshold_pct: numeric("chem_profit_margin_threshold_pct", { precision: 5, scale: 2 }).default("20"),
    // Phase 9: Commission % for tech-flagged work orders (upsell incentive)
    wo_upsell_commission_pct: numeric("wo_upsell_commission_pct", { precision: 5, scale: 2 }).default("0"),
    // Phase 8: Customer Portal branding
    brand_color: text("brand_color"),
    favicon_path: text("favicon_path"),
    portal_welcome_message: text("portal_welcome_message"),
    // Phase 10-14: Safety — unresponsive tech detection
    // Minutes without stop completion before triggering a safety alert (default 30)
    safety_timeout_minutes: integer("safety_timeout_minutes").notNull().default(30),
    // Escalation chain: ordered array of { role: 'owner' | 'office' | string (user ID), delay_minutes: number }
    // The first entry is always notified immediately (delay_minutes: 0); subsequent entries after their delay.
    safety_escalation_chain: jsonb("safety_escalation_chain")
      .$type<Array<{ role: string; delay_minutes: number }>>()
      .default(sql`'[{"role":"owner","delay_minutes":0}]'::jsonb`),
    // Phase 11: Time tracking settings
    // Org-level toggle — if false, clock-in/out UI is hidden from tech app
    time_tracking_enabled: boolean("time_tracking_enabled").notNull().default(false),
    // Radius (meters) around a stop location within which clock-in is allowed
    geofence_radius_meters: integer("geofence_radius_meters").notNull().default(100),
    // Minutes of inactivity before system auto-detects a break
    break_auto_detect_minutes: integer("break_auto_detect_minutes").notNull().default(30),
    // Pay period cadence: 'weekly' | 'bi_weekly' | 'semi_monthly'
    pay_period_type: text("pay_period_type").notNull().default("bi_weekly"),
    // Weekly hours threshold before overtime pay applies
    overtime_threshold_hours: integer("overtime_threshold_hours").notNull().default(40),
    // Phase 11: Accounting settings
    // Enables double-entry bookkeeping features (chart of accounts, journal entries, P&L)
    accountant_mode_enabled: boolean("accountant_mode_enabled").notNull().default(false),
    // When accounting is enabled, sets the historical start date for financial records
    accounting_start_date: date("accounting_start_date"),

    // Phase 10-16: Broadcast history — last 10 broadcasts stored as JSONB for simplicity.
    // No complex queries needed on broadcast history; JSONB avoids a separate table.
    broadcast_history: jsonb("broadcast_history")
      .$type<Array<{
        id: string
        sent_at: string
        segment_type: string
        segment_label: string
        channels: string[]
        subject: string
        total_targeted: number
        email_sent: number
        email_failed: number
        sms_sent: number
        sms_failed: number
      }>>(),
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
