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

/**
 * Visit draft — all field data captured offline before sync to Supabase.
 *
 * The id is a client-generated UUID (not auto-increment) so the visit_id
 * is known before the record is synced to Postgres.
 * status="completed" means the tech finished and sync is pending or done.
 */
export interface VisitDraft {
  id: string                    // visit UUID generated client-side
  stopId: string                // route stop identifier
  poolId: string                // pool being serviced
  customerId: string            // customer ID
  chemistry: Record<string, number | null>  // all reading values keyed by param name
  checklist: Array<{ taskId: string; completed: boolean; notes: string }>
  notes: string
  // Internal notes — visible only to office/owner, not on customer report
  internalNotes?: string
  // Internal flags — e.g. ["needs_follow_up", "escalate"] for office review
  internalFlags?: string[]
  status: "draft" | "completed" | "editing"
  updatedAt: number             // Date.now()
}

/**
 * Photo queue item — compressed images staged for Supabase Storage upload.
 *
 * CRITICAL: blob is NOT indexed — indexing Blob columns corrupts IDB performance.
 * Only visitId, orgId, status, and createdAt are indexed for queue management queries.
 * storagePath is filled after a successful upload and used to update service_visits.photo_urls.
 *
 * orgId is stored here (not only in visitDraft) so the global photo sync processor
 * in sync.ts can construct the correct storage path without needing live session context.
 */
export interface PhotoQueueItem {
  id?: number                   // auto-increment
  visitId: string               // FK to visitDrafts.id
  orgId: string                 // org scope for storage path + RLS
  blob: Blob                    // raw compressed image — NOT base64, NOT indexed
  tag?: "before" | "after" | "issue" | "equipment"
  status: "pending" | "uploaded" | "failed"
  storagePath?: string          // filled after successful upload
  createdAt: number
}

class OfflineDB extends Dexie {
  syncQueue!: Table<SyncQueueItem>
  routeCache!: Table<CachedRoute>
  // Phase 3 stores
  visitDrafts!: Table<VisitDraft>
  photoQueue!: Table<PhotoQueueItem>

  constructor() {
    super("poolco-offline")

    // v1: Phase 1-2 sync infrastructure — NEVER MODIFY (Dexie immutable versioning)
    this.version(1).stores({
      // ++id = auto-increment primary key; index createdAt, retries, status for query perf
      syncQueue: "++id, createdAt, retries, status",
      // id is primary key (stop_id or route_id); index cachedAt and expiresAt for expiry queries
      routeCache: "id, cachedAt, expiresAt",
    })

    // v2: Phase 3 field tech stores — additive migration (v1 data preserved)
    this.version(2).stores({
      // Carry forward all v1 stores unchanged
      syncQueue: "++id, createdAt, retries, status",
      routeCache: "id, cachedAt, expiresAt",
      // id is the visit UUID (client-generated); index stopId, updatedAt, status for route display
      visitDrafts: "id, stopId, updatedAt, status",
      // ++id auto-increment; blob is NOT indexed (critical — indexing blobs corrupts IDB perf)
      photoQueue: "++id, visitId, status, createdAt",
    })

    // v3: Phase 3-06 — add orgId to photoQueue for global sync processor
    // orgId is needed to construct the storage path without live session context.
    // NEVER MODIFY older versions — Dexie immutable versioning.
    this.version(3).stores({
      syncQueue: "++id, createdAt, retries, status",
      routeCache: "id, cachedAt, expiresAt",
      visitDrafts: "id, stopId, updatedAt, status",
      // orgId added as indexed field for global photo sync processor
      photoQueue: "++id, visitId, orgId, status, createdAt",
    })
  }
}

export const offlineDb = new OfflineDB()
