/**
 * Phase 12: Projects & Renovations — Materials & Procurement Schema
 *
 * Tables: project_materials, project_purchase_orders, project_po_line_items,
 *         project_material_receipts, project_material_usage, project_material_returns
 *
 * Tracks the full materials lifecycle: estimate -> order -> receive -> use -> return
 *
 * RLS: owner+office manage all, tech can log usage/receipts in field
 */
import {
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
import { projects } from "./projects"
import { projectPhases } from "./projects"
import { projectProposalLineItems } from "./project-proposals"
import { profiles } from "./profiles"

// ---------------------------------------------------------------------------
// project_materials
// ---------------------------------------------------------------------------

export const projectMaterials = pgTable(
  "project_materials",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    project_id: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // Optional link to the proposal line item that originated this material
    proposal_line_item_id: uuid("proposal_line_item_id").references(
      () => projectProposalLineItems.id,
      { onDelete: "set null" }
    ),
    name: text("name").notNull(),
    // category: 'pool_equipment' | 'plumbing' | 'electrical' | 'decking' | 'surface' | 'chemical' | 'other'
    category: text("category").notNull().default("other"),
    quantity_estimated: numeric("quantity_estimated", { precision: 10, scale: 3 }).notNull().default("0"),
    quantity_ordered: numeric("quantity_ordered", { precision: 10, scale: 3 }).notNull().default("0"),
    quantity_received: numeric("quantity_received", { precision: 10, scale: 3 }).notNull().default("0"),
    quantity_used: numeric("quantity_used", { precision: 10, scale: 3 }).notNull().default("0"),
    unit: text("unit").notNull().default("each"),
    unit_cost_estimated: numeric("unit_cost_estimated", { precision: 12, scale: 2 }),
    unit_cost_actual: numeric("unit_cost_actual", { precision: 12, scale: 2 }),
    supplier: text("supplier"),
    // order_status: 'not_ordered' | 'ordered' | 'partial' | 'received' | 'returned'
    order_status: text("order_status").notNull().default("not_ordered"),
    notes: text("notes"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("project_materials_project_id_idx").on(table.project_id),
    index("project_materials_org_id_idx").on(table.org_id),

    // RLS: all org members can view materials
    pgPolicy("project_materials_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`org_id = (select auth.jwt() ->> 'org_id')::uuid`,
    }),
    // RLS: owner+office can create/manage materials
    pgPolicy("project_materials_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    pgPolicy("project_materials_update_policy", {
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
    pgPolicy("project_materials_delete_policy", {
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
// project_purchase_orders
// ---------------------------------------------------------------------------

export const projectPurchaseOrders = pgTable(
  "project_purchase_orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    project_id: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // Sequential PO number (e.g. "PO-0001")
    po_number: text("po_number"),
    supplier_name: text("supplier_name").notNull(),
    supplier_contact: text("supplier_contact"),
    // status: 'draft' | 'sent' | 'acknowledged' | 'partial' | 'complete' | 'cancelled'
    status: text("status").notNull().default("draft"),
    total_amount: numeric("total_amount", { precision: 12, scale: 2 }).notNull().default("0"),
    notes: text("notes"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("project_purchase_orders_project_id_idx").on(table.project_id),

    pgPolicy("project_purchase_orders_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`org_id = (select auth.jwt() ->> 'org_id')::uuid`,
    }),
    pgPolicy("project_purchase_orders_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    pgPolicy("project_purchase_orders_update_policy", {
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
    pgPolicy("project_purchase_orders_delete_policy", {
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
// project_po_line_items
// ---------------------------------------------------------------------------

export const projectPoLineItems = pgTable(
  "project_po_line_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    po_id: uuid("po_id")
      .notNull()
      .references(() => projectPurchaseOrders.id, { onDelete: "cascade" }),
    material_id: uuid("material_id").references(() => projectMaterials.id, {
      onDelete: "set null",
    }),
    quantity: numeric("quantity", { precision: 10, scale: 3 }).notNull().default("1"),
    unit_price: numeric("unit_price", { precision: 12, scale: 2 }).notNull().default("0"),
    total: numeric("total", { precision: 12, scale: 2 }).notNull().default("0"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("project_po_line_items_po_id_idx").on(table.po_id),

    pgPolicy("project_po_line_items_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`org_id = (select auth.jwt() ->> 'org_id')::uuid`,
    }),
    pgPolicy("project_po_line_items_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    pgPolicy("project_po_line_items_update_policy", {
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
    pgPolicy("project_po_line_items_delete_policy", {
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
// project_material_receipts
// ---------------------------------------------------------------------------

export const projectMaterialReceipts = pgTable(
  "project_material_receipts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    material_id: uuid("material_id")
      .notNull()
      .references(() => projectMaterials.id, { onDelete: "cascade" }),
    po_id: uuid("po_id").references(() => projectPurchaseOrders.id, { onDelete: "set null" }),
    quantity_received: numeric("quantity_received", { precision: 10, scale: 3 }).notNull(),
    received_by: uuid("received_by").references(() => profiles.id, { onDelete: "set null" }),
    received_at: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
    // Optional photo of receipt/delivery confirmation
    photo_url: text("photo_url"),
    notes: text("notes"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("project_material_receipts_material_id_idx").on(table.material_id),

    // RLS: all org members can view receipts
    pgPolicy("project_material_receipts_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`org_id = (select auth.jwt() ->> 'org_id')::uuid`,
    }),
    // RLS: owner+office+tech can log receipts (tech receives deliveries on site)
    pgPolicy("project_material_receipts_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office', 'tech')
      `,
    }),
    pgPolicy("project_material_receipts_update_policy", {
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
    pgPolicy("project_material_receipts_delete_policy", {
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
// project_material_usage
// ---------------------------------------------------------------------------

export const projectMaterialUsage = pgTable(
  "project_material_usage",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    material_id: uuid("material_id")
      .notNull()
      .references(() => projectMaterials.id, { onDelete: "cascade" }),
    project_id: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    phase_id: uuid("phase_id").references(() => projectPhases.id, { onDelete: "set null" }),
    logged_by: uuid("logged_by").references(() => profiles.id, { onDelete: "set null" }),
    quantity_used: numeric("quantity_used", { precision: 10, scale: 3 }).notNull(),
    used_at: timestamp("used_at", { withTimezone: true }).defaultNow().notNull(),
    notes: text("notes"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("project_material_usage_material_id_idx").on(table.material_id),
    index("project_material_usage_project_id_idx").on(table.project_id),

    // RLS: all org members can view usage
    pgPolicy("project_material_usage_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`org_id = (select auth.jwt() ->> 'org_id')::uuid`,
    }),
    // RLS: owner+office+tech can log usage
    pgPolicy("project_material_usage_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office', 'tech')
      `,
    }),
    pgPolicy("project_material_usage_update_policy", {
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
    pgPolicy("project_material_usage_delete_policy", {
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
// project_material_returns
// ---------------------------------------------------------------------------

export const projectMaterialReturns = pgTable(
  "project_material_returns",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    material_id: uuid("material_id")
      .notNull()
      .references(() => projectMaterials.id, { onDelete: "cascade" }),
    quantity_returned: numeric("quantity_returned", { precision: 10, scale: 3 }).notNull(),
    return_reason: text("return_reason"),
    credit_amount: numeric("credit_amount", { precision: 12, scale: 2 }).notNull().default("0"),
    returned_by: uuid("returned_by").references(() => profiles.id, { onDelete: "set null" }),
    returned_at: timestamp("returned_at", { withTimezone: true }).defaultNow().notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("project_material_returns_material_id_idx").on(table.material_id),

    pgPolicy("project_material_returns_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`org_id = (select auth.jwt() ->> 'org_id')::uuid`,
    }),
    pgPolicy("project_material_returns_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office', 'tech')
      `,
    }),
    pgPolicy("project_material_returns_update_policy", {
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
    pgPolicy("project_material_returns_delete_policy", {
      for: "delete",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
  ]
).enableRLS()
