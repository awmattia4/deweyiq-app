import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { pgPolicy } from "drizzle-orm/pg-core"
import { authenticatedRole } from "drizzle-orm/supabase"
import { sql } from "drizzle-orm"

export const orgs = pgTable(
  "orgs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    // slug used for customer portal URLs (e.g. /portal/my-pool-co)
    slug: text("slug").unique(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // RLS: members can only see their own org
    pgPolicy("orgs_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`id = (select auth.jwt() ->> 'org_id')::uuid`,
    }),
    // RLS: only the org owner can update org details
    pgPolicy("orgs_update_policy", {
      for: "update",
      to: authenticatedRole,
      using: sql`id = (select auth.jwt() ->> 'org_id')::uuid AND (select auth.jwt() ->> 'user_role') = 'owner'`,
      withCheck: sql`id = (select auth.jwt() ->> 'org_id')::uuid AND (select auth.jwt() ->> 'user_role') = 'owner'`,
    }),
  ]
).enableRLS()
