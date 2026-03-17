"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { holdProject, resumeProject, updateProjectStage } from "@/actions/projects"
import type { ProjectDetail } from "@/actions/projects"
import { PROJECT_STAGES, PROJECT_STAGE_LABELS, PROJECT_TYPE_LABELS } from "@/lib/projects-constants"

// ─── Stage badge colors ────────────────────────────────────────────────────────

const STAGE_COLORS: Record<string, string> = {
  lead: "bg-zinc-700 text-zinc-200",
  site_survey_scheduled: "bg-blue-900/60 text-blue-300",
  survey_complete: "bg-cyan-900/60 text-cyan-300",
  proposal_sent: "bg-violet-900/60 text-violet-300",
  proposal_approved: "bg-purple-900/60 text-purple-300",
  deposit_received: "bg-amber-900/60 text-amber-300",
  permitted: "bg-orange-900/60 text-orange-300",
  in_progress: "bg-blue-900/60 text-blue-300",
  punch_list: "bg-yellow-900/60 text-yellow-300",
  complete: "bg-emerald-900/60 text-emerald-300",
  warranty_active: "bg-teal-900/60 text-teal-300",
}

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-900/60 text-emerald-300",
  on_hold: "bg-amber-900/60 text-amber-300",
  suspended: "bg-red-900/60 text-red-300",
  cancelled: "bg-red-900/60 text-red-200",
  complete: "bg-slate-700 text-slate-300",
}

interface ProjectDetailHeaderProps {
  project: ProjectDetail
  onProjectUpdate: (project: ProjectDetail) => void
}

/**
 * ProjectDetailHeader — Top section of the project detail page.
 *
 * Shows: project name, project number (PRJ-XXXX), customer link, type badge,
 * stage badge, status indicator. Stage progression indicator (dots). Action buttons.
 */
export function ProjectDetailHeader({ project, onProjectUpdate }: ProjectDetailHeaderProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [holdDialogOpen, setHoldDialogOpen] = useState(false)
  const [holdReason, setHoldReason] = useState("")
  const [stageDropdownOpen, setStageDropdownOpen] = useState(false)

  const stageIndex = PROJECT_STAGES.indexOf(project.stage as typeof PROJECT_STAGES[number])
  const totalStages = PROJECT_STAGES.length

  function handleHold() {
    if (!holdReason.trim()) return
    startTransition(async () => {
      const result = await holdProject(project.id, holdReason.trim())
      if ("error" in result) {
        toast.error(result.error)
      } else {
        toast.success("Project placed on hold")
        setHoldDialogOpen(false)
        setHoldReason("")
        onProjectUpdate({ ...project, status: "on_hold", on_hold_reason: holdReason.trim() })
      }
    })
  }

  function handleResume() {
    startTransition(async () => {
      const result = await resumeProject(project.id)
      if ("error" in result) {
        toast.error(result.error)
      } else {
        toast.success("Project resumed")
        onProjectUpdate({ ...project, status: "active", on_hold_reason: null })
      }
    })
  }

  function handleStageChange(newStage: string) {
    setStageDropdownOpen(false)
    startTransition(async () => {
      const result = await updateProjectStage(project.id, newStage)
      if ("error" in result) {
        toast.error(result.error)
      } else {
        toast.success(`Stage updated to ${PROJECT_STAGE_LABELS[newStage] ?? newStage}`)
        onProjectUpdate({ ...project, stage: newStage, stage_entered_at: new Date() })
      }
    })
  }

  return (
    <div className="flex flex-col gap-4 px-6 pt-6 pb-4 border-b border-border shrink-0">
      {/* Back link + project number */}
      <div className="flex items-center gap-1 text-sm text-muted-foreground">
        <Link href="/projects" className="hover:text-foreground transition-colors">
          Projects
        </Link>
        <span>/</span>
        <span className="text-foreground font-mono">
          {project.project_number ?? "New Project"}
        </span>
      </div>

      {/* Title row */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-bold tracking-tight">{project.name}</h1>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Link
              href={`/customers/${project.customer_id}`}
              className="text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline"
            >
              {project.customerName}
            </Link>
            <span className="text-border">·</span>
            <span
              className={cn(
                "inline-flex items-center rounded px-2 py-0.5 text-xs font-medium",
                "bg-muted text-muted-foreground"
              )}
            >
              {PROJECT_TYPE_LABELS[project.project_type] ?? project.project_type}
            </span>
            {project.poolName && (
              <>
                <span className="text-border">·</span>
                <span className="text-muted-foreground">{project.poolName}</span>
              </>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 shrink-0">
          {project.status === "on_hold" ? (
            <Button
              size="sm"
              variant="outline"
              onClick={handleResume}
              disabled={isPending}
            >
              Resume
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setHoldDialogOpen(true)}
              disabled={isPending || project.status === "complete" || project.status === "cancelled"}
            >
              Hold
            </Button>
          )}

          {/* Stage change dropdown */}
          <div className="relative">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setStageDropdownOpen((o) => !o)}
              disabled={isPending}
            >
              {PROJECT_STAGE_LABELS[project.stage] ?? project.stage}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="ml-1.5 h-3.5 w-3.5"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
                  clipRule="evenodd"
                />
              </svg>
            </Button>
            {stageDropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setStageDropdownOpen(false)}
                />
                <div className="absolute right-0 z-20 mt-1 w-52 rounded-md border border-border bg-background shadow-lg py-1">
                  {PROJECT_STAGES.map((stage) => (
                    <button
                      key={stage}
                      type="button"
                      className={cn(
                        "w-full px-3 py-1.5 text-left text-sm transition-colors",
                        stage === project.stage
                          ? "bg-accent text-foreground font-medium"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground"
                      )}
                      onClick={() => handleStageChange(stage)}
                    >
                      {PROJECT_STAGE_LABELS[stage]}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Status + Stage indicator row */}
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={cn(
            "inline-flex items-center rounded px-2 py-0.5 text-xs font-medium",
            STAGE_COLORS[project.stage] ?? "bg-muted text-muted-foreground"
          )}
        >
          {PROJECT_STAGE_LABELS[project.stage] ?? project.stage}
        </span>
        {project.status !== "active" && (
          <span
            className={cn(
              "inline-flex items-center rounded px-2 py-0.5 text-xs font-medium",
              STATUS_COLORS[project.status] ?? "bg-muted text-muted-foreground"
            )}
          >
            {project.status === "on_hold" ? "On Hold" : project.status}
          </span>
        )}
        {project.on_hold_reason && (
          <span className="text-xs text-muted-foreground italic">
            — {project.on_hold_reason}
          </span>
        )}
      </div>

      {/* Stage progress bar */}
      <div className="flex gap-1 -mt-1">
        {PROJECT_STAGES.map((stage, i) => (
          <div
            key={stage}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors",
              i <= stageIndex
                ? "bg-primary"
                : "bg-muted"
            )}
            title={PROJECT_STAGE_LABELS[stage]}
          />
        ))}
      </div>

      {/* Hold dialog */}
      <Dialog open={holdDialogOpen} onOpenChange={setHoldDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Place Project On Hold</DialogTitle>
            <DialogDescription>
              Provide a reason for placing this project on hold. This will be recorded in the
              activity log.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 mt-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="hold-reason">Reason</Label>
              <Textarea
                id="hold-reason"
                placeholder="e.g. Waiting for customer to finalize permits..."
                value={holdReason}
                onChange={(e) => setHoldReason(e.target.value)}
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setHoldDialogOpen(false)
                  setHoldReason("")
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleHold} disabled={!holdReason.trim() || isPending}>
                Place on Hold
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
