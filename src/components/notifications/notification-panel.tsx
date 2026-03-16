"use client"

/**
 * NotificationPanel — Slide-out sheet showing grouped in-app notifications.
 *
 * Phase 10: Smart Features / Notifications — Plan 11
 *
 * Layout:
 * - Sheet (side="right") slides in from the right
 * - Header: "Notifications" title + "Mark all read" button
 * - Two sections:
 *     "Needs Action" — urgent notifications (needs_action urgency), bordered highlight
 *     "Informational" — FYI notifications (informational urgency)
 * - Each notification row: title, body (truncated), time ago, unread dot
 * - Clicking a notification: marks read + navigates to notification.link
 * - X button per notification: dismisses it (soft delete)
 * - Empty state: "No notifications" in muted italic text
 *
 * onCountChange(delta): called when unread count changes so the bell badge updates
 * without re-fetching the count from the server.
 */

import { useState, useEffect, useCallback, useTransition } from "react"
import { useRouter } from "next/navigation"
import { XIcon } from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  getNotifications,
  markRead,
  markAllRead,
  dismissNotification,
} from "@/actions/user-notifications"
import type { NotificationGroup } from "@/actions/user-notifications"
import type { UserNotification } from "@/lib/db/schema/user-notifications"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format a date as "time ago" string — simple relative time without a library. */
function timeAgo(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)

  if (diffSec < 60) return "just now"
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHour < 24) return `${diffHour}h ago`
  if (diffDay < 7) return `${diffDay}d ago`
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

// ---------------------------------------------------------------------------
// Notification Row
// ---------------------------------------------------------------------------

interface NotificationRowProps {
  notification: UserNotification
  onRead: (id: string) => void
  onDismiss: (id: string) => void
}

function NotificationRow({ notification, onRead, onDismiss }: NotificationRowProps) {
  const isUnread = !notification.read_at

  return (
    <div className="relative flex items-start gap-3 px-4 py-3 hover:bg-accent/50 transition-colors group">
      {/* Unread indicator dot */}
      {isUnread && (
        <div className="mt-1.5 shrink-0 h-2 w-2 rounded-full bg-primary" aria-label="Unread" />
      )}
      {!isUnread && <div className="mt-1.5 shrink-0 h-2 w-2" />}

      {/* Notification content — clickable to navigate */}
      <button
        type="button"
        onClick={() => onRead(notification.id)}
        className="flex-1 min-w-0 text-left cursor-pointer"
      >
        <p className={`text-sm leading-snug ${isUnread ? "font-semibold text-foreground" : "font-medium text-foreground/80"}`}>
          {notification.title}
        </p>
        {notification.body && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
            {notification.body}
          </p>
        )}
        <p className="text-xs text-muted-foreground/60 mt-1">
          {timeAgo(new Date(notification.created_at))}
        </p>
      </button>

      {/* Dismiss button — visible on hover */}
      <button
        type="button"
        onClick={() => onDismiss(notification.id)}
        className="shrink-0 mt-0.5 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
        aria-label="Dismiss notification"
      >
        <XIcon className="h-3 w-3" />
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section
// ---------------------------------------------------------------------------

interface SectionProps {
  title: string
  notifications: UserNotification[]
  urgent?: boolean
  onRead: (id: string) => void
  onDismiss: (id: string) => void
}

function NotificationSection({ title, notifications, urgent, onRead, onDismiss }: SectionProps) {
  if (notifications.length === 0) return null

  return (
    <div className="flex flex-col">
      <div className={`px-4 py-2 ${urgent ? "bg-amber-500/10 border-l-2 border-amber-500/60" : ""}`}>
        <h3 className={`text-xs font-semibold uppercase tracking-wider ${urgent ? "text-amber-500" : "text-muted-foreground"}`}>
          {title}
        </h3>
      </div>
      <div className="divide-y divide-border/40">
        {notifications.map((n) => (
          <NotificationRow
            key={n.id}
            notification={n}
            onRead={onRead}
            onDismiss={onDismiss}
          />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

interface NotificationPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called with +1 or -1 when unread count changes due to read/dismiss actions */
  onCountChange: (delta: number) => void
}

export function NotificationPanel({ open, onOpenChange, onCountChange }: NotificationPanelProps) {
  const router = useRouter()
  const [notifications, setNotifications] = useState<NotificationGroup>({
    needs_action: [],
    informational: [],
  })
  const [loading, setLoading] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Load notifications when panel opens
  useEffect(() => {
    if (!open) return

    setLoading(true)
    getNotifications().then((result) => {
      if (result.success && result.data) {
        setNotifications(result.data)
      }
      setLoading(false)
    })
  }, [open])

  const handleRead = useCallback(
    (id: string) => {
      // Find the notification to check if it was unread
      const allNotifs = [
        ...notifications.needs_action,
        ...notifications.informational,
      ]
      const notif = allNotifs.find((n) => n.id === id)
      const wasUnread = notif && !notif.read_at

      // Optimistically mark read in local state
      setNotifications((prev) => ({
        needs_action: prev.needs_action.map((n) =>
          n.id === id ? { ...n, read_at: new Date() } : n
        ),
        informational: prev.informational.map((n) =>
          n.id === id ? { ...n, read_at: new Date() } : n
        ),
      }))

      // Update unread badge count
      if (wasUnread) onCountChange(-1)

      // Navigate to link if present
      if (notif?.link) {
        onOpenChange(false)
        router.push(notif.link)
      }

      // Persist to server
      startTransition(async () => {
        await markRead(id)
      })
    },
    [notifications, onCountChange, onOpenChange, router]
  )

  const handleDismiss = useCallback(
    (id: string) => {
      // Find notification to check if it was unread
      const allNotifs = [
        ...notifications.needs_action,
        ...notifications.informational,
      ]
      const notif = allNotifs.find((n) => n.id === id)
      const wasUnread = notif && !notif.read_at

      // Remove from local state optimistically
      setNotifications((prev) => ({
        needs_action: prev.needs_action.filter((n) => n.id !== id),
        informational: prev.informational.filter((n) => n.id !== id),
      }))

      // Update badge count if it was unread
      if (wasUnread) onCountChange(-1)

      // Persist to server
      startTransition(async () => {
        await dismissNotification(id)
      })
    },
    [notifications, onCountChange]
  )

  const handleMarkAllRead = useCallback(() => {
    // Count unread before marking
    const unreadCount =
      notifications.needs_action.filter((n) => !n.read_at).length +
      notifications.informational.filter((n) => !n.read_at).length

    // Optimistically mark all as read
    const now = new Date()
    setNotifications((prev) => ({
      needs_action: prev.needs_action.map((n) => ({ ...n, read_at: n.read_at ?? now })),
      informational: prev.informational.map((n) => ({ ...n, read_at: n.read_at ?? now })),
    }))

    // Update badge
    if (unreadCount > 0) onCountChange(-unreadCount)

    // Persist to server
    startTransition(async () => {
      await markAllRead()
    })
  }, [notifications, onCountChange])

  const totalCount =
    notifications.needs_action.length + notifications.informational.length

  const hasUnread =
    notifications.needs_action.some((n) => !n.read_at) ||
    notifications.informational.some((n) => !n.read_at)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" showCloseButton={false} className="w-full sm:max-w-sm flex flex-col p-0 gap-0">
        {/* Header */}
        <SheetHeader className="px-4 py-4 border-b border-border/60 flex-row items-center justify-between space-y-0">
          <SheetTitle className="text-base font-semibold">Notifications</SheetTitle>
          <div className="flex items-center gap-2">
            {hasUnread && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleMarkAllRead}
                disabled={isPending}
                className="h-7 px-2 text-xs cursor-pointer"
              >
                Mark all read
              </Button>
            )}
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
              aria-label="Close notifications"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </div>
        </SheetHeader>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-sm text-muted-foreground">Loading...</p>
            </div>
          ) : totalCount === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4">
              <p className="text-sm text-muted-foreground italic">No notifications</p>
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-border/40">
              <NotificationSection
                title="Needs Action"
                notifications={notifications.needs_action}
                urgent
                onRead={handleRead}
                onDismiss={handleDismiss}
              />
              {notifications.needs_action.length > 0 && notifications.informational.length > 0 && (
                <Separator />
              )}
              <NotificationSection
                title="Informational"
                notifications={notifications.informational}
                onRead={handleRead}
                onDismiss={handleDismiss}
              />
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
