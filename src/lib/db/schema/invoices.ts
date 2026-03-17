/**
 * Phase 6: Work Orders & Quoting — Invoices Schema
 * Phase 7: Billing & Payments — Extended with billing model, period, payment fields
 *
 * Tables: invoices, invoice_line_items
 *
 * Invoices support multi-WO invoicing (a single invoice can cover multiple
 * work orders, e.g. monthly combined invoice) and billing-model-based
 * generation (per-stop, flat-rate, plus-chemicals, custom).
 *
 * RLS:
 * - SELECT/INSERT/UPDATE: owner+office
 * - DELETE: owner only
 */
import {
  boolean,
  date,
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

// ---------------------------------------------------------------------------
// invoices
// ---------------------------------------------------------------------------

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    // Sequential number with prefix (e.g. "INV-0042") — generated from org_settings
    invoice_number: text("invoice_number"),
    // Status: draft | sent | paid | void
    status: text("status").notNull().default("draft"),
    // Supports multi-WO invoicing — array of work_order IDs this invoice covers
    work_order_ids: jsonb("work_order_ids").$type<string[]>(),
    customer_id: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    subtotal: numeric("subtotal", { precision: 10, scale: 2 }).notNull().default("0"),
    tax_amount: numeric("tax_amount", { precision: 10, scale: 2 }).notNull().default("0"),
    discount_amount: numeric("discount_amount", { precision: 10, scale: 2 }).notNull().default("0"),
    total: numeric("total", { precision: 10, scale: 2 }).notNull().default("0"),
    notes: text("notes"),
    issued_at: timestamp("issued_at", { withTimezone: true }),
    paid_at: timestamp("paid_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    // Phase 7: Billing model & period
    billing_model: text("billing_model"), // 'per_stop' | 'flat_rate' | 'plus_chemicals' | 'custom'
    billing_period_start: date("billing_period_start"),
    billing_period_end: date("billing_period_end"),
    due_date: date("due_date"),
    // Phase 7: Payment tracking
    stripe_payment_intent_id: text("stripe_payment_intent_id"),
    payment_method: text("payment_method"), // 'card' | 'ach' | 'check' | 'cash' | 'qbo'
    surcharge_amount: numeric("surcharge_amount", { precision: 10, scale: 2 }),
    qbo_invoice_id: text("qbo_invoice_id"),
    // Phase 7: Communication tracking
    sent_at: timestamp("sent_at", { withTimezone: true }),
    sent_sms_at: timestamp("sent_sms_at", { withTimezone: true }),
    // Phase 12: Project billing extension
    // Nullable — only set for project-related invoices
    project_id: uuid("project_id"),
    // invoice_type: 'service' | 'project_deposit' | 'project_progress' | 'project_final'
    invoice_type: text("invoice_type").notNull().default("service"),
    // Links to the payment milestone this invoice fulfills
    project_milestone_id: uuid("project_milestone_id"),
    // Retainage (holdback) tracking for construction billing
    retainage_held: numeric("retainage_held", { precision: 12, scale: 2 }),
    retainage_released: numeric("retainage_released", { precision: 12, scale: 2 }),
  },
  (table) => [
    index("invoices_org_id_idx").on(table.org_id),
    index("invoices_customer_id_idx").on(table.customer_id),
    index("invoices_status_idx").on(table.status),

    // RLS: owner+office can view invoices
    pgPolicy("invoices_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    // RLS: owner+office can create invoices
    pgPolicy("invoices_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    // RLS: owner+office can update invoices
    pgPolicy("invoices_update_policy", {
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
    // RLS: only owner can delete invoices
    pgPolicy("invoices_delete_policy", {
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
// invoice_line_items
// ---------------------------------------------------------------------------

export const invoiceLineItems = pgTable(
  "invoice_line_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    invoice_id: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    // item_type: 'part' | 'labor' | 'other'
    item_type: text("item_type").notNull().default("part"),
    quantity: numeric("quantity", { precision: 10, scale: 3 }).notNull().default("1"),
    unit: text("unit").notNull().default("each"),
    unit_price: numeric("unit_price", { precision: 10, scale: 2 }).notNull().default("0"),
    // Per-line discount: type = 'percent' | 'flat'
    discount_type: text("discount_type"),
    discount_value: numeric("discount_value", { precision: 10, scale: 2 }),
    is_taxable: boolean("is_taxable").notNull().default(true),
    line_total: numeric("line_total", { precision: 10, scale: 2 }).notNull().default("0"),
    sort_order: integer("sort_order").notNull().default(0),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    // Phase 7: Link to service visit for per-stop line items
    visit_id: uuid("visit_id"),
    stop_date: date("stop_date"),
  },
  (table) => [
    // RLS: owner+office can view invoice line items
    pgPolicy("invoice_line_items_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    // RLS: owner+office can create invoice line items
    pgPolicy("invoice_line_items_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    // RLS: owner+office can update invoice line items
    pgPolicy("invoice_line_items_update_policy", {
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
    // RLS: owner+office can delete invoice line items
    pgPolicy("invoice_line_items_delete_policy", {
      for: "delete",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
  ]
).enableRLS()
