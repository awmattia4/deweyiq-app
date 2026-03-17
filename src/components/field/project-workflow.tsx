"use client"

/**
 * ProjectWorkflow — main project work screen for field techs.
 *
 * Mirrors the simplicity of StopWorkflow. Sections via tabs:
 * Tasks | Timer | Photos | Materials | Equipment | Issue
 *
 * Bottom bar: "Complete Phase" button (enabled when all required tasks done + at least 1 photo).
 * Quality self-inspection checklist shown before final completion.
 *
 * Phase 12 Plan 12 (PROJ-32, 46-56)
 */

import { useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  ClipboardListIcon,
  ClockIcon,
  CameraIcon,
  PackageIcon,
  WrenchIcon,
  FlagIcon,
  AlertTriangleIcon,
  CheckIcon,
  XIcon,
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
import { toast } from "sonner"
import { useLiveQuery } from "dexie-react-hooks"
import { ProjectTimer } from "@/components/field/project-timer"
import { ProjectPhotoCapture } from "@/components/field/project-photo-capture"
import { offlineDb } from "@/lib/offline/db"
import {
  completeTask,
  uncompleteTask,
  logMaterialUsage,
  returnEquipment,
  flagIssue,
  completePhase,
} from "@/actions/projects-field"
import type { ProjectPhaseDetailForTech } from "@/actions/projects-field"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProjectWorkflowProps {
  phaseDetail: ProjectPhaseDetailForTech
  orgId: string
}

// Quality self-inspection checklist shown before phase completion
const QUALITY_CHECKLIST = [
  "All required tasks are marked complete",
  "Work area cleaned up and debris removed",
  "Photos taken before, during, and after work",
  "Materials usage logged",
  "No safety hazards left on site",
]

// ---------------------------------------------------------------------------
// Issue flag form
// ---------------------------------------------------------------------------

interface IssueFlagFormProps {
  open: boolean
  onClose: () => void
  projectId: string
  phaseId: string
}

function IssueFlagForm({ open, onClose, projectId, phaseId }: IssueFlagFormProps) {
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [severity, setSeverity] = useState<"low" | "medium" | "high" | "critical">("medium")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = useCallback(async () => {
    if (!title.trim()) {
      toast.error("Please enter a title for the issue")
      return
    }

    setIsSubmitting(true)
    try {
      const result = await flagIssue({
        projectId,
        phaseId,
        title: title.trim(),
        description: description.trim() || undefined,
        severity,
      })

      if ("error" in result) {
        toast.error(result.error)
        return
      }

      toast.success("Issue flagged — office has been notified")
      setTitle("")
      setDescription("")
      setSeverity("medium")
      onClose()
    } catch {
      toast.error("Failed to flag issue")
    } finally {
      setIsSubmitting(false)
    }
  }, [projectId, phaseId, title, description, severity, onClose])

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[90dvh] pb-safe mx-auto max-w-lg overflow-y-auto">
        <SheetHeader className="pb-4 border-b border-border/60">
          <SheetTitle className="flex items-center gap-2 text-amber-400">
            <FlagIcon className="h-5 w-5" />
            Flag Issue
          </SheetTitle>
          <SheetDescription className="text-sm text-muted-foreground">
            Office will be notified. They decide whether a change order is needed.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 px-1 pt-5 pb-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Issue Title</label>
            <input
              type="text"
              placeholder="What's the issue?"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-border/60 bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Description (optional)</label>
            <textarea
              placeholder="Describe what you found..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-border/60 bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Severity</label>
            <div className="grid grid-cols-4 gap-2">
              {(["low", "medium", "high", "critical"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSeverity(s)}
                  className={cn(
                    "rounded-lg border py-2 text-sm font-medium capitalize cursor-pointer transition-colors min-h-[44px]",
                    severity === s
                      ? s === "critical"
                        ? "bg-red-600 border-red-600 text-white"
                        : s === "high"
                        ? "bg-orange-500/20 border-orange-500/50 text-orange-400"
                        : s === "medium"
                        ? "bg-amber-500/20 border-amber-500/50 text-amber-400"
                        : "bg-blue-500/20 border-blue-500/50 text-blue-400"
                      : "border-border/50 text-muted-foreground hover:border-border"
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <Button
            className="w-full h-12 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold cursor-pointer"
            disabled={isSubmitting}
            onClick={handleSubmit}
          >
            <FlagIcon className="h-4 w-4 mr-2" />
            Flag This Issue
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// Material usage form
// ---------------------------------------------------------------------------

interface MaterialUsageRowProps {
  material: { id: string; name: string; unit: string; quantity_estimated: string; quantity_used: string }
  phaseId: string
  onLogged: () => void
}

function MaterialUsageRow({ material, phaseId, onLogged }: MaterialUsageRowProps) {
  const [qty, setQty] = useState("1")
  const [isLogging, setIsLogging] = useState(false)
  const [showInput, setShowInput] = useState(false)

  const remaining = Math.max(
    0,
    parseFloat(material.quantity_estimated) - parseFloat(material.quantity_used ?? "0")
  )

  const handleLog = useCallback(async () => {
    const quantity = parseFloat(qty)
    if (!quantity || quantity <= 0) {
      toast.error("Enter a valid quantity")
      return
    }

    setIsLogging(true)
    try {
      const result = await logMaterialUsage({
        materialId: material.id,
        phaseId,
        quantityUsed: quantity,
      })

      if ("error" in result) {
        toast.error(result.error)
        return
      }

      toast.success(`Logged ${quantity} ${material.unit} of ${material.name}`)
      setQty("1")
      setShowInput(false)
      onLogged()
    } catch {
      toast.error("Failed to log usage")
    } finally {
      setIsLogging(false)
    }
  }, [material.id, material.name, material.unit, phaseId, qty, onLogged])

  return (
    <div className="rounded-xl border border-border/40 bg-muted/20 p-3 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{material.name}</p>
          <p className="text-xs text-muted-foreground">
            Used: {parseFloat(material.quantity_used).toFixed(2)} / {parseFloat(material.quantity_estimated).toFixed(2)} {material.unit}
            {remaining > 0 && (
              <span className="ml-1.5 text-amber-400/80">
                ({remaining.toFixed(2)} remaining)
              </span>
            )}
          </p>
        </div>
        {!showInput ? (
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 h-8 text-xs cursor-pointer"
            onClick={() => setShowInput(true)}
          >
            Log Usage
          </Button>
        ) : (
          <button
            type="button"
            onClick={() => setShowInput(false)}
            className="text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <XIcon className="h-4 w-4" />
          </button>
        )}
      </div>

      {showInput && (
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="flex-1 rounded-lg border border-border/60 bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <span className="text-sm text-muted-foreground shrink-0">{material.unit}</span>
          <Button
            size="sm"
            className="shrink-0 h-8 bg-primary hover:bg-primary/90 text-primary-foreground cursor-pointer"
            disabled={isLogging}
            onClick={handleLog}
          >
            <CheckIcon className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main ProjectWorkflow component
// ---------------------------------------------------------------------------

export function ProjectWorkflow({ phaseDetail, orgId }: ProjectWorkflowProps) {
  const router = useRouter()

  // ── Task completion state (optimistic via Dexie) ──────────────────────────
  const draftKey = `${phaseDetail.projectId}:${phaseDetail.phaseId}`
  const draft = useLiveQuery(
    () => offlineDb.projectTaskDrafts.get(draftKey),
    [draftKey]
  )

  // ── Photo count for phase completion validation ────────────────────────────
  const photoCount = useLiveQuery(
    () =>
      offlineDb.projectPhotoQueue
        .where("phaseId")
        .equals(phaseDetail.phaseId)
        .count(),
    [phaseDetail.phaseId],
    0
  )

  // ── Modal state ────────────────────────────────────────────────────────────
  const [flagIssueOpen, setFlagIssueOpen] = useState(false)
  const [selfInspectionOpen, setSelfInspectionOpen] = useState(false)
  const [selfInspectionChecks, setSelfInspectionChecks] = useState<boolean[]>(
    QUALITY_CHECKLIST.map(() => false)
  )
  const [isCompleting, setIsCompleting] = useState(false)

  // ── Determine task completion state ───────────────────────────────────────
  // Merge server state with Dexie optimistic updates
  const taskCompletions = draft?.taskCompletions ?? {}
  const tasks = phaseDetail.tasks.map((t) => ({
    ...t,
    is_completed:
      t.id in taskCompletions ? taskCompletions[t.id] : t.is_completed,
  }))

  // ── Required tasks validation ──────────────────────────────────────────────
  const requiredTasksDone = tasks
    .filter((t) => t.is_required)
    .every((t) => t.is_completed)

  const serverPhotoCount = phaseDetail.photoCount
  const totalPhotoCount = (photoCount ?? 0) + serverPhotoCount

  const canCompletePhase = requiredTasksDone && totalPhotoCount > 0
  const phaseAlreadyComplete = phaseDetail.phaseStatus === "complete"

  // ── Task toggle handler ────────────────────────────────────────────────────
  const handleToggleTask = useCallback(
    async (taskId: string, currentlyCompleted: boolean) => {
      // Optimistic update in Dexie
      const newCompletions = {
        ...(draft?.taskCompletions ?? {}),
        [taskId]: !currentlyCompleted,
      }

      const existingDraft = await offlineDb.projectTaskDrafts.get(draftKey)
      await offlineDb.projectTaskDrafts.put({
        ...(existingDraft ?? {
          id: draftKey,
          projectId: phaseDetail.projectId,
          phaseId: phaseDetail.phaseId,
          timerRunning: false,
          timerStartedAt: null,
          timerAccumulatedMs: 0,
          activeTaskId: null,
          activeTimeLogId: null,
          status: "idle" as const,
        }),
        id: draftKey,
        taskCompletions: newCompletions,
        updatedAt: Date.now(),
      })

      // Server sync
      try {
        const result = currentlyCompleted
          ? await uncompleteTask(taskId)
          : await completeTask(taskId)

        if ("error" in result) {
          // Revert optimistic update on error
          const revertCompletions = {
            ...(draft?.taskCompletions ?? {}),
            [taskId]: currentlyCompleted,
          }
          const currentDraft = await offlineDb.projectTaskDrafts.get(draftKey)
          if (currentDraft) {
            await offlineDb.projectTaskDrafts.put({
              ...currentDraft,
              taskCompletions: revertCompletions,
              updatedAt: Date.now(),
            })
          }
          toast.error(result.error)
        }
      } catch {
        toast.error("Failed to update task")
      }
    },
    [draft, draftKey, phaseDetail.projectId, phaseDetail.phaseId]
  )

  // ── Phase completion ───────────────────────────────────────────────────────
  const handleOpenSelfInspection = useCallback(() => {
    if (!canCompletePhase) {
      if (!requiredTasksDone) {
        toast.error("Complete all required tasks first")
      } else if (totalPhotoCount === 0) {
        toast.error("Add at least one photo before completing the phase")
      }
      return
    }
    setSelfInspectionChecks(QUALITY_CHECKLIST.map(() => false))
    setSelfInspectionOpen(true)
  }, [canCompletePhase, requiredTasksDone, totalPhotoCount])

  const handleCompletePhase = useCallback(async () => {
    const allChecked = selfInspectionChecks.every(Boolean)
    if (!allChecked) {
      toast.error("Please confirm all quality checks before completing")
      return
    }

    setIsCompleting(true)
    try {
      const result = await completePhase(phaseDetail.phaseId)

      if ("error" in result) {
        toast.error(result.error)
        return
      }

      setSelfInspectionOpen(false)
      toast.success("Phase completed! Office has been notified.")
      router.push("/routes")
    } catch {
      toast.error("Failed to complete phase")
    } finally {
      setIsCompleting(false)
    }
  }, [phaseDetail.phaseId, selfInspectionChecks, router])

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="flex flex-col min-h-[calc(100dvh-4rem)]">
        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-border/60">
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11 shrink-0 cursor-pointer"
            onClick={() => router.back()}
            aria-label="Back to projects"
          >
            <ArrowLeftIcon className="h-5 w-5" />
          </Button>
          <div className="min-w-0">
            <h1 className="font-semibold text-base leading-tight truncate">
              {phaseDetail.phaseName}
            </h1>
            <p className="text-sm text-muted-foreground truncate">
              {phaseDetail.customerName} · {phaseDetail.projectName}
            </p>
          </div>
        </div>

        {/* ── Completed banner ──────────────────────────────────────────────── */}
        {phaseAlreadyComplete && (
          <div className="flex items-center gap-2 px-4 py-2.5 bg-green-500/10 border-b border-green-500/20">
            <CheckCircleIcon className="h-4 w-4 text-green-400 shrink-0" />
            <span className="text-sm font-medium text-green-400">
              Phase complete
            </span>
          </div>
        )}

        {/* ── Tabs ─────────────────────────────────────────────────────────── */}
        <Tabs defaultValue="tasks" className="flex flex-col flex-1">
          <TabsList className="w-full overflow-x-auto justify-start rounded-none border-b border-border/60 bg-transparent h-auto px-4 py-0 gap-0 shrink-0">
            {[
              { value: "tasks", label: "Tasks", icon: <ClipboardListIcon className="h-4 w-4" /> },
              { value: "timer", label: "Timer", icon: <ClockIcon className="h-4 w-4" /> },
              { value: "photos", label: "Photos", icon: <CameraIcon className="h-4 w-4" /> },
              { value: "materials", label: "Materials", icon: <PackageIcon className="h-4 w-4" /> },
              { value: "equipment", label: "Equipment", icon: <WrenchIcon className="h-4 w-4" /> },
            ].map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="flex items-center gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-3 min-h-[44px] py-2 text-sm font-medium text-muted-foreground data-[state=active]:text-foreground cursor-pointer whitespace-nowrap transition-colors duration-150"
              >
                {tab.icon}
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* ── Tasks tab ────────────────────────────────────────────────────── */}
          <TabsContent
            value="tasks"
            className="flex-1 overflow-y-auto mt-0 px-4 py-4 pb-28 space-y-2 data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:duration-150"
          >
            {tasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 p-10 text-center gap-3">
                <ClipboardListIcon className="h-10 w-10 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground italic">No tasks for this phase.</p>
              </div>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  {tasks.filter((t) => t.is_completed).length} of {tasks.length} complete
                  {tasks.some((t) => t.is_required) && (
                    <span className="ml-1.5">
                      · {tasks.filter((t) => t.is_required && !t.is_completed).length} required remaining
                    </span>
                  )}
                </p>
                {tasks.map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => handleToggleTask(task.id, task.is_completed)}
                    className={cn(
                      "w-full flex items-start gap-3 rounded-xl border p-3.5 text-left transition-all cursor-pointer",
                      task.is_completed
                        ? "border-green-500/20 bg-green-500/5"
                        : "border-border/60 bg-card hover:border-border hover:bg-muted/20"
                    )}
                  >
                    <div
                      className={cn(
                        "h-5 w-5 rounded shrink-0 mt-0.5 flex items-center justify-center border-2 transition-colors",
                        task.is_completed
                          ? "bg-green-500 border-green-500"
                          : "border-border/60"
                      )}
                    >
                      {task.is_completed && <CheckIcon className="h-3.5 w-3.5 text-white" />}
                    </div>
                    <div className="min-w-0">
                      <p className={cn(
                        "text-sm font-medium leading-tight",
                        task.is_completed ? "text-muted-foreground line-through" : "text-foreground"
                      )}>
                        {task.name}
                        {task.is_required && !task.is_completed && (
                          <span className="ml-1.5 text-[10px] font-normal text-amber-400 align-middle no-underline">Required</span>
                        )}
                      </p>
                      {task.notes && (
                        <p className="text-xs text-muted-foreground mt-0.5">{task.notes}</p>
                      )}
                    </div>
                  </button>
                ))}
              </>
            )}
          </TabsContent>

          {/* ── Timer tab ──────────────────────────────────────────────────── */}
          <TabsContent
            value="timer"
            className="flex-1 overflow-y-auto mt-0 px-4 py-4 pb-28 data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:duration-150"
          >
            <ProjectTimer
              projectId={phaseDetail.projectId}
              phaseId={phaseDetail.phaseId}
              tasks={tasks.map((t) => ({ id: t.id, name: t.name }))}
              serverActiveTimerLogId={phaseDetail.activeTimerLogId}
              serverActiveTimerStartTime={phaseDetail.activeTimerStartTime}
              timeLogs={phaseDetail.timeLogs}
            />
          </TabsContent>

          {/* ── Photos tab ─────────────────────────────────────────────────── */}
          <TabsContent
            value="photos"
            className="flex-1 overflow-y-auto mt-0 px-4 py-4 pb-28 data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:duration-150"
          >
            <ProjectPhotoCapture
              projectId={phaseDetail.projectId}
              phaseId={phaseDetail.phaseId}
              taskId={null}
              orgId={orgId}
            />
            {serverPhotoCount > 0 && (photoCount ?? 0) === 0 && (
              <p className="text-xs text-muted-foreground mt-3 text-center">
                {serverPhotoCount} photo{serverPhotoCount !== 1 ? "s" : ""} already uploaded for this phase.
              </p>
            )}
          </TabsContent>

          {/* ── Materials tab ──────────────────────────────────────────────── */}
          <TabsContent
            value="materials"
            className="flex-1 overflow-y-auto mt-0 px-4 py-4 pb-28 space-y-3 data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:duration-150"
          >
            {phaseDetail.materials.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 p-10 text-center gap-3">
                <PackageIcon className="h-10 w-10 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground italic">No materials for this project.</p>
              </div>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  {phaseDetail.materials.length} material{phaseDetail.materials.length !== 1 ? "s" : ""} for this project
                </p>
                {phaseDetail.materials.map((material) => (
                  <MaterialUsageRow
                    key={material.id}
                    material={material}
                    phaseId={phaseDetail.phaseId}
                    onLogged={() => {}} // parent would refresh on nav back
                  />
                ))}
              </>
            )}
          </TabsContent>

          {/* ── Equipment tab ──────────────────────────────────────────────── */}
          <TabsContent
            value="equipment"
            className="flex-1 overflow-y-auto mt-0 px-4 py-4 pb-28 space-y-3 data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:duration-150"
          >
            {phaseDetail.equipment.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 p-10 text-center gap-3">
                <WrenchIcon className="h-10 w-10 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground italic">No equipment assigned to this project.</p>
              </div>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  {phaseDetail.equipment.filter((e) => !e.returned_date).length} item(s) on site
                </p>
                {phaseDetail.equipment.map((eq) => (
                  <div
                    key={eq.id}
                    className={cn(
                      "rounded-xl border p-3.5",
                      eq.returned_date
                        ? "border-border/30 bg-muted/10 opacity-60"
                        : "border-border/60 bg-card"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {eq.equipment_description}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Assigned {eq.assigned_date}
                          {eq.returned_date && ` · Returned ${eq.returned_date}`}
                        </p>
                      </div>
                      {!eq.returned_date && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="shrink-0 h-8 text-xs cursor-pointer"
                          onClick={async () => {
                            const result = await returnEquipment(eq.id)
                            if ("error" in result) {
                              toast.error(result.error)
                            } else {
                              toast.success("Equipment marked as returned")
                            }
                          }}
                        >
                          Return
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </>
            )}
          </TabsContent>
        </Tabs>

        {/* ── Bottom bar ───────────────────────────────────────────────────── */}
        <div className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-t border-border/60 safe-area-inset-bottom">
          {phaseAlreadyComplete ? (
            <Button
              className="w-full h-12 text-base font-semibold rounded-xl cursor-pointer"
              variant="outline"
              onClick={() => router.back()}
            >
              <ArrowLeftIcon className="h-4 w-4 mr-2" />
              Back to Projects
            </Button>
          ) : (
            <div className="flex flex-col gap-2.5">
              {/* Flag Issue button */}
              <Button
                variant="outline"
                className="w-full h-10 rounded-xl border-amber-500/30 text-amber-400 hover:bg-amber-500/10 hover:border-amber-500/50 hover:text-amber-300 transition-colors cursor-pointer text-sm"
                onClick={() => setFlagIssueOpen(true)}
              >
                <FlagIcon className="h-4 w-4 mr-1.5" />
                Flag Issue
              </Button>

              {/* Complete Phase button */}
              <Button
                className={cn(
                  "w-full h-12 text-base font-semibold rounded-xl transition-all cursor-pointer",
                  canCompletePhase
                    ? "bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-900/20"
                    : "bg-muted text-muted-foreground"
                )}
                disabled={!canCompletePhase}
                onClick={handleOpenSelfInspection}
              >
                <CheckCircleIcon className="h-5 w-5 mr-2" />
                Complete Phase
              </Button>

              {/* Hint text when disabled */}
              {!canCompletePhase && (
                <p className="text-xs text-muted-foreground text-center">
                  {!requiredTasksDone
                    ? "Complete all required tasks to finish this phase"
                    : "Add at least one photo to finish this phase"}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Issue flag sheet ───────────────────────────────────────────────── */}
      <IssueFlagForm
        open={flagIssueOpen}
        onClose={() => setFlagIssueOpen(false)}
        projectId={phaseDetail.projectId}
        phaseId={phaseDetail.phaseId}
      />

      {/* ── Self-inspection sheet ──────────────────────────────────────────── */}
      <Sheet open={selfInspectionOpen} onOpenChange={(v) => !v && setSelfInspectionOpen(false)}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[90dvh] pb-safe mx-auto max-w-lg overflow-y-auto">
          <SheetHeader className="pb-4 border-b border-border/60">
            <SheetTitle className="flex items-center gap-2 text-green-400">
              <CheckCircleIcon className="h-5 w-5" />
              Quality Self-Inspection
            </SheetTitle>
            <SheetDescription className="text-sm text-muted-foreground">
              Confirm these checks before marking the phase complete.
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-3 px-1 pt-5">
            {QUALITY_CHECKLIST.map((item, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  const updated = [...selfInspectionChecks]
                  updated[i] = !updated[i]
                  setSelfInspectionChecks(updated)
                }}
                className={cn(
                  "w-full flex items-start gap-3 rounded-xl border p-3.5 text-left transition-all cursor-pointer",
                  selfInspectionChecks[i]
                    ? "border-green-500/20 bg-green-500/5"
                    : "border-border/60 bg-card hover:border-border"
                )}
              >
                <div
                  className={cn(
                    "h-5 w-5 rounded shrink-0 mt-0.5 flex items-center justify-center border-2 transition-colors",
                    selfInspectionChecks[i]
                      ? "bg-green-500 border-green-500"
                      : "border-border/60"
                  )}
                >
                  {selfInspectionChecks[i] && <CheckIcon className="h-3.5 w-3.5 text-white" />}
                </div>
                <p className="text-sm text-foreground leading-tight">{item}</p>
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-3 px-1 pt-5 pb-4">
            <Button
              className={cn(
                "w-full h-12 text-base font-semibold rounded-xl",
                selfInspectionChecks.every(Boolean)
                  ? "bg-green-600 hover:bg-green-700 text-white cursor-pointer"
                  : "bg-muted text-muted-foreground"
              )}
              disabled={!selfInspectionChecks.every(Boolean) || isCompleting}
              onClick={handleCompletePhase}
            >
              {isCompleting ? (
                "Completing..."
              ) : (
                <>
                  <CheckCircleIcon className="h-5 w-5 mr-2" />
                  Mark Phase Complete
                </>
              )}
            </Button>
            <Button
              variant="ghost"
              className="w-full h-11 text-sm rounded-xl cursor-pointer"
              onClick={() => setSelfInspectionOpen(false)}
            >
              Cancel
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
