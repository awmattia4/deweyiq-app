"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ExternalLinkIcon } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import type { PortalMessage } from "@/actions/portal-messages"
import { getMessages, markAsRead, sendMessage } from "@/actions/portal-messages"
import { MessageBubble } from "@/components/portal/message-bubble"
import { MessageInput } from "@/components/portal/message-input"

interface InboxThreadProps {
  customerId: string
  customerName: string
  customerEmail: string
  orgId: string
  /** Display name of the office/owner staff member replying */
  senderName: string
}

/**
 * InboxThread — Office-side message thread for a specific customer.
 *
 * - Loads messages on mount via getMessages
 * - Subscribes to Realtime broadcast on `portal-thread-${customerId}`
 * - Auto-marks messages as read when opened (office role)
 * - Reuse MessageBubble and MessageInput from portal components
 */
export function InboxThread({
  customerId,
  customerName,
  customerEmail,
  orgId,
  senderName,
}: InboxThreadProps) {
  const [messages, setMessages] = useState<PortalMessage[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSending, setIsSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Load messages when customerId changes
  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setMessages([])

    getMessages(orgId, customerId).then((msgs) => {
      if (cancelled) return
      setMessages(msgs)
      setIsLoading(false)
    })

    // Mark messages as read when thread is opened
    markAsRead(orgId, customerId, "office").catch(console.error)

    return () => {
      cancelled = true
    }
  }, [orgId, customerId])

  // Scroll to bottom when messages load
  useEffect(() => {
    if (!isLoading) {
      bottomRef.current?.scrollIntoView({ behavior: "instant" })
    }
  }, [isLoading])

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages.length])

  // Supabase Realtime subscription
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase.channel(`portal-thread-${customerId}`, {
      config: { broadcast: { ack: false } },
    })

    channel.on("broadcast", { event: "message" }, (payload) => {
      const incoming = payload.payload as PortalMessage
      if (!incoming?.id) return

      setMessages((prev) => {
        if (prev.some((m) => m.id === incoming.id)) return prev
        // Mark as read automatically if it's a customer message (office has thread open)
        markAsRead(orgId, customerId, "office").catch(console.error)
        return [...prev, incoming]
      })
    })

    channel.subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [customerId, orgId])

  async function handleSend(body: string | null, photoPath: string | null) {
    if (!body && !photoPath) return
    setIsSending(true)
    try {
      const result = await sendMessage({
        orgId,
        customerId,
        senderRole: "office",
        senderName,
        body,
        photoPath,
      })

      if (result.success && result.message) {
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
      {/* Customer info header */}
      <div className="px-4 py-3 border-b border-border/60 flex items-center justify-between gap-3 shrink-0">
        <div>
          <p className="text-sm font-semibold text-foreground">{customerName}</p>
          {customerEmail && (
            <p className="text-xs text-muted-foreground">{customerEmail}</p>
          )}
        </div>
        <Link
          href={`/customers/${customerId}`}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          View profile
          <ExternalLinkIcon className="h-3 w-3" />
        </Link>
      </div>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="flex flex-col gap-3 p-4 min-h-full justify-end">
            {messages.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 py-16 text-center">
                <p className="text-sm font-medium text-foreground">No messages yet</p>
                <p className="text-xs text-muted-foreground max-w-xs">
                  Start the conversation by sending a reply below.
                </p>
              </div>
            ) : (
              messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  isOwn={message.sender_role === "office"}
                />
              ))
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Reply input */}
      <MessageInput
        orgId={orgId}
        customerId={customerId}
        onSend={handleSend}
        isSending={isSending}
        placeholder={`Reply to ${customerName}...`}
      />
    </div>
  )
}
