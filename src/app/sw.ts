/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker"
import { Serwist } from "serwist"

declare const self: ServiceWorkerGlobalScope & {
  __SW_MANIFEST: (string | { url: string; revision: string | null })[]
}

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: false,
  runtimeCaching: defaultCache,
})

serwist.addEventListeners()

// ---------------------------------------------------------------------------
// Web Push: receive and display push notifications
// ---------------------------------------------------------------------------

/**
 * push event handler — receives a Web Push message from the server and shows
 * a native browser/OS notification.
 *
 * Payload shape: { title: string; body: string; url: string; icon?: string }
 *
 * The 'url' field is stored in notification.data so that the notificationclick
 * handler can open the correct deep link when the user taps the notification.
 */
self.addEventListener("push", (event: PushEvent) => {
  const data = event.data?.json() as {
    title: string
    body: string
    url?: string
    icon?: string
  } | null

  if (!data?.title) return

  // Cast to 'any' for `vibrate` — it is a valid NotificationOptions property
  // in all modern browsers but older TypeScript lib definitions omit it.
  const showNotificationPromise = self.registration.showNotification(data.title, {
    body: data.body,
    icon: data.icon ?? "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: data.url ?? "/" },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)

  event.waitUntil(showNotificationPromise)
})

// ---------------------------------------------------------------------------
// Web Push: handle notification tap — open or focus the app window
// ---------------------------------------------------------------------------

/**
 * notificationclick event handler — closes the notification and navigates
 * the user to the deep link embedded in notification.data.url.
 *
 * Strategy:
 * 1. Find an existing app window via clients.matchAll()
 * 2. If found, navigate it to the URL and focus it
 * 3. If not found, open a new window with clients.openWindow()
 */
self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close()

  const targetUrl: string = (event.notification.data as { url?: string })?.url ?? "/"

  const focusOrOpenPromise = (self.clients as Clients)
    .matchAll({ type: "window", includeUncontrolled: true })
    .then((windowClients) => {
      // Try to find and focus an existing app window
      for (const client of windowClients) {
        if ("focus" in client) {
          void (client as WindowClient).navigate(targetUrl)
          return (client as WindowClient).focus()
        }
      }
      // No existing window — open a new one
      return (self.clients as Clients).openWindow(targetUrl)
    })

  event.waitUntil(focusOrOpenPromise)
})
