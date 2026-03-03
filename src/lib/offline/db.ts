import Dexie, { type Table } from "dexie"

export interface SyncQueueItem {
  id?: number                              // Auto-incremented primary key
  url: string                              // API endpoint to replay
  method: string                           // HTTP method (POST, PATCH, DELETE, etc.)
  body: string                             // JSON-serialized request body
  headers: Record<string, string>          // Request headers (auth, content-type, etc.)
  createdAt: number                        // Date.now() when enqueued
  retries: number                          // Number of replay attempts so far
  status: "pending" | "processing" | "failed"  // Current queue item state
  lastError?: string                       // Last error message (for debugging)
}

export interface CachedRoute {
  id: string           // stop_id or route_id
  data: unknown        // Full route/stop data (JSON-serializable)
  cachedAt: number     // When this entry was cached (Date.now())
  expiresAt: number    // When this cache entry becomes stale (Date.now() + TTL)
}

class OfflineDB extends Dexie {
  syncQueue!: Table<SyncQueueItem>
  routeCache!: Table<CachedRoute>

  constructor() {
    super("poolco-offline")
    this.version(1).stores({
      // ++id = auto-increment primary key; index createdAt, retries, status for query perf
      syncQueue: "++id, createdAt, retries, status",
      // id is primary key (stop_id or route_id); index cachedAt and expiresAt for expiry queries
      routeCache: "id, cachedAt, expiresAt",
    })
  }
}

export const offlineDb = new OfflineDB()
