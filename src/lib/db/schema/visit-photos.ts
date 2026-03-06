import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { pgPolicy } from "drizzle-orm/pg-core"
import { authenticatedRole } from "drizzle-orm/supabase"
import { sql } from "drizzle-orm"
import { orgs } from "./orgs"
import { serviceVisits } from "./service-visits"

/**
 * Visit photos — one row per photo attached to a service visit.
 *
 * Photos are stored in Supabase Storage; this table holds metadata only.
 * The storage_path follows the convention: "{org_id}/visits/{visit_id}/{filename}.webp"
 *
 * The `tag` column categorizes the photo for report generation:
 * - "before" / "after" — before/after service state
 * - "issue" — equipment problem or chemical hazard
 * - "equipment" — equipment installation or condition
 * - null — untagged (general photo)
 *
 * Denormalized photo_urls array on service_visits holds the same paths for fast
 * report generation without a JOIN.
 *
 * RLS: all org members can view; owner+office+tech can INSERT (tech can photo their visits);
 * only owner+office can UPDATE/DELETE.
 */
export const visitPhotos = pgTable(
  "visit_photos",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    visit_id: uuid("visit_id")
      .notNull()
      .references(() => serviceVisits.id, { onDelete: "cascade" }),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    // Storage path: "{org_id}/visits/{visit_id}/{filename}.webp"
    storage_path: text("storage_path").notNull(),
    // "before" | "after" | "issue" | "equipment" | null
    tag: text("tag"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("visit_photos_visit_id_idx").on(table.visit_id),
    index("visit_photos_org_id_idx").on(table.org_id),

    // RLS: all org members can view visit photos
    pgPolicy("visit_photos_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`org_id = (select auth.jwt() ->> 'org_id')::uuid`,
    }),
    // RLS: owner+office+tech can upload photos (techs photo their own visits)
    pgPolicy("visit_photos_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office', 'tech')
      `,
    }),
    // RLS: only owner+office can update photo metadata
    pgPolicy("visit_photos_update_policy", {
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
    // RLS: only owner+office can delete photos (techs cannot delete)
    pgPolicy("visit_photos_delete_policy", {
      for: "delete",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
  ]
).enableRLS()
