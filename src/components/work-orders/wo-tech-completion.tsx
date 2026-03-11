"use client"

import { useRef, useState, useCallback, useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  CheckCircle2Icon,
  PlayCircleIcon,
  CameraIcon,
  ClockIcon,
  PlusIcon,
  XIcon,
  ExpandIcon,
  MicIcon,
  WrenchIcon,
} from "lucide-react"
import imageCompression from "browser-image-compression"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import {
  updateWorkOrderStatus,
  addLineItemToWorkOrder,
  updateLineItemActualHours,
  type WorkOrderDetail,
  type WorkOrderLineItem,
} from "@/actions/work-orders"
import { createWoPhotoUploadUrl } from "@/actions/storage"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LocalPhoto {
  id: string
  blob: Blob
  objectUrl: string
  status: "pending" | "uploaded" | "failed"
  storagePath?: string
}

interface AdHocPart {
  id: string          // client-generated
  description: string
  quantity: string
  saveToCatalog: boolean
}

interface WoTechCompletionProps {
  workOrder: WorkOrderDetail
  orgId: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCategory(cat: string): string {
  const map: Record<string, string> = {
    pump: "Pump",
    filter: "Filter",
    heater: "Heater",
    plumbing_leak: "Plumbing / Leak",
    surface: "Surface",
    electrical: "Electrical",
    other: "Other",
  }
  return map[cat] ?? cat
}

function formatStatus(status: string): string {
  const map: Record<string, string> = {
    draft: "Draft",
    quoted: "Quoted",
    approved: "Approved",
    scheduled: "Scheduled",
    in_progress: "In Progress",
    complete: "Complete",
    invoiced: "Invoiced",
    cancelled: "Cancelled",
  }
  return map[status] ?? status
}

function statusColor(status: string): string {
  switch (status) {
    case "scheduled":
      return "bg-blue-500/15 text-blue-300 border-blue-500/30"
    case "in_progress":
      return "bg-amber-500/15 text-amber-300 border-amber-500/30"
    case "complete":
      return "bg-green-500/15 text-green-300 border-green-500/30"
    default:
      return "bg-muted/30 text-muted-foreground border-border/50"
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * WoTechCompletion — tech-facing work order arrival and completion flow.
 *
 * Shows for WOs with status 'scheduled' or 'in_progress' assigned to the
 * current tech. Renders:
 * - Arrival flow (scheduled → in_progress): "Mark Arrived" button
 * - Completion flow (in_progress → complete): photos, notes, actual hours,
 *   ad-hoc parts, "Mark Complete" button
 *
 * All photo uploads go to work-order-photos/{orgId}/work-orders/{woId}/completion/
 */
export function WoTechCompletion({ workOrder, orgId }: WoTechCompletionProps) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Arrival state ──────────────────────────────────────────────────────────
  const [isMarkingArrived, setIsMarkingArrived] = useState(false)

  // ── Completion form state ──────────────────────────────────────────────────
  const [completionNotes, setCompletionNotes] = useState("")
  const [photos, setPhotos] = useState<LocalPhoto[]>([])
  const [viewingPhoto, setViewingPhoto] = useState<LocalPhoto | null>(null)
  const [isCompressing, setIsCompressing] = useState(false)
  const [isCompleting, setIsCompleting] = useState(false)

  // ── Actual hours state (per labor line item) ───────────────────────────────
  // Map from lineItemId → local string value (local state, flushed on blur)
  const [actualHoursMap, setActualHoursMap] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {}
    for (const li of workOrder.lineItems) {
      if (li.item_type === "labor" && li.labor_type === "hourly") {
        map[li.id] = li.actual_hours ?? ""
      }
    }
    return map
  })

  // ── Ad-hoc parts state ─────────────────────────────────────────────────────
  const [adHocParts, setAdHocParts] = useState<AdHocPart[]>([])
  const [showAddPart, setShowAddPart] = useState(false)
  const [newPartDesc, setNewPartDesc] = useState("")
  const [newPartQty, setNewPartQty] = useState("1")
  const [newPartSave, setNewPartSave] = useState(false)

  // ── Cleanup object URLs on unmount ─────────────────────────────────────────
  useEffect(() => {
    return () => {
      photos.forEach((p) => URL.revokeObjectURL(p.objectUrl))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Derived state ──────────────────────────────────────────────────────────
  const isScheduled = workOrder.status === "scheduled"
  const isInProgress = workOrder.status === "in_progress"
  const laborLineItems = workOrder.lineItems.filter(
    (li) => li.item_type === "labor" && li.labor_type === "hourly"
  )

  // ── Mark Arrived ──────────────────────────────────────────────────────────

  const handleMarkArrived = useCallback(async () => {
    setIsMarkingArrived(true)
    try {
      const result = await updateWorkOrderStatus(workOrder.id, "in_progress")
      if (!result.success) {
        toast.error(result.error ?? "Failed to update status")
        return
      }
      toast.success("Marked as arrived", {
        description: workOrder.title,
      })
      router.refresh()
    } catch (err) {
      console.error("[WoTechCompletion] Mark arrived error:", err)
      toast.error("Something went wrong")
    } finally {
      setIsMarkingArrived(false)
    }
  }, [workOrder.id, workOrder.title, router])

  // ── Actual hours handlers ─────────────────────────────────────────────────

  const handleHoursChange = useCallback((lineItemId: string, value: string) => {
    // Allow partial numbers (e.g. "2." while typing) — only flush complete numbers
    setActualHoursMap((prev) => ({ ...prev, [lineItemId]: value }))
  }, [])

  const handleHoursBlur = useCallback(
    async (lineItemId: string) => {
      const raw = actualHoursMap[lineItemId] ?? ""
      const parsed = parseFloat(raw)
      if (isNaN(parsed) || parsed < 0) return

      const normalized = parsed.toFixed(2)
      setActualHoursMap((prev) => ({ ...prev, [lineItemId]: normalized }))

      const result = await updateLineItemActualHours(lineItemId, normalized)
      if (!result.success) {
        toast.error("Failed to save hours")
      }
    },
    [actualHoursMap]
  )

  // ── Ad-hoc part handlers ──────────────────────────────────────────────────

  const handleAddPart = useCallback(async () => {
    if (!newPartDesc.trim()) return

    const partId = crypto.randomUUID()
    const newPart: AdHocPart = {
      id: partId,
      description: newPartDesc.trim(),
      quantity: newPartQty || "1",
      saveToCatalog: newPartSave,
    }

    // Immediately persist to server
    const result = await addLineItemToWorkOrder(workOrder.id, {
      description: newPart.description,
      itemType: "part",
      quantity: newPart.quantity,
      unit: "each",
      isTaxable: true,
      isOptional: false,
    })

    if (!result.success) {
      toast.error(result.error ?? "Failed to add part")
      return
    }

    setAdHocParts((prev) => [...prev, newPart])
    setNewPartDesc("")
    setNewPartQty("1")
    setNewPartSave(false)
    setShowAddPart(false)
    toast.success("Part added")
  }, [workOrder.id, newPartDesc, newPartQty, newPartSave])

  const handleRemoveAdHocPart = useCallback((partId: string) => {
    setAdHocParts((prev) => prev.filter((p) => p.id !== partId))
  }, [])

  // ── Photo capture ─────────────────────────────────────────────────────────

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

        const photoId = crypto.randomUUID()
        const objectUrl = URL.createObjectURL(compressed)
        setPhotos((prev) => [
          ...prev,
          { id: photoId, blob: compressed, objectUrl, status: "pending" },
        ])
      } catch (err) {
        console.error("[WoTechCompletion] Photo compression failed:", err)
        toast.error("Failed to process photo")
      } finally {
        setIsCompressing(false)
      }
    },
    []
  )

  const removePhoto = useCallback((photoId: string) => {
    setPhotos((prev) => {
      const photo = prev.find((p) => p.id === photoId)
      if (photo) URL.revokeObjectURL(photo.objectUrl)
      return prev.filter((p) => p.id !== photoId)
    })
  }, [])

  // ── Photo upload ──────────────────────────────────────────────────────────

  const uploadCompletionPhotos = useCallback(async (): Promise<string[]> => {
    const storagePaths: string[] = []

    for (const photo of photos) {
      try {
        const fileName = `photo-${photo.id}.webp`
        const result = await createWoPhotoUploadUrl(orgId, workOrder.id, fileName, "completion")
        if (!result) continue

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
      } catch {
        setPhotos((prev) =>
          prev.map((p) =>
            p.id === photo.id ? { ...p, status: "failed" } : p
          )
        )
      }
    }

    return storagePaths
  }, [photos, orgId, workOrder.id])

  // ── Mark Complete ─────────────────────────────────────────────────────────

  const handleMarkComplete = useCallback(async () => {
    setIsCompleting(true)
    try {
      // Upload photos first
      let completionPhotoPaths: string[] = []
      if (photos.length > 0 && navigator.onLine) {
        completionPhotoPaths = await uploadCompletionPhotos()
      }

      const result = await updateWorkOrderStatus(workOrder.id, "complete", {
        completionNotes: completionNotes.trim() || undefined,
        completionPhotoPaths: completionPhotoPaths.length > 0 ? completionPhotoPaths : undefined,
      })

      if (!result.success) {
        toast.error(result.error ?? "Failed to complete work order")
        return
      }

      toast.success("Work order completed", {
        description: workOrder.title,
      })

      router.push("/work-orders")
    } catch (err) {
      console.error("[WoTechCompletion] Complete error:", err)
      toast.error("Something went wrong")
    } finally {
      setIsCompleting(false)
    }
  }, [
    workOrder.id,
    workOrder.title,
    completionNotes,
    photos.length,
    uploadCompletionPhotos,
    router,
  ])

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-0 min-h-screen bg-background">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="px-4 pt-5 pb-4 border-b border-border/60">
        <div className="flex items-start justify-between gap-3 mb-2">
          <h1 className="text-lg font-semibold text-foreground leading-tight">
            {workOrder.title}
          </h1>
          <span
            className={cn(
              "shrink-0 text-xs font-medium px-2.5 py-1 rounded-full border",
              statusColor(workOrder.status)
            )}
          >
            {formatStatus(workOrder.status)}
          </span>
        </div>

        <div className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground">
            {workOrder.customerName}
            {workOrder.poolName && (
              <span className="text-muted-foreground/60"> · {workOrder.poolName}</span>
            )}
          </p>
          <p className="text-xs text-muted-foreground/60">
            {formatCategory(workOrder.category)}
            {workOrder.target_date && (
              <> · Target: {workOrder.target_date}</>
            )}
          </p>
        </div>
      </div>

      {/* ── WO Description ──────────────────────────────────────────────────── */}
      {workOrder.description && (
        <div className="px-4 py-3 border-b border-border/40 bg-muted/10">
          <p className="text-sm text-muted-foreground leading-relaxed">
            {workOrder.description}
          </p>
        </div>
      )}

      {/* ── Arrival section (scheduled only) ───────────────────────────────── */}
      {isScheduled && (
        <div className="flex flex-col gap-3 px-4 py-5">
          <div className="flex items-center gap-2">
            <PlayCircleIcon className="h-4 w-4 text-blue-400" />
            <span className="text-sm font-semibold text-foreground">Ready to start?</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Tap "Mark Arrived" to begin the work order. The status will change to In Progress
            and the activity log will record your arrival time.
          </p>
          <Button
            className="w-full h-12 text-base font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
            onClick={handleMarkArrived}
            disabled={isMarkingArrived}
          >
            <PlayCircleIcon className="h-5 w-5 mr-2" />
            {isMarkingArrived ? "Marking arrived…" : "Mark Arrived"}
          </Button>
        </div>
      )}

      {/* ── Completion form (in_progress only) ─────────────────────────────── */}
      {isInProgress && (
        <div className="flex flex-col gap-0 pb-32">
          {/* ── Line items ───────────────────────────────────────────────── */}
          {workOrder.lineItems.length > 0 && (
            <section className="px-4 py-4 border-b border-border/40">
              <div className="flex items-center gap-2 mb-3">
                <WrenchIcon className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold text-foreground">Work Items</span>
              </div>
              <div className="flex flex-col gap-2">
                {workOrder.lineItems.map((li) => (
                  <LineItemRow
                    key={li.id}
                    lineItem={li}
                    actualHours={actualHoursMap[li.id]}
                    onHoursChange={handleHoursChange}
                    onHoursBlur={handleHoursBlur}
                  />
                ))}
              </div>
            </section>
          )}

          {/* ── Ad-hoc parts ─────────────────────────────────────────────── */}
          <section className="px-4 py-4 border-b border-border/40">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <PlusIcon className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold text-foreground">Add Parts Used</span>
              </div>
              {!showAddPart && (
                <button
                  type="button"
                  onClick={() => setShowAddPart(true)}
                  className="text-xs text-primary hover:text-primary/80 cursor-pointer font-medium"
                >
                  + Add part
                </button>
              )}
            </div>

            {/* Existing ad-hoc parts */}
            {adHocParts.length > 0 && (
              <div className="flex flex-col gap-2 mb-3">
                {adHocParts.map((part) => (
                  <div
                    key={part.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border/40 bg-muted/10 px-3 py-2.5"
                  >
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm text-foreground truncate">{part.description}</span>
                      <span className="text-xs text-muted-foreground">Qty: {part.quantity}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveAdHocPart(part.id)}
                      className="shrink-0 h-7 w-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/40 cursor-pointer transition-colors"
                    >
                      <XIcon className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add part form */}
            {showAddPart && (
              <div className="flex flex-col gap-3 rounded-xl border border-border/50 bg-muted/10 p-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Part description
                  </label>
                  <input
                    type="text"
                    value={newPartDesc}
                    onChange={(e) => setNewPartDesc(e.target.value)}
                    placeholder="e.g. O-ring kit, pump impeller..."
                    className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex flex-col gap-1.5 w-24">
                    <label className="text-xs font-medium text-muted-foreground">Quantity</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0.01"
                      step="any"
                      value={newPartQty}
                      onChange={(e) => setNewPartQty(e.target.value)}
                      className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <label className="flex items-center gap-2 mt-5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newPartSave}
                      onChange={(e) => setNewPartSave(e.target.checked)}
                      className="h-4 w-4 rounded border-border/60 accent-primary cursor-pointer"
                    />
                    <span className="text-xs text-muted-foreground">Save to catalog</span>
                  </label>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1 h-9 rounded-lg cursor-pointer"
                    onClick={handleAddPart}
                    disabled={!newPartDesc.trim()}
                  >
                    Save Part
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 px-3 rounded-lg cursor-pointer"
                    onClick={() => {
                      setShowAddPart(false)
                      setNewPartDesc("")
                      setNewPartQty("1")
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {adHocParts.length === 0 && !showAddPart && (
              <p className="text-xs text-muted-foreground/60">
                Add any parts used that weren't on the original work order.
              </p>
            )}
          </section>

          {/* ── Completion photos ─────────────────────────────────────────── */}
          <section className="px-4 py-4 border-b border-border/40">
            <div className="flex items-center gap-2 mb-3">
              <CameraIcon className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold text-foreground">Completion Photos</span>
            </div>

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

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isCompressing}
              className={cn(
                "flex items-center justify-center gap-2.5 w-full rounded-xl border-2 border-dashed min-h-[56px] text-sm font-medium cursor-pointer transition-all mb-3",
                isCompressing
                  ? "border-border/30 bg-muted/10 text-muted-foreground cursor-wait"
                  : "border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 hover:border-primary/50 active:scale-[0.99]"
              )}
              aria-label="Add completion photo"
            >
              <CameraIcon className={cn("h-5 w-5 shrink-0", isCompressing && "animate-pulse")} />
              <span>{isCompressing ? "Processing…" : "Add completion photo"}</span>
            </button>

            {photos.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {photos.map((photo) => (
                  <div key={photo.id} className="relative aspect-square">
                    <button
                      type="button"
                      onClick={() => setViewingPhoto(photo)}
                      className="w-full h-full rounded-xl overflow-hidden border border-border/40 bg-muted/20 cursor-pointer group"
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
                      {photo.status === "failed" && (
                        <span className="absolute bottom-1.5 right-1.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-background" />
                      )}
                    </button>
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
          </section>

          {/* ── Completion notes ──────────────────────────────────────────── */}
          <section className="px-4 py-4 border-b border-border/40">
            <label
              htmlFor="wo-completion-notes"
              className="flex items-center gap-2 text-sm font-semibold text-foreground mb-3"
            >
              <WrenchIcon className="h-4 w-4 text-muted-foreground" />
              What was done?
              <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground/60 font-normal">
                <MicIcon className="h-3 w-3" />
                Voice dictation
              </span>
            </label>
            <textarea
              id="wo-completion-notes"
              value={completionNotes}
              onChange={(e) => setCompletionNotes(e.target.value)}
              placeholder="Describe the work completed, parts replaced, anything the office should know..."
              rows={4}
              className="w-full resize-none rounded-xl border border-border/60 bg-muted/20 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </section>
        </div>
      )}

      {/* ── Fixed bottom bar ─────────────────────────────────────────────────── */}
      {isInProgress && (
        <div className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-t border-border/60 safe-area-inset-bottom">
          <Button
            className="w-full h-12 text-base font-semibold rounded-xl bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-900/20 cursor-pointer"
            onClick={handleMarkComplete}
            disabled={isCompleting}
          >
            <CheckCircle2Icon className="h-5 w-5 mr-2" />
            {isCompleting ? "Completing…" : "Mark Complete"}
          </Button>
        </div>
      )}

      {/* ── Photo viewer ─────────────────────────────────────────────────────── */}
      {viewingPhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setViewingPhoto(null)}
          role="dialog"
          aria-modal="true"
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
    </div>
  )
}

// ---------------------------------------------------------------------------
// LineItemRow — renders a single line item with optional actual hours input
// ---------------------------------------------------------------------------

interface LineItemRowProps {
  lineItem: WorkOrderLineItem
  actualHours?: string
  onHoursChange: (lineItemId: string, value: string) => void
  onHoursBlur: (lineItemId: string) => Promise<void>
}

function LineItemRow({ lineItem, actualHours, onHoursChange, onHoursBlur }: LineItemRowProps) {
  const isHourlyLabor = lineItem.item_type === "labor" && lineItem.labor_type === "hourly"

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border/40 bg-muted/10 px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col min-w-0">
          <span className="text-sm text-foreground leading-snug">{lineItem.description}</span>
          <span className="text-xs text-muted-foreground mt-0.5">
            {lineItem.item_type === "labor" ? "Labor" : "Part"}
            {lineItem.labor_type === "flat_rate" && " (flat rate)"}
            {lineItem.labor_type === "hourly" && " (hourly)"}
            {" · "}Qty {lineItem.quantity} {lineItem.unit}
          </span>
        </div>
        {lineItem.unit_price && (
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            ${parseFloat(lineItem.unit_price).toFixed(2)}
          </span>
        )}
      </div>

      {/* Actual hours input for hourly labor items */}
      {isHourlyLabor && (
        <div className="flex items-center gap-2.5 pt-1 border-t border-border/30">
          <ClockIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <label
            htmlFor={`hours-${lineItem.id}`}
            className="text-xs text-muted-foreground whitespace-nowrap"
          >
            Actual hours:
          </label>
          <input
            id={`hours-${lineItem.id}`}
            type="number"
            inputMode="decimal"
            min="0"
            step="0.25"
            value={actualHours ?? ""}
            onChange={(e) => onHoursChange(lineItem.id, e.target.value)}
            onBlur={() => void onHoursBlur(lineItem.id)}
            placeholder="0.00"
            className="w-20 rounded-lg border border-border/60 bg-background px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <span className="text-xs text-muted-foreground">hrs</span>
          {lineItem.actual_hours && (
            <span className="ml-auto text-xs text-green-400 flex items-center gap-1">
              <CheckCircle2Icon className="h-3 w-3" />
              Saved
            </span>
          )}
        </div>
      )}
    </div>
  )
}

