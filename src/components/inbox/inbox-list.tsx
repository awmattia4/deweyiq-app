"use client"

import type { InboxThread } from "@/actions/portal-messages"

function formatRelativeTime(isoString: string): string {
  const now = Date.now()
  const then = new Date(isoString).getTime()
  const diffMs = now - then
  if (diffMs < 60_000) return "just now"
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`
  if (diffMs < 172_800_000) return "yesterday"
  return new Date(isoString).toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

interface InboxListProps {
  threads: InboxThread[]
  activeCustomerId: string | null
  onSelect: (customerId: string) => void
}

/**
 * InboxList — Thread sidebar showing all customer conversations.
 *
 * Each row: customer name, last message preview, relative time, unread badge.
 * Active thread is highlighted. Unread threads are listed first.
 */
export function InboxList({ threads, activeCustomerId, onSelect }: InboxListProps) {
  if (threads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-16 px-4 text-center">
        <p className="text-sm font-medium text-foreground">No messages yet</p>
        <p className="text-xs text-muted-foreground mt-1">
          Customers will appear here when they send messages through the portal.
        </p>
      </div>
    )
  }

  return (
    <div className="divide-y divide-border/50">
      {threads.map((thread) => {
        const isActive = thread.customerId === activeCustomerId
        const hasUnread = thread.unreadCount > 0

        return (
          <button
            key={thread.customerId}
            type="button"
            onClick={() => onSelect(thread.customerId)}
            className={`w-full text-left px-4 py-3.5 flex items-start gap-3 transition-colors cursor-pointer ${
              isActive
                ? "bg-muted/80"
                : "hover:bg-muted/40 active:bg-muted/60"
            }`}
          >
            {/* Unread indicator dot */}
            <div className="flex-shrink-0 mt-1">
              {hasUnread ? (
                <div className="w-2 h-2 rounded-full bg-primary" />
              ) : (
                <div className="w-2 h-2 rounded-full" />
              )}
            </div>

            {/* Thread info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 mb-0.5">
                <span
                  className={`text-sm truncate ${
                    hasUnread ? "font-semibold text-foreground" : "font-medium text-foreground"
                  }`}
                >
                  {thread.customerName}
                </span>
                <span className="text-[10px] text-muted-foreground flex-shrink-0">
                  {formatRelativeTime(thread.lastMessageAt)}
                </span>
              </div>

              <div className="flex items-center justify-between gap-2">
                <p
                  className={`text-xs truncate ${
                    hasUnread ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {thread.lastMessage ?? "(photo)"}
                </p>
                {hasUnread && (
                  <span className="flex-shrink-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground px-1">
                    {thread.unreadCount > 99 ? "99+" : thread.unreadCount}
                  </span>
                )}
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
