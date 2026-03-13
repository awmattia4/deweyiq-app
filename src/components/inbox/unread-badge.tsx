"use client"

import { useEffect, useState } from "react"
import { getUnreadCount } from "@/actions/portal-messages"

interface UnreadBadgeProps {
  orgId: string
  role: "office" | "customer"
  customerId?: string
  initialCount?: number
  /** Poll interval in ms (default 30s) */
  pollIntervalMs?: number
}

/**
 * UnreadBadge — Displays an unread message count badge.
 *
 * Polls getUnreadCount every 30 seconds (configurable) to keep the badge
 * up to date. Used in:
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

  useEffect(() => {
    // Initial fetch
    getUnreadCount(orgId, role, customerId).then(({ count: n }) => setCount(n))

    // Polling
    const interval = setInterval(() => {
      getUnreadCount(orgId, role, customerId).then(({ count: n }) => setCount(n))
    }, pollIntervalMs)

    return () => clearInterval(interval)
  }, [orgId, role, customerId, pollIntervalMs])

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

  useEffect(() => {
    getUnreadCount(orgId, role, customerId).then(({ count: n }) => setCount(n))

    const interval = setInterval(() => {
      getUnreadCount(orgId, role, customerId).then(({ count: n }) => setCount(n))
    }, pollIntervalMs)

    return () => clearInterval(interval)
  }, [orgId, role, customerId, pollIntervalMs])

  if (count <= 0) return null

  return (
    <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-primary text-[8px] font-bold text-primary-foreground">
      {count > 9 ? "9+" : count}
    </span>
  )
}
