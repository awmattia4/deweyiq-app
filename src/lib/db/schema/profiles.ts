import { index, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { pgPolicy } from "drizzle-orm/pg-core"
import { authenticatedRole } from "drizzle-orm/supabase"
import { sql } from "drizzle-orm"
import { orgs } from "./orgs"

/**
 * User roles in the system:
 * - owner: full access; can manage billing, team, and all data
 * - office: internal staff; can manage customers, schedules, invoices
 * - tech: field technician; can view/update assigned stops and log work
 * - customer: portal-only access; can view their own pool data
 */
export type UserRole = "owner" | "office" | "tech" | "customer"

export const profiles = pgTable(
  "profiles",
  {
    // References auth.users — same UUID, set on signup via org-creation trigger
    id: uuid("id").primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    full_name: text("full_name").notNull(),
    email: text("email").notNull(),
    // Values: 'owner' | 'office' | 'tech' | 'customer'
    role: text("role").notNull(),
    avatar_url: text("avatar_url"),
    // Phase 9: Tech payroll — 'per_stop' | 'hourly'
    pay_type: text("pay_type").default("per_stop"),
    // Phase 9: Dollar amount per stop (if pay_type='per_stop') or per hour (if pay_type='hourly')
    pay_rate: numeric("pay_rate", { precision: 10, scale: 2 }),
    // Phase 11: QuickBooks Online employee entity ID.
    // When QBO time push is enabled, time entries are pushed to this QBO Employee ID.
    // Null = not yet linked to a QBO employee (fallback to CSV export).
    qbo_employee_id: text("qbo_employee_id"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // Index on org_id for RLS query performance — every policy filters by org_id
    index("profiles_org_id_idx").on(table.org_id),

    // RLS: members can see all profiles within their own org
    pgPolicy("profiles_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`org_id = (select auth.jwt() ->> 'org_id')::uuid`,
    }),
    // RLS: can only insert profiles into own org
    pgPolicy("profiles_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`org_id = (select auth.jwt() ->> 'org_id')::uuid`,
    }),
    // RLS: users update their own profile; owner/office can update any profile in their org
    pgPolicy("profiles_update_policy", {
      for: "update",
      to: authenticatedRole,
      using: sql`
        id = auth.uid()
        OR (
          (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
          AND org_id = (select auth.jwt() ->> 'org_id')::uuid
        )
      `,
      withCheck: sql`
        id = auth.uid()
        OR (
          (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
          AND org_id = (select auth.jwt() ->> 'org_id')::uuid
        )
      `,
    }),
    // RLS: only the org owner can delete profiles
    pgPolicy("profiles_delete_policy", {
      for: "delete",
      to: authenticatedRole,
      using: sql`
        (select auth.jwt() ->> 'user_role') = 'owner'
        AND org_id = (select auth.jwt() ->> 'org_id')::uuid
      `,
    }),
  ]
).enableRLS()
