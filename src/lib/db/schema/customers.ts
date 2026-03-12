import { boolean, doublePrecision, index, numeric, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { pgPolicy } from "drizzle-orm/pg-core"
import { authenticatedRole } from "drizzle-orm/supabase"
import { sql } from "drizzle-orm"
import { orgs } from "./orgs"
import { profiles } from "./profiles"

/**
 * Customer status lifecycle:
 * - active: currently serviced
 * - paused: temporarily suspended (e.g., seasonal)
 * - cancelled: no longer a customer
 */
export const customerStatusEnum = pgEnum("customer_status", [
  "active",
  "paused",
  "cancelled",
])

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    // Core contact info (CUST-01)
    full_name: text("full_name").notNull(),
    address: text("address"),
    phone: text("phone"),
    email: text("email"),
    // Access info (CUST-01)
    gate_code: text("gate_code"),
    access_notes: text("access_notes"),
    // Status and routing
    status: customerStatusEnum("status").notNull().default("active"),
    assigned_tech_id: uuid("assigned_tech_id").references(() => profiles.id, {
      onDelete: "set null",
    }),
    route_name: text("route_name"),
    // Geocoding coordinates — set by Phase 4 geocoding when address is saved
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    // Phase 5: per-customer opt-out for pre-arrival SMS/email notifications
    notifications_enabled: boolean("notifications_enabled").notNull().default(true),
    // Phase 6: tax exemption status — when true, WOs/invoices skip tax calculation
    tax_exempt: boolean("tax_exempt").notNull().default(false),
    // Phase 7: Billing model & payment
    billing_model: text("billing_model"), // 'per_stop' | 'flat_rate' | 'plus_chemicals' | 'custom'
    flat_rate_amount: numeric("flat_rate_amount", { precision: 10, scale: 2 }),
    stripe_customer_id: text("stripe_customer_id"),
    autopay_enabled: boolean("autopay_enabled").notNull().default(false),
    autopay_method_id: text("autopay_method_id"),
    qbo_customer_id: text("qbo_customer_id"),
    overdue_balance: numeric("overdue_balance", { precision: 10, scale: 2 }),
    // Timestamps
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("customers_org_id_idx").on(table.org_id),
    index("customers_status_idx").on(table.status),
    index("customers_assigned_tech_idx").on(table.assigned_tech_id),

    // RLS: all org members can view customers (owner, office, tech, customer roles)
    pgPolicy("customers_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`org_id = (select auth.jwt() ->> 'org_id')::uuid`,
    }),
    // RLS: only owner+office can create customers
    pgPolicy("customers_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    // RLS: only owner+office can update customers
    pgPolicy("customers_update_policy", {
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
    // RLS: only owner+office can delete customers
    pgPolicy("customers_delete_policy", {
      for: "delete",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
  ]
).enableRLS()
