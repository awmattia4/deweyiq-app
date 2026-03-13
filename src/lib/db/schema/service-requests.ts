import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { pgPolicy } from "drizzle-orm/pg-core"
import { authenticatedRole } from "drizzle-orm/supabase"
import { sql } from "drizzle-orm"
import { orgs } from "./orgs"
import { customers } from "./customers"
import { pools } from "./pools"

/**
 * service_requests — customer-submitted service requests from the portal.
 *
 * Customers submit requests via a guided form; office reviews and can
 * link to a work order. Status progresses: submitted → reviewed → scheduled → complete.
 *
 * RLS:
 * - Office policy: owner+office can SELECT/INSERT/UPDATE/DELETE any request in their org
 * - Customer SELECT policy: customer role can SELECT their own requests (by email lookup)
 * - Customer INSERT policy: customer role can INSERT their own requests (by email lookup)
 * - Customers CANNOT update or delete requests (office-only)
 */
export const serviceRequests = pgTable(
  "service_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    customer_id: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    // Optional: which pool this request is about
    pool_id: uuid("pool_id").references(() => pools.id, { onDelete: "set null" }),
    // No FK constraint on work_order_id to avoid circular deps
    work_order_id: uuid("work_order_id"),
    // 'green_pool' | 'opening_closing' | 'repair' | 'cleaning' | 'chemical' | 'other'
    category: text("category").notNull(),
    description: text("description").notNull(),
    is_urgent: boolean("is_urgent").notNull().default(false),
    // Array of Storage paths for attached photos
    photo_paths: jsonb("photo_paths").$type<string[]>().default([]),
    // Customer-preferred scheduling
    preferred_date: text("preferred_date"),
    // 'morning' | 'afternoon' | 'anytime'
    preferred_time_window: text("preferred_time_window"),
    // 'submitted' | 'reviewed' | 'scheduled' | 'complete' | 'declined'
    status: text("status").notNull().default("submitted"),
    // Office-internal notes
    office_notes: text("office_notes"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("service_requests_org_id_idx").on(table.org_id),
    index("service_requests_customer_id_idx").on(table.customer_id),
    index("service_requests_status_idx").on(table.status),

    // RLS: owner and office can manage all service requests in their org
    pgPolicy("service_requests_office_policy", {
      for: "all",
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

    // RLS: customers can SELECT their own requests
    pgPolicy("service_requests_customer_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'customer'
        AND customer_id IN (
          SELECT id FROM customers
          WHERE email = (select auth.email())
          AND org_id = (select auth.jwt() ->> 'org_id')::uuid
        )
      `,
    }),

    // RLS: customers can INSERT their own requests
    pgPolicy("service_requests_customer_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'customer'
        AND customer_id IN (
          SELECT id FROM customers
          WHERE email = (select auth.email())
          AND org_id = (select auth.jwt() ->> 'org_id')::uuid
        )
      `,
    }),
  ]
).enableRLS()
