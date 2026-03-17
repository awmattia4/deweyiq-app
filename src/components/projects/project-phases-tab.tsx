"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { toLocalDateString } from "@/lib/date-utils"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  createProjectPhase,
  updateProjectPhase,
  deleteProjectPhase,
  updatePhaseTask,
  getProjectDetail,
} from "@/actions/projects"
import type { ProjectDetail, ProjectPhaseSummary } from "@/actions/projects"
import { SubAssignmentSection } from "@/components/projects/sub-assignment"
import type { SubcontractorRow, SubAssignmentRow } from "@/actions/projects-subcontractors"

// ─── Phase status config ───────────────────────────────────────────────────────

const PHASE_STATUS_LABELS: Record<string, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  complete: "Complete",
  on_hold: "On Hold",
  skipped: "Skipped",
}

const PHASE_STATUS_COLORS: Record<string, string> = {
  not_started: "bg-zinc-700 text-zinc-200",
  in_progress: "bg-blue-900/60 text-blue-300",
  complete: "bg-emerald-900/60 text-emerald-300",
  on_hold: "bg-amber-900/60 text-amber-300",
  skipped: "bg-zinc-800 text-zinc-500",
}

interface ProjectPhasesTabProps {
  project: ProjectDetail
  onProjectUpdate: (project: ProjectDetail) => void
  // Sub assignment data (Plan 10)
  availableSubs?: SubcontractorRow[]
  subAssignments?: SubAssignmentRow[]
  onSubAssignmentsChange?: (updated: SubAssignmentRow[]) => void
}

interface PhaseFormData {
  name: string
  dependency_phase_id: string
  dependency_type: "hard" | "soft"
  estimated_start_date: string
  estimated_end_date: string
  assigned_tech_id: string
  estimated_labor_hours: string
  is_outdoor: boolean
  notes: string
}

const EMPTY_PHASE_FORM: PhaseFormData = {
  name: "",
  dependency_phase_id: "",
  dependency_type: "hard",
  estimated_start_date: "",
  estimated_end_date: "",
  assigned_tech_id: "",
  estimated_labor_hours: "",
  is_outdoor: false,
  notes: "",
}

/**
 * ProjectPhasesTab — Ordered list of project phases with dependency tracking.
 *
 * Features:
 * - Phase list with status badges, assigned tech, date ranges, labor hours
 * - Dependency indicator (shows predecessor phase name with hard/soft badge)
 * - Phase CRUD: Add Phase dialog, Edit Phase inline, Remove (soft-delete to 'skipped')
 * - Task list per phase with completion toggle
 * - Mark phase complete (validates required tasks are done first)
 * - Cascade notification: shows how many downstream phases were rescheduled
 */
export function ProjectPhasesTab({
  project,
  onProjectUpdate,
  availableSubs = [],
  subAssignments = [],
  onSubAssignmentsChange,
}: ProjectPhasesTabProps) {
  const [isPending, startTransition] = useTransition()
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [editingPhaseId, setEditingPhaseId] = useState<string | null>(null)
  const [formData, setFormData] = useState<PhaseFormData>(EMPTY_PHASE_FORM)
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set())
  const [lastCascadeCount, setLastCascadeCount] = useState(0)

  const phases = project.phases
  const phaseMap = new Map(phases.map((p) => [p.id, p]))

  function toggleExpand(phaseId: string) {
    setExpandedPhases((prev) => {
      const next = new Set(prev)
      if (next.has(phaseId)) next.delete(phaseId)
      else next.add(phaseId)
      return next
    })
  }

  function openAddDialog() {
    setFormData(EMPTY_PHASE_FORM)
    setEditingPhaseId(null)
    setAddDialogOpen(true)
  }

  function openEditDialog(phase: ProjectPhaseSummary) {
    setFormData({
      name: phase.name,
      dependency_phase_id: phase.dependency_phase_id ?? "",
      dependency_type: (phase.dependency_type as "hard" | "soft") ?? "hard",
      estimated_start_date: phase.estimated_start_date ?? "",
      estimated_end_date: phase.estimated_end_date ?? "",
      assigned_tech_id: phase.assigned_tech_id ?? "",
      estimated_labor_hours: phase.estimated_labor_hours ?? "",
      is_outdoor: phase.is_outdoor,
      notes: phase.notes ?? "",
    })
    setEditingPhaseId(phase.id)
    setAddDialogOpen(true)
  }

  async function refreshProject() {
    const updated = await getProjectDetail(project.id)
    if (updated) onProjectUpdate(updated)
  }

  function handleSavePhase() {
    if (!formData.name.trim()) {
      toast.error("Phase name is required")
      return
    }

    startTransition(async () => {
      if (editingPhaseId) {
        const result = await updateProjectPhase(editingPhaseId, {
          name: formData.name.trim(),
          dependency_phase_id: formData.dependency_phase_id || null,
          dependency_type: formData.dependency_type,
          estimated_start_date: formData.estimated_start_date || null,
          estimated_end_date: formData.estimated_end_date || null,
          assigned_tech_id: formData.assigned_tech_id || null,
          estimated_labor_hours: formData.estimated_labor_hours || null,
          notes: formData.notes || null,
        })

        if (!result.success) {
          toast.error(result.error ?? "Failed to update phase")
        } else {
          const cascaded = result.cascadedPhaseCount ?? 0
          if (cascaded > 0) {
            toast.success(`Phase updated — ${cascaded} downstream phase${cascaded === 1 ? "" : "s"} rescheduled`)
            setLastCascadeCount(cascaded)
          } else {
            toast.success("Phase updated")
          }
          setAddDialogOpen(false)
          await refreshProject()
        }
      } else {
        const result = await createProjectPhase(project.id, {
          name: formData.name.trim(),
          dependency_phase_id: formData.dependency_phase_id || null,
          dependency_type: formData.dependency_type,
          estimated_start_date: formData.estimated_start_date || null,
          estimated_end_date: formData.estimated_end_date || null,
          assigned_tech_id: formData.assigned_tech_id || null,
          estimated_labor_hours: formData.estimated_labor_hours || null,
          is_outdoor: formData.is_outdoor,
          notes: formData.notes || null,
        })

        if (!result.success) {
          toast.error(result.error ?? "Failed to create phase")
        } else {
          toast.success("Phase added")
          setAddDialogOpen(false)
          await refreshProject()
        }
      }
    })
  }

  function handleRemovePhase(phaseId: string, phaseName: string) {
    startTransition(async () => {
      const result = await deleteProjectPhase(phaseId)
      if (!result.success) {
        toast.error(result.error ?? "Failed to remove phase")
      } else {
        toast.success(`Phase "${phaseName}" removed`)
        await refreshProject()
      }
    })
  }

  function handleMarkPhaseComplete(phase: ProjectPhaseSummary) {
    const incompleteRequired = phase.tasks.filter((t) => t.is_required && !t.is_completed)
    if (incompleteRequired.length > 0) {
      toast.error(
        `${incompleteRequired.length} required task${incompleteRequired.length === 1 ? "" : "s"} must be completed first`
      )
      return
    }

    startTransition(async () => {
      const result = await updateProjectPhase(phase.id, {
        status: "complete",
        actual_end_date: toLocalDateString(new Date()),
      })
      if (!result.success) {
        toast.error(result.error ?? "Failed to mark phase complete")
      } else {
        toast.success(`"${phase.name}" marked complete`)
        await refreshProject()
      }
    })
  }

  function handleTaskToggle(taskId: string, phaseId: string, completed: boolean) {
    startTransition(async () => {
      const result = await updatePhaseTask(taskId, { is_completed: completed })
      if (!result.success) {
        toast.error(result.error ?? "Failed to update task")
      } else {
        const updatedPhases = project.phases.map((p) => {
          if (p.id !== phaseId) return p
          return {
            ...p,
            tasks: p.tasks.map((t) =>
              t.id === taskId
                ? { ...t, is_completed: completed, completed_at: completed ? new Date() : null }
                : t
            ),
          }
        })
        onProjectUpdate({ ...project, phases: updatedPhases })
      }
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {phases.length} phase{phases.length === 1 ? "" : "s"}
            {phases.length > 0 && ` — ${phases.filter((p) => p.status === "complete").length} complete`}
          </p>
          {lastCascadeCount > 0 && (
            <p className="text-xs text-amber-400 mt-0.5">
              Last update rescheduled {lastCascadeCount} downstream phase{lastCascadeCount === 1 ? "" : "s"}
            </p>
          )}
        </div>
        <Button size="sm" variant="outline" onClick={openAddDialog} disabled={isPending}>
          Add Phase
        </Button>
      </div>

      {/* Phase list */}
      {phases.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm text-muted-foreground italic">
              No phases yet. Add phases to track milestones and dependencies.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {phases.map((phase, index) => {
            const dependencyPhase = phase.dependency_phase_id
              ? phaseMap.get(phase.dependency_phase_id)
              : null
            const isExpanded = expandedPhases.has(phase.id)
            const completedTasks = phase.tasks.filter((t) => t.is_completed).length
            const totalTasks = phase.tasks.length
            const canComplete =
              phase.status !== "complete" &&
              phase.status !== "skipped" &&
              phase.tasks.filter((t) => t.is_required && !t.is_completed).length === 0

            return (
              <Card key={phase.id} className="overflow-hidden">
                {/* Phase header row */}
                <div
                  className="flex items-start gap-3 p-4 cursor-pointer hover:bg-accent/30 transition-colors"
                  onClick={() => toggleExpand(phase.id)}
                >
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs text-muted-foreground font-medium mt-0.5">
                    {index + 1}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-sm">{phase.name}</span>
                      <span
                        className={cn(
                          "inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium",
                          PHASE_STATUS_COLORS[phase.status] ?? "bg-muted text-muted-foreground"
                        )}
                      >
                        {PHASE_STATUS_LABELS[phase.status] ?? phase.status}
                      </span>
                      {phase.is_outdoor && (
                        <span className="text-xs text-muted-foreground">Outdoor</span>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-xs text-muted-foreground">
                      {phase.techName && <span>{phase.techName}</span>}
                      {phase.estimated_start_date && (
                        <span>
                          {formatDate(phase.estimated_start_date)}
                          {phase.estimated_end_date && ` – ${formatDate(phase.estimated_end_date)}`}
                        </span>
                      )}
                      {phase.estimated_labor_hours && (
                        <span>{parseFloat(phase.estimated_labor_hours)} est. hrs</span>
                      )}
                      {phase.actual_labor_hours && (
                        <span className="text-foreground font-medium">
                          {parseFloat(phase.actual_labor_hours)} actual hrs
                        </span>
                      )}
                      {totalTasks > 0 && (
                        <span>{completedTasks}/{totalTasks} tasks</span>
                      )}
                    </div>

                    {/* Dependency indicator */}
                    {dependencyPhase && (
                      <div className="flex items-center gap-1 mt-1.5 text-xs text-muted-foreground">
                        <span>Depends on:</span>
                        <span className="font-medium text-foreground">{dependencyPhase.name}</span>
                        <span
                          className={cn(
                            "rounded px-1 py-0.5 text-xs",
                            phase.dependency_type === "hard"
                              ? "bg-red-900/30 text-red-400"
                              : "bg-amber-900/30 text-amber-400"
                          )}
                        >
                          {phase.dependency_type === "hard" ? "hard" : "soft"}
                        </span>
                      </div>
                    )}
                  </div>

                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className={cn(
                      "h-4 w-4 text-muted-foreground transition-transform flex-shrink-0 mt-0.5",
                      isExpanded && "rotate-180"
                    )}
                    aria-hidden="true"
                  >
                    <path
                      fillRule="evenodd"
                      d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>

                {/* Expanded: tasks + actions */}
                {isExpanded && (
                  <div className="border-t border-border bg-muted/20">
                    {phase.tasks.length > 0 && (
                      <div className="p-4 flex flex-col gap-2">
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          Tasks
                        </span>
                        {phase.tasks.map((task) => (
                          <div key={task.id} className="flex items-start gap-2.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleTaskToggle(task.id, phase.id, !task.is_completed)
                              }}
                              disabled={isPending}
                              className={cn(
                                "flex-shrink-0 mt-0.5 w-4 h-4 rounded border transition-colors",
                                task.is_completed
                                  ? "bg-emerald-500 border-emerald-500"
                                  : "border-border hover:border-primary"
                              )}
                              aria-label={task.is_completed ? "Mark incomplete" : "Mark complete"}
                            >
                              {task.is_completed && (
                                <svg viewBox="0 0 16 16" fill="white" className="w-full h-full p-0.5">
                                  <path d="M13.707 4.293a1 1 0 0 1 0 1.414l-6.414 6.414a1 1 0 0 1-1.414 0L3.293 9.535a1 1 0 0 1 1.414-1.414L6.586 9.9l5.707-5.607a1 1 0 0 1 1.414 0Z" />
                                </svg>
                              )}
                            </button>
                            <div className="flex-1 min-w-0">
                              <span
                                className={cn(
                                  "text-sm",
                                  task.is_completed && "line-through text-muted-foreground"
                                )}
                              >
                                {task.name}
                              </span>
                              {task.is_required && !task.is_completed && (
                                <span className="ml-1.5 text-xs text-amber-400">required</span>
                              )}
                              {task.notes && (
                                <p className="text-xs text-muted-foreground mt-0.5">{task.notes}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Sub assignments inline */}
                    {(availableSubs.length > 0 || subAssignments.some((a) => a.phase_id === phase.id)) && (
                      <div className="px-4 pb-3 border-t border-border pt-3">
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-2">
                          Subcontractors
                        </span>
                        <SubAssignmentSection
                          phaseId={phase.id}
                          phaseName={phase.name}
                          assignments={subAssignments.filter((a) => a.phase_id === phase.id)}
                          availableSubs={availableSubs}
                          onAssignmentsChange={(updated) => {
                            const otherAssignments = subAssignments.filter(
                              (a) => a.phase_id !== phase.id
                            )
                            onSubAssignmentsChange?.([...otherAssignments, ...updated])
                          }}
                        />
                      </div>
                    )}

                    {/* Phase actions */}
                    <div className="flex flex-wrap items-center gap-2 px-4 pb-4">
                      {canComplete && (
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleMarkPhaseComplete(phase)
                          }}
                          disabled={isPending}
                        >
                          Mark Complete
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation()
                          openEditDialog(phase)
                        }}
                        disabled={isPending}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleRemovePhase(phase.id, phase.name)
                        }}
                        disabled={isPending}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {/* Add / Edit Phase Dialog */}
      <Dialog
        open={addDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setAddDialogOpen(false)
            setEditingPhaseId(null)
            setFormData(EMPTY_PHASE_FORM)
          }
        }}
      >
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPhaseId ? "Edit Phase" : "Add Phase"}</DialogTitle>
            <DialogDescription>
              {editingPhaseId
                ? "Update phase details. Changing dates will automatically reschedule downstream phases."
                : "Add a new phase to this project. Set a dependency to link it to a predecessor phase."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 mt-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="phase-name">Phase Name</Label>
              <Input
                id="phase-name"
                placeholder="e.g. Excavation, Gunite, Tile and Coping..."
                value={formData.name}
                onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
              />
            </div>

            {phases.length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="phase-dependency">Depends On</Label>
                  <select
                    id="phase-dependency"
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={formData.dependency_phase_id}
                    onChange={(e) =>
                      setFormData((f) => ({ ...f, dependency_phase_id: e.target.value }))
                    }
                  >
                    <option value="">None</option>
                    {phases
                      .filter((p) => p.id !== editingPhaseId)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </select>
                </div>
                {formData.dependency_phase_id && (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="phase-dep-type">Dependency Type</Label>
                    <select
                      id="phase-dep-type"
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      value={formData.dependency_type}
                      onChange={(e) =>
                        setFormData((f) => ({
                          ...f,
                          dependency_type: e.target.value as "hard" | "soft",
                        }))
                      }
                    >
                      <option value="hard">Hard (must complete first)</option>
                      <option value="soft">Soft (warning only)</option>
                    </select>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="phase-start">Scheduled Start</Label>
                <Input
                  id="phase-start"
                  type="date"
                  value={formData.estimated_start_date}
                  onChange={(e) =>
                    setFormData((f) => ({ ...f, estimated_start_date: e.target.value }))
                  }
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="phase-end">Scheduled End</Label>
                <Input
                  id="phase-end"
                  type="date"
                  value={formData.estimated_end_date}
                  onChange={(e) =>
                    setFormData((f) => ({ ...f, estimated_end_date: e.target.value }))
                  }
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="phase-hours">Estimated Labor Hours</Label>
              <Input
                id="phase-hours"
                type="number"
                min="0"
                step="0.5"
                placeholder="e.g. 8"
                value={formData.estimated_labor_hours}
                onChange={(e) =>
                  setFormData((f) => ({ ...f, estimated_labor_hours: e.target.value }))
                }
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                id="phase-outdoor"
                type="checkbox"
                checked={formData.is_outdoor}
                onChange={(e) => setFormData((f) => ({ ...f, is_outdoor: e.target.checked }))}
                className="h-4 w-4 rounded border-border"
              />
              <Label htmlFor="phase-outdoor" className="font-normal cursor-pointer">
                Outdoor work (weather dependent)
              </Label>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="phase-notes">Notes</Label>
              <Textarea
                id="phase-notes"
                placeholder="Any instructions or notes for this phase..."
                value={formData.notes}
                onChange={(e) => setFormData((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setAddDialogOpen(false)
                  setEditingPhaseId(null)
                  setFormData(EMPTY_PHASE_FORM)
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSavePhase}
                disabled={isPending || !formData.name.trim()}
              >
                {editingPhaseId ? "Save Changes" : "Add Phase"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Helper ────────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  try {
    const [year, month, day] = dateStr.split("-").map(Number)
    return new Date(year, month - 1, day).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    })
  } catch {
    return dateStr
  }
}
