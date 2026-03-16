"use client"

/**
 * NotificationBell — Bell icon in the app header with unread badge.
 *
 * Phase 10: Smart Features / Notifications — Plan 11
 *
 * Features:
 * - Shows Bell icon with red unread count badge (hidden when 0)
 * - Subscribes to Supabase Realtime postgres_changes on user_notifications
 *   for INSERT events filtered by recipient_id — increments count in real-time
 * - On click: opens the NotificationPanel
 *
 * Realtime note (per 10-09 research):
 *   Only subscribe to INSERT events, not UPDATE/DELETE — REPLICA IDENTITY
 *   for UPDATE/DELETE events is not configured on this table. INSERT is
 *   sufficient to catch new notifications arriving in real-time.
 *
 * Props:
 *   userId: string — used to filter Realtime events to this user's notifications
 *   initialCount: number — SSR'd unread count; incremented by Realtime inserts
 */

import { useState, useEffect, useCallback } from "react"
import { BellIcon } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { NotificationPanel } from "@/components/notifications/notification-panel"

interface NotificationBellProps {
  userId: string
  initialCount: number
}

export function NotificationBell({ userId, initialCount }: NotificationBellProps) {
  const [unreadCount, setUnreadCount] = useState(initialCount)
  const [panelOpen, setPanelOpen] = useState(false)

  // When the panel is closed, refresh count from the current notification state
  const handleCountChange = useCallback((delta: number) => {
    setUnreadCount((prev) => Math.max(0, prev + delta))
  }, [])

  // Reset count when panel is opened (user is looking at notifications)
  const handlePanelOpen = useCallback((open: boolean) => {
    setPanelOpen(open)
  }, [])

  // Supabase Realtime subscription — increment count on INSERT for this user
  useEffect(() => {
    const supabase = createClient()

    const channel = supabase
      .channel(`user_notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "user_notifications",
          filter: `recipient_id=eq.${userId}`,
        },
        () => {
          // New notification arrived — increment unread count
          setUnreadCount((prev) => prev + 1)
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [userId])

  const displayCount = unreadCount > 0 ? unreadCount : null

  return (
    <>
      <button
        type="button"
        onClick={() => handlePanelOpen(true)}
        className="relative flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground transition-colors hover:text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
        aria-label={`Notifications${displayCount ? ` (${displayCount} unread)` : ""}`}
      >
        <BellIcon className="h-4 w-4" aria-hidden="true" />

        {/* Unread count badge — only shown when count > 0 */}
        {displayCount !== null && (
          <span
            className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none"
            aria-hidden="true"
          >
            {displayCount > 99 ? "99+" : displayCount}
          </span>
        )}
      </button>

      <NotificationPanel
        open={panelOpen}
        onOpenChange={handlePanelOpen}
        onCountChange={handleCountChange}
      />
    </>
  )
}
