import {
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
import { profiles } from "./profiles"

/**
 * Web Push subscription storage — one row per subscribed user per device.
 *
 * Each browser/device creates its own push subscription with a unique endpoint.
 * The endpoint URL is per browser instance; if a user has 3 devices logged in,
 * there will be 3 rows with different endpoints for the same user_id.
 *
 * Key fields:
 *   - endpoint: The push service URL (browser-specific, unique per device)
 *   - p256dh: Browser's public key for message encryption
 *   - auth: Authentication secret for message encryption
 *   - device_hint: Best-effort device type for UI display
 *
 * Pitfall: Per MEMORY.md, server-side push sends must use adminDb to read
 * push_subscriptions — the sending path runs without a user session JWT
 * and RLS would block the read.
 *
 * RLS:
 *   - SELECT: user manages their own subscriptions (browser UI)
 *   - INSERT: user registers new device subscriptions
 *   - DELETE: user removes their subscriptions
 *   - Server push uses adminDb (bypasses RLS — intentional, non-user context)
 */
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    org_id: uuid("org_id").notNull(),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    // Best-effort device type: 'ios' | 'android' | 'desktop'
    device_hint: text("device_hint"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    last_used_at: timestamp("last_used_at", { withTimezone: true }),
  },
  (table) => [
    // Unique endpoint (one row per browser subscription)
    unique("push_subscriptions_endpoint_unique").on(table.endpoint),
    // Fast lookup: all subscriptions for a user
    index("push_subscriptions_user_idx").on(table.user_id),

    // RLS: users manage their own subscriptions
    pgPolicy("push_subscriptions_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`user_id = auth.uid()`,
    }),
    pgPolicy("push_subscriptions_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`user_id = auth.uid()`,
    }),
    pgPolicy("push_subscriptions_delete_policy", {
      for: "delete",
      to: authenticatedRole,
      using: sql`user_id = auth.uid()`,
    }),
    // UPDATE not needed — on re-subscribe, upsert via onConflictDoUpdate on endpoint
  ]
).enableRLS()

export type PushSubscription = typeof pushSubscriptions.$inferSelect
export type NewPushSubscription = typeof pushSubscriptions.$inferInsert
