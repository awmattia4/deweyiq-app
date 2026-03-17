/**
 * Phase 12: Projects & Renovations — Billing Extension Schema
 *
 * Tables: project_change_orders, project_inspections, project_permits,
 *         project_punch_list, project_warranty_terms, warranty_claims, project_documents
 *
 * All documents use soft-archive (archived_at) instead of hard delete (PROJ-91).
 *
 * RLS: owner+office manage all; tech can SELECT and flag issues
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
import { profiles } from "./profiles"
import { workOrders } from "./work-orders"
import { invoices } from "./invoices"

// ---------------------------------------------------------------------------
// project_change_orders
// ---------------------------------------------------------------------------

export const projectChangeOrders = pgTable(
  "project_change_orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    project_id: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // Sequential CO number (e.g. "CO-001")
    change_order_number: text("change_order_number"),
    description: text("description").notNull(),
    // reason: 'scope_change' | 'unforeseen_conditions' | 'customer_request' | 'design_change' | 'regulatory' | 'other'
    reason: text("reason").notNull().default("scope_change"),
    // status: 'draft' | 'pending_approval' | 'approved' | 'declined' | 'voided'
    status: text("status").notNull().default("draft"),
    // Positive = cost increase, negative = cost decrease
    cost_impact: numeric("cost_impact", { precision: 12, scale: 2 }).notNull().default("0"),
    // Schedule impact in calendar days
    schedule_impact_days: integer("schedule_impact_days").notNull().default(0),
    // cost_allocation: 'add_to_final' | 'spread_remaining' | 'collect_immediately'
    cost_allocation: text("cost_allocation").notNull().default("add_to_final"),
    // JSONB array of line items: [{ description, category, quantity, unit_price, total }]
    line_items: jsonb("line_items").$type<
      Array<{
        description: string
        category: string
        quantity: number
        unit_price: number
        total: number
      }>
    >(),
    // Optional link to the issue flag that triggered this CO
    issue_flag_id: uuid("issue_flag_id"),
    // Approval tracking
    approved_at: timestamp("approved_at", { withTimezone: true }),
    approved_signature: text("approved_signature"),
    // Soft-archive (PROJ-91)
    archived_at: timestamp("archived_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("project_change_orders_project_id_idx").on(table.project_id),

    // RLS: all org members can view change orders
    pgPolicy("project_change_orders_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`org_id = (select auth.jwt() ->> 'org_id')::uuid`,
    }),
    pgPolicy("project_change_orders_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    pgPolicy("project_change_orders_update_policy", {
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
    pgPolicy("project_change_orders_delete_policy", {
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
// project_inspections
// ---------------------------------------------------------------------------

export const projectInspections = pgTable(
  "project_inspections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    project_id: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    phase_id: uuid("phase_id").references(() => projectPhases.id, { onDelete: "set null" }),
    // inspection_type: 'framing' | 'electrical' | 'plumbing' | 'final' | 'health_dept' | 'structural' | 'other'
    inspection_type: text("inspection_type").notNull(),
    // YYYY-MM-DD dates
    scheduled_date: text("scheduled_date"),
    actual_date: text("actual_date"),
    inspector_name: text("inspector_name"),
    inspector_contact: text("inspector_contact"),
    // status: 'scheduled' | 'passed' | 'failed' | 'cancelled' | 'rescheduled'
    status: text("status").notNull().default("scheduled"),
    result_notes: text("result_notes"),
    // Array of correction tasks required after failed inspection
    correction_tasks: jsonb("correction_tasks").$type<
      Array<{ description: string; completed: boolean }>
    >(),
    // Array of Supabase Storage paths for inspection documents/photos
    documents: jsonb("documents").$type<string[]>(),
    // Soft-archive (PROJ-91)
    archived_at: timestamp("archived_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("project_inspections_project_id_idx").on(table.project_id),

    pgPolicy("project_inspections_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`org_id = (select auth.jwt() ->> 'org_id')::uuid`,
    }),
    pgPolicy("project_inspections_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    pgPolicy("project_inspections_update_policy", {
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
    pgPolicy("project_inspections_delete_policy", {
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
// project_permits
// ---------------------------------------------------------------------------

export const projectPermits = pgTable(
  "project_permits",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    project_id: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // permit_type: 'building' | 'electrical' | 'plumbing' | 'mechanical' | 'hoa' | 'utility' | 'other'
    permit_type: text("permit_type").notNull(),
    permit_number: text("permit_number"),
    // status: 'not_applied' | 'applied' | 'under_review' | 'approved' | 'denied' | 'expired'
    status: text("status").notNull().default("not_applied"),
    // YYYY-MM-DD dates
    applied_date: text("applied_date"),
    approved_date: text("approved_date"),
    expiration_date: text("expiration_date"),
    inspector_name: text("inspector_name"),
    inspector_phone: text("inspector_phone"),
    fee: numeric("fee", { precision: 12, scale: 2 }),
    // Array of Supabase Storage paths for permit documents
    documents: jsonb("documents").$type<string[]>(),
    notes: text("notes"),
    // Soft-archive (PROJ-91)
    archived_at: timestamp("archived_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("project_permits_project_id_idx").on(table.project_id),

    pgPolicy("project_permits_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`org_id = (select auth.jwt() ->> 'org_id')::uuid`,
    }),
    pgPolicy("project_permits_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    pgPolicy("project_permits_update_policy", {
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
    pgPolicy("project_permits_delete_policy", {
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
// project_punch_list
// ---------------------------------------------------------------------------

export const projectPunchList = pgTable(
  "project_punch_list",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    project_id: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    item_description: text("item_description").notNull(),
    // status: 'open' | 'in_progress' | 'resolved' | 'accepted'
    status: text("status").notNull().default("open"),
    assigned_to: uuid("assigned_to").references(() => profiles.id, { onDelete: "set null" }),
    // Array of Supabase Storage paths for issue photos
    photo_urls: jsonb("photo_urls").$type<string[]>(),
    resolution_notes: text("resolution_notes"),
    resolved_at: timestamp("resolved_at", { withTimezone: true }),
    customer_accepted_at: timestamp("customer_accepted_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("project_punch_list_project_id_idx").on(table.project_id),

    pgPolicy("project_punch_list_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`org_id = (select auth.jwt() ->> 'org_id')::uuid`,
    }),
    pgPolicy("project_punch_list_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    // Tech can update punch list items (mark as resolved in field)
    pgPolicy("project_punch_list_update_policy", {
      for: "update",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office', 'tech')
      `,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office', 'tech')
      `,
    }),
    pgPolicy("project_punch_list_delete_policy", {
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
// project_warranty_terms
// ---------------------------------------------------------------------------

export const projectWarrantyTerms = pgTable(
  "project_warranty_terms",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    // project_type: 'new_pool' | 'renovation' | 'equipment' | 'remodel' | 'replaster' | 'other'
    project_type: text("project_type").notNull(),
    // warranty_type: 'workmanship' | 'equipment' | 'surface' | 'structural'
    warranty_type: text("warranty_type").notNull(),
    // Duration in months
    duration_months: integer("duration_months").notNull(),
    what_covered: text("what_covered").notNull(),
    exclusions: text("exclusions"),
    is_active: boolean("is_active").notNull().default(true),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("project_warranty_terms_org_id_idx").on(table.org_id),

    pgPolicy("project_warranty_terms_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`org_id = (select auth.jwt() ->> 'org_id')::uuid`,
    }),
    pgPolicy("project_warranty_terms_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    pgPolicy("project_warranty_terms_update_policy", {
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
    pgPolicy("project_warranty_terms_delete_policy", {
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
// warranty_claims
// ---------------------------------------------------------------------------

export const warrantyClaims = pgTable(
  "warranty_claims",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    project_id: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    warranty_term_id: uuid("warranty_term_id").references(() => projectWarrantyTerms.id, {
      onDelete: "set null",
    }),
    // Optional WO created to address the warranty claim
    work_order_id: uuid("work_order_id").references(() => workOrders.id, { onDelete: "set null" }),
    customer_description: text("customer_description").notNull(),
    // status: 'submitted' | 'under_review' | 'approved' | 'denied' | 'resolved'
    status: text("status").notNull().default("submitted"),
    submitted_at: timestamp("submitted_at", { withTimezone: true }).defaultNow().notNull(),
    resolution_notes: text("resolution_notes"),
    is_warranty_covered: boolean("is_warranty_covered").notNull().default(true),
    // Soft-archive (PROJ-91)
    archived_at: timestamp("archived_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("warranty_claims_project_id_idx").on(table.project_id),
    index("warranty_claims_org_id_idx").on(table.org_id),

    pgPolicy("warranty_claims_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`org_id = (select auth.jwt() ->> 'org_id')::uuid`,
    }),
    pgPolicy("warranty_claims_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    pgPolicy("warranty_claims_update_policy", {
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
    pgPolicy("warranty_claims_delete_policy", {
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
// project_documents
// ---------------------------------------------------------------------------

export const projectDocuments = pgTable(
  "project_documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    project_id: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // document_type: 'hoa' | 'permit' | 'contract' | 'photo' | 'certificate' | 'other'
    document_type: text("document_type").notNull().default("other"),
    // Supabase Storage path
    file_path: text("file_path").notNull(),
    file_name: text("file_name").notNull(),
    uploaded_by: uuid("uploaded_by").references(() => profiles.id, { onDelete: "set null" }),
    // Soft-archive (PROJ-91)
    archived_at: timestamp("archived_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("project_documents_project_id_idx").on(table.project_id),

    pgPolicy("project_documents_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`org_id = (select auth.jwt() ->> 'org_id')::uuid`,
    }),
    // Owner, office, and tech can upload documents
    pgPolicy("project_documents_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office', 'tech')
      `,
    }),
    pgPolicy("project_documents_update_policy", {
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
    pgPolicy("project_documents_delete_policy", {
      for: "delete",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
  ]
).enableRLS()
