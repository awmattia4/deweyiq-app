"use client"

import type { PortalMessage } from "@/actions/portal-messages"

interface MessageBubbleProps {
  message: PortalMessage
  isOwn: boolean
}

/**
 * MessageBubble — A single chat message in the thread.
 *
 * Own messages (isOwn=true) are right-aligned with primary background.
 * Other party messages are left-aligned with muted background.
 * Shows: body text, photo thumbnail (clickable), sender name, relative timestamp.
 */
export function MessageBubble({ message, isOwn }: MessageBubbleProps) {
  const timeLabel = formatRelativeTime(message.created_at)

  return (
    <div className={`flex flex-col gap-1 ${isOwn ? "items-end" : "items-start"}`}>
      {/* Sender name above bubble (only for other party) */}
      {!isOwn && (
        <span className="text-xs text-muted-foreground px-1">{message.sender_name}</span>
      )}

      <div
        className={`relative max-w-[80%] sm:max-w-[65%] rounded-2xl px-4 py-2.5 ${
          isOwn
            ? "bg-primary text-primary-foreground rounded-br-sm"
            : "bg-muted text-foreground rounded-bl-sm"
        }`}
      >
        {/* Photo attachment */}
        {message.photo_url && (
          <a
            href={message.photo_url}
            target="_blank"
            rel="noopener noreferrer"
            className="block mb-2"
          >
            <img
              src={message.photo_url}
              alt="Photo attachment"
              className="max-w-full rounded-lg max-h-64 object-cover cursor-pointer hover:opacity-90 transition-opacity"
              loading="lazy"
            />
          </a>
        )}

        {/* Text body */}
        {message.body && (
          <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
            {message.body}
          </p>
        )}
      </div>

      {/* Timestamp below bubble */}
      <span className="text-[10px] text-muted-foreground px-1">{timeLabel}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Relative time formatting
// ---------------------------------------------------------------------------

function formatRelativeTime(isoString: string): string {
  const now = Date.now()
  const then = new Date(isoString).getTime()
  const diffMs = now - then

  if (diffMs < 60_000) return "Just now"
  if (diffMs < 3_600_000) {
    const mins = Math.floor(diffMs / 60_000)
    return `${mins} min ago`
  }
  if (diffMs < 86_400_000) {
    const hours = Math.floor(diffMs / 3_600_000)
    return `${hours}h ago`
  }
  if (diffMs < 172_800_000) return "Yesterday"

  return new Date(isoString).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })
}
