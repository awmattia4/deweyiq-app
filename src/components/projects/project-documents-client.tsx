"use client"

import { useState } from "react"
import Link from "next/link"
import { PermitTracker } from "@/components/projects/permit-tracker"
import { HoaDocuments } from "@/components/projects/hoa-documents"
import type { ProjectDetail } from "@/actions/projects"
import type { Permit, ProjectDocument } from "@/actions/projects-permits"
import { PROJECT_TYPE_LABELS } from "@/lib/projects-constants"

interface ProjectDocumentsClientProps {
  project: ProjectDetail
  initialPermits: Permit[]
  initialDocuments: ProjectDocument[]
}

/**
 * ProjectDocumentsClient — Client wrapper for the Documents page.
 *
 * Manages local state for permits and documents so changes (add/update/archive)
 * reflect immediately without a full page reload.
 */
export function ProjectDocumentsClient({
  project,
  initialPermits,
  initialDocuments,
}: ProjectDocumentsClientProps) {
  const [permits, setPermits] = useState(initialPermits)
  const [documents, setDocuments] = useState(initialDocuments)

  return (
    <div className="flex flex-col min-h-0">
      {/* Page header */}
      <div className="flex flex-col gap-4 px-6 pt-6 pb-4 border-b border-border shrink-0">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <Link href="/projects" className="hover:text-foreground transition-colors">
            Projects
          </Link>
          <span>/</span>
          <Link
            href={`/projects/${project.id}`}
            className="hover:text-foreground transition-colors font-mono"
          >
            {project.project_number ?? "Project"}
          </Link>
          <span>/</span>
          <span className="text-foreground">Documents</span>
        </div>

        {/* Title */}
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight">Documents</h1>
          <p className="text-sm text-muted-foreground">
            {project.name}
            {" — "}
            {PROJECT_TYPE_LABELS[project.project_type] ?? project.project_type}
          </p>
        </div>

        {/* Back to project link */}
        <div>
          <Link
            href={`/projects/${project.id}?tab=overview`}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            &larr; Back to project
          </Link>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="flex flex-col gap-6 max-w-3xl">
          {/* Permits section */}
          <PermitTracker
            projectId={project.id}
            permits={permits}
            onPermitsChange={setPermits}
          />

          {/* HOA & Documents section */}
          <HoaDocuments
            projectId={project.id}
            documents={documents}
            onDocumentsChange={setDocuments}
          />
        </div>
      </div>
    </div>
  )
}
