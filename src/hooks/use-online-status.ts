"use client"

import { useState, useEffect } from "react"

/**
 * useOnlineStatus — Tracks browser connectivity state.
 *
 * Used by the persistent offline banner and sync status icon in the app shell.
 * SSR-safe: defaults to true (assume online) on the server.
 *
 * Note: navigator.onLine can be unreliable (it reflects network interface
 * state, not actual internet connectivity). For field use, we treat it as
 * the best available signal and rely on failed API calls to confirm offline.
 */
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true
  )

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)

    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [])

  return isOnline
}
