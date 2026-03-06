"use client"

import { useRef, useState, useCallback, useEffect } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import imageCompression from "browser-image-compression"
import {
  CameraIcon,
  XIcon,
  TagIcon,
  AlertTriangleIcon,
  ExpandIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { offlineDb, type PhotoQueueItem } from "@/lib/offline/db"
import { createPhotoUploadUrl } from "@/actions/storage"
import { useOnlineStatus } from "@/hooks/use-online-status"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PhotoTag = "before" | "after" | "issue" | "equipment"

const TAG_LABELS: Record<PhotoTag, string> = {
  before: "Before",
  after: "After",
  issue: "Issue",
  equipment: "Equipment",
}

const TAG_COLORS: Record<PhotoTag, string> = {
  before: "bg-blue-500/20 text-blue-400 border-blue-500/40",
  after: "bg-green-500/20 text-green-400 border-green-500/40",
  issue: "bg-red-500/20 text-red-400 border-red-500/40",
  equipment: "bg-amber-500/20 text-amber-400 border-amber-500/40",
}

interface PhotoCaptureProps {
  visitId: string
  orgId: string
}

// ---------------------------------------------------------------------------
// Photo sync processor
// ---------------------------------------------------------------------------

/**
 * processPhotoQueue — uploads pending photos in Dexie to Supabase Storage.
 *
 * Called on mount and when connectivity returns. Separate from the text
 * enqueueWrite queue because blobs cannot be JSON-serialized.
 */
async function processPhotoQueue(
  visitId: string,
  orgId: string
): Promise<void> {
  const pending = await offlineDb.photoQueue
    .where("status")
    .equals("pending")
    .and((item) => item.visitId === visitId)
    .toArray()

  for (const item of pending) {
    if (!item.id) continue

    try {
      const fileName = `photo-${item.id}-${Date.now()}.webp`
      const result = await createPhotoUploadUrl(orgId, visitId, fileName)

      if (!result) {
        console.error("[photos] Failed to get signed URL for photo", item.id)
        await offlineDb.photoQueue.update(item.id, { status: "failed" })
        continue
      }

      // Upload blob directly to Supabase Storage via signed URL
      const uploadResponse = await fetch(result.signedUrl, {
        method: "PUT",
        body: item.blob,
        headers: {
          "Content-Type": "image/webp",
        },
      })

      if (uploadResponse.ok) {
        await offlineDb.photoQueue.update(item.id, {
          status: "uploaded",
          storagePath: result.path,
        })
        console.debug("[photos] Uploaded photo", item.id, "to", result.path)
      } else {
        console.error(
          "[photos] Upload failed for photo",
          item.id,
          uploadResponse.status
        )
        await offlineDb.photoQueue.update(item.id, { status: "failed" })
      }
    } catch (err) {
      console.error("[photos] Upload error for photo", item.id, err)
      await offlineDb.photoQueue.update(item.id, { status: "failed" })
    }
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * PhotoCapture — camera integration with client-side compression and offline queue.
 *
 * Flow on capture:
 * 1. File selected from camera (hidden <input capture="environment">)
 * 2. Compress with browser-image-compression (300KB WebP, 1200px max)
 * 3. Write blob to Dexie photoQueue IMMEDIATELY (never lost if app closes)
 * 4. Show optional tag selector (auto-dismisses in 3s if not tapped)
 * 5. If online: upload to Supabase Storage, mark "uploaded"
 * 6. If offline: stays "pending", syncs when connectivity returns
 */
export function PhotoCapture({ visitId, orgId }: PhotoCaptureProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isOnline = useOnlineStatus()

  // ── State ─────────────────────────────────────────────────────────────────

  const [isCompressing, setIsCompressing] = useState(false)
  const [tagPendingId, setTagPendingId] = useState<number | null>(null)
  const [tagDismissTimer, setTagDismissTimer] = useState<ReturnType<typeof setTimeout> | null>(null)
  const [viewingPhoto, setViewingPhoto] = useState<PhotoQueueItem | null>(null)
  const [viewingObjectUrl, setViewingObjectUrl] = useState<string | null>(null)

  // ── Live query — photos for this visit ────────────────────────────────────

  const photos = useLiveQuery(
    () =>
      offlineDb.photoQueue
        .where("visitId")
        .equals(visitId)
        .sortBy("createdAt"),
    [visitId]
  )

  // Thumbnail object URLs — managed per photo item to avoid memory leaks
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<number, string>>({})

  useEffect(() => {
    if (!photos) return

    // Create object URLs for new photos, revoke ones that are gone
    const newUrls: Record<number, string> = {}
    for (const photo of photos) {
      if (!photo.id) continue
      if (thumbnailUrls[photo.id]) {
        newUrls[photo.id] = thumbnailUrls[photo.id]
      } else {
        newUrls[photo.id] = URL.createObjectURL(photo.blob)
      }
    }

    // Revoke URLs for photos that were removed
    for (const [id, url] of Object.entries(thumbnailUrls)) {
      if (!newUrls[Number(id)]) {
        URL.revokeObjectURL(url)
      }
    }

    setThumbnailUrls(newUrls)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      Object.values(thumbnailUrls).forEach(URL.revokeObjectURL)
      if (viewingObjectUrl) URL.revokeObjectURL(viewingObjectUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Process photo queue on connectivity return ────────────────────────────

  useEffect(() => {
    if (isOnline) {
      void processPhotoQueue(visitId, orgId)
    }
  }, [isOnline, visitId, orgId])

  // ── Tag selector auto-dismiss ─────────────────────────────────────────────

  const startTagDismissTimer = useCallback(
    (photoId: number) => {
      if (tagDismissTimer) clearTimeout(tagDismissTimer)
      const timer = setTimeout(() => {
        setTagPendingId(null)
        setTagDismissTimer(null)
        // If online, upload after tag dismissed
        void processPhotoQueue(visitId, orgId)
      }, 3000)
      setTagDismissTimer(timer)
    },
    [tagDismissTimer, visitId, orgId]
  )

  // ── Camera capture handler ────────────────────────────────────────────────

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return

      // Reset input so same file can be selected again
      e.target.value = ""

      setIsCompressing(true)

      try {
        // Step 1: Compress image client-side
        const compressed = await imageCompression(file, {
          maxSizeMB: 0.3,
          maxWidthOrHeight: 1200,
          useWebWorker: true,
          fileType: "image/webp",
          initialQuality: 0.8,
        })

        // Step 2: Write to Dexie IMMEDIATELY — never lost even if app closes
        const queueItem: Omit<PhotoQueueItem, "id"> = {
          visitId,
          orgId,
          blob: compressed,
          tag: undefined,
          status: "pending",
          createdAt: Date.now(),
        }

        const newId = await offlineDb.photoQueue.add(queueItem)

        // Step 3: Show tag selector with auto-dismiss timer
        setTagPendingId(newId as number)
        startTagDismissTimer(newId as number)
      } catch (err) {
        console.error("[photos] Compression failed:", err)
      } finally {
        setIsCompressing(false)
      }
    },
    [visitId, startTagDismissTimer]
  )

  // ── Tag selection handler ─────────────────────────────────────────────────

  const handleTagSelect = useCallback(
    async (photoId: number, tag: PhotoTag | null) => {
      if (tagDismissTimer) {
        clearTimeout(tagDismissTimer)
        setTagDismissTimer(null)
      }
      setTagPendingId(null)

      if (tag) {
        await offlineDb.photoQueue.update(photoId, { tag })
      }

      // Now upload — photo is in Dexie either way
      if (isOnline) {
        void processPhotoQueue(visitId, orgId)
      }
    },
    [tagDismissTimer, isOnline, visitId, orgId]
  )

  // ── Photo viewer ──────────────────────────────────────────────────────────

  const handleViewPhoto = useCallback((photo: PhotoQueueItem) => {
    if (viewingObjectUrl) URL.revokeObjectURL(viewingObjectUrl)
    const url = URL.createObjectURL(photo.blob)
    setViewingObjectUrl(url)
    setViewingPhoto(photo)
  }, [viewingObjectUrl])

  const handleCloseViewer = useCallback(() => {
    if (viewingObjectUrl) {
      URL.revokeObjectURL(viewingObjectUrl)
      setViewingObjectUrl(null)
    }
    setViewingPhoto(null)
  }, [viewingObjectUrl])

  // ── Derived state ─────────────────────────────────────────────────────────

  const photoCount = photos?.length ?? 0
  const showWarning = photoCount >= 10

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-4">
      {/* ── Camera button ──────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2">
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
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isCompressing}
          className={cn(
            "flex items-center justify-center gap-3 w-full rounded-2xl border-2 border-dashed transition-all min-h-[72px]",
            "text-sm font-medium cursor-pointer",
            isCompressing
              ? "border-border/30 bg-muted/20 text-muted-foreground cursor-wait"
              : "border-primary/40 bg-primary/5 text-primary hover:bg-primary/10 hover:border-primary/60 active:scale-[0.98]"
          )}
          aria-label="Take photo"
        >
          <CameraIcon
            className={cn(
              "h-7 w-7 shrink-0",
              isCompressing && "animate-pulse"
            )}
          />
          <span>
            {isCompressing ? "Compressing…" : "Tap to take photo"}
          </span>
        </button>

        {/* Offline indicator */}
        {!isOnline && (
          <p className="text-xs text-amber-400/80 text-center">
            Offline — photos will upload when connectivity returns
          </p>
        )}
      </div>

      {/* ── 10+ photo warning ──────────────────────────────────────────────── */}
      {showWarning && (
        <div className="flex items-center gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <AlertTriangleIcon className="h-4 w-4 text-amber-400 shrink-0" />
          <p className="text-sm text-amber-300">
            {photoCount} photos — large uploads may be slow on cellular
          </p>
        </div>
      )}

      {/* ── Tag selector overlay ────────────────────────────────────────────── */}
      {tagPendingId !== null && (
        <div className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <TagIcon className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">Tag this photo</p>
            <span className="ml-auto text-xs text-muted-foreground/60">auto-skip in 3s</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(TAG_LABELS) as PhotoTag[]).map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => handleTagSelect(tagPendingId, tag)}
                className={cn(
                  "rounded-full border px-4 py-2 text-sm font-medium transition-all cursor-pointer",
                  "hover:opacity-80 active:scale-95",
                  TAG_COLORS[tag]
                )}
              >
                {TAG_LABELS[tag]}
              </button>
            ))}
            <button
              type="button"
              onClick={() => handleTagSelect(tagPendingId, null)}
              className="rounded-full border border-border/50 bg-muted/30 px-4 py-2 text-sm font-medium text-muted-foreground transition-all cursor-pointer hover:opacity-80 active:scale-95"
            >
              Skip
            </button>
          </div>
        </div>
      )}

      {/* ── Photo grid ─────────────────────────────────────────────────────── */}
      {photoCount > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">
              Photos{" "}
              <span className="text-muted-foreground font-normal">
                ({photoCount})
              </span>
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {photos?.map((photo) => {
              if (!photo.id) return null
              const thumbUrl = thumbnailUrls[photo.id]
              if (!thumbUrl) return null

              return (
                <button
                  key={photo.id}
                  type="button"
                  onClick={() => handleViewPhoto(photo)}
                  className="relative aspect-square rounded-xl overflow-hidden border border-border/40 bg-muted/20 cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`View photo${photo.tag ? ` tagged ${photo.tag}` : ""}`}
                >
                  {/* Thumbnail */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={thumbUrl}
                    alt=""
                    className="w-full h-full object-cover"
                  />

                  {/* Tag badge */}
                  {photo.tag && (
                    <span
                      className={cn(
                        "absolute top-1.5 left-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-tight",
                        TAG_COLORS[photo.tag]
                      )}
                    >
                      {TAG_LABELS[photo.tag]}
                    </span>
                  )}

                  {/* Upload status indicator */}
                  {photo.status === "pending" && (
                    <span className="absolute bottom-1.5 right-1.5 h-2 w-2 rounded-full bg-amber-400 ring-2 ring-background" />
                  )}
                  {photo.status === "failed" && (
                    <span className="absolute bottom-1.5 right-1.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-background" />
                  )}

                  {/* Expand overlay on hover/focus */}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 group-focus-visible:bg-black/30 transition-colors">
                    <ExpandIcon className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity drop-shadow" />
                  </div>
                </button>
              )
            })}
          </div>

          {/* Upload status legend */}
          {photos?.some((p) => p.status === "pending") && (
            <p className="text-xs text-muted-foreground/60 flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-amber-400 inline-block" />
              Pending upload
              {photos.some((p) => p.status === "failed") && (
                <>
                  <span className="h-2 w-2 rounded-full bg-red-500 inline-block ml-2" />
                  Upload failed
                </>
              )}
            </p>
          )}
        </div>
      )}

      {/* ── Full-size photo viewer modal ────────────────────────────────────── */}
      {viewingPhoto && viewingObjectUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={handleCloseViewer}
          role="dialog"
          aria-modal="true"
          aria-label="Photo viewer"
        >
          <div
            className="relative max-w-full max-h-full flex flex-col gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <div className="flex items-center justify-between">
              {viewingPhoto.tag ? (
                <span
                  className={cn(
                    "rounded-full border px-3 py-1 text-sm font-medium",
                    TAG_COLORS[viewingPhoto.tag]
                  )}
                >
                  {TAG_LABELS[viewingPhoto.tag]}
                </span>
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={handleCloseViewer}
                className="ml-auto flex items-center justify-center h-10 w-10 rounded-full bg-white/10 text-white cursor-pointer hover:bg-white/20 transition-colors"
                aria-label="Close photo viewer"
              >
                <XIcon className="h-5 w-5" />
              </button>
            </div>

            {/* Full-size image */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={viewingObjectUrl}
              alt=""
              className="max-w-full max-h-[80dvh] object-contain rounded-xl"
            />
          </div>
        </div>
      )}
    </div>
  )
}
