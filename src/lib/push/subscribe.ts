/**
 * subscribe.ts — Client-side Web Push subscription helper.
 *
 * Phase 10: Smart Features / Notifications — Plan 17
 *
 * Exports:
 *   - urlBase64ToUint8Array: Converts VAPID public key base64url → Uint8Array
 *   - subscribeToPush: Subscribe the current browser to Web Push notifications
 *   - unsubscribeFromPush: Remove the current browser's push subscription
 *   - isPushSubscribed: Check whether the browser already has a push subscription
 *
 * iOS note (per 10-RESEARCH.md Pitfall 1):
 *   Push notifications on iOS only work in standalone (installed PWA) mode.
 *   We check display-mode before attempting subscription on iOS — if not
 *   installed we silently skip and let the install prompt guide the user.
 *
 * NEXT_PUBLIC_VAPID_PUBLIC_KEY must be set in .env.local for push to work.
 */

import { subscribeUserPush, unsubscribeUserPush } from "@/actions/push"

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/**
 * urlBase64ToUint8Array — Converts a base64url-encoded VAPID public key string
 * into a Uint8Array suitable for pushManager.subscribe().
 *
 * Standard VAPID keys are base64url encoded (RFC 4648 §5). The browser API
 * requires them as raw bytes (Uint8Array) rather than strings.
 */
export function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  // Pad to multiple of 4 characters for atob compatibility
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const rawData = atob(base64)
  const buffer = new ArrayBuffer(rawData.length)
  const outputArray = new Uint8Array(buffer)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return buffer
}

// ---------------------------------------------------------------------------
// iOS detection helpers
// ---------------------------------------------------------------------------

function isIos(): boolean {
  if (typeof navigator === "undefined") return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
}

function isStandaloneMode(): boolean {
  if (typeof window === "undefined") return false
  return window.matchMedia("(display-mode: standalone)").matches
}

// ---------------------------------------------------------------------------
// Push subscription lifecycle
// ---------------------------------------------------------------------------

/**
 * subscribeToPush — Subscribe the current browser to Web Push notifications.
 *
 * Steps:
 * 1. Check browser support (serviceWorker + PushManager)
 * 2. On iOS, verify standalone mode — skip silently if not installed
 * 3. Get the active service worker registration via navigator.serviceWorker.ready
 * 4. Check for an existing subscription (avoid creating duplicates)
 * 5. Create a new subscription with the VAPID public key
 * 6. Persist the subscription to the server via subscribeUserPush server action
 *
 * Returns { success: boolean; error?: string }
 */
export async function subscribeToPush(): Promise<{ success: boolean; error?: string }> {
  // Check browser support
  if (typeof window === "undefined") return { success: false, error: "Not a browser" }
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return { success: false, error: "Push not supported in this browser" }
  }

  // iOS requires installed PWA mode for push to work
  if (isIos() && !isStandaloneMode()) {
    return { success: false, error: "Install the app first to enable push notifications on iOS" }
  }

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!vapidPublicKey) {
    console.warn("[push] NEXT_PUBLIC_VAPID_PUBLIC_KEY not set — push subscription skipped")
    return { success: false, error: "Push notifications not configured" }
  }

  try {
    const registration = await navigator.serviceWorker.ready

    // Check for existing subscription — reuse if present
    const existing = await registration.pushManager.getSubscription()
    const subscriptionToSave = existing
      ? existing
      : await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        })

    // Persist to server
    const result = await subscribeUserPush(subscriptionToSave.toJSON())
    return result
  } catch (error) {
    console.error("[push] subscribeToPush error:", error)
    if (error instanceof Error && error.name === "NotAllowedError") {
      return { success: false, error: "Notification permission denied" }
    }
    return { success: false, error: "Failed to subscribe to push notifications" }
  }
}

/**
 * unsubscribeFromPush — Remove the current browser's Web Push subscription.
 *
 * Unsubscribes from the PushManager and removes the record from the server.
 */
export async function unsubscribeFromPush(): Promise<{ success: boolean; error?: string }> {
  if (typeof window === "undefined") return { success: false, error: "Not a browser" }
  if (!("serviceWorker" in navigator)) return { success: false, error: "Not supported" }

  try {
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()
    if (!subscription) return { success: true } // Already unsubscribed

    const endpoint = subscription.endpoint
    await subscription.unsubscribe()
    const result = await unsubscribeUserPush(endpoint)
    return result
  } catch (error) {
    console.error("[push] unsubscribeFromPush error:", error)
    return { success: false, error: "Failed to unsubscribe" }
  }
}

/**
 * isPushSubscribed — Check whether the browser has an active push subscription.
 *
 * Does not check server state — only checks the local PushManager.
 */
export async function isPushSubscribed(): Promise<boolean> {
  if (typeof window === "undefined") return false
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false

  try {
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()
    return subscription !== null
  } catch {
    return false
  }
}
