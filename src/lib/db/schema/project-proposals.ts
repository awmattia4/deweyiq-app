/**
 * Phase 12: Projects & Renovations — Proposals Schema
 *
 * Tables: project_proposals, project_proposal_tiers, project_proposal_line_items,
 *         project_proposal_addons, project_payment_milestones, proposal_change_requests
 *
 * All proposal documents use soft-archive (archived_at) instead of hard delete (PROJ-91).
 *
 * RLS: owner+office manage all, tech SELECT only
 */
import {
  boolean,
  index,
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
import { projects } from "./projects"
import { projectPhases } from "./projects"
import { invoices } from "./invoices"

// ---------------------------------------------------------------------------
// project_proposals
// ---------------------------------------------------------------------------

export const projectProposals = pgTable(
  "project_proposals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    project_id: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // Increments with each revision on the same project
    version: integer("version").notNull().default(1),
    // status: 'draft' | 'sent' | 'approved' | 'declined' | 'superseded' | 'expired'
    status: text("status").notNull().default("draft"),
    // pricing_method: 'lump_sum' | 'cost_plus' | 'time_and_materials' | 'fixed_per_phase'
    pricing_method: text("pricing_method").notNull().default("lump_sum"),
    // When false, customer portal shows totals only (not individual line items)
    show_line_item_detail: boolean("show_line_item_detail").notNull().default(true),
    scope_description: text("scope_description"),
    terms_and_conditions: text("terms_and_conditions"),
    warranty_info: text("warranty_info"),
    cancellation_policy: text("cancellation_policy"),
    // Set when customer selects a tier (good/better/best) on approval
    selected_tier: text("selected_tier"),
    // Digital signature data
    signature_data_url: text("signature_data_url"),
    signed_at: timestamp("signed_at", { withTimezone: true }),
    signed_name: text("signed_name"),
    signed_ip: text("signed_ip"),
    // Lifecycle timestamps
    approved_at: timestamp("approved_at", { withTimezone: true }),
    sent_at: timestamp("sent_at", { withTimezone: true }),
    // Computed total (denormalized for fast display; recalculated on line item changes)
    total_amount: numeric("total_amount", { precision: 12, scale: 2 }).default("0"),
    // Soft-archive instead of hard delete (PROJ-91)
    archived_at: timestamp("archived_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("project_proposals_project_id_idx").on(table.project_id),
    index("project_proposals_org_id_idx").on(table.org_id),

    // RLS: all org members can view proposals
    pgPolicy("project_proposals_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`org_id = (select auth.jwt() ->> 'org_id')::uuid`,
    }),
    // RLS: owner+office can create proposals
    pgPolicy("project_proposals_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    // RLS: owner+office can update proposals
    pgPolicy("project_proposals_update_policy", {
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
    // RLS: only owner can delete proposals
    pgPolicy("project_proposals_delete_policy", {
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
// project_proposal_tiers
// ---------------------------------------------------------------------------

export const projectProposalTiers = pgTable(
  "project_proposal_tiers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    proposal_id: uuid("proposal_id")
      .notNull()
      .references(() => projectProposals.id, { onDelete: "cascade" }),
    // tier_level: 'good' | 'better' | 'best'
    tier_level: text("tier_level").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    price: numeric("price", { precision: 12, scale: 2 }).notNull().default("0"),
    // Array of feature strings displayed to customer
    features: jsonb("features").$type<string[]>(),
    // Array of Supabase Storage paths for tier photos/renderings
    photo_urls: jsonb("photo_urls").$type<string[]>(),
    sort_order: integer("sort_order").notNull().default(0),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("project_proposal_tiers_proposal_id_idx").on(table.proposal_id),

    pgPolicy("project_proposal_tiers_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`org_id = (select auth.jwt() ->> 'org_id')::uuid`,
    }),
    pgPolicy("project_proposal_tiers_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    pgPolicy("project_proposal_tiers_update_policy", {
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
    pgPolicy("project_proposal_tiers_delete_policy", {
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
// project_proposal_line_items
// ---------------------------------------------------------------------------

export const projectProposalLineItems = pgTable(
  "project_proposal_line_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    proposal_id: uuid("proposal_id")
      .notNull()
      .references(() => projectProposals.id, { onDelete: "cascade" }),
    // null = shared across all tiers; set = specific to one tier
    tier_id: uuid("tier_id").references(() => projectProposalTiers.id, { onDelete: "cascade" }),
    // category: 'material' | 'labor' | 'subcontractor' | 'equipment' | 'permit' | 'other'
    category: text("category").notNull().default("material"),
    description: text("description").notNull(),
    quantity: numeric("quantity", { precision: 10, scale: 3 }).notNull().default("1"),
    unit_price: numeric("unit_price", { precision: 12, scale: 2 }).notNull().default("0"),
    markup_pct: numeric("markup_pct", { precision: 5, scale: 2 }).notNull().default("0"),
    total: numeric("total", { precision: 12, scale: 2 }).notNull().default("0"),
    sort_order: integer("sort_order").notNull().default(0),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("project_proposal_li_proposal_id_idx").on(table.proposal_id),

    pgPolicy("project_proposal_li_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`org_id = (select auth.jwt() ->> 'org_id')::uuid`,
    }),
    pgPolicy("project_proposal_li_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    pgPolicy("project_proposal_li_update_policy", {
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
    pgPolicy("project_proposal_li_delete_policy", {
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
// project_proposal_addons
// ---------------------------------------------------------------------------

export const projectProposalAddons = pgTable(
  "project_proposal_addons",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    proposal_id: uuid("proposal_id")
      .notNull()
      .references(() => projectProposals.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    price: numeric("price", { precision: 12, scale: 2 }).notNull().default("0"),
    // Customer selects optional add-ons when approving the proposal
    is_selected: boolean("is_selected").notNull().default(false),
    sort_order: integer("sort_order").notNull().default(0),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("project_proposal_addons_proposal_id_idx").on(table.proposal_id),

    pgPolicy("project_proposal_addons_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`org_id = (select auth.jwt() ->> 'org_id')::uuid`,
    }),
    pgPolicy("project_proposal_addons_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    pgPolicy("project_proposal_addons_update_policy", {
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
    pgPolicy("project_proposal_addons_delete_policy", {
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
// project_payment_milestones
// ---------------------------------------------------------------------------

export const projectPaymentMilestones = pgTable(
  "project_payment_milestones",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    project_id: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // Nullable — milestone may exist before proposal is finalized
    proposal_id: uuid("proposal_id").references(() => projectProposals.id, {
      onDelete: "set null",
    }),
    // Human-readable name: "Deposit", "Excavation Complete", "Final Payment"
    name: text("name").notNull(),
    // Optional trigger: milestone becomes due when this phase completes
    trigger_phase_id: uuid("trigger_phase_id").references(() => projectPhases.id, {
      onDelete: "set null",
    }),
    // Percentage of total contract amount
    percentage: numeric("percentage", { precision: 5, scale: 2 }),
    // Absolute dollar amount (calculated from percentage * contract_amount, or entered directly)
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull().default("0"),
    // YYYY-MM-DD — optional explicit due date
    due_date: text("due_date"),
    // Set when invoice is created for this milestone
    invoice_id: uuid("invoice_id").references(() => invoices.id, { onDelete: "set null" }),
    // status: 'pending' | 'invoiced' | 'paid'
    status: text("status").notNull().default("pending"),
    sort_order: integer("sort_order").notNull().default(0),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("project_payment_milestones_project_id_idx").on(table.project_id),

    pgPolicy("project_payment_milestones_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`org_id = (select auth.jwt() ->> 'org_id')::uuid`,
    }),
    pgPolicy("project_payment_milestones_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    pgPolicy("project_payment_milestones_update_policy", {
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
    pgPolicy("project_payment_milestones_delete_policy", {
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
// proposal_change_requests
// ---------------------------------------------------------------------------

export const proposalChangeRequests = pgTable(
  "proposal_change_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    proposal_id: uuid("proposal_id")
      .notNull()
      .references(() => projectProposals.id, { onDelete: "cascade" }),
    // Customer's notes requesting changes before signing
    customer_notes: text("customer_notes"),
    // status: 'pending' | 'addressed' | 'dismissed'
    status: text("status").notNull().default("pending"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("proposal_change_requests_proposal_id_idx").on(table.proposal_id),

    pgPolicy("proposal_change_requests_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`org_id = (select auth.jwt() ->> 'org_id')::uuid`,
    }),
    pgPolicy("proposal_change_requests_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    pgPolicy("proposal_change_requests_update_policy", {
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
    pgPolicy("proposal_change_requests_delete_policy", {
      for: "delete",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
  ]
).enableRLS()
