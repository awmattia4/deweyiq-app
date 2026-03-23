/**
 * Phase 13: Truck Inventory & Shopping Lists — Shopping Lists Schema
 *
 * Tables: shopping_list_items, purchase_orders, po_line_items
 *
 * shopping_list_items: items needed (from any source) — aggregated org-wide + per-tech
 * purchase_orders: formal or checklist-mode POs sent to suppliers
 * po_line_items: individual line items within a PO
 *
 * RLS:
 * - shopping_list_items: SELECT all org; INSERT/UPDATE owner+office+tech; DELETE owner+office
 * - purchase_orders: SELECT/INSERT/UPDATE/DELETE owner+office
 * - po_line_items: SELECT/INSERT/UPDATE/DELETE owner+office
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
import { profiles } from "./profiles"
import { partsCatalog } from "./parts-catalog"
import { chemicalProducts } from "./chemical-products"
import { workOrders } from "./work-orders"
import { truckInventory } from "./truck-inventory"

// ---------------------------------------------------------------------------
// shopping_list_items
// ---------------------------------------------------------------------------

export const shoppingListItems = pgTable(
  "shopping_list_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    // NULL = shared org list; set = tech-specific list
    tech_id: uuid("tech_id").references(() => profiles.id, { onDelete: "set null" }),
    catalog_item_id: uuid("catalog_item_id").references(() => partsCatalog.id, {
      onDelete: "set null",
    }),
    chemical_product_id: uuid("chemical_product_id").references(
      () => chemicalProducts.id,
      { onDelete: "set null" }
    ),
    item_name: text("item_name").notNull(),
    category: text("category").notNull(),
    quantity_needed: numeric("quantity_needed", { precision: 10, scale: 3 }).notNull(),
    unit: text("unit").notNull(),
    // 'manual' | 'work_order' | 'project' | 'low_inventory' | 'forecast'
    source_type: text("source_type"),
    source_work_order_id: uuid("source_work_order_id").references(() => workOrders.id, {
      onDelete: "set null",
    }),
    // Plain UUID — no FK to avoid potential circular imports with projects table
    source_project_id: uuid("source_project_id"),
    source_inventory_item_id: uuid("source_inventory_item_id").references(
      () => truckInventory.id,
      { onDelete: "set null" }
    ),
    // Lifecycle: 'needed' | 'ordered' | 'received' | 'loaded' | 'used'
    status: text("status").notNull().default("needed"),
    ordered_at: timestamp("ordered_at", { withTimezone: true }),
    ordered_by_id: uuid("ordered_by_id").references(() => profiles.id, {
      onDelete: "set null",
    }),
    vendor: text("vendor"),
    po_reference: text("po_reference"),
    received_at: timestamp("received_at", { withTimezone: true }),
    received_by_id: uuid("received_by_id").references(() => profiles.id, {
      onDelete: "set null",
    }),
    loaded_at: timestamp("loaded_at", { withTimezone: true }),
    loaded_by_id: uuid("loaded_by_id").references(() => profiles.id, {
      onDelete: "set null",
    }),
    used_at: timestamp("used_at", { withTimezone: true }),
    used_by_id: uuid("used_by_id").references(() => profiles.id, {
      onDelete: "set null",
    }),
    is_urgent: boolean("is_urgent").notNull().default(false),
    urgent_reason: text("urgent_reason"),
    notes: text("notes"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("shopping_list_items_org_idx").on(table.org_id),
    index("shopping_list_items_tech_idx").on(table.tech_id),
    index("shopping_list_items_status_idx").on(table.status),

    // RLS: all org members can view shopping list items
    pgPolicy("shopping_list_items_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`org_id = (select auth.jwt() ->> 'org_id')::uuid`,
    }),
    // RLS: owner+office+tech can add/update items
    pgPolicy("shopping_list_items_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office', 'tech')
      `,
    }),
    pgPolicy("shopping_list_items_update_policy", {
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
    // RLS: only owner+office can delete items
    pgPolicy("shopping_list_items_delete_policy", {
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
// purchase_orders
// ---------------------------------------------------------------------------

export const purchaseOrders = pgTable(
  "purchase_orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    po_number: text("po_number"),
    supplier_name: text("supplier_name").notNull(),
    supplier_contact: text("supplier_contact"),
    supplier_email: text("supplier_email"),
    // 'formal' | 'checklist'
    mode: text("mode").notNull().default("checklist"),
    // 'draft' | 'sent' | 'partial' | 'complete' | 'cancelled'
    status: text("status").notNull().default("draft"),
    total_amount: numeric("total_amount", { precision: 12, scale: 2 }).notNull().default("0"),
    notes: text("notes"),
    sent_at: timestamp("sent_at", { withTimezone: true }),
    created_by_id: uuid("created_by_id").references(() => profiles.id, {
      onDelete: "set null",
    }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("purchase_orders_org_idx").on(table.org_id),
    index("purchase_orders_status_idx").on(table.status),

    // RLS: owner+office can manage POs
    pgPolicy("purchase_orders_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    pgPolicy("purchase_orders_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    pgPolicy("purchase_orders_update_policy", {
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
    pgPolicy("purchase_orders_delete_policy", {
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
// po_line_items
// ---------------------------------------------------------------------------

export const poLineItems = pgTable(
  "po_line_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    po_id: uuid("po_id")
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: "cascade" }),
    // Optional link back to the shopping list item this line item originated from
    shopping_list_item_id: uuid("shopping_list_item_id").references(
      () => shoppingListItems.id,
      { onDelete: "set null" }
    ),
    item_name: text("item_name").notNull(),
    quantity: numeric("quantity", { precision: 10, scale: 3 }).notNull().default("1"),
    unit: text("unit").notNull().default("each"),
    unit_price: numeric("unit_price", { precision: 12, scale: 2 }).notNull().default("0"),
    total: numeric("total", { precision: 12, scale: 2 }).notNull().default("0"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("po_line_items_po_idx").on(table.po_id),

    // RLS: owner+office can manage PO line items
    pgPolicy("po_line_items_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    pgPolicy("po_line_items_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    pgPolicy("po_line_items_update_policy", {
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
    pgPolicy("po_line_items_delete_policy", {
      for: "delete",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
  ]
).enableRLS()
