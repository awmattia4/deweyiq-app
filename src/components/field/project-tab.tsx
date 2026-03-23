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
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 p-12 text-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <HardHatIcon className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
          </div>
          <div className="flex flex-col gap-1 max-w-sm">
            <p className="font-medium text-sm">No project assignments today</p>
            <p className="text-sm text-muted-foreground">
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
