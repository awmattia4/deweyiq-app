import { notFound, redirect } from "next/navigation"
import { getCurrentUser } from "@/actions/auth"
import { getProjectDetail } from "@/actions/projects"
import { getPermitsForProject, getProjectDocuments } from "@/actions/projects-permits"
import { ProjectDocumentsClient } from "@/components/projects/project-documents-client"

interface ProjectDocumentsPageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: ProjectDocumentsPageProps) {
  const { id } = await params
  const project = await getProjectDetail(id)
  return {
    title: project ? `Documents — ${project.name}` : "Documents",
  }
}

/**
 * ProjectDocumentsPage — Server component for the Documents tab of a project.
 *
 * Fetches permits and project documents in parallel.
 * Role guard: owner and office only.
 */
export default async function ProjectDocumentsPage({ params }: ProjectDocumentsPageProps) {
  const user = await getCurrentUser()

  if (!user) redirect("/login")
  if (user.role === "tech") redirect("/routes")
  if (user.role === "customer") redirect("/portal")

  const { id } = await params

  const [project, permitsResult, documentsResult] = await Promise.all([
    getProjectDetail(id),
    getPermitsForProject(id),
    getProjectDocuments(id),
  ])

  if (!project) {
    notFound()
  }

  const permits = "error" in permitsResult ? [] : permitsResult
  const documents = "error" in documentsResult ? [] : documentsResult

  return (
    <ProjectDocumentsClient
      project={project}
      initialPermits={permits}
      initialDocuments={documents}
    />
  )
}
