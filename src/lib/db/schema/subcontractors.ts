/**
 * Phase 12: Projects & Renovations — Subcontractor Directory Schema
 *
 * Tables: subcontractors, project_phase_subcontractors
 *
 * Tracks the org's subcontractor directory with insurance/license tracking,
 * and links subcontractors to specific project phases.
 *
 * RLS: owner+office manage all (subcontractor info is office-sensitive)
 */
import {
  boolean,
  index,
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
import { projectPhases } from "./projects"

// ---------------------------------------------------------------------------
// subcontractors
// ---------------------------------------------------------------------------

export const subcontractors = pgTable(
  "subcontractors",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // trade: 'plumbing' | 'electrical' | 'excavation' | 'decking' | 'masonry' | 'plastering' | 'other'
    trade: text("trade").notNull().default("other"),
    contact_name: text("contact_name"),
    email: text("email"),
    phone: text("phone"),
    address: text("address"),
    // Supabase Storage path to insurance certificate PDF
    insurance_cert_path: text("insurance_cert_path"),
    // YYYY-MM-DD
    insurance_expiry: text("insurance_expiry"),
    license_number: text("license_number"),
    // YYYY-MM-DD
    license_expiry: text("license_expiry"),
    payment_terms: text("payment_terms"),
    notes: text("notes"),
    is_active: boolean("is_active").notNull().default(true),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("subcontractors_org_id_idx").on(table.org_id),

    // RLS: owner+office can view subcontractors (financial/insurance info is sensitive)
    pgPolicy("subcontractors_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    pgPolicy("subcontractors_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    pgPolicy("subcontractors_update_policy", {
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
    pgPolicy("subcontractors_delete_policy", {
      for: "delete",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
  ]
).enableRLS()

// ---------------------------------------------------------------------------
// project_phase_subcontractors
// ---------------------------------------------------------------------------

export const projectPhaseSubcontractors = pgTable(
  "project_phase_subcontractors",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    phase_id: uuid("phase_id")
      .notNull()
      .references(() => projectPhases.id, { onDelete: "cascade" }),
    subcontractor_id: uuid("subcontractor_id")
      .notNull()
      .references(() => subcontractors.id, { onDelete: "cascade" }),
    scope_of_work: text("scope_of_work"),
    agreed_price: numeric("agreed_price", { precision: 12, scale: 2 }),
    // status: 'not_started' | 'in_progress' | 'complete' | 'needs_rework'
    status: text("status").notNull().default("not_started"),
    // payment_status: 'unpaid' | 'partial' | 'paid'
    payment_status: text("payment_status").notNull().default("unpaid"),
    amount_paid: numeric("amount_paid", { precision: 12, scale: 2 }).notNull().default("0"),
    // Supabase Storage path to lien waiver document
    lien_waiver_path: text("lien_waiver_path"),
    // YYYY-MM-DD dates
    scheduled_start: text("scheduled_start"),
    scheduled_end: text("scheduled_end"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("project_phase_subcontractors_phase_id_idx").on(table.phase_id),
    index("project_phase_subcontractors_sub_id_idx").on(table.subcontractor_id),

    pgPolicy("project_phase_subcontractors_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    pgPolicy("project_phase_subcontractors_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    pgPolicy("project_phase_subcontractors_update_policy", {
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
    pgPolicy("project_phase_subcontractors_delete_policy", {
      for: "delete",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
  ]
).enableRLS()
