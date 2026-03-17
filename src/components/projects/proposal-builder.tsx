"use client"

/**
 * ProposalBuilder — Stub component for the project proposal builder.
 * Full implementation: Phase 12 Plan 05.
 */

import type { ProjectDetail } from "@/actions/projects"
import type { ProposalDetail } from "@/actions/projects-proposals"

interface ProposalBuilderProps {
  project: ProjectDetail
  initialProposal: ProposalDetail | null
  error?: string
}

export function ProposalBuilder({ project, initialProposal, error }: ProposalBuilderProps) {
  return (
    <div className="flex flex-col gap-4 p-6">
      <h1 className="text-2xl font-bold tracking-tight">Proposal Builder</h1>
      <p className="text-sm text-muted-foreground">
        Proposal management for {project.name} — coming soon.
      </p>
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
    </div>
  )
}
