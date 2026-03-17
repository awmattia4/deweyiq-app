import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { pgPolicy } from "drizzle-orm/pg-core"
import { authenticatedRole } from "drizzle-orm/supabase"
import { sql } from "drizzle-orm"
import { orgs } from "./orgs"
import { customers } from "./customers"

/**
 * portal_messages — chat messages between customers and the office via the portal.
 *
 * Used for general messaging (top-level) and per-request threads
 * (when service_request_id is set). Supports optional photo attachments.
 * Phase 12 Plan 16: added project_id FK for project-scoped messaging (PROJ-88).
 *
 * RLS:
 * - Office policy: owner+office can SELECT/INSERT/UPDATE/DELETE any message in their org
 * - Customer policy: customer role can SELECT/INSERT messages where
 *   customer_id matches their own customers row (looked up by email)
 */
export const portalMessages = pgTable(
  "portal_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    customer_id: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    // When set, this message belongs to a specific service request thread
    service_request_id: uuid("service_request_id"),
    // When set, this message belongs to a project thread (PROJ-88)
    project_id: uuid("project_id"),
    // 'customer' | 'office'
    sender_role: text("sender_role").notNull(),
    sender_name: text("sender_name").notNull(),
    body: text("body"),
    // Optional single photo attachment — Storage path
    photo_path: text("photo_path"),
    // Read receipts
    read_by_office_at: timestamp("read_by_office_at", { withTimezone: true }),
    read_by_customer_at: timestamp("read_by_customer_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("portal_messages_customer_id_idx").on(table.customer_id),
    index("portal_messages_org_id_idx").on(table.org_id),
    index("portal_messages_service_request_id_idx").on(table.service_request_id),
    index("portal_messages_project_id_idx").on(table.project_id),

    // RLS: owner and office can manage all messages in their org
    pgPolicy("portal_messages_office_policy", {
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

    // RLS: customers can read/write their own messages (looked up by email)
    pgPolicy("portal_messages_customer_policy", {
      for: "all",
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
