/**
 * Phase 6: Work Orders & Quoting — Work Orders Schema
 *
 * IMPORTANT: All colors used in PDF-related code MUST be hex (e.g. #60a5fa),
 * NOT oklch(). WebGL paint properties and PDF renderers cannot parse oklch().
 * Only CSS DOM elements support oklch() color values.
 *
 * Tables: work_orders, work_order_line_items
 *
 * RLS:
 * - work_orders: SELECT all org members, INSERT owner+office+tech,
 *   UPDATE owner+office or assigned tech, DELETE owner only
 * - work_order_line_items: SELECT all org, INSERT owner+office+tech,
 *   UPDATE owner+office, DELETE owner+office
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
import { customers } from "./customers"
import { pools } from "./pools"
import { profiles } from "./profiles"

// ---------------------------------------------------------------------------
// work_orders
// ---------------------------------------------------------------------------

export const workOrders = pgTable(
  "work_orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    customer_id: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    pool_id: uuid("pool_id").references(() => pools.id, { onDelete: "set null" }),
    created_by_id: uuid("created_by_id").references(() => profiles.id, {
      onDelete: "set null",
    }),
    assigned_tech_id: uuid("assigned_tech_id").references(() => profiles.id, {
      onDelete: "set null",
    }),
    // Self-reference for follow-up WOs — no FK to avoid cascade complexity
    parent_wo_id: uuid("parent_wo_id"),
    title: text("title").notNull(),
    description: text("description"),
    // Category: pump | filter | heater | plumbing_leak | surface | electrical | other
    category: text("category").notNull().default("other"),
    // Priority: emergency | high | normal | low
    priority: text("priority").notNull().default("normal"),
    // Status: draft | quoted | approved | scheduled | in_progress | complete | invoiced | cancelled
    status: text("status").notNull().default("draft"),
    // Severity (used for tech-flagged WOs): routine | urgent | emergency
    severity: text("severity"),
    // Target service date — stored as YYYY-MM-DD text per date-utils convention
    // NEVER use toISOString().split("T")[0] — use toLocalDateString() from @/lib/date-utils
    target_date: text("target_date"),
    completed_at: timestamp("completed_at", { withTimezone: true }),
    completion_notes: text("completion_notes"),
    // Array of Supabase Storage paths for completion photos
    completion_photo_paths: jsonb("completion_photo_paths").$type<string[]>(),
    cancelled_at: timestamp("cancelled_at", { withTimezone: true }),
    cancelled_by_id: uuid("cancelled_by_id").references(() => profiles.id, {
      onDelete: "set null",
    }),
    cancel_reason: text("cancel_reason"),
    // Tech who flagged this WO from a service stop
    flagged_by_tech_id: uuid("flagged_by_tech_id").references(() => profiles.id, {
      onDelete: "set null",
    }),
    // Service visit that triggered this WO creation
    flagged_from_visit_id: uuid("flagged_from_visit_id"),
    // Per-WO tax exemption override
    tax_exempt: boolean("tax_exempt").notNull().default(false),
    // Discount: type = 'percent' | 'flat'
    discount_type: text("discount_type"),
    discount_value: numeric("discount_value", { precision: 10, scale: 2 }),
    discount_reason: text("discount_reason"),
    // WO template used to seed line items on creation
    template_id: uuid("template_id"),
    // Labor — hours and rate captured at WO creation/scheduling (used for quote/invoice line items)
    labor_hours: numeric("labor_hours", { precision: 6, scale: 2 }),
    labor_rate: numeric("labor_rate", { precision: 10, scale: 2 }),
    // Actual hours worked — updated by tech when completing the WO
    labor_actual_hours: numeric("labor_actual_hours", { precision: 6, scale: 2 }),
    // Audit trail — JSONB array of { type, at, by_id, note } events
    activity_log: jsonb("activity_log").$type<
      Array<{ type: string; at: string; by_id: string; note: string | null }>
    >(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("work_orders_org_id_idx").on(table.org_id),
    index("work_orders_customer_id_idx").on(table.customer_id),
    index("work_orders_status_idx").on(table.status),
    index("work_orders_assigned_tech_idx").on(table.assigned_tech_id),

    // RLS: all org members can view work orders
    pgPolicy("work_orders_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`org_id = (select auth.jwt() ->> 'org_id')::uuid`,
    }),
    // RLS: owner, office, and techs can create work orders (techs flag from stops)
    pgPolicy("work_orders_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office', 'tech')
      `,
    }),
    // RLS: owner+office can update any WO; assigned tech can update their own
    pgPolicy("work_orders_update_policy", {
      for: "update",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (
          (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
          OR (
            (select auth.jwt() ->> 'user_role') = 'tech'
            AND assigned_tech_id = (select auth.uid())
          )
        )
      `,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (
          (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
          OR (
            (select auth.jwt() ->> 'user_role') = 'tech'
            AND assigned_tech_id = (select auth.uid())
          )
        )
      `,
    }),
    // RLS: only owner can delete work orders
    pgPolicy("work_orders_delete_policy", {
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
// work_order_line_items
// ---------------------------------------------------------------------------

export const workOrderLineItems = pgTable(
  "work_order_line_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    work_order_id: uuid("work_order_id")
      .notNull()
      .references(() => workOrders.id, { onDelete: "cascade" }),
    // Nullable — line items can be free-text or catalog-linked
    catalog_item_id: uuid("catalog_item_id"),
    description: text("description").notNull(),
    // item_type: 'part' | 'labor' | 'other'
    item_type: text("item_type").notNull().default("part"),
    // labor_type: 'hourly' | 'flat_rate' (only relevant when item_type = 'labor')
    labor_type: text("labor_type"),
    quantity: numeric("quantity", { precision: 10, scale: 3 }).notNull().default("1"),
    unit: text("unit").notNull().default("each"),
    unit_cost: numeric("unit_cost", { precision: 10, scale: 2 }),
    unit_price: numeric("unit_price", { precision: 10, scale: 2 }),
    markup_pct: numeric("markup_pct", { precision: 5, scale: 2 }),
    // Per-line discount: type = 'percent' | 'flat'
    discount_type: text("discount_type"),
    discount_value: numeric("discount_value", { precision: 10, scale: 2 }),
    is_taxable: boolean("is_taxable").notNull().default(true),
    is_optional: boolean("is_optional").notNull().default(false),
    // Actual hours logged (for labor items)
    actual_hours: numeric("actual_hours", { precision: 6, scale: 2 }),
    sort_order: integer("sort_order").notNull().default(0),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("work_order_line_items_wo_id_idx").on(table.work_order_id),

    // RLS: all org members can view line items
    pgPolicy("wo_line_items_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`org_id = (select auth.jwt() ->> 'org_id')::uuid`,
    }),
    // RLS: owner, office, and techs can create line items
    pgPolicy("wo_line_items_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office', 'tech')
      `,
    }),
    // RLS: owner+office can update line items
    pgPolicy("wo_line_items_update_policy", {
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
    // RLS: owner+office can delete line items
    pgPolicy("wo_line_items_delete_policy", {
      for: "delete",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
  ]
).enableRLS()
