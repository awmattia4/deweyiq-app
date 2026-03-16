"use server"

/**
 * user-notifications.ts — Server actions for in-app notification CRUD and user preferences.
 *
 * Phase 10: Smart Features / Notifications — Plan 11
 *
 * Exports:
 *   Notification CRUD:
 *   - getNotifications: Get user's notifications grouped by urgency
 *   - getUnreadCount: Count of unread (not dismissed) notifications
 *   - markRead: Mark a single notification as read
 *   - markAllRead: Mark all unread notifications as read
 *   - dismissNotification: Soft-delete a notification (sets dismissed_at)
 *
 *   Preferences:
 *   - getNotificationPreferences: Fetch user's per-type channel preferences
 *   - updateNotificationPreference: Upsert a single type+channel preference
 */

import { createClient } from "@/lib/supabase/server"
import { withRls } from "@/lib/db"
import type { SupabaseToken } from "@/lib/db"
import {
  userNotifications,
  notificationPreferences,
} from "@/lib/db/schema"
import { eq, and, isNull, desc } from "drizzle-orm"
import type { UserNotification } from "@/lib/db/schema/user-notifications"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NotificationGroup = {
  needs_action: UserNotification[]
  informational: UserNotification[]
}

export type NotificationPreferenceRow = {
  notification_type: string
  push_enabled: boolean
  email_enabled: boolean
  in_app_enabled: boolean
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getToken(): Promise<SupabaseToken | null> {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  if (!claimsData) return null
  return claimsData.claims as SupabaseToken
}

// ---------------------------------------------------------------------------
// Notification CRUD
// ---------------------------------------------------------------------------

/**
 * getNotifications — Return the current user's notifications grouped by urgency.
 *
 * Filters out dismissed notifications. Ordered by created_at desc (newest first).
 * Splits into needs_action and informational for the panel UI.
 */
export async function getNotifications(limit = 50): Promise<{
  success: boolean
  data?: NotificationGroup
  error?: string
}> {
  try {
    const token = await getToken()
    if (!token) return { success: false, error: "Not authenticated" }

    const rows = await withRls(token, (db) =>
      db
        .select()
        .from(userNotifications)
        .where(isNull(userNotifications.dismissed_at))
        .orderBy(desc(userNotifications.created_at))
        .limit(limit)
    )

    const needs_action = rows.filter((n) => n.urgency === "needs_action")
    const informational = rows.filter((n) => n.urgency === "informational")

    return {
      success: true,
      data: { needs_action, informational },
    }
  } catch (error) {
    console.error("[user-notifications] getNotifications error:", error)
    return { success: false, error: "Failed to fetch notifications" }
  }
}

/**
 * getUnreadCount — Count of notifications where read_at IS NULL and dismissed_at IS NULL.
 */
export async function getUnreadCount(): Promise<number> {
  try {
    const token = await getToken()
    if (!token) return 0

    const rows = await withRls(token, (db) =>
      db
        .select({ id: userNotifications.id })
        .from(userNotifications)
        .where(
          and(
            isNull(userNotifications.read_at),
            isNull(userNotifications.dismissed_at)
          )
        )
    )

    return rows.length
  } catch (error) {
    console.error("[user-notifications] getUnreadCount error:", error)
    return 0
  }
}

/**
 * markRead — Set read_at = now() for a single notification.
 */
export async function markRead(notificationId: string): Promise<{
  success: boolean
  error?: string
}> {
  try {
    const token = await getToken()
    if (!token) return { success: false, error: "Not authenticated" }

    await withRls(token, (db) =>
      db
        .update(userNotifications)
        .set({ read_at: new Date() })
        .where(eq(userNotifications.id, notificationId))
    )

    return { success: true }
  } catch (error) {
    console.error("[user-notifications] markRead error:", error)
    return { success: false, error: "Failed to mark read" }
  }
}

/**
 * markAllRead — Set read_at = now() on all unread, non-dismissed notifications.
 */
export async function markAllRead(): Promise<{
  success: boolean
  error?: string
}> {
  try {
    const token = await getToken()
    if (!token) return { success: false, error: "Not authenticated" }

    await withRls(token, (db) =>
      db
        .update(userNotifications)
        .set({ read_at: new Date() })
        .where(
          and(
            isNull(userNotifications.read_at),
            isNull(userNotifications.dismissed_at)
          )
        )
    )

    return { success: true }
  } catch (error) {
    console.error("[user-notifications] markAllRead error:", error)
    return { success: false, error: "Failed to mark all read" }
  }
}

/**
 * dismissNotification — Soft-delete: sets dismissed_at = now().
 *
 * Dismissed notifications are excluded from getNotifications results.
 * Hard deletes are not allowed (per schema design).
 */
export async function dismissNotification(notificationId: string): Promise<{
  success: boolean
  error?: string
}> {
  try {
    const token = await getToken()
    if (!token) return { success: false, error: "Not authenticated" }

    await withRls(token, (db) =>
      db
        .update(userNotifications)
        .set({ dismissed_at: new Date() })
        .where(eq(userNotifications.id, notificationId))
    )

    return { success: true }
  } catch (error) {
    console.error("[user-notifications] dismissNotification error:", error)
    return { success: false, error: "Failed to dismiss notification" }
  }
}

// ---------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------

/**
 * getNotificationPreferences — Fetch all notification_preferences rows for the current user.
 *
 * Missing rows mean "use defaults" (all channels enabled). The UI should treat
 * missing rows as all three channels enabled.
 */
export async function getNotificationPreferences(): Promise<{
  success: boolean
  data?: NotificationPreferenceRow[]
  error?: string
}> {
  try {
    const token = await getToken()
    if (!token) return { success: false, error: "Not authenticated" }

    const rows = await withRls(token, (db) =>
      db
        .select({
          notification_type: notificationPreferences.notification_type,
          push_enabled: notificationPreferences.push_enabled,
          email_enabled: notificationPreferences.email_enabled,
          in_app_enabled: notificationPreferences.in_app_enabled,
        })
        .from(notificationPreferences)
        .orderBy(notificationPreferences.notification_type)
    )

    return { success: true, data: rows }
  } catch (error) {
    console.error("[user-notifications] getNotificationPreferences error:", error)
    return { success: false, error: "Failed to fetch preferences" }
  }
}

/**
 * updateNotificationPreference — Upsert a single channel preference for a notification type.
 *
 * channel: "push" | "email" | "in_app"
 * enabled: boolean
 */
export async function updateNotificationPreference(
  notificationType: string,
  channel: "push" | "email" | "in_app",
  enabled: boolean
): Promise<{
  success: boolean
  error?: string
}> {
  try {
    const token = await getToken()
    if (!token) return { success: false, error: "Not authenticated" }

    const userId = token.sub
    const orgId = token.org_id as string | undefined
    if (!userId || !orgId) return { success: false, error: "Missing user context" }

    const channelColumn =
      channel === "push"
        ? { push_enabled: enabled }
        : channel === "email"
          ? { email_enabled: enabled }
          : { in_app_enabled: enabled }

    await withRls(token, (db) =>
      db
        .insert(notificationPreferences)
        .values({
          user_id: userId,
          org_id: orgId!,
          notification_type: notificationType,
          push_enabled: channel === "push" ? enabled : true,
          email_enabled: channel === "email" ? enabled : true,
          in_app_enabled: channel === "in_app" ? enabled : true,
        })
        .onConflictDoUpdate({
          target: [
            notificationPreferences.user_id,
            notificationPreferences.org_id,
            notificationPreferences.notification_type,
          ],
          set: {
            ...channelColumn,
            updated_at: new Date(),
          },
        })
    )

    return { success: true }
  } catch (error) {
    console.error("[user-notifications] updateNotificationPreference error:", error)
    return { success: false, error: "Failed to update preference" }
  }
}
