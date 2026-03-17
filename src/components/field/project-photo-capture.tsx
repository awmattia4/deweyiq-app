"use client"

/**
 * ProjectPhotoCapture — camera integration for project photos with auto-context tagging.
 *
 * Auto-fills project_id, phase_id, task_id from the current context (which project/phase/task
 * the tech is viewing). Tech selects tag from a quick-select bar (Before | During | After | Issue).
 *
 * Uses Dexie projectPhotoQueue for offline-first storage (same blob-not-indexed pattern as
 * the service visit PhotoCapture component).
 *
 * Phase 12 Plan 12 (PROJ-50)
 */

import { useRef, useState, useCallback, useEffect } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import imageCompression from "browser-image-compression"
import { CameraIcon, TagIcon, AlertTriangleIcon, ExpandIcon, XIcon } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { offlineDb } from "@/lib/offline/db"
import type { ProjectPhotoQueueItem } from "@/lib/offline/db"
import { createPhotoUploadUrl } from "@/actions/storage"
import { uploadProjectPhoto } from "@/actions/projects-field"
import { useOnlineStatus } from "@/hooks/use-online-status"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ProjectPhotoTag = "before" | "during" | "after" | "issue"

const TAG_LABELS: Record<ProjectPhotoTag, string> = {
  before: "Before",
  during: "During",
  after: "After",
  issue: "Issue",
}

const TAG_COLORS: Record<ProjectPhotoTag, string> = {
  before: "bg-blue-500/20 text-blue-400 border-blue-500/40",
  during: "bg-purple-500/20 text-purple-400 border-purple-500/40",
  after: "bg-green-500/20 text-green-400 border-green-500/40",
  issue: "bg-red-500/20 text-red-400 border-red-500/40",
}

interface ProjectPhotoCaptureProps {
  projectId: string
  phaseId: string
  taskId?: string | null
  orgId: string
}

// ---------------------------------------------------------------------------
// Photo sync processor
// ---------------------------------------------------------------------------

async function processProjectPhotoQueue(orgId: string): Promise<void> {
  const pending = await offlineDb.projectPhotoQueue
    .where("status")
    .equals("pending")
    .and((item) => item.orgId === orgId)
    .toArray()

  for (const item of pending) {
    if (!item.id) continue

    try {
      const fileName = `project-photo-${item.id}-${Date.now()}.webp`
      // Use a projects-specific storage path
      const result = await createPhotoUploadUrl(
        orgId,
        `projects/${item.projectId}`,
        fileName
      )

      if (!result) {
        await offlineDb.projectPhotoQueue.update(item.id, { status: "failed" })
        continue
      }

      const uploadResponse = await fetch(result.signedUrl, {
        method: "PUT",
        body: item.blob,
        headers: { "Content-Type": "image/webp" },
      })

      if (uploadResponse.ok) {
        // Save photo record to server
        if (item.tag) {
          await uploadProjectPhoto({
            projectId: item.projectId,
            phaseId: item.phaseId ?? "",
            taskId: item.taskId ?? undefined,
            tag: item.tag as "before" | "during" | "after" | "issue",
            caption: item.caption,
            filePath: result.path,
          }).catch(() => {}) // non-fatal — storage path is saved either way
        }

        await offlineDb.projectPhotoQueue.update(item.id, {
          status: "uploaded",
          storagePath: result.path,
        })
      } else {
        await offlineDb.projectPhotoQueue.update(item.id, { status: "failed" })
      }
    } catch (err) {
      console.error("[projectPhotos] Upload error for photo", item.id, err)
      await offlineDb.projectPhotoQueue.update(item.id, { status: "failed" })
    }
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProjectPhotoCapture({
  projectId,
  phaseId,
  taskId,
  orgId,
}: ProjectPhotoCaptureProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isOnline = useOnlineStatus()

  // ── State ──────────────────────────────────────────────────────────────────
  const [isCompressing, setIsCompressing] = useState(false)
  const [tagPendingId, setTagPendingId] = useState<number | null>(null)
  const [tagDismissTimer, setTagDismissTimer] = useState<ReturnType<typeof setTimeout> | null>(null)
  const [viewingPhoto, setViewingPhoto] = useState<ProjectPhotoQueueItem | null>(null)
  const [viewingObjectUrl, setViewingObjectUrl] = useState<string | null>(null)

  // ── Live query — project photos for this phase ─────────────────────────────
  const photos = useLiveQuery(
    () =>
      offlineDb.projectPhotoQueue
        .where("phaseId")
        .equals(phaseId)
        .sortBy("createdAt"),
    [phaseId]
  )

  // Thumbnail object URLs
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<number, string>>({})

  useEffect(() => {
    if (!photos) return

    const newUrls: Record<number, string> = {}
    for (const photo of photos) {
      if (!photo.id) continue
      if (thumbnailUrls[photo.id]) {
        newUrls[photo.id] = thumbnailUrls[photo.id]
      } else {
        newUrls[photo.id] = URL.createObjectURL(photo.blob)
      }
    }

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

  // ── Process queue on connectivity return ───────────────────────────────────
  useEffect(() => {
    if (isOnline) {
      void processProjectPhotoQueue(orgId)
    }
  }, [isOnline, orgId])

  // ── Tag selector auto-dismiss ──────────────────────────────────────────────
  const startTagDismissTimer = useCallback(
    (photoId: number) => {
      if (tagDismissTimer) clearTimeout(tagDismissTimer)
      const timer = setTimeout(() => {
        setTagPendingId(null)
        setTagDismissTimer(null)
        void processProjectPhotoQueue(orgId)
      }, 4000)
      setTagDismissTimer(timer)
    },
    [tagDismissTimer, orgId]
  )

  // ── Camera capture handler ──────────────────────────────────────────────────
  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return

      e.target.value = ""
      setIsCompressing(true)

      try {
        const compressed = await imageCompression(file, {
          maxSizeMB: 0.3,
          maxWidthOrHeight: 1200,
          useWebWorker: true,
          fileType: "image/webp",
          initialQuality: 0.8,
        })

        const queueItem: Omit<ProjectPhotoQueueItem, "id"> = {
          projectId,
          phaseId,
          taskId: taskId ?? null,
          orgId,
          blob: compressed,
          tag: null,
          status: "pending",
          createdAt: Date.now(),
        }

        const newId = await offlineDb.projectPhotoQueue.add(queueItem)

        setTagPendingId(newId as number)
        startTagDismissTimer(newId as number)
      } catch (err) {
        console.error("[projectPhotos] Compression failed:", err)
        toast.error("Failed to compress photo")
      } finally {
        setIsCompressing(false)
      }
    },
    [projectId, phaseId, taskId, orgId, startTagDismissTimer]
  )

  // ── Tag selection handler ──────────────────────────────────────────────────
  const handleTagSelect = useCallback(
    async (photoId: number, tag: ProjectPhotoTag | null) => {
      if (tagDismissTimer) {
        clearTimeout(tagDismissTimer)
        setTagDismissTimer(null)
      }
      setTagPendingId(null)

      if (tag) {
        await offlineDb.projectPhotoQueue.update(photoId, { tag })
      }

      if (isOnline) {
        void processProjectPhotoQueue(orgId)
      }
    },
    [tagDismissTimer, isOnline, orgId]
  )

  // ── Photo viewer ───────────────────────────────────────────────────────────
  const handleViewPhoto = useCallback((photo: ProjectPhotoQueueItem) => {
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

  const photoCount = photos?.length ?? 0

  return (
    <div className="flex flex-col gap-4">
      {/* Camera button */}
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
          aria-label="Take project photo"
        >
          <CameraIcon
            className={cn("h-7 w-7 shrink-0", isCompressing && "animate-pulse")}
          />
          <span>{isCompressing ? "Compressing..." : "Tap to take photo"}</span>
        </button>

        {!isOnline && (
          <p className="text-xs text-amber-400/80 text-center">
            Offline — photos will upload when connectivity returns
          </p>
        )}
      </div>

      {/* Tag selector overlay — auto-dismisses in 4s */}
      {tagPendingId !== null && (
        <div className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <TagIcon className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">Tag this photo</p>
            <span className="ml-auto text-xs text-muted-foreground/60">auto-skip in 4s</span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {(Object.keys(TAG_LABELS) as ProjectPhotoTag[]).map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => handleTagSelect(tagPendingId, tag)}
                className={cn(
                  "rounded-full border px-3 min-h-[44px] text-sm font-medium transition-all cursor-pointer",
                  "hover:opacity-80 active:scale-95",
                  TAG_COLORS[tag]
                )}
              >
                {TAG_LABELS[tag]}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => handleTagSelect(tagPendingId, null)}
            className="rounded-full border border-border/50 bg-muted/30 px-4 min-h-[44px] text-sm font-medium text-muted-foreground transition-all cursor-pointer hover:opacity-80 active:scale-95"
          >
            Skip tag
          </button>
        </div>
      )}

      {/* Photo grid */}
      {photoCount > 0 && (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium text-foreground">
            Photos{" "}
            <span className="text-muted-foreground font-normal">({photoCount})</span>
          </p>

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
                  className="relative aspect-square rounded-xl overflow-hidden border border-border/40 bg-muted/20 cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring animate-in fade-in-0 duration-200"
                  aria-label={`View photo${photo.tag ? ` tagged ${photo.tag}` : ""}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={thumbUrl} alt="" className="w-full h-full object-cover" />

                  {photo.tag && (
                    <span
                      className={cn(
                        "absolute top-1.5 left-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-tight",
                        TAG_COLORS[photo.tag]
                      )}
                    >
                      {TAG_LABELS[photo.tag as ProjectPhotoTag]}
                    </span>
                  )}

                  {photo.status === "pending" && (
                    <span className="absolute bottom-1.5 right-1.5 h-2 w-2 rounded-full bg-amber-400 ring-2 ring-background" />
                  )}
                  {photo.status === "failed" && (
                    <span className="absolute bottom-1.5 right-1.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-background" />
                  )}

                  <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 group-focus-visible:bg-black/30 transition-colors">
                    <ExpandIcon className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity drop-shadow" />
                  </div>
                </button>
              )
            })}
          </div>

          {photos?.some((p) => p.status === "pending") && (
            <p className="text-xs text-muted-foreground/60 flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-amber-400 inline-block" />
              Pending upload
              {photos.some((p) => p.status === "failed") && (
                <>
                  <span className="h-2 w-2 rounded-full bg-red-500 inline-block ml-2" />
                  <AlertTriangleIcon className="h-3 w-3" />
                  Upload failed
                </>
              )}
            </p>
          )}
        </div>
      )}

      {/* Full-size photo viewer */}
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
            <div className="flex items-center justify-between">
              {viewingPhoto.tag ? (
                <span
                  className={cn(
                    "rounded-full border px-3 py-1 text-sm font-medium",
                    TAG_COLORS[viewingPhoto.tag as ProjectPhotoTag]
                  )}
                >
                  {TAG_LABELS[viewingPhoto.tag as ProjectPhotoTag]}
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
