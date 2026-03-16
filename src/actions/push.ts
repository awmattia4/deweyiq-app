"use server"

/**
 * push.ts — Web Push subscription management and notification sending.
 *
 * Phase 10: Smart Features / Notifications — Plan 09
 *
 * Exports:
 *   - subscribeUserPush: Register a new push subscription for the current user
 *   - unsubscribeUserPush: Remove a push subscription by endpoint
 *   - sendPushToUser: Internal (not "use server") — sends push to all user devices
 *
 * VAPID configuration:
 *   - NEXT_PUBLIC_VAPID_PUBLIC_KEY: Public key (client-safe, required for serviceWorker)
 *   - VAPID_PRIVATE_KEY: Private key (server-only — never expose to client)
 *   - VAPID_CONTACT_EMAIL: Optional contact email for VAPID
 *
 * Key patterns:
 *   - subscribeUserPush uses withRls so the user can only insert their own row
 *   - sendPushToUser uses adminDb — runs without a user session JWT context
 *   - 410 Gone responses from push service auto-clean expired subscriptions
 *   - Promise.allSettled ensures one device failure doesn't block other devices
 */

import webpush from "web-push"
import { createClient } from "@/lib/supabase/server"
import { withRls, adminDb } from "@/lib/db"
import type { SupabaseToken } from "@/lib/db"
import { pushSubscriptions } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import { headers } from "next/headers"

// ---------------------------------------------------------------------------
// VAPID configuration
// ---------------------------------------------------------------------------

// Configure VAPID lazily on first use — avoids build errors when env vars are absent.
let vapidConfigured = false

function ensureVapidConfigured() {
  if (vapidConfigured) return
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!publicKey || !privateKey) {
    throw new Error(
      "VAPID keys not configured. Set NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY."
    )
  }
  const subject = `mailto:${process.env.VAPID_CONTACT_EMAIL || "admin@poolco.app"}`
  webpush.setVapidDetails(subject, publicKey, privateKey)
  vapidConfigured = true
}

// ---------------------------------------------------------------------------
// Device hint detection
// ---------------------------------------------------------------------------

function detectDeviceHint(userAgent: string): "ios" | "android" | "desktop" | null {
  const ua = userAgent.toLowerCase()
  if (ua.includes("iphone") || ua.includes("ipad") || ua.includes("ipod")) return "ios"
  if (ua.includes("android")) return "android"
  if (ua.includes("mozilla") || ua.includes("chrome") || ua.includes("safari")) return "desktop"
  return null
}

// ---------------------------------------------------------------------------
// Server actions
// ---------------------------------------------------------------------------

/**
 * subscribeUserPush — Register a new Web Push subscription for the current user.
 *
 * Called from the client after the browser returns a PushSubscription from
 * serviceWorkerRegistration.pushManager.subscribe(). Upserts on endpoint to
 * handle re-subscriptions (e.g. after browser restart).
 */
export async function subscribeUserPush(subscription: PushSubscriptionJSON): Promise<{
  success: boolean
  error?: string
}> {
  try {
    const supabase = await createClient()
    const { data: claimsData } = await supabase.auth.getClaims()
    if (!claimsData) return { success: false, error: "Not authenticated" }

    const token = claimsData.claims as SupabaseToken
    const userId = token.sub
    const orgId = token.org_id as string | undefined
    if (!userId || !orgId) return { success: false, error: "Missing user context" }

    if (!subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
      return { success: false, error: "Invalid subscription object" }
    }

    // Best-effort device hint from User-Agent header
    const headersList = await headers()
    const ua = headersList.get("user-agent") ?? ""
    const deviceHint = detectDeviceHint(ua)

    await withRls(token, (db) =>
      db
        .insert(pushSubscriptions)
        .values({
          user_id: userId,
          org_id: orgId,
          endpoint: subscription.endpoint!,
          p256dh: subscription.keys!.p256dh,
          auth: subscription.keys!.auth,
          device_hint: deviceHint,
        })
        .onConflictDoUpdate({
          target: pushSubscriptions.endpoint,
          set: {
            p256dh: subscription.keys!.p256dh,
            auth: subscription.keys!.auth,
            device_hint: deviceHint,
            last_used_at: new Date(),
          },
        })
    )

    return { success: true }
  } catch (error) {
    console.error("[push] subscribeUserPush error:", error)
    return { success: false, error: "Failed to save subscription" }
  }
}

/**
 * unsubscribeUserPush — Remove a Web Push subscription by endpoint.
 *
 * Called when the user disables push notifications in their browser or
 * in the app settings. User can only delete their own subscriptions (RLS).
 */
export async function unsubscribeUserPush(endpoint: string): Promise<{
  success: boolean
  error?: string
}> {
  try {
    const supabase = await createClient()
    const { data: claimsData } = await supabase.auth.getClaims()
    if (!claimsData) return { success: false, error: "Not authenticated" }

    const token = claimsData.claims as SupabaseToken

    await withRls(token, (db) =>
      db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint))
    )

    return { success: true }
  } catch (error) {
    console.error("[push] unsubscribeUserPush error:", error)
    return { success: false, error: "Failed to remove subscription" }
  }
}

// ---------------------------------------------------------------------------
// Internal push sending (not "use server" callable — used by dispatch.ts)
// ---------------------------------------------------------------------------

/**
 * sendPushToUser — Send a Web Push notification to all subscribed devices for a user.
 *
 * This is an internal function — NOT a Next.js Server Action (no "use server"
 * at function level). It is called from dispatch.ts in server context.
 *
 * Uses adminDb to read subscriptions because:
 * 1. Sending may happen without a user JWT context (webhook handlers, cron)
 * 2. The dispatch is server-to-server — the sender is the system, not the user
 *
 * On 410 Gone: the push endpoint has expired. The subscription is auto-cleaned.
 * On other failures: logged but not thrown — one device failure is non-fatal.
 */
export async function sendPushToUser(
  userId: string,
  payload: { title: string; body: string; url?: string }
): Promise<void> {
  try {
    ensureVapidConfigured()
  } catch (err) {
    // VAPID not configured — skip push silently (dev environments without keys)
    console.warn("[push] VAPID not configured, skipping push send:", (err as Error).message)
    return
  }

  const userSubscriptions = await adminDb
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.user_id, userId))

  if (userSubscriptions.length === 0) return

  const pushPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url ?? "/",
    icon: "/icons/icon-192x192.png",
    badge: "/icons/badge-72x72.png",
  })

  const results = await Promise.allSettled(
    userSubscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          },
          pushPayload
        )
        // Update last_used_at on success
        await adminDb
          .update(pushSubscriptions)
          .set({ last_used_at: new Date() })
          .where(eq(pushSubscriptions.id, sub.id))
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number }).statusCode
        if (statusCode === 410 || statusCode === 404) {
          // 410 Gone / 404 Not Found: subscription expired — clean it up
          console.info("[push] Cleaning up expired subscription:", sub.id)
          await adminDb
            .delete(pushSubscriptions)
            .where(eq(pushSubscriptions.id, sub.id))
        } else {
          // Other failures are non-fatal — log and continue
          console.error("[push] Failed to send to device:", sub.id, err)
        }
      }
    })
  )

  const failed = results.filter((r) => r.status === "rejected").length
  if (failed > 0) {
    console.warn(`[push] ${failed}/${results.length} push deliveries failed for user ${userId}`)
  }
}
