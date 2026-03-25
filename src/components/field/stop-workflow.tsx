"use client"

import { useMemo, useState, useCallback, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  FlaskConicalIcon,
  ClipboardListIcon,
  CameraIcon,
  FileTextIcon,
  PencilIcon,
  SkipForwardIcon,
  AlertTriangleIcon,
  FlagIcon,
  WrenchIcon,
  PackageIcon,
} from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { ChemistryGrid } from "@/components/field/chemistry-grid"
import { ChemistryDosing } from "@/components/field/chemistry-dosing"
import { ChemistryPrediction } from "@/components/field/chemistry-prediction"
import { Checklist } from "@/components/field/checklist"
import { PhotoCapture, processPhotoQueue } from "@/components/field/photo-capture"
import { PhotoDiagnosis } from "@/components/field/photo-diagnosis"
import { NotesField } from "@/components/field/notes-field"
import { InternalNotes } from "@/components/field/internal-notes"
import { VoiceNoteButton } from "@/components/field/voice-note-button"
import type { StructuredVoiceData } from "@/components/field/voice-note-button"
import { CompletionModal, SkipStopDialog, OverrideWarningSheet } from "@/components/field/completion-modal"
import { FlagIssueSheet } from "@/components/work-orders/flag-issue-sheet"
import { InventoryDeductPrompt } from "@/components/field/inventory-deduct-prompt"
import { updateTruckInventoryItem } from "@/actions/truck-inventory"
import { useVisitDraft } from "@/hooks/use-visit-draft"
import { useLiveQuery } from "dexie-react-hooks"
import { offlineDb } from "@/lib/offline/db"
import { enqueueWrite } from "@/lib/offline/sync"
import { completeStop, skipStop, markStopStarted } from "@/actions/visits"
import type { StopContext, CompleteStopWarnings } from "@/actions/visits"
import type { FullChemistryReadings } from "@/lib/chemistry/dosing"
import { logEquipmentReading } from "@/actions/equipment-readings"
import type { EquipmentMetrics } from "@/actions/equipment-readings"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StopWorkflowProps {
  stopId: string
  visitId: string
  context: StopContext
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * StopWorkflow — tab host for Chemistry | Tasks | Photos | Notes.
 *
 * Per locked decisions:
 * - Chemistry is the default active tab
 * - Complete button always visible at the bottom, regardless of active tab
 * - Complete button disabled until at least one chemistry reading or task is completed
 * - After completing a stop: auto-advance to the next stop in the route with a success toast
 * - Techs can skip stops (must provide a reason)
 */
export function StopWorkflow({ stopId, visitId, context }: StopWorkflowProps) {
  const router = useRouter()

  const { draft, isCompleted, updateChemistry, updateChecklist, markAllChecklistComplete, updateNotes, updateInternalNotesDraft, completeDraft, reopenDraft } =
    useVisitDraft(stopId, context.customerId, context.poolId, visitId)

  // ── Modal state ──────────────────────────────────────────────────────────

  const [completionOpen, setCompletionOpen] = useState(false)
  const [skipOpen, setSkipOpen] = useState(false)
  const [flagIssueOpen, setFlagIssueOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)
  const [pendingNav, setPendingNav] = useState<string | null>(null)
  // Warn-but-allow: warnings returned from completeStop when overrideWarnings=false
  const [warnings, setWarnings] = useState<CompleteStopWarnings | null>(null)
  // Phase 13: Inventory deductions from auto-decrement (shown after completion)
  const [deductions, setDeductions] = useState<Array<{ inventoryItemId: string; itemName: string; unit: string; deductedAmount: number; newQuantity: number }> | null>(null)

  // Edit mode is derived from Dexie draft status — NOT React state.
  // This avoids stale closure bugs since useLiveQuery keeps it in sync.
  const isEditMode = draft?.status === "editing"

  const handleReopenDraft = useCallback(async () => {
    await reopenDraft() // sets Dexie status to "editing"
  }, [reopenDraft])

  // Intercept ALL navigation when in edit mode:
  // 1. Browser back / swipe gesture → popstate
  // 2. Sidebar links / any <a> click → capture-phase click listener
  useEffect(() => {
    if (!isEditMode) return

    // ── Popstate: browser back / swipe gesture ──
    window.history.pushState({ stopEditing: true }, "")

    const handlePopState = () => {
      window.history.pushState({ stopEditing: true }, "")
      setPendingNav("/routes")
      setDiscardOpen(true)
    }

    // ── Click capture: intercept all link clicks before Next.js router ──
    const handleClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest("a")
      if (!anchor) return
      const href = anchor.getAttribute("href")
      if (!href || href.startsWith("#")) return
      // Don't intercept external links
      if (href.startsWith("http") && !href.startsWith(window.location.origin)) return

      e.preventDefault()
      e.stopPropagation()
      setPendingNav(href)
      setDiscardOpen(true)
    }

    window.addEventListener("popstate", handlePopState)
    document.addEventListener("click", handleClick, true) // capture phase
    return () => {
      window.removeEventListener("popstate", handlePopState)
      document.removeEventListener("click", handleClick, true)
    }
  }, [isEditMode])

  // ── Mark stop as started (Phase 9: captures started_at for duration metrics) ──
  useEffect(() => {
    if (isCompleted || !context.routeStopId) return
    // Fire-and-forget — failure is non-fatal per markStopStarted's design
    markStopStarted(context.routeStopId).catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Discard edits — revert draft to completed and navigate to intended destination
  const handleDiscardEdits = useCallback(async () => {
    await completeDraft() // sets status back to "completed"
    setDiscardOpen(false)
    const dest = pendingNav ?? "/routes"
    setPendingNav(null)
    router.push(dest)
  }, [completeDraft, router, pendingNav])

  // Keep editing — close dialog and clear pending nav
  const handleKeepEditing = useCallback(() => {
    setDiscardOpen(false)
    setPendingNav(null)
  }, [])

  // ── Wrap updateChecklist to match Checklist component's onUpdate signature ──

  const handleChecklistUpdate = (taskId: string, completed: boolean, notes: string) =>
    updateChecklist(taskId, completed, notes)

  // ── Derive chemistry readings for dosing engine ─────────────────────────

  const chemistryReadings = useMemo((): FullChemistryReadings => {
    const c = draft?.chemistry ?? {}
    return {
      pH: c["pH"] ?? null,
      totalAlkalinity: c["totalAlkalinity"] ?? null,
      calciumHardness: c["calciumHardness"] ?? null,
      cya: c["cya"] ?? null,
      salt: c["salt"] ?? null,
      borate: c["borate"] ?? null,
      temperatureF: c["temperatureF"] ?? null,
      freeChlorine: c["freeChlorine"] ?? null,
      bromine: c["bromine"] ?? null,
      tds: c["tds"] ?? null,
      phosphates: c["phosphates"] ?? null,
    }
  }, [draft?.chemistry])

  // ── Dosing amounts ref — captures latest recs from ChemistryDosing ───────
  // Using a ref instead of state avoids re-renders every time dosing changes.
  // Reading from the ref in executeComplete is synchronous with no stale closure risk.

  const dosingAmountsRef = useRef<Array<{ chemical: string; productId: string; amount: number; unit: string }>>([])

  const handleDosingChange = useCallback((amounts: Array<{ chemical: string; productId: string; amount: number; unit: string }>) => {
    dosingAmountsRef.current = amounts
  }, [])

  // ── Equipment readings ref — captures readings from EquipmentReadingsSection ──
  // Populated when tech confirms completion via CompletionModal.
  // Logged after stop completes (fire-and-forget — non-fatal).
  const equipmentReadingsRef = useRef<Record<string, EquipmentMetrics>>({})

  // ── Minimum data check for enabling Complete button ─────────────────────

  const hasMinimumData = useMemo(() => {
    if (!draft) return false
    const hasChemistryReading = Object.values(draft.chemistry).some(
      (v) => v !== null && v !== undefined
    )
    const hasCompletedTask = draft.checklist.some((t) => t.completed)
    return hasChemistryReading || hasCompletedTask
  }, [draft])

  // ── Photo count — live query for summary in completion modal ────────────

  const photoCount = useLiveQuery(
    () =>
      offlineDb.photoQueue
        .where("visitId")
        .equals(visitId)
        .count(),
    [visitId],
    0
  )

  // ── Latest uploaded photo — used for AI photo diagnosis ──────────────────
  // Only uploaded photos have a storagePath we can pass to the AI vision API.
  const latestUploadedPhoto = useLiveQuery(
    () =>
      offlineDb.photoQueue
        .where("visitId")
        .equals(visitId)
        .and((item) => item.status === "uploaded")
        .sortBy("createdAt")
        .then((items) => items[items.length - 1] ?? null),
    [visitId],
    null
  )

  // ── Voice note structured data handler ────────────────────────────────────
  // Merges AI-extracted fields into the draft without overwriting unrelated data.
  const handleVoiceStructured = useCallback(
    (data: StructuredVoiceData) => {
      // Apply chemistry readings
      if (data.chemistryReadings && Object.keys(data.chemistryReadings).length > 0) {
        for (const [key, value] of Object.entries(data.chemistryReadings)) {
          updateChemistry(key, value)
        }
      }
      // Apply notes (append if existing notes present)
      if (data.notes) {
        const existingNotes = draft?.notes ?? ""
        const newNotes = existingNotes
          ? `${existingNotes}\n\n${data.notes}`
          : data.notes
        updateNotes(newNotes)
      }
      // Apply checklist updates
      if (data.checklistUpdates && data.checklistUpdates.length > 0) {
        for (const update of data.checklistUpdates) {
          updateChecklist(update.taskId, update.completed, update.notes ?? "")
        }
      }
    },
    [draft?.notes, updateChemistry, updateNotes, updateChecklist]
  )

  // ── Get uploaded photo storage paths for saving with the visit ──────────

  const getUploadedPhotoPaths = useCallback(async (): Promise<string[]> => {
    const uploaded = await offlineDb.photoQueue
      .where("visitId")
      .equals(visitId)
      .and((item) => item.status === "uploaded")
      .toArray()
    return uploaded
      .map((item) => item.storagePath)
      .filter(Boolean) as string[]
  }, [visitId])

  // ── Complete stop handler (shared logic) ────────────────────────────────

  const executeComplete = useCallback(
    async (overrideWarnings: boolean) => {
      if (!draft) return
      const wasEditing = draft.status === "editing"
      setIsSubmitting(true)

      try {
        // Flush any pending photo uploads before reading paths —
        // without this, photos still uploading at completion time get silently dropped.
        if (typeof navigator !== "undefined" && navigator.onLine) {
          await processPhotoQueue(visitId, context.orgId)
        }

        const photoStoragePaths = await getUploadedPhotoPaths()

        // Use draft.id (original visitId) so re-completion updates the same
        // server row via onConflictDoUpdate instead of creating a duplicate.
        const effectiveVisitId = draft.id ?? visitId
        const completionData = {
          visitId: effectiveVisitId,
          customerId: context.customerId,
          poolId: context.poolId,
          chemistry: draft.chemistry,
          checklist: draft.checklist,
          notes: draft.notes,
          photoStoragePaths,
          overrideWarnings,
          dosingAmounts: dosingAmountsRef.current.length > 0 ? dosingAmountsRef.current : undefined,
          internalNotes: draft.internalNotes || undefined,
          internalFlags: draft.internalFlags && draft.internalFlags.length > 0 ? draft.internalFlags : undefined,
        }

        if (typeof navigator !== "undefined" && navigator.onLine) {
          // Online: call server action directly
          const result = await completeStop(completionData)

          // Warn-but-allow: server returned missing requirements → show override sheet
          if (!result.success && result.warnings) {
            setWarnings(result.warnings)
            setCompletionOpen(false)
            return
          }

          if (!result.success) {
            throw new Error(result.error ?? "Failed to complete stop")
          }

          // Phase 13: Capture inventory deductions for confirmation prompt
          if (result.deductions && result.deductions.length > 0) {
            setDeductions(result.deductions)
          }
        } else {
          // Offline: enqueue to sync queue — replayed via POST /api/visits/complete
          await enqueueWrite("/api/visits/complete", "POST", completionData)
        }

        // Clear any previously shown warnings
        setWarnings(null)

        // Mark draft as completed and clean up Dexie draft
        await completeDraft()

        // Log equipment readings — fire-and-forget, non-fatal
        // Only when online (offline sync for equipment readings is not supported in Phase 10)
        if (typeof navigator !== "undefined" && navigator.onLine) {
          const readings = equipmentReadingsRef.current
          const equipmentEntries = Object.entries(readings).filter(
            ([, metrics]) => Object.keys(metrics).length > 0
          )
          for (const [equipmentId, metrics] of equipmentEntries) {
            // Find pool_id for this equipment piece from context
            const equipItem = context.poolEquipment?.find((e) => e.id === equipmentId)
            if (equipItem) {
              // Async fire-and-forget — log failure silently
              logEquipmentReading(equipmentId, context.poolId, metrics, effectiveVisitId).catch(
                (err) => console.warn("[StopWorkflow] Equipment reading log failed:", err)
              )
            }
          }
          // Clear the ref after logging
          equipmentReadingsRef.current = {}
        }

        // Clean up uploaded photo queue items (they're now saved to the visit)
        const uploadedPhotos = await offlineDb.photoQueue
          .where("visitId")
          .equals(effectiveVisitId)
          .and((item) => item.status === "uploaded")
          .toArray()
        await offlineDb.photoQueue.bulkDelete(
          uploadedPhotos.map((p) => p.id!).filter(Boolean)
        )

        setCompletionOpen(false)

        toast.success(wasEditing ? "Stop updated!" : "Stop completed!", {
          description: `${context.customerName} — ${context.poolName}`,
        })

        router.push("/routes")
      } catch (err) {
        console.error("[StopWorkflow] Complete stop error:", err)
        toast.error(wasEditing ? "Failed to update stop" : "Failed to save stop", {
          description:
            err instanceof Error ? err.message : "Please try again.",
        })
      } finally {
        setIsSubmitting(false)
      }
    },
    [
      draft,
      visitId,
      context.customerId,
      context.poolId,
      context.poolEquipment,
      context.customerName,
      context.poolName,
      getUploadedPhotoPaths,
      completeDraft,
      router,
    ]
  )

  // ── First attempt: check requirements before completing ──────────────────

  const handleConfirmComplete = useCallback(async (equipmentReadings: Record<string, EquipmentMetrics>) => {
    // Store equipment readings in ref before executing so executeComplete can access them
    equipmentReadingsRef.current = equipmentReadings
    await executeComplete(false)
  }, [executeComplete])

  // ── Override: tech chose to complete despite missing required data ────────

  const handleCompleteAnyway = useCallback(async () => {
    await executeComplete(true)
  }, [executeComplete])

  // ── Skip stop handler ─────────────────────────────────────────────────────

  const handleConfirmSkip = useCallback(
    async (reason: string) => {
      setIsSubmitting(true)
      try {
        const result = await skipStop({
          visitId,
          customerId: context.customerId,
          poolId: context.poolId,
          skipReason: reason,
        })

        if (!result.success) {
          throw new Error(result.error ?? "Failed to skip stop")
        }

        // Mark draft as completed so it doesn't re-appear
        await completeDraft()
        setSkipOpen(false)

        toast("Stop skipped", {
          description: `Reason: ${reason}`,
        })

        router.push("/routes")
      } catch (err) {
        console.error("[StopWorkflow] Skip stop error:", err)
        toast.error("Failed to skip stop", {
          description:
            err instanceof Error ? err.message : "Please try again.",
        })
      } finally {
        setIsSubmitting(false)
      }
    },
    [
      visitId,
      context.customerId,
      context.poolId,
      completeDraft,
      router,
    ]
  )

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      <div className="flex flex-col min-h-[calc(100dvh-4rem)]">
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-border/60">
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11 shrink-0 cursor-pointer"
            onClick={() => {
              if (isEditMode) {
                setDiscardOpen(true)
              } else {
                router.push("/routes")
              }
            }}
            aria-label="Back to routes"
          >
            <ArrowLeftIcon className="h-5 w-5" />
          </Button>
          <div className="min-w-0">
            <h1 className="font-semibold text-base leading-tight truncate">
              {context.customerName}
            </h1>
            <p className="text-sm text-muted-foreground truncate">
              {context.poolName}
              {context.serviceTypeName && (
                <span className="ml-1 opacity-70">· {context.serviceTypeName}</span>
              )}
            </p>
          </div>
        </div>

        {/* ── Completed banner ──────────────────────────────────────────── */}
        {isCompleted && (
          <div className="flex items-center gap-2 px-4 py-2.5 bg-green-500/10 border-b border-green-500/20">
            <CheckCircleIcon className="h-4 w-4 text-green-400 shrink-0" />
            <span className="text-sm font-medium text-green-400">
              Stop completed
            </span>
          </div>
        )}

        {/* ── Phase 13: Inventory deduction confirmation ──────────────────── */}
        {deductions && deductions.length > 0 && (
          <div className="px-4 pt-3">
            <InventoryDeductPrompt
              deductions={deductions}
              onConfirm={async (adjustments) => {
                // Apply any adjustments the tech made
                for (const adj of adjustments) {
                  const original = deductions.find((d) => d.inventoryItemId === adj.inventoryItemId)
                  if (original && adj.adjustedAmount !== original.deductedAmount) {
                    // Difference between what was auto-deducted and what tech says they used
                    const diff = original.deductedAmount - adj.adjustedAmount
                    if (diff !== 0) {
                      try {
                        // Add back the difference (positive diff = used less than deducted)
                        await updateTruckInventoryItem(adj.inventoryItemId, {
                          quantity: original.newQuantity + diff,
                        })
                      } catch (err) {
                        console.error("[StopWorkflow] Failed to adjust inventory:", err)
                      }
                    }
                  }
                }
                setDeductions(null)
                toast("Inventory confirmed")
              }}
              onDismiss={() => {
                setDeductions(null)
              }}
            />
          </div>
        )}

        {/* ── Work order instructions banner ─────────────────────────────── */}
        {context.workOrder && (
          <div className="border-b border-amber-500/20 bg-amber-500/5 px-4 py-3 space-y-2">
            <div className="flex items-center gap-2">
              <WrenchIcon className="h-4 w-4 text-amber-400 shrink-0" />
              <span className="text-sm font-semibold text-amber-300 truncate">
                {context.workOrder.title}
              </span>
              <span className="inline-flex shrink-0 items-center rounded-full bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[10px] font-medium text-amber-300 leading-none capitalize">
                {context.workOrder.category}
              </span>
              {context.workOrder.priority !== "normal" && (
                <span className={cn(
                  "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-medium leading-none capitalize",
                  context.workOrder.priority === "urgent"
                    ? "bg-red-500/15 border border-red-500/30 text-red-300"
                    : "bg-blue-500/15 border border-blue-500/30 text-blue-300"
                )}>
                  {context.workOrder.priority}
                </span>
              )}
            </div>
            {context.workOrder.description && (
              <p className="text-sm text-amber-200/80 leading-relaxed whitespace-pre-line">
                {context.workOrder.description}
              </p>
            )}
            {context.workOrder.lineItems.length > 0 && (
              <div className="space-y-1 pt-1">
                <p className="text-[11px] font-medium text-amber-300/70 uppercase tracking-wider flex items-center gap-1">
                  <PackageIcon className="h-3 w-3" />
                  Parts &amp; Materials
                </p>
                <ul className="space-y-0.5">
                  {context.workOrder.lineItems.map((item, i) => (
                    <li key={i} className="text-xs text-amber-200/70 flex items-baseline gap-1.5">
                      <span className="text-amber-400/50">·</span>
                      <span>{item.description}</span>
                      {(item.quantity !== "1" || item.unit !== "ea") && (
                        <span className="text-amber-300/50">
                          ({item.quantity} {item.unit})
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* ── Tab shell ──────────────────────────────────────────────────── */}
        <Tabs defaultValue="chemistry" className="flex flex-col flex-1">
          {/* Tab list — horizontally scrollable on narrow viewports */}
          {/* Tab list — each trigger meets 44px min-height (FIELD-11) */}
          <TabsList variant="line" className="w-full grid grid-cols-4 rounded-none border-b border-border/60 bg-transparent h-auto px-0 py-0 gap-0 shrink-0">
            <TabsTrigger
              value="chemistry"
              className="rounded-none border-none shadow-none! bg-transparent! min-h-[44px] py-2 text-xs data-[state=active]:text-foreground cursor-pointer after:bottom-0!"
            >
              <FlaskConicalIcon className="h-4 w-4 shrink-0" />
              Chem
            </TabsTrigger>
            <TabsTrigger
              value="tasks"
              className="rounded-none border-none shadow-none! bg-transparent! min-h-[44px] py-2 text-xs data-[state=active]:text-foreground cursor-pointer after:bottom-0!"
            >
              <ClipboardListIcon className="h-4 w-4 shrink-0" />
              Tasks
            </TabsTrigger>
            <TabsTrigger
              value="photos"
              className="rounded-none border-none shadow-none! bg-transparent! min-h-[44px] py-2 text-xs data-[state=active]:text-foreground cursor-pointer after:bottom-0!"
            >
              <CameraIcon className="h-4 w-4 shrink-0" />
              Photos
            </TabsTrigger>
            <TabsTrigger
              value="notes"
              className="rounded-none border-none shadow-none! bg-transparent! min-h-[44px] py-2 text-xs data-[state=active]:text-foreground cursor-pointer after:bottom-0!"
            >
              <FileTextIcon className="h-4 w-4 shrink-0" />
              Notes
            </TabsTrigger>
          </TabsList>

          {/* ── Chemistry tab ─────────────────────────────────────────────── */}
          {/* Fade transition on tab switch (150ms) */}
          <TabsContent
            value="chemistry"
            className="flex-1 overflow-y-auto mt-0 px-4 py-4 space-y-4 pb-28 data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:duration-150"
          >
            {/* AI chemistry predictions — shown before taking readings (not when completed) */}
            {!isCompleted && (
              <ChemistryPrediction poolId={context.poolId} />
            )}
            <ChemistryGrid
              chemistry={draft?.chemistry ?? {}}
              previousChemistry={context.previousChemistry}
              sanitizerType={context.sanitizerType}
              onUpdate={updateChemistry}
              readOnly={isCompleted}
            />
            <ChemistryDosing
              readings={chemistryReadings}
              pool={{
                volumeGallons: context.poolVolumeGallons ?? 15000,
                sanitizerType: context.sanitizerType,
              }}
              products={context.chemicalProducts}
              onDosingChange={handleDosingChange}
            />
          </TabsContent>

          {/* ── Tasks tab ─────────────────────────────────────────────────── */}
          <TabsContent
            value="tasks"
            className="flex-1 overflow-y-auto mt-0 px-4 py-4 pb-28 data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:duration-150"
          >
            {draft ? (
              <Checklist
                tasks={context.checklistTasks}
                draft={draft}
                onUpdate={handleChecklistUpdate}
                onMarkAllComplete={markAllChecklistComplete}
                readOnly={isCompleted}
              />
            ) : (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 p-10 text-center gap-3">
                <ClipboardListIcon className="h-10 w-10 text-muted-foreground/40" />
                <p className="text-sm font-medium text-muted-foreground">
                  Loading tasks...
                </p>
              </div>
            )}
          </TabsContent>

          {/* ── Photos tab ────────────────────────────────────────────────── */}
          <TabsContent
            value="photos"
            className="flex-1 overflow-y-auto mt-0 px-4 py-4 pb-28 data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:duration-150 space-y-4"
          >
            <PhotoCapture visitId={visitId} orgId={context.orgId} readOnly={isCompleted} />
            {/* AI photo diagnosis — only shown when at least one photo is uploaded */}
            {latestUploadedPhoto?.storagePath && (
              <PhotoDiagnosis
                photoUrl={latestUploadedPhoto.storagePath}
                poolContext={{
                  sanitizerType: context.sanitizerType,
                  lastChemistry: context.previousChemistry,
                }}
              />
            )}
          </TabsContent>

          {/* ── Notes tab ─────────────────────────────────────────────────── */}
          <TabsContent
            value="notes"
            className="flex-1 overflow-y-auto mt-0 px-4 py-4 pb-28 data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:duration-150 space-y-4"
          >
            {draft ? (
              <>
                {/* AI voice note — only shown when not completed */}
                {!isCompleted && (
                  <VoiceNoteButton
                    onStructured={handleVoiceStructured}
                    poolContext={{
                      sanitizerType: context.sanitizerType,
                      chemistryParams: Object.keys(draft.chemistry),
                      checklistTasks: context.checklistTasks.map((t) => ({
                        taskId: t.taskId,
                        label: t.label,
                      })),
                    }}
                  />
                )}
                <NotesField draft={draft} onUpdate={updateNotes} readOnly={isCompleted} />
                <InternalNotes
                  notes={draft.internalNotes ?? ""}
                  flags={draft.internalFlags ?? []}
                  onChange={updateInternalNotesDraft}
                  previousNotes={context.previousInternalNotes}
                  readOnly={isCompleted}
                />
              </>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 p-10 text-center gap-3">
                <p className="text-sm text-muted-foreground">Loading...</p>
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* ── Always-visible bottom bar ──────────────────────────────────── */}
        <div className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-t border-border/60 safe-area-inset-bottom">
          {isCompleted ? (
            <div className="flex gap-3">
              <Button
                className="flex-1 h-12 text-base font-semibold rounded-xl cursor-pointer"
                variant="outline"
                onClick={() => router.push("/routes")}
              >
                <ArrowLeftIcon className="h-4 w-4 mr-2" />
                Back to Route
              </Button>
              <Button
                className="h-12 px-5 rounded-xl cursor-pointer bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20"
                variant="outline"
                onClick={handleReopenDraft}
              >
                <PencilIcon className="h-4 w-4 mr-1.5" />
                Edit
              </Button>
            </div>
          ) : (
            <>
              {/* Flag Issue button — always visible, spans full width above primary actions */}
              <div className="flex gap-3 mb-2.5">
                <Button
                  variant="outline"
                  className="flex-1 h-10 rounded-xl border-amber-500/30 text-amber-400 hover:bg-amber-500/10 hover:border-amber-500/50 hover:text-amber-300 transition-colors cursor-pointer text-sm"
                  onClick={() => setFlagIssueOpen(true)}
                  disabled={isSubmitting}
                  aria-label="Flag an issue"
                >
                  <FlagIcon className="h-4 w-4 mr-1.5" />
                  Flag Issue
                </Button>
              </div>

              <div className="flex gap-3">
                {/* Skip button — only on first completion, not when editing */}
                {!isEditMode && (
                  <Button
                    variant="outline"
                    className="h-12 px-4 rounded-xl border-border/60 text-muted-foreground hover:text-foreground hover:border-border transition-colors cursor-pointer"
                    onClick={() => setSkipOpen(true)}
                    disabled={isSubmitting}
                    aria-label="Skip this stop"
                  >
                    <SkipForwardIcon className="h-4 w-4" />
                    <span className="ml-1.5 text-sm">Skip</span>
                  </Button>
                )}

                {/* Complete / Save button — primary action */}
                <Button
                  className={cn(
                    "flex-1 h-12 text-base font-semibold rounded-xl transition-all cursor-pointer",
                    hasMinimumData
                      ? "bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-900/20"
                      : "bg-muted text-muted-foreground cursor-not-allowed"
                  )}
                  disabled={!hasMinimumData || isSubmitting}
                  onClick={() => setCompletionOpen(true)}
                >
                  <CheckCircleIcon className="h-5 w-5 mr-2" />
                  {isEditMode ? "Save Changes" : "Complete Stop"}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Modals ──────────────────────────────────────────────────────────── */}
      {draft && (
        <CompletionModal
          open={completionOpen}
          onClose={() => setCompletionOpen(false)}
          onConfirm={handleConfirmComplete}
          draft={draft}
          context={context}
          photoCount={photoCount ?? 0}
          isSubmitting={isSubmitting}
          isEdit={isEditMode}
        />
      )}

      {/* ── Override warning sheet — shown when completeStop returns warnings ── */}
      {warnings && (
        <OverrideWarningSheet
          open={warnings !== null}
          warnings={warnings}
          onGoBack={() => setWarnings(null)}
          onCompleteAnyway={handleCompleteAnyway}
          isSubmitting={isSubmitting}
        />
      )}

      <SkipStopDialog
        open={skipOpen}
        onClose={() => setSkipOpen(false)}
        onConfirm={handleConfirmSkip}
        isSubmitting={isSubmitting}
      />

      {/* ── Flag Issue sheet — always mounted, visible at any stop state ────── */}
      <FlagIssueSheet
        open={flagIssueOpen}
        customerId={context.customerId}
        poolId={context.poolId}
        visitId={visitId}
        orgId={context.orgId}
        onClose={() => setFlagIssueOpen(false)}
      />

      {/* ── Discard edits confirmation ─────────────────────────────────────── */}
      <Sheet open={discardOpen} onOpenChange={(v) => !v && handleKeepEditing()}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[90dvh] pb-safe mx-auto max-w-lg">
          <SheetHeader className="pb-4 border-b border-border/60">
            <SheetTitle className="flex items-center gap-2 text-lg text-amber-400">
              <AlertTriangleIcon className="h-5 w-5" />
              Unsaved Changes
            </SheetTitle>
            <SheetDescription className="text-sm text-muted-foreground">
              You have unsaved edits. Going back will discard all changes made since reopening this stop.
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-col gap-3 px-4 pt-5 pb-4">
            <Button
              className="w-full h-12 text-base font-semibold rounded-xl bg-red-600 hover:bg-red-700 text-white cursor-pointer"
              onClick={handleDiscardEdits}
            >
              Discard Changes
            </Button>
            <Button
              variant="ghost"
              className="w-full h-11 text-sm rounded-xl cursor-pointer"
              onClick={handleKeepEditing}
            >
              Keep Editing
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
