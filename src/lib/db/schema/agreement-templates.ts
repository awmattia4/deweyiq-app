/**
 * Phase 14: Service Agreement Templates
 *
 * Reusable templates that pre-populate new agreements with default terms,
 * pricing, and service frequency. Each org can have multiple templates
 * (e.g. "Standard Weekly", "Premium Bi-Weekly", "Commercial Monthly").
 *
 * RLS: owner+office for all operations
 */
import {
  boolean,
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

export const agreementTemplates = pgTable(
  "agreement_templates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    // Human-readable name shown in dropdowns
    name: text("name").notNull(),
    // Default values pre-populated when creating a new agreement from this template
    default_term_type: text("default_term_type"),
    default_frequency: text("default_frequency"),
    default_pricing_model: text("default_pricing_model"),
    default_monthly_amount: numeric("default_monthly_amount", { precision: 10, scale: 2 }),
    // Agreement text content
    terms_and_conditions: text("terms_and_conditions"),
    cancellation_policy: text("cancellation_policy"),
    liability_waiver: text("liability_waiver"),
    // Marketing/service description shown to customer
    service_description: text("service_description"),
    // Soft-delete: inactive templates are hidden from dropdowns but retained
    is_active: boolean("is_active").notNull().default(true),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    pgPolicy("agreement_templates_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    pgPolicy("agreement_templates_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    pgPolicy("agreement_templates_update_policy", {
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
    pgPolicy("agreement_templates_delete_policy", {
      for: "delete",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      `,
    }),
  ]
).enableRLS()
