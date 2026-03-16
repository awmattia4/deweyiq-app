import {
  boolean,
  index,
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
import { profiles } from "./profiles"

/**
 * Per-user notification preference overrides per org.
 *
 * Preference model (per user decision: per-org defaults with per-user overrides):
 *   - Default (no row): all channels enabled (in-app + push + email = true)
 *   - Row exists: user's explicit preference for that notification_type
 *
 * notification_type values match NOTIFICATION_TYPE_CONFIG keys in dispatch.ts.
 *
 * Channels:
 *   - in_app_enabled: Bell icon notification in app header
 *   - push_enabled: Native browser/device push notification
 *   - email_enabled: Email delivery (only types with email templates)
 *
 * UNIQUE(user_id, org_id, notification_type) — one preference row per type per user per org.
 *
 * RLS:
 *   - SELECT / INSERT / UPDATE / DELETE: user manages their own preferences
 */
export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    notification_type: text("notification_type").notNull(),
    // Channel enable/disable flags (default all enabled)
    push_enabled: boolean("push_enabled").notNull().default(true),
    email_enabled: boolean("email_enabled").notNull().default(true),
    in_app_enabled: boolean("in_app_enabled").notNull().default(true),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // One preference row per notification type per user per org
    unique("notification_prefs_user_org_type_unique").on(
      table.user_id,
      table.org_id,
      table.notification_type
    ),
    // Fast lookup: all preferences for a user in an org
    index("notification_prefs_user_org_idx").on(table.user_id, table.org_id),

    // RLS: users manage their own preferences
    pgPolicy("notification_prefs_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`
        user_id = auth.uid()
        AND org_id = (select auth.jwt() ->> 'org_id')::uuid
      `,
    }),
    pgPolicy("notification_prefs_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        user_id = auth.uid()
        AND org_id = (select auth.jwt() ->> 'org_id')::uuid
      `,
    }),
    pgPolicy("notification_prefs_update_policy", {
      for: "update",
      to: authenticatedRole,
      using: sql`
        user_id = auth.uid()
        AND org_id = (select auth.jwt() ->> 'org_id')::uuid
      `,
      withCheck: sql`
        user_id = auth.uid()
        AND org_id = (select auth.jwt() ->> 'org_id')::uuid
      `,
    }),
    pgPolicy("notification_prefs_delete_policy", {
      for: "delete",
      to: authenticatedRole,
      using: sql`
        user_id = auth.uid()
        AND org_id = (select auth.jwt() ->> 'org_id')::uuid
      `,
    }),
  ]
).enableRLS()

export type NotificationPreference = typeof notificationPreferences.$inferSelect
export type NewNotificationPreference = typeof notificationPreferences.$inferInsert
