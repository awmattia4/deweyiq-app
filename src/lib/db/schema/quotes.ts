/**
 * Phase 6: Work Orders & Quoting — Quotes Schema
 *
 * Table: quotes
 *
 * A quote is a versioned price proposal attached to a work order.
 * Customers access quotes via a public token endpoint (adminDb — no RLS needed).
 *
 * Version history: each time a quote is revised after sending, version increments
 * and a new row is created (old rows are retained for audit trail).
 *
 * RLS:
 * - SELECT/INSERT/UPDATE: owner+office
 * - DELETE: owner only
 * Customers access via public token endpoint using adminDb (no RLS).
 */
import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"
import { pgPolicy } from "drizzle-orm/pg-core"
import { authenticatedRole } from "drizzle-orm/supabase"
import { sql } from "drizzle-orm"
import { orgs } from "./orgs"
import { workOrders } from "./work-orders"

export const quotes = pgTable(
  "quotes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    work_order_id: uuid("work_order_id")
      .notNull()
      .references(() => workOrders.id, { onDelete: "cascade" }),
    // Sequential number with prefix (e.g. "Q-0042") — generated from org_settings
    quote_number: text("quote_number"),
    // Revision number — increments when a sent quote is revised
    version: integer("version").notNull().default(1),
    // Status: draft | sent | approved | declined | expired | superseded
    status: text("status").notNull().default("draft"),
    // When this quote expires (ISO timestamp)
    expires_at: timestamp("expires_at", { withTimezone: true }),
    // Customer approval details
    approved_at: timestamp("approved_at", { withTimezone: true }),
    // Name customer typed when signing (digital signature)
    signature_name: text("signature_name"),
    // IDs of optional line items the customer chose to include
    approved_optional_item_ids: jsonb("approved_optional_item_ids").$type<string[]>(),
    // Customer rejection details
    declined_at: timestamp("declined_at", { withTimezone: true }),
    decline_reason: text("decline_reason"),
    // Note explaining what changed in this revision
    change_note: text("change_note"),
    // Full snapshot of the quote at send time (preserves pricing even if catalog changes)
    snapshot_json: jsonb("snapshot_json"),
    // When this quote was emailed/shared with the customer
    sent_at: timestamp("sent_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // RLS: owner+office can view quotes
    pgPolicy("quotes_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    // RLS: owner+office can create quotes
    pgPolicy("quotes_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    // RLS: owner+office can update quotes
    pgPolicy("quotes_update_policy", {
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
    // RLS: only owner can delete quotes
    pgPolicy("quotes_delete_policy", {
      for: "delete",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      `,
    }),
  ]
).enableRLS()
