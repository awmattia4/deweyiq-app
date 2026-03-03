import Dexie, { type Table } from "dexie"

export interface SyncQueueItem {
  id?: number
  url: string
  method: string
  body: string
  headers: Record<string, string>
  createdAt: number
  retries: number
}

export interface CachedRoute {
  id: string        // stop_id
  data: unknown     // full route stop data
  cachedAt: number
}

class OfflineDB extends Dexie {
  syncQueue!: Table<SyncQueueItem>
  routeCache!: Table<CachedRoute>

  constructor() {
    super("poolco-offline")
    this.version(1).stores({
      syncQueue: "++id, createdAt, retries",
      routeCache: "id, cachedAt",
    })
  }
}

export const offlineDb = new OfflineDB()

/**
 * enqueueWrite — Queue a write for background sync when offline.
 *
 * Stores the request in IndexedDB and registers a Background Sync tag
 * (Chrome Android). On iOS, sync happens when the user re-opens the app
 * — Background Sync API is not supported on iOS Safari as of early 2026.
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
  })

  // Register Background Sync tag if service worker supports it (Chrome Android)
  if (
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    "sync" in ServiceWorkerRegistration.prototype
  ) {
    const registration = await navigator.serviceWorker.ready
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (registration as any).sync.register("poolco-outbound-sync")
  }
}
