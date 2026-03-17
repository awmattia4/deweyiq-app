"use client"

/**
 * ProjectStopCard — card for each project assignment in the Projects tab.
 *
 * Shows: project name, customer name, address, current phase name,
 * task progress (X of Y complete), active timer indicator (if running).
 *
 * Per user preference: entire card is clickable — no separate button.
 * Tapping opens /routes/project/[phaseId] workflow page.
 *
 * Phase 12 Plan 12
 */

import { useRouter } from "next/navigation"
import { PlayIcon, MapPinIcon, CheckCircleIcon } from "lucide-react"
import type { TechProjectSummary } from "@/actions/projects-field"
import { cn } from "@/lib/utils"

interface ProjectStopCardProps {
  project: TechProjectSummary
}

export function ProjectStopCard({ project }: ProjectStopCardProps) {
  const router = useRouter()

  const taskPct =
    project.totalTasks > 0
      ? Math.round((project.completedTasks / project.totalTasks) * 100)
      : 0

  const phaseComplete = project.currentPhaseStatus === "complete"

  return (
    <button
      type="button"
      onClick={() => {
        if (project.currentPhaseId) {
          router.push(`/routes/project/${project.currentPhaseId}`)
        }
      }}
      disabled={!project.currentPhaseId}
      className={cn(
        "w-full rounded-2xl border bg-card p-4 text-left transition-all cursor-pointer",
        "hover:border-border hover:bg-muted/20 active:scale-[0.98]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        phaseComplete ? "border-green-500/20" : "border-border/60"
      )}
      aria-label={`Open project: ${project.name}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/* Project + phase name */}
          <div className="flex items-start gap-2">
            {phaseComplete && (
              <CheckCircleIcon className="h-4 w-4 text-green-400 shrink-0 mt-0.5" />
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground leading-tight truncate">
                {project.name}
                {project.projectNumber && (
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                    {project.projectNumber}
                  </span>
                )}
              </p>
              {project.currentPhaseName && (
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  Phase: {project.currentPhaseName}
                </p>
              )}
            </div>
          </div>

          {/* Customer + address */}
          <p className="text-sm text-muted-foreground mt-1.5 truncate">
            {project.customerName}
          </p>
          {project.address && (
            <div className="flex items-center gap-1 mt-0.5">
              <MapPinIcon className="h-3 w-3 text-muted-foreground/60 shrink-0" />
              <p className="text-xs text-muted-foreground/80 truncate">{project.address}</p>
            </div>
          )}
        </div>

        {/* Right side: task progress + active timer indicator */}
        <div className="flex flex-col items-end gap-1 shrink-0">
          {/* Active timer pill */}
          {project.hasActiveTimer && (
            <div className="flex items-center gap-1 rounded-full bg-green-500/15 border border-green-500/30 px-2 py-0.5">
              <PlayIcon className="h-2.5 w-2.5 text-green-400" />
              <span className="text-[10px] font-medium text-green-400">Timer</span>
            </div>
          )}

          {/* Task progress */}
          {project.totalTasks > 0 && (
            <div className="text-right">
              <p className="text-sm font-semibold text-foreground">
                {project.completedTasks}/{project.totalTasks}
              </p>
              <p className="text-[10px] text-muted-foreground">tasks</p>
            </div>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {project.totalTasks > 0 && (
        <div className="mt-3">
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-300",
                phaseComplete ? "bg-green-500" : "bg-primary"
              )}
              style={{ width: `${taskPct}%` }}
            />
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">{taskPct}% complete</p>
        </div>
      )}

      {/* Due date */}
      {project.estimatedEndDate && (
        <p className="text-xs text-muted-foreground/60 mt-1.5">
          Target: {project.estimatedEndDate}
        </p>
      )}
    </button>
  )
}
