/**
 * dispatch.ts — Unified notification dispatch for all company user events.
 *
 * Phase 10: Smart Features / Notifications — Plan 09
 *
 * This is the single entry point for ALL notification delivery in the system.
 * Every platform event (stop completion, WO lifecycle, quote responses, payments,
 * etc.) calls notifyUser() or notifyOrgRole() — never writes to user_notifications
 * or calls sendPushToUser directly.
 *
 * Architecture:
 *   1. Check user's notification_preferences for the event type
 *      - No preference row → defaults (all channels enabled)
 *   2. If in_app_enabled → INSERT into user_notifications
 *   3. If push_enabled → sendPushToUser (native device push)
 *   4. If email_enabled and type has an email template → queue email
 *   All operations are non-blocking — failures are logged, never thrown.
 *
 * NOTIFICATION_TYPE_CONFIG:
 *   Maps NOTIF requirement IDs (NOTIF-05 through NOTIF-23) to notification_type
 *   strings with default urgency and target roles.
 *   - Plans 10-10, 10-11, 10-12, 10-14 wire actual event triggers.
 *
 * Usage:
 *   // Single recipient
 *   await notifyUser(recipientId, orgId, {
 *     type: "payment_received",
 *     urgency: "informational",
 *     title: "Payment received",
 *     body: "$150.00 from John Smith",
 *     link: "/billing/inv_123",
 *   })
 *
 *   // All owner+office staff
 *   await notifyOrgRole(orgId, "owner+office", {
 *     type: "stop_skipped",
 *     urgency: "needs_action",
 *     title: "Stop skipped",
 *     body: "Tech Alex skipped John Smith (pool maintenance)",
 *     link: "/schedule",
 *   })
 */

import { adminDb } from "@/lib/db"
import {
  userNotifications,
  notificationPreferences,
  profiles,
} from "@/lib/db/schema"
import { eq, and, inArray } from "drizzle-orm"
import { sendPushToUser } from "@/actions/push"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NotificationUrgency = "needs_action" | "informational"

export type NotificationEvent = {
  type: string
  urgency: NotificationUrgency
  title: string
  body: string
  link?: string
  metadata?: Record<string, unknown>
}

type RoleTarget = "owner" | "office" | "tech" | "owner+office"

type NotificationTypeConfig = {
  urgency: NotificationUrgency
  roles: Array<"owner" | "office" | "tech">
}

// ---------------------------------------------------------------------------
// NOTIFICATION_TYPE_CONFIG
// Maps all 19 company notification types (NOTIF-05 through NOTIF-23) to
// default urgency and target roles.
// Plans 10-10, 10-11, 10-12, 10-14 wire the actual event triggers.
// ---------------------------------------------------------------------------

export const NOTIFICATION_TYPE_CONFIG: Record<string, NotificationTypeConfig> = {
  // NOTIF-05: Owner/office notified when tech completes a stop
  stop_completed: { urgency: "informational", roles: ["owner", "office"] },
  // NOTIF-06: Owner/office notified when tech skips a stop
  stop_skipped: { urgency: "needs_action", roles: ["owner", "office"] },
  // NOTIF-07: Owner/office notified when tech marks can't-complete
  stop_cant_complete: { urgency: "needs_action", roles: ["owner", "office"] },
  // NOTIF-08: Owner/office notified when route started/finished
  route_started: { urgency: "informational", roles: ["owner", "office"] },
  route_finished: { urgency: "informational", roles: ["owner", "office"] },
  // NOTIF-09: Owner/office notified when chemistry out of range
  chemistry_alert: { urgency: "needs_action", roles: ["owner", "office"] },
  // NOTIF-10: Owner/office notified when WO created/updated/completed
  wo_created: { urgency: "informational", roles: ["owner", "office"] },
  wo_updated: { urgency: "informational", roles: ["owner", "office"] },
  wo_completed: { urgency: "informational", roles: ["owner", "office"] },
  // NOTIF-11: Owner/office notified when quote approved/rejected
  quote_approved: { urgency: "informational", roles: ["owner", "office"] },
  quote_rejected: { urgency: "needs_action", roles: ["owner", "office"] },
  // NOTIF-12: Owner/office notified when payment received
  payment_received: { urgency: "informational", roles: ["owner", "office"] },
  // NOTIF-13: Owner/office notified when payment fails
  payment_failed: { urgency: "needs_action", roles: ["owner", "office"] },
  // NOTIF-14: Owner/office notified when portal message received
  portal_message: { urgency: "needs_action", roles: ["owner", "office"] },
  // NOTIF-15: Owner/office notified when service request submitted
  service_request: { urgency: "needs_action", roles: ["owner", "office"] },
  // NOTIF-16: Owner/office notified when customer added/cancelled
  customer_added: { urgency: "informational", roles: ["owner", "office"] },
  customer_cancelled: { urgency: "needs_action", roles: ["owner", "office"] },
  // NOTIF-17: Owner/office notified when invoice overdue
  invoice_overdue: { urgency: "needs_action", roles: ["owner", "office"] },
  // NOTIF-18: Owner/office notified of weather reschedule proposals
  weather_proposal: { urgency: "needs_action", roles: ["owner", "office"] },
  // NOTIF-19: Tech notified when assigned new stop/WO/route change
  tech_assigned: { urgency: "informational", roles: ["tech"] },
  // NOTIF-20: Tech notified when customer approves their quote
  tech_quote_approved: { urgency: "informational", roles: ["tech"] },
  // NOTIF-21: Tech notified of schedule changes
  schedule_change: { urgency: "informational", roles: ["tech"] },
  // NOTIF-22: Tech notified of weather alerts on upcoming route
  tech_weather_alert: { urgency: "needs_action", roles: ["tech"] },
  // NOTIF-23: Owner notified of system events
  system_event: { urgency: "needs_action", roles: ["owner"] },
}

// ---------------------------------------------------------------------------
// Core dispatch
// ---------------------------------------------------------------------------

/**
 * notifyUser — Deliver a notification to a single recipient.
 *
 * Checks preferences, creates in-app notification, sends push — all
 * non-blocking. Failures are logged but never thrown to callers.
 */
export async function notifyUser(
  recipientId: string,
  orgId: string,
  event: NotificationEvent
): Promise<void> {
  try {
    // Check user preferences for this notification type
    let inAppEnabled = true
    let pushEnabled = true
    // email_enabled reserved for future use — email delivery is handled by
    // individual send functions (dunning, invoice, etc.) with their own logic
    // let emailEnabled = true

    try {
      const [pref] = await adminDb
        .select()
        .from(notificationPreferences)
        .where(
          and(
            eq(notificationPreferences.user_id, recipientId),
            eq(notificationPreferences.org_id, orgId),
            eq(notificationPreferences.notification_type, event.type)
          )
        )
        .limit(1)

      if (pref) {
        inAppEnabled = pref.in_app_enabled
        pushEnabled = pref.push_enabled
        // emailEnabled = pref.email_enabled
      }
    } catch (prefErr) {
      // Non-fatal: fall through to defaults (all enabled)
      console.warn("[dispatch] Failed to read notification preferences:", prefErr)
    }

    // Step 1: Create in-app notification
    if (inAppEnabled) {
      try {
        await adminDb.insert(userNotifications).values({
          org_id: orgId,
          recipient_id: recipientId,
          notification_type: event.type,
          urgency: event.urgency,
          title: event.title,
          body: event.body,
          link: event.link,
          metadata: event.metadata as Record<string, unknown> | undefined,
        })
      } catch (inAppErr) {
        console.error("[dispatch] Failed to create in-app notification:", inAppErr)
        // Non-fatal — continue to push
      }
    }

    // Step 2: Send push notification
    if (pushEnabled) {
      try {
        // Fire-and-forget — push failures never block
        void sendPushToUser(recipientId, {
          title: event.title,
          body: event.body ?? "",
          url: event.link,
        })
      } catch (pushErr) {
        console.error("[dispatch] Failed to send push notification:", pushErr)
      }
    }

    // Step 3: Email delivery
    // Individual notification types with email templates handle their own
    // email delivery via the template engine (Phase 7-08 pattern).
    // dispatch.ts does not queue emails — each event trigger decides whether
    // to send email alongside calling notifyUser.
  } catch (err) {
    // Top-level catch — notification failures are always non-fatal
    console.error("[dispatch] Unexpected error in notifyUser:", err)
  }
}

/**
 * notifyOrgRole — Broadcast a notification to all users of a given role in an org.
 *
 * Used for broadcasts like "notify all office staff when a payment is received."
 * The 'owner+office' shorthand targets both owner and office roles.
 *
 * Internally calls notifyUser for each matching profile — each recipient gets
 * their own preference check and notification row.
 */
export async function notifyOrgRole(
  orgId: string,
  role: RoleTarget,
  event: NotificationEvent
): Promise<void> {
  try {
    // Determine which roles to target
    const targetRoles =
      role === "owner+office" ? ["owner", "office"] : [role]

    // Fetch all profiles with the target role(s) in the org
    const recipients = await adminDb
      .select({ id: profiles.id })
      .from(profiles)
      .where(
        and(
          eq(profiles.org_id, orgId),
          inArray(profiles.role, targetRoles)
        )
      )

    if (recipients.length === 0) return

    // Notify each recipient — sequential to avoid overwhelming the DB
    // with concurrent inserts for large orgs. For typical pool companies
    // (1-5 office staff) this is not a bottleneck.
    for (const recipient of recipients) {
      await notifyUser(recipient.id, orgId, event)
    }
  } catch (err) {
    console.error("[dispatch] Unexpected error in notifyOrgRole:", err)
  }
}
