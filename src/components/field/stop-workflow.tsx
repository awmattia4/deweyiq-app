"use client"

import { useMemo, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  FlaskConicalIcon,
  ClipboardListIcon,
  CameraIcon,
  FileTextIcon,
  SkipForwardIcon,
} from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { ChemistryGrid } from "@/components/field/chemistry-grid"
import { ChemistryDosing } from "@/components/field/chemistry-dosing"
import { Checklist } from "@/components/field/checklist"
import { PhotoCapture } from "@/components/field/photo-capture"
import { NotesField } from "@/components/field/notes-field"
import { CompletionModal, SkipStopDialog } from "@/components/field/completion-modal"
import { useVisitDraft } from "@/hooks/use-visit-draft"
import { useLiveQuery } from "dexie-react-hooks"
import { offlineDb } from "@/lib/offline/db"
import { enqueueWrite } from "@/lib/offline/sync"
import { completeStop, skipStop } from "@/actions/visits"
import type { StopContext } from "@/actions/visits"
import type { FullChemistryReadings } from "@/lib/chemistry/dosing"
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

  const { draft, updateChemistry, updateChecklist, updateNotes, completeDraft } =
    useVisitDraft(stopId, context.customerId, context.poolId, visitId)

  // ── Modal state ──────────────────────────────────────────────────────────

  const [completionOpen, setCompletionOpen] = useState(false)
  const [skipOpen, setSkipOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

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

  // ── Complete stop handler ────────────────────────────────────────────────

  const handleConfirmComplete = useCallback(async () => {
    if (!draft) return
    setIsSubmitting(true)

    try {
      const photoStoragePaths = await getUploadedPhotoPaths()

      const completionData = {
        visitId,
        customerId: context.customerId,
        poolId: context.poolId,
        chemistry: draft.chemistry,
        checklist: draft.checklist,
        notes: draft.notes,
        photoStoragePaths,
      }

      if (typeof navigator !== "undefined" && navigator.onLine) {
        // Online: call server action directly
        const result = await completeStop(completionData)
        if (!result.success) {
          throw new Error(result.error ?? "Failed to complete stop")
        }
      } else {
        // Offline: enqueue to sync queue — replayed via POST /api/visits/complete
        await enqueueWrite("/api/visits/complete", "POST", completionData)
      }

      // Mark draft as completed and clean up Dexie draft
      await completeDraft()

      // Clean up uploaded photo queue items (they're now saved to the visit)
      const uploadedPhotos = await offlineDb.photoQueue
        .where("visitId")
        .equals(visitId)
        .and((item) => item.status === "uploaded")
        .toArray()
      await offlineDb.photoQueue.bulkDelete(
        uploadedPhotos.map((p) => p.id!).filter(Boolean)
      )

      setCompletionOpen(false)

      // Per locked decision: "After completing a stop: auto-advance to the next
      // stop in the route with a success toast"
      toast.success("Stop completed!", {
        description: `${context.customerName} — ${context.poolName}`,
      })

      router.push("/routes")
    } catch (err) {
      console.error("[StopWorkflow] Complete stop error:", err)
      toast.error("Failed to save stop", {
        description:
          err instanceof Error ? err.message : "Please try again.",
      })
    } finally {
      setIsSubmitting(false)
    }
  }, [
    draft,
    visitId,
    context.customerId,
    context.poolId,
    context.customerName,
    context.poolName,
    getUploadedPhotoPaths,
    completeDraft,
    router,
  ])

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
            onClick={() => router.push("/routes")}
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
            </p>
          </div>
        </div>

        {/* ── Tab shell ──────────────────────────────────────────────────── */}
        <Tabs defaultValue="chemistry" className="flex flex-col flex-1">
          {/* Tab list — horizontally scrollable on narrow viewports */}
          {/* Tab list — each trigger meets 44px min-height (FIELD-11) */}
          <TabsList className="w-full overflow-x-auto justify-start rounded-none border-b border-border/60 bg-transparent h-auto px-4 py-0 gap-0 shrink-0">
            <TabsTrigger
              value="chemistry"
              className="flex items-center gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-3 min-h-[44px] py-2 text-sm font-medium text-muted-foreground data-[state=active]:text-foreground cursor-pointer whitespace-nowrap transition-colors duration-150"
            >
              <FlaskConicalIcon className="h-4 w-4" />
              Chemistry
            </TabsTrigger>
            <TabsTrigger
              value="tasks"
              className="flex items-center gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-3 min-h-[44px] py-2 text-sm font-medium text-muted-foreground data-[state=active]:text-foreground cursor-pointer whitespace-nowrap transition-colors duration-150"
            >
              <ClipboardListIcon className="h-4 w-4" />
              Tasks
            </TabsTrigger>
            <TabsTrigger
              value="photos"
              className="flex items-center gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-3 min-h-[44px] py-2 text-sm font-medium text-muted-foreground data-[state=active]:text-foreground cursor-pointer whitespace-nowrap transition-colors duration-150"
            >
              <CameraIcon className="h-4 w-4" />
              Photos
            </TabsTrigger>
            <TabsTrigger
              value="notes"
              className="flex items-center gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-3 min-h-[44px] py-2 text-sm font-medium text-muted-foreground data-[state=active]:text-foreground cursor-pointer whitespace-nowrap transition-colors duration-150"
            >
              <FileTextIcon className="h-4 w-4" />
              Notes
            </TabsTrigger>
          </TabsList>

          {/* ── Chemistry tab ─────────────────────────────────────────────── */}
          {/* Fade transition on tab switch (150ms) */}
          <TabsContent
            value="chemistry"
            className="flex-1 overflow-y-auto mt-0 px-4 py-4 space-y-4 pb-28 data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:duration-150"
          >
            <ChemistryGrid
              chemistry={draft?.chemistry ?? {}}
              previousChemistry={context.previousChemistry}
              sanitizerType={context.sanitizerType}
              onUpdate={updateChemistry}
            />
            <ChemistryDosing
              readings={chemistryReadings}
              pool={{
                volumeGallons: context.poolVolumeGallons ?? 15000,
                sanitizerType: context.sanitizerType,
              }}
              products={context.chemicalProducts}
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
            className="flex-1 overflow-y-auto mt-0 px-4 py-4 pb-28 data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:duration-150"
          >
            <PhotoCapture visitId={visitId} orgId={context.orgId} />
          </TabsContent>

          {/* ── Notes tab ─────────────────────────────────────────────────── */}
          <TabsContent
            value="notes"
            className="flex-1 overflow-y-auto mt-0 px-4 py-4 pb-28 data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:duration-150"
          >
            {draft ? (
              <NotesField draft={draft} onUpdate={updateNotes} />
            ) : (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 p-10 text-center gap-3">
                <p className="text-sm text-muted-foreground">Loading...</p>
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* ── Always-visible bottom bar ──────────────────────────────────── */}
        <div className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-t border-border/60 safe-area-inset-bottom">
          <div className="flex gap-3">
            {/* Skip button — less prominent */}
            <Button
              variant="outline"
              className="h-12 px-4 rounded-xl border-border/60 text-muted-foreground hover:text-foreground hover:border-border transition-colors cursor-pointer"
              onClick={() => setSkipOpen(true)}
              disabled={draft?.status === "completed" || isSubmitting}
              aria-label="Skip this stop"
            >
              <SkipForwardIcon className="h-4 w-4" />
              <span className="ml-1.5 text-sm">Skip</span>
            </Button>

            {/* Complete button — primary action */}
            <Button
              className={cn(
                "flex-1 h-12 text-base font-semibold rounded-xl transition-all cursor-pointer",
                hasMinimumData
                  ? "bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-900/20"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              )}
              disabled={!hasMinimumData || draft?.status === "completed" || isSubmitting}
              onClick={() => setCompletionOpen(true)}
            >
              <CheckCircleIcon className="h-5 w-5 mr-2" />
              {draft?.status === "completed" ? "Stop Completed" : "Complete Stop"}
            </Button>
          </div>
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
        />
      )}

      <SkipStopDialog
        open={skipOpen}
        onClose={() => setSkipOpen(false)}
        onConfirm={handleConfirmSkip}
        isSubmitting={isSubmitting}
      />
    </>
  )
}
