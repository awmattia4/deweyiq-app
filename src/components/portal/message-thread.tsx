"use client"

import { useEffect, useRef, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import type { PortalMessage } from "@/actions/portal-messages"
import { sendMessage } from "@/actions/portal-messages"
import { MessageBubble } from "./message-bubble"
import { MessageInput } from "./message-input"

interface MessageThreadProps {
  customerId: string
  orgId: string
  initialMessages: PortalMessage[]
  /** The display name of the current viewer (used as senderName on send) */
  senderName: string
  /** "customer" | "office" — determines bubble alignment and send role */
  senderRole: "customer" | "office"
}

/**
 * MessageThread — Real-time chat thread.
 *
 * Subscribes to Supabase Realtime Broadcast on channel `portal-thread-${customerId}`.
 * New messages are appended to local state immediately (optimistic) and deduplicated
 * when the broadcast echo comes back.
 *
 * Auto-scrolls to the bottom when new messages arrive.
 */
export function MessageThread({
  customerId,
  orgId,
  initialMessages,
  senderName,
  senderRole,
}: MessageThreadProps) {
  const [messages, setMessages] = useState<PortalMessage[]>(initialMessages)
  const [isSending, setIsSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // Scroll to bottom on initial load (instant, not animated)
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "instant" })
  }, [])

  // Supabase Realtime subscription
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase.channel(`portal-thread-${customerId}`, {
      config: { broadcast: { ack: false } },
    })

    channel.on("broadcast", { event: "message" }, (payload) => {
      const incomingMessage = payload.payload as PortalMessage
      if (!incomingMessage?.id) return

      setMessages((prev) => {
        // Deduplicate — don't add if already present (optimistic + broadcast echo)
        if (prev.some((m) => m.id === incomingMessage.id)) return prev
        return [...prev, incomingMessage]
      })
    })

    channel.subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [customerId])

  async function handleSend(body: string | null, photoPath: string | null) {
    if (!body && !photoPath) return

    setIsSending(true)
    try {
      const result = await sendMessage({
        orgId,
        customerId,
        senderRole,
        senderName,
        body,
        photoPath,
      })

      if (result.success && result.message) {
        // Optimistically add to local state (broadcast will echo back; deduplication handles it)
        setMessages((prev) => {
          if (prev.some((m) => m.id === result.message!.id)) return prev
          return [...prev, result.message!]
        })
      }
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Message list */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-3 p-4 min-h-full justify-end">
          {messages.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 py-16 text-center">
              <p className="text-sm font-medium text-foreground">No messages yet</p>
              <p className="text-xs text-muted-foreground max-w-xs">
                Send a message below to start a conversation with your service team.
              </p>
            </div>
          ) : (
            messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                isOwn={message.sender_role === senderRole}
              />
            ))
          )}
          {/* Scroll anchor */}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Message input */}
      <MessageInput
        orgId={orgId}
        customerId={customerId}
        onSend={handleSend}
        isSending={isSending}
        placeholder={
          senderRole === "customer"
            ? "Message your service team..."
            : "Reply to customer..."
        }
      />
    </div>
  )
}
