"use client"

import { useEffect, useRef, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import type { PortalMessage } from "@/actions/service-requests"
import { sendRequestMessage, createRequestPhotoUploadUrl } from "@/actions/service-requests"
import { PaperclipIcon, SendIcon, XIcon } from "lucide-react"
import imageCompression from "browser-image-compression"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RequestThreadProps {
  requestId: string
  customerId: string
  orgId: string
  senderRole: "customer" | "office"
  senderName: string
  initialMessages: PortalMessage[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeTime(date: Date | string): string {
  const now = Date.now()
  const then = new Date(date).getTime()
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

  return new Date(date).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })
}

// ---------------------------------------------------------------------------
// RequestThread
// ---------------------------------------------------------------------------

/**
 * RequestThread — per-request chat thread between customer and office.
 *
 * Subscribes to Supabase Realtime channel `portal-request-{requestId}` for
 * live message updates. Reuses the same MessageBubble-style layout as the
 * general portal messages thread.
 *
 * Used in:
 * - Portal: expanded request card (customer-facing)
 * - Office: RequestReviewPanel (staff-facing)
 */
export function RequestThread({
  requestId,
  customerId,
  orgId,
  senderRole,
  senderName,
  initialMessages,
}: RequestThreadProps) {
  const [messages, setMessages] = useState<PortalMessage[]>(initialMessages)
  const [text, setText] = useState("")
  const [photoPath, setPhotoPath] = useState<string | null>(null)
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null)
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Auto-scroll to bottom on new messages ────────────────────────────────

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // ── Supabase Realtime subscription ────────────────────────────────────────

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`portal-request-${requestId}`)
      .on("broadcast", { event: "message" }, ({ payload }) => {
        if (!payload?.id) return
        setMessages((prev) => {
          // Deduplicate by id
          if (prev.some((m) => m.id === payload.id)) return prev
          return [
            ...prev,
            {
              id: payload.id,
              org_id: orgId,
              customer_id: customerId,
              service_request_id: requestId,
              sender_role: payload.sender_role,
              sender_name: payload.sender_name,
              body: payload.body,
              photo_path: payload.photo_path,
              photo_url: null,
              read_by_office_at: null,
              read_by_customer_at: null,
              created_at: new Date(payload.created_at),
            },
          ]
        })
      })
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [requestId, orgId, customerId])

  // ── Photo upload ──────────────────────────────────────────────────────────

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadError(null)
    if (fileInputRef.current) fileInputRef.current.value = ""

    setIsUploadingPhoto(true)
    try {
      const localUrl = URL.createObjectURL(file)
      setPhotoPreviewUrl(localUrl)

      const compressed = await imageCompression(file, {
        maxSizeMB: 0.5,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
      })

      const uploadMeta = await createRequestPhotoUploadUrl(orgId, customerId, file.name)
      if (!uploadMeta) throw new Error("Could not get upload URL")

      const res = await fetch(uploadMeta.signedUrl, {
        method: "PUT",
        body: compressed,
        headers: { "Content-Type": compressed.type },
      })

      if (!res.ok) throw new Error(`Upload failed: ${res.statusText}`)
      setPhotoPath(uploadMeta.path)
    } catch (err) {
      console.error("[RequestThread] Photo upload error:", err)
      setPhotoPreviewUrl(null)
      setPhotoPath(null)
      setUploadError("Failed to upload photo. Please try again.")
    } finally {
      setIsUploadingPhoto(false)
    }
  }

  function clearPhoto() {
    setPhotoPath(null)
    setPhotoPreviewUrl(null)
    setUploadError(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  // ── Send message ──────────────────────────────────────────────────────────

  const canSend = (text.trim().length > 0 || photoPath !== null) && !isSending && !isUploadingPhoto

  async function handleSend() {
    if (!canSend) return

    const bodyText = text.trim() || null
    const path = photoPath

    // Optimistic update
    const optimisticMsg: PortalMessage = {
      id: `optimistic-${Date.now()}`,
      org_id: orgId,
      customer_id: customerId,
      service_request_id: requestId,
      sender_role: senderRole,
      sender_name: senderName,
      body: bodyText,
      photo_path: path,
      photo_url: photoPreviewUrl,
      read_by_office_at: null,
      read_by_customer_at: null,
      created_at: new Date(),
    }

    setMessages((prev) => [...prev, optimisticMsg])
    setText("")
    setPhotoPath(null)
    setPhotoPreviewUrl(null)
    if (textareaRef.current) textareaRef.current.style.height = "auto"

    setIsSending(true)
    try {
      const result = await sendRequestMessage({
        orgId,
        customerId,
        serviceRequestId: requestId,
        senderRole,
        senderName,
        body: bodyText,
        photoPath: path,
      })

      if (result.success) {
        // Replace optimistic message with real message
        setMessages((prev) =>
          prev.map((m) =>
            m.id === optimisticMsg.id
              ? { ...result.message, photo_url: photoPreviewUrl }
              : m
          )
        )
      } else {
        // Remove optimistic on failure
        setMessages((prev) => prev.filter((m) => m.id !== optimisticMsg.id))
      }
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticMsg.id))
    } finally {
      setIsSending(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      if (canSend) void handleSend()
    }
  }

  function handleTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setText(e.target.value)
    const ta = textareaRef.current
    if (ta) {
      ta.style.height = "auto"
      ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col rounded-xl border border-border/60">
      {/* Thread header */}
      <div className="px-4 py-3 border-b border-border/60">
        <p className="text-sm font-medium text-foreground">Messages</p>
        <p className="text-xs text-muted-foreground">
          Add notes, photos, or questions about this request.
        </p>
      </div>

      {/* Message list */}
      <div className="flex flex-col gap-3 p-4 min-h-[80px] max-h-[320px] overflow-y-auto">
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            No messages yet. Add a note or photo to this request.
          </p>
        ) : (
          messages.map((msg) => {
            const isOwn = msg.sender_role === senderRole
            return (
              <div
                key={msg.id}
                className={`flex flex-col gap-1 ${isOwn ? "items-end" : "items-start"}`}
              >
                {!isOwn && (
                  <span className="text-xs text-muted-foreground px-1">
                    {msg.sender_name}
                  </span>
                )}
                <div
                  className={`relative max-w-[80%] rounded-2xl px-4 py-2.5 ${
                    isOwn
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-muted text-foreground rounded-bl-sm"
                  }`}
                >
                  {msg.photo_url && (
                    <a href={msg.photo_url} target="_blank" rel="noopener noreferrer" className="block mb-2">
                      <img
                        src={msg.photo_url}
                        alt="Attachment"
                        className="max-w-full rounded-lg max-h-48 object-cover cursor-pointer hover:opacity-90 transition-opacity"
                        loading="lazy"
                      />
                    </a>
                  )}
                  {msg.body && (
                    <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                      {msg.body}
                    </p>
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground px-1">
                  {formatRelativeTime(msg.created_at)}
                </span>
              </div>
            )
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Message input */}
      <div className="border-t border-border/60 p-3">
        {photoPreviewUrl && (
          <div className="relative w-16 h-16 mb-2 rounded-lg overflow-hidden border border-border">
            <img src={photoPreviewUrl} alt="Attachment" className="w-full h-full object-cover" />
            {isUploadingPhoto ? (
              <div className="absolute inset-0 bg-background/70 flex items-center justify-center">
                <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <button
                type="button"
                onClick={clearPhoto}
                className="absolute top-0.5 right-0.5 rounded-full bg-background/80 p-0.5 cursor-pointer hover:bg-background"
                aria-label="Remove photo"
              >
                <XIcon className="h-3 w-3" />
              </button>
            )}
          </div>
        )}
        {uploadError && (
          <p className="text-xs text-destructive mb-2">{uploadError}</p>
        )}
        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploadingPhoto || isSending}
            className="p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50 cursor-pointer"
            aria-label="Attach photo"
          >
            <PaperclipIcon className="h-4 w-4" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileSelect}
          />
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            placeholder="Add a note or question..."
            rows={1}
            disabled={isSending}
            className="flex-1 resize-none bg-muted/50 border border-border rounded-2xl px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 placeholder:text-muted-foreground"
            style={{ minHeight: "36px", maxHeight: "120px", overflow: "hidden" }}
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={!canSend}
            className="p-2 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            aria-label="Send message"
          >
            {isSending ? (
              <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
            ) : (
              <SendIcon className="h-4 w-4" />
            )}
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1 text-right select-none">
          Enter to send &middot; Shift+Enter for new line
        </p>
      </div>
    </div>
  )
}
