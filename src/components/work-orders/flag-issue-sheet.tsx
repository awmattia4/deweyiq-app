"use client"

import { useRef, useState, useCallback, useEffect } from "react"
import {
  FlagIcon,
  CameraIcon,
  MicIcon,
  XIcon,
  ExpandIcon,
  CheckCircle2Icon,
} from "lucide-react"
import imageCompression from "browser-image-compression"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { createWorkOrder } from "@/actions/work-orders"
import { createWoPhotoUploadUrl } from "@/actions/storage"
import { toast } from "sonner"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORIES = [
  { id: "pump", label: "Pump" },
  { id: "filter", label: "Filter" },
  { id: "heater", label: "Heater" },
  { id: "plumbing_leak", label: "Plumbing/Leak" },
  { id: "surface", label: "Surface" },
  { id: "electrical", label: "Electrical" },
  { id: "other", label: "Other" },
] as const

type Category = (typeof CATEGORIES)[number]["id"]

const SEVERITIES = [
  { id: "routine", label: "Routine", color: "border-border/60 text-muted-foreground data-[active=true]:bg-muted/40 data-[active=true]:border-border data-[active=true]:text-foreground" },
  { id: "urgent", label: "Urgent", color: "border-amber-500/40 text-amber-400/70 data-[active=true]:bg-amber-500/15 data-[active=true]:border-amber-500/60 data-[active=true]:text-amber-300" },
  { id: "emergency", label: "Emergency", color: "border-red-500/40 text-red-400/70 data-[active=true]:bg-red-500/15 data-[active=true]:border-red-500/60 data-[active=true]:text-red-300" },
] as const

type Severity = (typeof SEVERITIES)[number]["id"]

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LocalPhoto {
  id: string          // client-generated id
  blob: Blob
  objectUrl: string
  status: "pending" | "uploaded" | "failed"
  storagePath?: string
}

interface FlagIssueSheetProps {
  open: boolean
  customerId: string
  poolId: string
  visitId: string
  orgId: string
  onClose: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * FlagIssueSheet — quick issue-flag bottom sheet for techs during a service stop.
 *
 * Optimized for ~10-second completion:
 * - Large pill buttons for category and severity
 * - Optional note with system dictation hint
 * - Optional photos (max 3, camera capture)
 * - Submits a draft WO and optionally uploads photos
 *
 * Offline: If navigator.onLine is false, still creates the WO via server action
 * when back online (no queueing — the sheet stays open if offline; navigator.onLine
 * is checked before submission). Photos are uploaded post-creation if online.
 */
export function FlagIssueSheet({
  open,
  customerId,
  poolId,
  visitId,
  orgId,
  onClose,
}: FlagIssueSheetProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Form state ─────────────────────────────────────────────────────────────
  const [category, setCategory] = useState<Category | null>(null)
  const [severity, setSeverity] = useState<Severity>("routine")
  const [note, setNote] = useState("")
  const [photos, setPhotos] = useState<LocalPhoto[]>([])
  const [viewingPhoto, setViewingPhoto] = useState<LocalPhoto | null>(null)

  // ── Submission state ───────────────────────────────────────────────────────
  const [isCompressing, setIsCompressing] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── Cleanup object URLs on unmount ─────────────────────────────────────────
  useEffect(() => {
    return () => {
      photos.forEach((p) => URL.revokeObjectURL(p.objectUrl))
      if (viewingPhoto) URL.revokeObjectURL(viewingPhoto.objectUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Reset form when sheet closes ──────────────────────────────────────────
  const handleClose = useCallback(() => {
    setCategory(null)
    setSeverity("routine")
    setNote("")
    photos.forEach((p) => URL.revokeObjectURL(p.objectUrl))
    setPhotos([])
    setViewingPhoto(null)
    setError(null)
    setIsSubmitting(false)
    onClose()
  }, [photos, onClose])

  // ── Photo capture ─────────────────────────────────────────────────────────

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      e.target.value = ""

      if (photos.length >= 3) {
        toast.error("Max 3 photos per flagged issue")
        return
      }

      setIsCompressing(true)
      try {
        const compressed = await imageCompression(file, {
          maxSizeMB: 0.3,
          maxWidthOrHeight: 1200,
          useWebWorker: true,
          fileType: "image/webp",
          initialQuality: 0.8,
        })

        const photoId = crypto.randomUUID()
        const objectUrl = URL.createObjectURL(compressed)
        setPhotos((prev) => [
          ...prev,
          { id: photoId, blob: compressed, objectUrl, status: "pending" },
        ])
      } catch (err) {
        console.error("[FlagIssueSheet] Photo compression failed:", err)
        toast.error("Failed to process photo")
      } finally {
        setIsCompressing(false)
      }
    },
    [photos.length]
  )

  const removePhoto = useCallback((photoId: string) => {
    setPhotos((prev) => {
      const photo = prev.find((p) => p.id === photoId)
      if (photo) URL.revokeObjectURL(photo.objectUrl)
      return prev.filter((p) => p.id !== photoId)
    })
  }, [])

  // ── Photo upload ──────────────────────────────────────────────────────────

  const uploadPhotos = useCallback(
    async (woId: string): Promise<string[]> => {
      const storagePaths: string[] = []

      for (const photo of photos) {
        try {
          const fileName = `photo-${photo.id}.webp`
          const result = await createWoPhotoUploadUrl(orgId, woId, fileName)
          if (!result) {
            console.error("[FlagIssueSheet] Failed to get signed URL for photo", photo.id)
            continue
          }

          const uploadResponse = await fetch(result.signedUrl, {
            method: "PUT",
            body: photo.blob,
            headers: { "Content-Type": "image/webp" },
          })

          if (uploadResponse.ok) {
            storagePaths.push(result.path)
            setPhotos((prev) =>
              prev.map((p) =>
                p.id === photo.id
                  ? { ...p, status: "uploaded", storagePath: result.path }
                  : p
              )
            )
          } else {
            setPhotos((prev) =>
              prev.map((p) =>
                p.id === photo.id ? { ...p, status: "failed" } : p
              )
            )
          }
        } catch (err) {
          console.error("[FlagIssueSheet] Photo upload error:", err)
          setPhotos((prev) =>
            prev.map((p) =>
              p.id === photo.id ? { ...p, status: "failed" } : p
            )
          )
        }
      }

      return storagePaths
    },
    [photos, orgId]
  )

  // ── Submit ────────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    if (!category) {
      setError("Please select a category.")
      return
    }

    setError(null)
    setIsSubmitting(true)

    try {
      // Generate a human-readable WO title from category + suffix
      const categoryLabel = CATEGORIES.find((c) => c.id === category)?.label ?? "Issue"
      const title = `${categoryLabel} Issue — Flagged by Tech`

      const woId = await createWorkOrder({
        customerId,
        poolId,
        title,
        description: note.trim() || undefined,
        category,
        severity,
        flagFromCurrentUser: true, // Server action auto-fills flaggedByTechId from JWT sub
        flaggedFromVisitId: visitId,
      })

      if (!woId) {
        setError("Failed to flag issue. Please try again.")
        return
      }

      // Upload photos if any (best-effort, non-fatal)
      if (photos.length > 0 && navigator.onLine) {
        await uploadPhotos(woId)
      }

      toast.success("Issue flagged", {
        description: `${categoryLabel} issue — ${severity}`,
      })

      handleClose()
    } catch (err) {
      console.error("[FlagIssueSheet] Submit error:", err)
      setError("Something went wrong. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }, [
    category,
    note,
    severity,
    customerId,
    poolId,
    visitId,
    photos.length,
    uploadPhotos,
    handleClose,
  ])

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Sheet open={open} onOpenChange={(v) => !v && handleClose()}>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl max-h-[92dvh] overflow-y-auto pb-safe mx-auto max-w-lg"
      >
        <SheetHeader className="pb-4 border-b border-border/60">
          <SheetTitle className="flex items-center gap-2 text-lg">
            <FlagIcon className="h-5 w-5 text-amber-400" />
            Flag Issue
          </SheetTitle>
          <SheetDescription className="text-sm text-muted-foreground">
            Creates a draft work order for office review.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-5 px-4 pt-4 pb-2">
          {/* ── Category picker ─────────────────────────────────────────── */}
          <div className="flex flex-col gap-2.5">
            <label className="text-sm font-medium text-foreground">
              Category <span className="text-red-400">*</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  data-active={category === cat.id}
                  onClick={() => {
                    setCategory(cat.id)
                    if (error) setError(null)
                  }}
                  className={cn(
                    "rounded-full border px-4 min-h-[44px] text-sm font-medium transition-all cursor-pointer",
                    "hover:opacity-90 active:scale-95",
                    category === cat.id
                      ? "bg-primary/15 border-primary/60 text-primary"
                      : "border-border/50 bg-muted/20 text-muted-foreground hover:border-border hover:text-foreground"
                  )}
                >
                  {cat.label}
                </button>
              ))}
            </div>
            {error && !category && (
              <p className="text-xs text-red-400">{error}</p>
            )}
          </div>

          {/* ── Severity picker ──────────────────────────────────────────── */}
          <div className="flex flex-col gap-2.5">
            <label className="text-sm font-medium text-foreground">Severity</label>
            <div className="flex gap-2">
              {SEVERITIES.map((sev) => (
                <button
                  key={sev.id}
                  type="button"
                  data-active={severity === sev.id}
                  onClick={() => setSeverity(sev.id)}
                  className={cn(
                    "flex-1 rounded-full border min-h-[44px] text-sm font-medium transition-all cursor-pointer",
                    "hover:opacity-90 active:scale-95",
                    sev.color
                  )}
                >
                  {sev.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Note field ───────────────────────────────────────────────── */}
          <div className="flex flex-col gap-2.5">
            <label
              htmlFor="flag-issue-note"
              className="flex items-center gap-2 text-sm font-medium text-foreground"
            >
              Note
              <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground/60 font-normal">
                <MicIcon className="h-3 w-3" />
                Voice dictation supported
              </span>
            </label>
            <textarea
              id="flag-issue-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Describe the issue..."
              rows={2}
              className="w-full resize-none rounded-xl border border-border/60 bg-muted/20 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* ── Photo capture ────────────────────────────────────────────── */}
          <div className="flex flex-col gap-2.5">
            <label className="text-sm font-medium text-foreground">
              Photos{" "}
              <span className="text-muted-foreground/60 font-normal text-xs">
                (max 3)
              </span>
            </label>

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={handleFileChange}
              aria-hidden="true"
              tabIndex={-1}
            />

            {/* Camera button — only show if under 3 photos */}
            {photos.length < 3 && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isCompressing}
                className={cn(
                  "flex items-center justify-center gap-2.5 w-full rounded-xl border-2 border-dashed min-h-[56px] text-sm font-medium cursor-pointer transition-all",
                  isCompressing
                    ? "border-border/30 bg-muted/10 text-muted-foreground cursor-wait"
                    : "border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 hover:border-primary/50 active:scale-[0.99]"
                )}
                aria-label="Take photo"
              >
                <CameraIcon className={cn("h-5 w-5 shrink-0", isCompressing && "animate-pulse")} />
                <span>{isCompressing ? "Processing…" : "Add photo"}</span>
              </button>
            )}

            {/* Photo thumbnails */}
            {photos.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {photos.map((photo) => (
                  <div key={photo.id} className="relative aspect-square">
                    <button
                      type="button"
                      onClick={() => setViewingPhoto(photo)}
                      className="w-full h-full rounded-xl overflow-hidden border border-border/40 bg-muted/20 cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label="View photo"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photo.objectUrl}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/25 transition-colors">
                        <ExpandIcon className="h-4 w-4 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" />
                      </div>
                      {/* Upload status dot */}
                      {photo.status === "failed" && (
                        <span className="absolute bottom-1.5 right-1.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-background" />
                      )}
                    </button>
                    {/* Remove button */}
                    <button
                      type="button"
                      onClick={() => removePhoto(photo.id)}
                      className="absolute -top-1.5 -right-1.5 h-6 w-6 rounded-full bg-background border border-border/60 flex items-center justify-center cursor-pointer hover:bg-muted transition-colors z-10"
                      aria-label="Remove photo"
                    >
                      <XIcon className="h-3 w-3 text-muted-foreground" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── General error ────────────────────────────────────────────── */}
          {error && category && (
            <p className="text-xs text-red-400">{error}</p>
          )}

          {/* ── Action buttons ───────────────────────────────────────────── */}
          <div className="flex flex-col gap-3 pb-4">
            <Button
              className={cn(
                "w-full h-12 text-base font-semibold rounded-xl cursor-pointer transition-all",
                category
                  ? "bg-amber-600 hover:bg-amber-700 text-white shadow-lg shadow-amber-900/20"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              )}
              onClick={handleSubmit}
              disabled={!category || isSubmitting || isCompressing}
            >
              <CheckCircle2Icon className="h-5 w-5 mr-2" />
              {isSubmitting ? "Flagging…" : "Flag Issue"}
            </Button>
            <Button
              variant="ghost"
              className="w-full h-11 text-sm rounded-xl cursor-pointer"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
          </div>
        </div>

        {/* ── Full-size photo viewer ───────────────────────────────────── */}
        {viewingPhoto && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
            onClick={() => setViewingPhoto(null)}
            role="dialog"
            aria-modal="true"
            aria-label="Photo viewer"
          >
            <div
              className="relative max-w-full max-h-full flex flex-col gap-3"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => setViewingPhoto(null)}
                  className="flex items-center justify-center h-10 w-10 rounded-full bg-white/10 text-white cursor-pointer hover:bg-white/20 transition-colors"
                  aria-label="Close photo viewer"
                >
                  <XIcon className="h-5 w-5" />
                </button>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={viewingPhoto.objectUrl}
                alt=""
                className="max-w-full max-h-[80dvh] object-contain rounded-xl"
              />
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
