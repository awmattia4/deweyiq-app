"use client"

/**
 * ProjectTab — Projects tab content for the /routes page.
 *
 * Shows:
 * 1. Daily project briefing card at the top (ProjectBriefing)
 * 2. List of active project assignments (ProjectStopCard for each)
 *
 * Client component — receives initial data from server page props.
 * Phase 12 Plan 12
 */

import { HardHatIcon } from "lucide-react"
import type { TechProjectSummary, ProjectBriefingData } from "@/actions/projects-field"
import { ProjectStopCard } from "@/components/field/project-stop-card"
import { ProjectBriefing } from "@/components/field/project-briefing"

interface ProjectTabProps {
  projects: TechProjectSummary[]
  briefing: ProjectBriefingData
  today: string
}

export function ProjectTab({ projects, briefing, today }: ProjectTabProps) {
  return (
    <div className="flex flex-col gap-4">
      {/* Daily briefing card */}
      <ProjectBriefing briefing={briefing} today={today} />

      {/* Project assignments */}
      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 p-10 text-center gap-3">
          <HardHatIcon className="h-10 w-10 text-muted-foreground/40" />
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              No project assignments today
            </p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              When you&apos;re assigned to a project phase, it will appear here.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">
            {projects.length} active project{projects.length !== 1 ? "s" : ""} assigned to you
          </p>
          {projects.map((project) => (
            <ProjectStopCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  )
}
