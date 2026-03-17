"use client"

/**
 * project-message-thread.tsx — Project-scoped real-time chat thread (PROJ-88).
 *
 * Same pattern as MessageThread but uses project_id channel and sendProjectMessage action.
 */

import { useEffect, useRef, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import type { PortalMessage } from "@/actions/portal-messages"
import { sendProjectMessage } from "@/actions/portal-project-messages"
import { MessageBubble } from "./message-bubble"
import { MessageInput } from "./message-input"

interface ProjectMessageThreadProps {
  customerId: string
  orgId: string
  projectId: string
  initialMessages: PortalMessage[]
  senderName: string
  senderRole: "customer" | "office"
}

export function ProjectMessageThread({
  customerId,
  orgId,
  projectId,
  initialMessages,
  senderName,
  senderRole,
}: ProjectMessageThreadProps) {
  const [messages, setMessages] = useState<PortalMessage[]>(initialMessages)
  const [isSending, setIsSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // Scroll to bottom on initial load
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "instant" })
  }, [])

  // Realtime subscription for project thread
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase.channel(`portal-project-${projectId}`, {
      config: { broadcast: { ack: false } },
    })

    channel.on("broadcast", { event: "message" }, (payload) => {
      const incomingMessage = payload.payload as PortalMessage
      if (!incomingMessage?.id) return

      setMessages((prev) => {
        const exists = prev.some((m) => m.id === incomingMessage.id)
        if (exists) return prev
        return [...prev, incomingMessage]
      })
    })

    channel.subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [projectId])

  async function handleSend(body: string | null, photoPath: string | null) {
    if (!body && !photoPath) return
    setIsSending(true)

    try {
      const result = await sendProjectMessage({
        orgId,
        customerId,
        projectId,
        senderRole,
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
      {/* Message list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-muted-foreground italic">
              No messages yet. Send a message to get started.
            </p>
          </div>
        ) : (
          messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              isOwn={msg.sender_role === senderRole}
            />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-border/60 p-3">
        <MessageInput
          orgId={orgId}
          customerId={customerId}
          onSend={handleSend}
          isSending={isSending}
          placeholder="Message about this project..."
        />
      </div>
    </div>
  )
}
