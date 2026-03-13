"use client"

import { useRef, useState } from "react"
import { PaperclipIcon, SendIcon, XIcon } from "lucide-react"
import { createMessagePhotoUploadUrl } from "@/actions/portal-messages"
import imageCompression from "browser-image-compression"

interface MessageInputProps {
  orgId: string
  customerId: string
  onSend: (body: string | null, photoPath: string | null) => Promise<void>
  isSending?: boolean
  placeholder?: string
}

/**
 * MessageInput — Auto-growing textarea with photo attachment and send button.
 *
 * - Auto-growing textarea: min 1 line, max 4 lines (~120px)
 * - Photo button: compresses (maxSizeMB 0.5) + uploads via signed URL
 * - Enter key sends; Shift+Enter inserts a newline
 * - Send button disabled when no text and no photo
 */
export function MessageInput({
  orgId,
  customerId,
  onSend,
  isSending = false,
  placeholder = "Type a message...",
}: MessageInputProps) {
  const [text, setText] = useState("")
  const [photoPath, setPhotoPath] = useState<string | null>(null)
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null)
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const canSend =
    (text.trim().length > 0 || photoPath !== null) && !isSending && !isUploadingPhoto

  function handleTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setText(e.target.value)
    // Auto-resize the textarea
    const ta = textareaRef.current
    if (ta) {
      ta.style.height = "auto"
      ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      if (canSend) {
        handleSend()
      }
    }
  }

  async function handleSend() {
    if (!canSend) return
    const bodyText = text.trim() || null
    const path = photoPath

    // Clear input immediately (optimistic)
    setText("")
    setPhotoPath(null)
    setPhotoPreviewUrl(null)
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
    }

    await onSend(bodyText, path)
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadError(null)

    // Reset so the same file can be re-selected if needed
    if (fileInputRef.current) fileInputRef.current.value = ""

    setIsUploadingPhoto(true)
    try {
      // Show local preview immediately
      const localUrl = URL.createObjectURL(file)
      setPhotoPreviewUrl(localUrl)

      // Compress to ≤ 0.5 MB
      const compressed = await imageCompression(file, {
        maxSizeMB: 0.5,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
      })

      // Get a signed upload URL from the server
      const uploadMeta = await createMessagePhotoUploadUrl(orgId, customerId, file.name)
      if (!uploadMeta) throw new Error("Could not get upload URL")

      // Upload the compressed blob
      const res = await fetch(uploadMeta.signedUrl, {
        method: "PUT",
        body: compressed,
        headers: { "Content-Type": compressed.type },
      })

      if (!res.ok) throw new Error(`Upload failed: ${res.statusText}`)

      setPhotoPath(uploadMeta.path)
    } catch (err) {
      console.error("[MessageInput] Photo upload error:", err)
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

  return (
    <div className="border-t border-border/60 bg-background/95 backdrop-blur-sm p-4">
      {/* Photo preview strip */}
      {photoPreviewUrl && (
        <div className="relative w-24 h-24 mb-3 rounded-lg overflow-hidden border border-border">
          <img
            src={photoPreviewUrl}
            alt="Photo to attach"
            className="w-full h-full object-cover"
          />
          {isUploadingPhoto && (
            <div className="absolute inset-0 bg-background/70 flex items-center justify-center">
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {!isUploadingPhoto && (
            <button
              type="button"
              onClick={clearPhoto}
              className="absolute top-1 right-1 rounded-full bg-background/80 p-0.5 hover:bg-background transition-colors cursor-pointer"
              aria-label="Remove photo"
            >
              <XIcon className="h-3 w-3" />
            </button>
          )}
        </div>
      )}

      {/* Upload error */}
      {uploadError && (
        <p className="text-xs text-destructive mb-2">{uploadError}</p>
      )}

      <div className="flex items-end gap-2">
        {/* Photo attach button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploadingPhoto || isSending}
          className="flex-shrink-0 p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50 cursor-pointer"
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

        {/* Text area */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={1}
          disabled={isSending}
          className="flex-1 resize-none bg-muted/50 border border-border rounded-2xl px-4 py-2 text-sm leading-relaxed focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 placeholder:text-muted-foreground"
          style={{ minHeight: "40px", maxHeight: "120px", overflow: "hidden" }}
        />

        {/* Send button */}
        <button
          type="button"
          onClick={handleSend}
          disabled={!canSend}
          className="flex-shrink-0 p-2 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          aria-label="Send message"
        >
          {isSending ? (
            <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
          ) : (
            <SendIcon className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Keyboard hint */}
      <p className="text-[10px] text-muted-foreground mt-1.5 text-right select-none">
        Enter to send &middot; Shift+Enter for new line
      </p>
    </div>
  )
}
