/**
 * sync.ts — Offline sync engine for PoolCo PWA.
 *
 * Architecture:
 * - Writes made while offline are stored in IndexedDB (via Dexie) and survive app close.
 * - When connectivity returns, queued writes are replayed to the server automatically.
 * - Cross-platform: uses the `online` window event (works on iOS Safari, Android, desktop).
 * - Background Sync API (Chrome Android) registered as an enhancement — not relied upon.
 * - Retry: exponential backoff with jitter. Max 5 retries before marking as failed.
 * - On final failure: item marked `failed`. UI shows error state. User can review.
 *
 * Locked decisions (from PROJECT.md):
 * - Offline-first architecture required from Phase 1
 * - Sync failure: auto-retry silently in background; only alert user after retries exhausted
 * - iOS does not support Background Sync API — use online event for cross-platform sync
 */

import { offlineDb, type SyncQueueItem } from "./db"

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_RETRIES = 5
const BASE_DELAY_MS = 1000
const MAX_DELAY_MS = 60_000

// ─── Module-level state ───────────────────────────────────────────────────────

/** True while processSyncQueue is actively running. Used by useSyncStatus. */
let _isSyncing = false

/** Returns whether the sync engine is currently processing the queue. */
export function isSyncing(): boolean {
  return _isSyncing
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Calculate retry delay with exponential backoff and jitter.
 * delay = min(baseDelay * 2^retries + random(0, 1000), maxDelay)
 */
function calcBackoffDelay(retries: number): number {
  const exponential = BASE_DELAY_MS * Math.pow(2, retries)
  const jitter = Math.random() * 1000
  return Math.min(exponential + jitter, MAX_DELAY_MS)
}

// ─── Core API ─────────────────────────────────────────────────────────────────

/**
 * enqueueWrite — Queue an outgoing API write for background sync.
 *
 * Call this instead of fetch() when making data-mutation requests.
 * If online, immediately attempts to process the queue. If offline
 * (or if the immediate attempt fails), the item persists in IndexedDB
 * and will be replayed when connectivity returns.
 *
 * @param url     - API endpoint (absolute path, e.g. "/api/jobs/123")
 * @param method  - HTTP method ("POST", "PATCH", "PUT", "DELETE")
 * @param body    - Request body (will be JSON.stringify'd)
 * @param headers - Additional headers (auth headers, content-type, etc.)
 */
export async function enqueueWrite(
  url: string,
  method: string,
  body: unknown,
  headers: Record<string, string> = {}
): Promise<void> {
  await offlineDb.syncQueue.add({
    url,
    method,
    body: JSON.stringify(body),
    headers,
    createdAt: Date.now(),
    retries: 0,
    status: "pending",
  })

  // Enhancement: register Background Sync tag (Chrome Android only)
  // This allows sync even if the tab is closed. Falls back to online event on iOS.
  if (
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    "sync" in ServiceWorkerRegistration.prototype
  ) {
    try {
      const registration = await navigator.serviceWorker.ready
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (registration as any).sync.register("poolco-outbound-sync")
    } catch {
      // Background Sync registration failed — that's fine, online event covers us
    }
  }

  // If we're online, attempt immediate processing
  if (typeof navigator !== "undefined" && navigator.onLine) {
    void processSyncQueue()
  }
}

/**
 * processSyncQueue — Replay all pending writes to the server.
 *
 * Reads pending items from the sync queue (ordered by createdAt ascending)
 * and attempts to replay each one. Handles success, client errors, server
 * errors, and network failures with appropriate retry logic.
 *
 * - 2xx: Item deleted from queue (success)
 * - 4xx: Item deleted from queue (client error — won't succeed on retry)
 * - 5xx or network error: Item retried with exponential backoff
 * - After MAX_RETRIES: Item marked as `failed` (user alerted via UI)
 *
 * Safe to call multiple times — uses status flag to prevent overlapping runs.
 */
export async function processSyncQueue(): Promise<void> {
  if (_isSyncing) return
  _isSyncing = true

  try {
    // Fetch all pending items ordered by creation time (oldest first)
    const pendingItems = await offlineDb.syncQueue
      .where("status")
      .equals("pending")
      .sortBy("createdAt")

    for (const item of pendingItems) {
      if (!item.id) continue

      // Mark as processing so UI can show active sync state
      await offlineDb.syncQueue.update(item.id, { status: "processing" })

      try {
        const response = await fetch(item.url, {
          method: item.method,
          body: item.body,
          headers: {
            "Content-Type": "application/json",
            ...item.headers,
          },
        })

        if (response.ok) {
          // 2xx: Write succeeded — remove from queue
          await offlineDb.syncQueue.delete(item.id)
        } else if (response.status >= 400 && response.status < 500) {
          // 4xx: Client error (bad request, not found, forbidden, etc.)
          // Retrying won't help — remove from queue and log
          console.error(
            `[sync] Dropping item ${item.id}: ${item.method} ${item.url} returned ${response.status} (client error — will not retry)`
          )
          await offlineDb.syncQueue.delete(item.id)
        } else {
          // 5xx: Server error — retry with backoff
          await handleRetryOrFail(item, `HTTP ${response.status}`)
        }
      } catch (networkError) {
        // Network error (fetch threw) — retry with backoff
        const errorMsg =
          networkError instanceof Error
            ? networkError.message
            : String(networkError)
        await handleRetryOrFail(item, errorMsg)
      }
    }
  } finally {
    _isSyncing = false
  }
}

/**
 * handleRetryOrFail — Increment retry count or mark as permanently failed.
 */
async function handleRetryOrFail(
  item: SyncQueueItem,
  errorMsg: string
): Promise<void> {
  if (!item.id) return

  const newRetries = item.retries + 1

  if (newRetries >= MAX_RETRIES) {
    // Retries exhausted — mark as failed so UI can alert the user
    console.error(
      `[sync] Item ${item.id} failed after ${MAX_RETRIES} retries: ${item.method} ${item.url} — ${errorMsg}`
    )
    await offlineDb.syncQueue.update(item.id, {
      status: "failed",
      retries: newRetries,
      lastError: errorMsg,
    })
  } else {
    // Schedule retry with exponential backoff
    const delay = calcBackoffDelay(newRetries)
    console.debug(
      `[sync] Item ${item.id} retry ${newRetries}/${MAX_RETRIES} in ${Math.round(delay / 1000)}s: ${errorMsg}`
    )
    await offlineDb.syncQueue.update(item.id, {
      status: "pending",
      retries: newRetries,
      lastError: errorMsg,
    })

    // Schedule the next retry attempt after backoff delay
    setTimeout(() => {
      void processSyncQueue()
    }, delay)
  }
}

/**
 * initSyncListener — Initialize background sync event listeners.
 *
 * Call once on app mount (in the root layout or a top-level provider).
 * Sets up:
 * 1. `online` event — fires when device reconnects (cross-platform, iOS + Android)
 * 2. `visibilitychange` event — fires when app comes to foreground (catches
 *    cases where device reconnected while app was backgrounded)
 * 3. Background Sync service worker message handler (Chrome Android enhancement)
 *
 * Returns a cleanup function to remove the listeners.
 */
export function initSyncListener(): () => void {
  if (typeof window === "undefined") {
    // SSR — no listeners needed
    return () => {}
  }

  // 1. Online event: primary cross-platform sync trigger
  const handleOnline = () => {
    console.debug("[sync] Device came online — processing sync queue")
    void processSyncQueue()
  }

  // 2. Visibility change: catches cases where device reconnected while backgrounded
  const handleVisibilityChange = () => {
    if (document.visibilityState === "visible" && navigator.onLine) {
      console.debug("[sync] App became visible and online — processing sync queue")
      void processSyncQueue()
    }
  }

  window.addEventListener("online", handleOnline)
  document.addEventListener("visibilitychange", handleVisibilityChange)

  // 3. Background Sync service worker message (Chrome Android enhancement)
  // The service worker fires a message when a sync event is received
  const handleSwMessage = (event: MessageEvent) => {
    if (
      event.data &&
      typeof event.data === "object" &&
      event.data.type === "BACKGROUND_SYNC"
    ) {
      console.debug("[sync] Background Sync message from service worker")
      void processSyncQueue()
    }
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", handleSwMessage)
  }

  // Attempt sync on initial mount in case items were queued in a previous session
  if (navigator.onLine) {
    void processSyncQueue()
  }

  return () => {
    window.removeEventListener("online", handleOnline)
    document.removeEventListener("visibilitychange", handleVisibilityChange)
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.removeEventListener("message", handleSwMessage)
    }
  }
}

/**
 * getSyncQueueStatus — Query current sync queue state for UI display.
 *
 * Returns counts of items in each state. Used by useSyncStatus hook
 * to determine which icon/state to show in the header.
 */
export async function getSyncQueueStatus(): Promise<{
  pending: number
  processing: number
  failed: number
}> {
  const [pending, processing, failed] = await Promise.all([
    offlineDb.syncQueue.where("status").equals("pending").count(),
    offlineDb.syncQueue.where("status").equals("processing").count(),
    offlineDb.syncQueue.where("status").equals("failed").count(),
  ])

  return { pending, processing, failed }
}

/**
 * prefetchTodayRoutes — Pre-cache today's route data for offline use.
 *
 * Stub function establishing the pre-caching architecture per locked decision:
 * "cache today's full route data when app opens with connectivity"
 *
 * Phase 3 will activate this by fetching from /api/routes/today and writing
 * each stop to offlineDb.routeCache. The cache pattern is documented here
 * for when the route API is available.
 *
 * Called on app open when online (in initSyncListener or a separate effect).
 */
export async function prefetchTodayRoutes(): Promise<void> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return

  // TODO(Phase 3): Fetch today's route from /api/routes/today
  // and write each stop to offlineDb.routeCache with:
  //   offlineDb.routeCache.bulkPut(stops.map(s => ({
  //     id: s.id,
  //     data: s,
  //     cachedAt: Date.now(),
  //     expiresAt: Date.now() + 24 * 60 * 60 * 1000,
  //   })))
  console.debug("[prefetch] Route API not available yet — activates in Phase 3")
}
