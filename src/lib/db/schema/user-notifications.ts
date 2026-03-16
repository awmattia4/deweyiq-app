import {
  boolean,
  index,
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
import { profiles } from "./profiles"

/**
 * In-app notification storage — one row per notification per recipient.
 *
 * Notification types (see NOTIFICATION_TYPE_CONFIG in dispatch.ts):
 *   stop_completed, stop_skipped, stop_cant_complete, route_started,
 *   route_finished, chemistry_alert, wo_created, wo_updated, wo_completed,
 *   quote_approved, quote_rejected, payment_received, payment_failed,
 *   portal_message, service_request, customer_added, customer_cancelled,
 *   invoice_overdue, weather_proposal, tech_assigned, tech_quote_approved,
 *   schedule_change, tech_weather_alert, system_event
 *
 * Urgency levels:
 *   - needs_action: Requires human response (missed stop, payment failed, etc.)
 *   - informational: FYI only (stop completed, payment received, etc.)
 *
 * Lifecycle:
 *   - Unread: read_at IS NULL
 *   - Read: read_at IS NOT NULL
 *   - Dismissed: dismissed_at IS NOT NULL (soft delete — no hard DELETE allowed)
 *   - Expired: expires_at < now() (auto-cleanup via scheduled job or filter)
 *
 * RLS:
 *   - SELECT / UPDATE: recipient sees and manages their own notifications
 *   - INSERT: adminDb only (system creates notifications, users never insert directly)
 *   - DELETE: disabled — use dismissed_at soft delete
 */
export const userNotifications = pgTable(
  "user_notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    recipient_id: uuid("recipient_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    // Notification classification
    notification_type: text("notification_type").notNull(),
    urgency: text("urgency").notNull().default("informational"), // 'needs_action' | 'informational'
    // Display content
    title: text("title").notNull(),
    body: text("body"),
    link: text("link"), // Deep link e.g. '/work-orders/[id]'
    // Lifecycle
    read_at: timestamp("read_at", { withTimezone: true }),
    dismissed_at: timestamp("dismissed_at", { withTimezone: true }),
    expires_at: timestamp("expires_at", { withTimezone: true })
      .notNull()
      .default(sql`now() + interval '30 days'`),
    // Structured data for rendering
    metadata: jsonb("metadata"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // Fast unread count per user
    index("user_notifications_recipient_read_idx").on(table.recipient_id, table.read_at),
    // Chronological listing per user
    index("user_notifications_recipient_created_idx").on(table.recipient_id, table.created_at),

    // RLS: recipient sees their own notifications in their org
    pgPolicy("user_notifications_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`
        recipient_id = auth.uid()
        AND org_id = (select auth.jwt() ->> 'org_id')::uuid
      `,
    }),
    // RLS: recipient can mark read / dismiss (UPDATE)
    pgPolicy("user_notifications_update_policy", {
      for: "update",
      to: authenticatedRole,
      using: sql`
        recipient_id = auth.uid()
        AND org_id = (select auth.jwt() ->> 'org_id')::uuid
      `,
      withCheck: sql`
        recipient_id = auth.uid()
        AND org_id = (select auth.jwt() ->> 'org_id')::uuid
      `,
    }),
    // INSERT and DELETE are handled via adminDb only — no RLS policy for those operations
  ]
).enableRLS()

export type UserNotification = typeof userNotifications.$inferSelect
export type NewUserNotification = typeof userNotifications.$inferInsert
