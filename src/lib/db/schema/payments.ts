/**
 * Phase 7: Billing & Payments — Payment Records Schema
 * Phase 11: Payment Plans, Customer Credits (PAY-03 through PAY-07)
 *
 * Tables:
 *   payment_records        — individual payment attempts and settlements
 *   payment_plans          — installment schedules for invoices
 *   payment_plan_installments — individual installments within a plan
 *   customer_credits       — issued credits that can be applied to invoices
 *
 * RLS:
 * - SELECT/INSERT/UPDATE: owner+office
 * - DELETE: owner only
 */
import {
  date,
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
import { invoices } from "./invoices"
import { customers } from "./customers"
import { profiles } from "./profiles"

// ---------------------------------------------------------------------------
// payment_records
// ---------------------------------------------------------------------------

export const paymentRecords = pgTable(
  "payment_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    invoice_id: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
    // 'card' | 'ach' | 'check' | 'cash' | 'qbo'
    method: text("method").notNull(),
    // 'pending' | 'settled' | 'failed' | 'refunded'
    status: text("status").notNull().default("pending"),
    stripe_payment_intent_id: text("stripe_payment_intent_id"),
    qbo_payment_id: text("qbo_payment_id"),
    settled_at: timestamp("settled_at", { withTimezone: true }),
    failure_reason: text("failure_reason"),
    attempt_count: integer("attempt_count").notNull().default(1),
    next_retry_at: timestamp("next_retry_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("payment_records_org_id_idx").on(table.org_id),
    index("payment_records_invoice_id_idx").on(table.invoice_id),
    index("payment_records_status_idx").on(table.status),

    // RLS: owner+office can view payment records
    pgPolicy("payment_records_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    // RLS: owner+office can create payment records
    pgPolicy("payment_records_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    // RLS: owner+office can update payment records
    pgPolicy("payment_records_update_policy", {
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
    // RLS: only owner can delete payment records
    pgPolicy("payment_records_delete_policy", {
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
// payment_plans
//
// An installment schedule tied to a single invoice. Splits the invoice total
// into equal installments paid over time. Owner-created; office can view.
// ---------------------------------------------------------------------------

export const paymentPlans = pgTable(
  "payment_plans",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    invoice_id: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    total_amount: numeric("total_amount", { precision: 12, scale: 2 }).notNull(),
    installment_count: integer("installment_count").notNull(),
    installment_amount: numeric("installment_amount", { precision: 12, scale: 2 }).notNull(),
    // 'weekly' | 'bi_weekly' | 'monthly'
    frequency: text("frequency").notNull().default("monthly"),
    start_date: date("start_date").notNull(),
    // 'active' | 'completed' | 'cancelled'
    status: text("status").notNull().default("active"),
    created_by: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("payment_plans_org_id_idx").on(table.org_id),
    index("payment_plans_invoice_id_idx").on(table.invoice_id),
    index("payment_plans_status_idx").on(table.status),

    pgPolicy("payment_plans_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    pgPolicy("payment_plans_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    pgPolicy("payment_plans_update_policy", {
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
    pgPolicy("payment_plans_delete_policy", {
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
// payment_plan_installments
//
// Individual installment rows within a payment plan. Linked to a payment
// record when the installment is paid.
// ---------------------------------------------------------------------------

export const paymentPlanInstallments = pgTable(
  "payment_plan_installments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    payment_plan_id: uuid("payment_plan_id")
      .notNull()
      .references(() => paymentPlans.id, { onDelete: "cascade" }),
    installment_number: integer("installment_number").notNull(),
    due_date: date("due_date").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    // 'pending' | 'paid' | 'overdue'
    status: text("status").notNull().default("pending"),
    // Linked payment record when the installment is paid
    payment_record_id: uuid("payment_record_id").references(() => paymentRecords.id, {
      onDelete: "set null",
    }),
    paid_at: timestamp("paid_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("ppi_plan_id_idx").on(table.payment_plan_id),
    index("ppi_org_id_idx").on(table.org_id),
    index("ppi_status_idx").on(table.status),

    pgPolicy("ppi_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    pgPolicy("ppi_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    pgPolicy("ppi_update_policy", {
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
    pgPolicy("ppi_delete_policy", {
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
// customer_credits
//
// Issued credits that can be applied to open invoices as a payment offset.
// source_type tracks the origin: 'refund' | 'goodwill' | 'overpayment'
// status: 'available' | 'applied' | 'expired'
// ---------------------------------------------------------------------------

export const customerCredits = pgTable(
  "customer_credits",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    customer_id: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    reason: text("reason").notNull(),
    // 'refund' | 'goodwill' | 'overpayment'
    source_type: text("source_type").notNull().default("goodwill"),
    // Optional: links back to the originating payment or invoice
    source_id: uuid("source_id"),
    // Set when the credit is applied to an invoice
    applied_to_invoice_id: uuid("applied_to_invoice_id").references(() => invoices.id, {
      onDelete: "set null",
    }),
    // 'available' | 'applied' | 'expired'
    status: text("status").notNull().default("available"),
    created_by: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("customer_credits_org_id_idx").on(table.org_id),
    index("customer_credits_customer_id_idx").on(table.customer_id),
    index("customer_credits_status_idx").on(table.status),

    pgPolicy("customer_credits_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    pgPolicy("customer_credits_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    pgPolicy("customer_credits_update_policy", {
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
    pgPolicy("customer_credits_delete_policy", {
      for: "delete",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      `,
    }),
  ]
).enableRLS()
