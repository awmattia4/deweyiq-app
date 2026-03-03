"use client"

import { useEffect } from "react"
import { initSyncListener, prefetchTodayRoutes } from "@/lib/offline/sync"

/**
 * SyncInitializer — Client component that wires up background sync on mount.
 *
 * Renders nothing to the DOM. Responsibilities:
 * 1. Calls initSyncListener() — registers online + visibilitychange events
 *    so queued writes are replayed when connectivity returns.
 * 2. Calls prefetchTodayRoutes() — pre-caches today's route data for offline use.
 *    Currently a stub (activates in Phase 3 when route API is available).
 *
 * Per locked decision: "Pre-caching: cache today's full route data when app
 * opens with connectivity."
 *
 * Place this once inside the staff app shell (AppShell). Returns the cleanup
 * function from initSyncListener() on unmount.
 */
export function SyncInitializer() {
  useEffect(() => {
    // Register online + visibilitychange event listeners for background sync
    const cleanup = initSyncListener()

    // Pre-cache today's routes on app open (stub in Phase 1, real in Phase 3)
    void prefetchTodayRoutes()

    return cleanup
  }, [])

  return null
}
