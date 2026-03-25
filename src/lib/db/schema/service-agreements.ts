/**
 * Phase 14: Service Agreements & Contracts
 *
 * Tables:
 * - service_agreements: master agreement per customer
 * - agreement_pool_entries: per-pool service details within an agreement
 * - agreement_amendments: versioned change log for active agreements
 *
 * RLS: owner+office for all operations (same pattern as quotes table)
 */
import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"
import { pgPolicy } from "drizzle-orm/pg-core"
import { authenticatedRole } from "drizzle-orm/supabase"
import { sql } from "drizzle-orm"
import { orgs } from "./orgs"
import { customers } from "./customers"
import { pools } from "./pools"
import { profiles } from "./profiles"
import { scheduleRules } from "./schedule-rules"

// ---------------------------------------------------------------------------
// service_agreements
// ---------------------------------------------------------------------------

export const serviceAgreements = pgTable(
  "service_agreements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    customer_id: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    // Sequential number with prefix (e.g. "SA-0001")
    agreement_number: text("agreement_number").notNull(),
    // Status: draft | sent | active | paused | expired | cancelled | declined
    status: text("status").notNull().default("draft"),
    // Term type: month_to_month | 6_month | 12_month
    term_type: text("term_type").notNull(),
    // YYYY-MM-DD format
    start_date: text("start_date"),
    // Null for month_to_month
    end_date: text("end_date"),
    auto_renew: boolean("auto_renew").notNull().default(true),
    // Optional FK to agreement_templates — must use text for forward-reference safety
    template_id: uuid("template_id"),
    // Agreement text fields
    terms_and_conditions: text("terms_and_conditions"),
    cancellation_policy: text("cancellation_policy"),
    liability_waiver: text("liability_waiver"),
    // Office-only internal notes
    internal_notes: text("internal_notes"),
    // Version counter — increments on each amendment
    version: integer("version").notNull().default(1),
    // Status transition timestamps
    sent_at: timestamp("sent_at", { withTimezone: true }),
    signed_at: timestamp("signed_at", { withTimezone: true }),
    declined_at: timestamp("declined_at", { withTimezone: true }),
    cancelled_at: timestamp("cancelled_at", { withTimezone: true }),
    paused_at: timestamp("paused_at", { withTimezone: true }),
    paused_reason: text("paused_reason"),
    renewed_at: timestamp("renewed_at", { withTimezone: true }),
    // Signature capture fields
    signature_name: text("signature_name"),
    signature_image_base64: text("signature_image_base64"),
    signature_ip: text("signature_ip"),
    signature_user_agent: text("signature_user_agent"),
    decline_reason: text("decline_reason"),
    // When a major amendment is pending customer re-sign, this is set.
    // Cleared when customer signs the amendment.
    pending_amendment_id: uuid("pending_amendment_id"),
    // JSONB array of { action, actor, at, note } entries
    activity_log: jsonb("activity_log")
      .$type<Array<{ action: string; actor: string; at: string; note?: string }>>()
      .default(sql`'[]'::jsonb`),
    renewal_reminder_sent_at: timestamp("renewal_reminder_sent_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // RLS: owner+office can view agreements
    pgPolicy("service_agreements_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    pgPolicy("service_agreements_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    pgPolicy("service_agreements_update_policy", {
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
    pgPolicy("service_agreements_delete_policy", {
      for: "delete",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      `,
    }),
  ]
).enableRLS()

// ---------------------------------------------------------------------------
// agreement_pool_entries
// ---------------------------------------------------------------------------

export const agreementPoolEntries = pgTable(
  "agreement_pool_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agreement_id: uuid("agreement_id")
      .notNull()
      .references(() => serviceAgreements.id, { onDelete: "cascade" }),
    pool_id: uuid("pool_id")
      .notNull()
      .references(() => pools.id, { onDelete: "cascade" }),
    // Frequency: weekly | biweekly | monthly | custom
    frequency: text("frequency").notNull(),
    custom_interval_days: integer("custom_interval_days"),
    // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    preferred_day_of_week: integer("preferred_day_of_week"),
    // Pricing model: monthly_flat | per_visit | tiered
    pricing_model: text("pricing_model").notNull(),
    monthly_amount: numeric("monthly_amount", { precision: 10, scale: 2 }),
    per_visit_amount: numeric("per_visit_amount", { precision: 10, scale: 2 }),
    // Tiered pricing: base rate up to threshold visits, overage per visit above
    tiered_threshold_visits: integer("tiered_threshold_visits"),
    tiered_base_amount: numeric("tiered_base_amount", { precision: 10, scale: 2 }),
    tiered_overage_amount: numeric("tiered_overage_amount", { precision: 10, scale: 2 }),
    // Array of checklist task IDs to perform at each visit
    checklist_task_ids: jsonb("checklist_task_ids")
      .$type<string[]>()
      .default(sql`'[]'::jsonb`),
    notes: text("notes"),
    // Set when customer accepts — links to the generated schedule rule
    schedule_rule_id: uuid("schedule_rule_id").references(() => scheduleRules.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    pgPolicy("agreement_pool_entries_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`
        EXISTS (
          SELECT 1 FROM service_agreements sa
          WHERE sa.id = agreement_id
            AND sa.org_id = (select auth.jwt() ->> 'org_id')::uuid
            AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
        )
      `,
    }),
    pgPolicy("agreement_pool_entries_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        EXISTS (
          SELECT 1 FROM service_agreements sa
          WHERE sa.id = agreement_id
            AND sa.org_id = (select auth.jwt() ->> 'org_id')::uuid
            AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
        )
      `,
    }),
    pgPolicy("agreement_pool_entries_update_policy", {
      for: "update",
      to: authenticatedRole,
      using: sql`
        EXISTS (
          SELECT 1 FROM service_agreements sa
          WHERE sa.id = agreement_id
            AND sa.org_id = (select auth.jwt() ->> 'org_id')::uuid
            AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
        )
      `,
      withCheck: sql`
        EXISTS (
          SELECT 1 FROM service_agreements sa
          WHERE sa.id = agreement_id
            AND sa.org_id = (select auth.jwt() ->> 'org_id')::uuid
            AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
        )
      `,
    }),
    pgPolicy("agreement_pool_entries_delete_policy", {
      for: "delete",
      to: authenticatedRole,
      using: sql`
        EXISTS (
          SELECT 1 FROM service_agreements sa
          WHERE sa.id = agreement_id
            AND sa.org_id = (select auth.jwt() ->> 'org_id')::uuid
            AND (select auth.jwt() ->> 'user_role') = 'owner'
        )
      `,
    }),
  ]
).enableRLS()

// ---------------------------------------------------------------------------
// agreement_amendments
// ---------------------------------------------------------------------------

export const agreementAmendments = pgTable(
  "agreement_amendments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agreement_id: uuid("agreement_id")
      .notNull()
      .references(() => serviceAgreements.id, { onDelete: "cascade" }),
    version_number: integer("version_number").notNull(),
    // 'major' requires customer re-sign; 'minor' is informational
    amendment_type: text("amendment_type").notNull(),
    change_summary: text("change_summary").notNull(),
    changed_by_id: uuid("changed_by_id").references(() => profiles.id, { onDelete: "set null" }),
    // Status: pending_signature | signed | rejected
    status: text("status").notNull().default("pending_signature"),
    signed_at: timestamp("signed_at", { withTimezone: true }),
    rejected_at: timestamp("rejected_at", { withTimezone: true }),
    // Full snapshot of agreement state at this amendment version
    snapshot_json: jsonb("snapshot_json"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    pgPolicy("agreement_amendments_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`
        EXISTS (
          SELECT 1 FROM service_agreements sa
          WHERE sa.id = agreement_id
            AND sa.org_id = (select auth.jwt() ->> 'org_id')::uuid
            AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
        )
      `,
    }),
    pgPolicy("agreement_amendments_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        EXISTS (
          SELECT 1 FROM service_agreements sa
          WHERE sa.id = agreement_id
            AND sa.org_id = (select auth.jwt() ->> 'org_id')::uuid
            AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
        )
      `,
    }),
    pgPolicy("agreement_amendments_update_policy", {
      for: "update",
      to: authenticatedRole,
      using: sql`
        EXISTS (
          SELECT 1 FROM service_agreements sa
          WHERE sa.id = agreement_id
            AND sa.org_id = (select auth.jwt() ->> 'org_id')::uuid
            AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
        )
      `,
      withCheck: sql`
        EXISTS (
          SELECT 1 FROM service_agreements sa
          WHERE sa.id = agreement_id
            AND sa.org_id = (select auth.jwt() ->> 'org_id')::uuid
            AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
        )
      `,
    }),
    pgPolicy("agreement_amendments_delete_policy", {
      for: "delete",
      to: authenticatedRole,
      using: sql`
        EXISTS (
          SELECT 1 FROM service_agreements sa
          WHERE sa.id = agreement_id
            AND sa.org_id = (select auth.jwt() ->> 'org_id')::uuid
            AND (select auth.jwt() ->> 'user_role') = 'owner'
        )
      `,
    }),
  ]
).enableRLS()
