/**
 * Phase 7: Billing & Payments — Dunning Configuration Schema
 *
 * Table: dunning_config
 *
 * Per-org configuration for automated payment reminder sequences.
 * One row per org (unique constraint on org_id).
 *
 * RLS:
 * - SELECT: owner+office
 * - INSERT/UPDATE/DELETE: owner only
 */
import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core"
import { pgPolicy } from "drizzle-orm/pg-core"
import { authenticatedRole } from "drizzle-orm/supabase"
import { sql } from "drizzle-orm"
import { orgs } from "./orgs"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DunningStep {
  day_offset: number
  email_subject: string
  email_body: string
}

// ---------------------------------------------------------------------------
// dunning_config
// ---------------------------------------------------------------------------

export const dunningConfig = pgTable(
  "dunning_config",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    steps: jsonb("steps").$type<DunningStep[]>().notNull().default([]),
    max_retries: integer("max_retries").notNull().default(3),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // One dunning config row per org
    unique("dunning_config_org_unique").on(table.org_id),

    // RLS: owner+office can view dunning config
    pgPolicy("dunning_config_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    // RLS: only owner can create dunning config
    pgPolicy("dunning_config_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      `,
    }),
    // RLS: only owner can update dunning config
    pgPolicy("dunning_config_update_policy", {
      for: "update",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      `,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      `,
    }),
    // RLS: only owner can delete dunning config
    pgPolicy("dunning_config_delete_policy", {
      for: "delete",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      `,
    }),
  ]
).enableRLS()
