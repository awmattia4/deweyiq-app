/**
 * Phase 13: Truck Inventory & Shopping Lists — Truck Inventory Schema
 *
 * Tables: truck_inventory, truck_inventory_log, truck_load_templates, truck_load_template_items
 *
 * truck_inventory: per-tech inventory of chemicals, parts, tools, and equipment
 * truck_inventory_log: audit log of all quantity changes
 * truck_load_templates: office-defined standard truck loads
 * truck_load_template_items: line items within a template
 *
 * RLS:
 * - truck_inventory: SELECT all org members; INSERT/UPDATE owner+office+tech; DELETE owner+office
 * - truck_inventory_log: SELECT all org members; INSERT owner+office+tech
 * - truck_load_templates: SELECT all org; INSERT/UPDATE/DELETE owner+office
 * - truck_load_template_items: SELECT all org; INSERT/UPDATE/DELETE owner+office
 */
import {
  boolean,
  index,
  integer,
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

// ---------------------------------------------------------------------------
// truck_inventory
// ---------------------------------------------------------------------------

export const truckInventory = pgTable(
  "truck_inventory",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    // NULL = warehouse/central stock, non-null = on a tech's truck
    tech_id: uuid("tech_id")
      .references(() => profiles.id, { onDelete: "cascade" }),
    // Optional link to catalog — null for ad-hoc items
    catalog_item_id: uuid("catalog_item_id").references(() => partsCatalog.id, {
      onDelete: "set null",
    }),
    chemical_product_id: uuid("chemical_product_id").references(
      () => chemicalProducts.id,
      { onDelete: "set null" }
    ),
    // Display name (copied from catalog or entered manually)
    item_name: text("item_name").notNull(),
    // 'chemical' | 'part' | 'tool' | 'equipment' | 'other'
    category: text("category").notNull().default("other"),
    quantity: numeric("quantity", { precision: 10, scale: 3 }).notNull().default("0"),
    unit: text("unit").notNull(),
    // Fire reorder alert when quantity drops at or below this value
    min_threshold: numeric("min_threshold", { precision: 10, scale: 3 }).notNull().default("0"),
    on_truck: boolean("on_truck").notNull().default(true),
    // Optional barcode linked to this item
    barcode: text("barcode"),
    // Set when reorder alert fires; cleared when restocked above threshold
    reorder_alert_sent_at: timestamp("reorder_alert_sent_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("truck_inventory_org_tech_idx").on(table.org_id, table.tech_id),
    index("truck_inventory_chemical_product_idx").on(table.chemical_product_id),

    // RLS: all org members can view truck inventory
    pgPolicy("truck_inventory_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`org_id = (select auth.jwt() ->> 'org_id')::uuid`,
    }),
    // RLS: owner+office+tech can add/update inventory items
    pgPolicy("truck_inventory_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office', 'tech')
      `,
    }),
    pgPolicy("truck_inventory_update_policy", {
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
    // RLS: only owner+office can delete inventory items
    pgPolicy("truck_inventory_delete_policy", {
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
// truck_inventory_log
// ---------------------------------------------------------------------------

export const truckInventoryLog = pgTable(
  "truck_inventory_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    truck_inventory_item_id: uuid("truck_inventory_item_id")
      .notNull()
      .references(() => truckInventory.id, { onDelete: "cascade" }),
    tech_id: uuid("tech_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    // 'auto_decrement' | 'manual_use' | 'loaded' | 'damaged' | 'transfer_out' | 'transfer_in' | 'adjustment'
    change_type: text("change_type").notNull(),
    quantity_before: numeric("quantity_before", { precision: 10, scale: 3 }).notNull(),
    quantity_change: numeric("quantity_change", { precision: 10, scale: 3 }).notNull(),
    quantity_after: numeric("quantity_after", { precision: 10, scale: 3 }).notNull(),
    // 'service_visit' | 'work_order' | 'transfer' | 'manual'
    source_type: text("source_type"),
    source_id: uuid("source_id"),
    // For transfer logs
    transfer_to_tech_id: uuid("transfer_to_tech_id").references(() => profiles.id, {
      onDelete: "set null",
    }),
    transfer_from_tech_id: uuid("transfer_from_tech_id").references(() => profiles.id, {
      onDelete: "set null",
    }),
    transfer_confirmed_at: timestamp("transfer_confirmed_at", { withTimezone: true }),
    notes: text("notes"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("truck_inventory_log_item_idx").on(table.truck_inventory_item_id),
    index("truck_inventory_log_tech_idx").on(table.tech_id),

    // RLS: all org members can view the audit log
    pgPolicy("truck_inventory_log_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`org_id = (select auth.jwt() ->> 'org_id')::uuid`,
    }),
    // RLS: owner+office+tech can insert log entries
    pgPolicy("truck_inventory_log_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office', 'tech')
      `,
    }),
  ]
).enableRLS()

// ---------------------------------------------------------------------------
// truck_load_templates
// ---------------------------------------------------------------------------

export const truckLoadTemplates = pgTable(
  "truck_load_templates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // 'tech' or null (null = applies to all roles)
    target_role: text("target_role"),
    is_active: boolean("is_active").notNull().default(true),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("truck_load_templates_org_idx").on(table.org_id),

    // RLS: all org members can view templates
    pgPolicy("truck_load_templates_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`org_id = (select auth.jwt() ->> 'org_id')::uuid`,
    }),
    // RLS: only owner+office can manage templates
    pgPolicy("truck_load_templates_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    pgPolicy("truck_load_templates_update_policy", {
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
    pgPolicy("truck_load_templates_delete_policy", {
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
// truck_load_template_items
// ---------------------------------------------------------------------------

export const truckLoadTemplateItems = pgTable(
  "truck_load_template_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    template_id: uuid("template_id")
      .notNull()
      .references(() => truckLoadTemplates.id, { onDelete: "cascade" }),
    catalog_item_id: uuid("catalog_item_id").references(() => partsCatalog.id, {
      onDelete: "set null",
    }),
    chemical_product_id: uuid("chemical_product_id").references(
      () => chemicalProducts.id,
      { onDelete: "set null" }
    ),
    item_name: text("item_name").notNull(),
    category: text("category").notNull(),
    default_quantity: numeric("default_quantity", { precision: 10, scale: 3 }).notNull(),
    unit: text("unit").notNull(),
    min_threshold: numeric("min_threshold", { precision: 10, scale: 3 }).notNull().default("0"),
    sort_order: integer("sort_order").notNull().default(0),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("truck_load_template_items_template_idx").on(table.template_id),

    // RLS: all org members can view template items
    pgPolicy("truck_load_template_items_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`org_id = (select auth.jwt() ->> 'org_id')::uuid`,
    }),
    // RLS: only owner+office can manage template items
    pgPolicy("truck_load_template_items_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    pgPolicy("truck_load_template_items_update_policy", {
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
    pgPolicy("truck_load_template_items_delete_policy", {
      for: "delete",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
  ]
).enableRLS()
