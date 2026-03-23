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
  // Phase 12 stores
  projectTaskDrafts!: Table<ProjectTaskDraft>
  projectPhotoQueue!: Table<ProjectPhotoQueueItem>
  // Phase 13 stores
  inventoryUpdates!: Table<InventoryUpdate>

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

    // v4: Phase 12 — project offline stores for timer state + task completions + project photos
    // Carry forward ALL v3 stores unchanged — Dexie immutable versioning.
    this.version(4).stores({
      syncQueue: "++id, createdAt, retries, status",
      routeCache: "id, cachedAt, expiresAt",
      visitDrafts: "id, stopId, updatedAt, status",
      photoQueue: "++id, visitId, orgId, status, createdAt",
      // Project task drafts: timer state + task completion state per project phase
      // id = "{projectId}:{phaseId}" composite key (client-generated)
      projectTaskDrafts: "id, projectId, phaseId, updatedAt, status",
      // Project photo queue: same blob-not-indexed pattern as photoQueue
      projectPhotoQueue: "++id, projectId, phaseId, status, createdAt",
    })

    // v5: Phase 13 — offline inventory quantity adjustments
    // Carry forward ALL v4 stores unchanged — Dexie immutable versioning.
    this.version(5).stores({
      syncQueue: "++id, createdAt, retries, status",
      routeCache: "id, cachedAt, expiresAt",
      visitDrafts: "id, stopId, updatedAt, status",
      photoQueue: "++id, visitId, orgId, status, createdAt",
      projectTaskDrafts: "id, projectId, phaseId, updatedAt, status",
      projectPhotoQueue: "++id, projectId, phaseId, status, createdAt",
      // Inventory updates: pending quantity adjustments when offline
      inventoryUpdates: "++id, techId, itemId, status, createdAt",
    })
  }
}

// ---------------------------------------------------------------------------
// Project-specific offline types
// ---------------------------------------------------------------------------

/**
 * ProjectTaskDraft — timer state and task completion state for a project phase.
 *
 * id = "{projectId}:{phaseId}" — deterministic composite key so the record can be
 * found without a scan. survives app close/reopen.
 *
 * status="active" = timer is running; "paused" = timer paused; "idle" = no active timer
 */
export interface ProjectTaskDraft {
  id: string                      // "{projectId}:{phaseId}"
  projectId: string
  phaseId: string
  // Timer state — stored here so it survives app close/reopen (per MEMORY.md Dexie pattern)
  timerRunning: boolean
  timerStartedAt: number | null   // Date.now() when timer started (null if not running)
  timerAccumulatedMs: number      // total ms accumulated in prior timer runs
  activeTaskId: string | null     // which task the timer is for (null = phase-level)
  activeTimeLogId: string | null  // server-side project_time_logs.id (set after startProjectTimer)
  // Task completion overrides (optimistic UI before server confirms)
  // taskId -> boolean
  taskCompletions: Record<string, boolean>
  status: "idle" | "active" | "paused"
  updatedAt: number               // Date.now()
}

/**
 * ProjectPhotoQueueItem — compressed project photos staged for Supabase Storage upload.
 *
 * CRITICAL: blob is NOT indexed — indexing Blob columns corrupts IDB performance.
 * Only projectId, phaseId, status, and createdAt are indexed for queue management.
 */
export interface ProjectPhotoQueueItem {
  id?: number                     // auto-increment
  projectId: string
  phaseId: string | null
  taskId: string | null
  orgId: string
  blob: Blob                      // raw compressed image — NOT base64, NOT indexed
  tag: "before" | "during" | "after" | "issue" | null
  caption?: string
  status: "pending" | "uploaded" | "failed"
  storagePath?: string            // filled after successful upload
  createdAt: number
}

// ---------------------------------------------------------------------------
// Phase 13 offline types
// ---------------------------------------------------------------------------

/**
 * InventoryUpdate — offline inventory quantity adjustment queued for sync.
 *
 * Created when tech adjusts inventory amounts while offline.
 * Synced to server when connectivity is restored via the syncQueue processor.
 *
 * status="pending"  — not yet synced to server
 * status="synced"   — successfully applied to server
 * status="failed"   — sync failed after retry limit
 */
export interface InventoryUpdate {
  id?: number             // auto-increment
  techId: string          // which tech's truck this is for
  itemId: string          // truck_inventory.id (server-side UUID)
  // 'auto_decrement' | 'manual_use' | 'loaded' | 'damaged' | 'adjustment'
  changeType: string
  // Negative = used/decremented, positive = loaded/added
  quantityChange: number
  status: "pending" | "synced" | "failed"
  createdAt: number       // Date.now()
}

export const offlineDb = new OfflineDB()
