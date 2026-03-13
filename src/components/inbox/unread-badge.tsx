"use client"

import { useEffect, useState, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { getUnreadCount } from "@/actions/portal-messages"

interface UnreadBadgeProps {
  orgId: string
  role: "office" | "customer"
  customerId?: string
  initialCount?: number
  /** Poll interval in ms (default 30s) — fallback if Realtime is unavailable */
  pollIntervalMs?: number
}

/**
 * UnreadBadge — Displays an unread message count badge.
 *
 * Subscribes to the `unread-badge-{orgId}` Realtime Broadcast channel for
 * instant updates when messages are sent. Falls back to 30s polling.
 *
 * Used in:
 * - AppSidebar: role='office', shows total unread from all customers
 * - PortalShell: role='customer', shows unread replies from office
 *
 * Returns null if count is 0 (no badge shown).
 */
export function UnreadBadge({
  orgId,
  role,
  customerId,
  initialCount = 0,
  pollIntervalMs = 30_000,
}: UnreadBadgeProps) {
  const [count, setCount] = useState(initialCount)

  const refresh = useCallback(() => {
    getUnreadCount(orgId, role, customerId).then(({ count: n }) => setCount(n))
  }, [orgId, role, customerId])

  useEffect(() => {
    // Initial fetch
    refresh()

    // Realtime subscription for instant updates
    const supabase = createClient()
    const channel = supabase.channel(`unread-badge-${orgId}`)
    channel.on("broadcast", { event: "refresh" }, () => {
      refresh()
    })
    channel.subscribe()

    // Polling as fallback
    const interval = setInterval(refresh, pollIntervalMs)

    return () => {
      clearInterval(interval)
      supabase.removeChannel(channel)
    }
  }, [orgId, role, customerId, pollIntervalMs, refresh])

  if (count <= 0) return null

  return (
    <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground px-1 group-data-[collapsible=icon]:hidden">
      {count > 99 ? "99+" : count}
    </span>
  )
}

/**
 * UnreadDot — Simpler dot version for the portal nav (no number, just indicator).
 */
export function UnreadDot({
  orgId,
  role,
  customerId,
  initialCount = 0,
  pollIntervalMs = 30_000,
}: UnreadBadgeProps) {
  const [count, setCount] = useState(initialCount)

  const refresh = useCallback(() => {
    getUnreadCount(orgId, role, customerId).then(({ count: n }) => setCount(n))
  }, [orgId, role, customerId])

  useEffect(() => {
    refresh()

    const supabase = createClient()
    const channel = supabase.channel(`unread-badge-${orgId}`)
    channel.on("broadcast", { event: "refresh" }, () => {
      refresh()
    })
    channel.subscribe()

    const interval = setInterval(refresh, pollIntervalMs)

    return () => {
      clearInterval(interval)
      supabase.removeChannel(channel)
    }
  }, [orgId, role, customerId, pollIntervalMs, refresh])

  if (count <= 0) return null

  return (
    <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-primary text-[8px] font-bold text-primary-foreground">
      {count > 9 ? "9+" : count}
    </span>
  )
}
