"use client"

import { useState, useEffect, useRef } from "react"
import { getSyncQueueStatus, isSyncing } from "@/lib/offline/sync"

// ─── Types ────────────────────────────────────────────────────────────────────

export type SyncState = "synced" | "syncing" | "pending" | "error"

export interface SyncStatus {
  /** Current sync state for icon display */
  status: SyncState
  /** Number of writes waiting to be sent to the server */
  pendingCount: number
  /** Number of writes that failed after all retries exhausted */
  failedCount: number
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** How often to poll when there are pending/active items (ms) */
const ACTIVE_POLL_INTERVAL_MS = 2_500

/** How often to poll when queue is idle (ms) */
const IDLE_POLL_INTERVAL_MS = 10_000

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * useSyncStatus — Tracks the state of the offline sync queue.
 *
 * Used by SyncStatusIcon in the app shell header to show real-time sync state.
 * Polls the Dexie syncQueue at variable intervals:
 * - Every 2.5 seconds when items are pending/processing (active state)
 * - Every 10 seconds when the queue is idle (synced state)
 *
 * States:
 * - `synced`:   Queue is empty. Everything is up to date.
 * - `syncing`:  processSyncQueue is actively running (sending writes).
 * - `pending`:  Items are waiting to be sent (not currently syncing).
 * - `error`:    Items failed after MAX_RETRIES — user action may be needed.
 */
export function useSyncStatus(): SyncStatus {
  const [status, setStatus] = useState<SyncStatus>({
    status: "synced",
    pendingCount: 0,
    failedCount: 0,
  })

  // Track current interval so we can switch between active and idle polling
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isActiveRef = useRef(false)

  async function refresh() {
    const { pending, processing, failed } = await getSyncQueueStatus()
    const syncing = isSyncing()

    let syncState: SyncState
    if (failed > 0) {
      syncState = "error"
    } else if (syncing || processing > 0) {
      syncState = "syncing"
    } else if (pending > 0) {
      syncState = "pending"
    } else {
      syncState = "synced"
    }

    setStatus({
      status: syncState,
      pendingCount: pending + processing,
      failedCount: failed,
    })

    // Switch between active/idle polling based on queue state
    const shouldBeActive = pending > 0 || processing > 0 || syncing
    if (shouldBeActive !== isActiveRef.current) {
      isActiveRef.current = shouldBeActive
      schedulePolling(shouldBeActive)
    }
  }

  function schedulePolling(active: boolean) {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
    }
    const interval = active ? ACTIVE_POLL_INTERVAL_MS : IDLE_POLL_INTERVAL_MS
    intervalRef.current = setInterval(() => {
      void refresh()
    }, interval)
  }

  useEffect(() => {
    // Initial fetch
    void refresh()

    // Start with idle polling; refresh() will switch to active if needed
    schedulePolling(false)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return status
}
