/**
 * Phase 6: Work Orders & Quoting — Parts Catalog Schema
 *
 * Tables: parts_catalog, wo_templates
 *
 * parts_catalog: reusable parts/labor items for line item lookup
 * wo_templates: work order templates that pre-populate line items on creation
 *
 * RLS:
 * - SELECT: all org members
 * - INSERT/UPDATE/DELETE: owner+office only
 */
import {
  boolean,
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

// ---------------------------------------------------------------------------
// parts_catalog
// ---------------------------------------------------------------------------

export const partsCatalog = pgTable(
  "parts_catalog",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    category: text("category"),
    sku: text("sku"),
    default_cost_price: numeric("default_cost_price", { precision: 10, scale: 2 }),
    default_sell_price: numeric("default_sell_price", { precision: 10, scale: 2 }),
    default_unit: text("default_unit"),
    // When true, this item represents a labor charge (not a physical part)
    is_labor: boolean("is_labor").notNull().default(false),
    is_active: boolean("is_active").notNull().default(true),
    // Phase 13: QuickBooks Online two-way sync — QBO item ID for this catalog item
    qbo_item_id: text("qbo_item_id"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // RLS: all org members can view the parts catalog
    pgPolicy("parts_catalog_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`org_id = (select auth.jwt() ->> 'org_id')::uuid`,
    }),
    // RLS: only owner+office can create catalog items
    pgPolicy("parts_catalog_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    // RLS: only owner+office can update catalog items
    pgPolicy("parts_catalog_update_policy", {
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
    // RLS: only owner+office can delete catalog items
    pgPolicy("parts_catalog_delete_policy", {
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
// wo_templates
// ---------------------------------------------------------------------------

export const woTemplates = pgTable(
  "wo_templates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    category: text("category"),
    // Default priority for WOs created from this template
    default_priority: text("default_priority").notNull().default("normal"),
    // Snapshot of line items — copied to WO on creation
    // Array of { description, item_type, quantity, unit, unit_price, markup_pct, is_taxable, sort_order }
    line_items_snapshot: jsonb("line_items_snapshot").$type<
      Array<{
        description: string
        item_type: string
        labor_type?: string
        quantity: string
        unit: string
        unit_cost?: string
        unit_price?: string
        markup_pct?: string
        is_taxable: boolean
        is_optional: boolean
        sort_order: number
      }>
    >(),
    is_active: boolean("is_active").notNull().default(true),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // RLS: all org members can view templates
    pgPolicy("wo_templates_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`org_id = (select auth.jwt() ->> 'org_id')::uuid`,
    }),
    // RLS: only owner+office can create templates
    pgPolicy("wo_templates_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    // RLS: only owner+office can update templates
    pgPolicy("wo_templates_update_policy", {
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
    // RLS: only owner+office can delete templates
    pgPolicy("wo_templates_delete_policy", {
      for: "delete",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
  ]
).enableRLS()
