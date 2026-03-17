import { notFound, redirect } from "next/navigation"
import { getCurrentUser } from "@/actions/auth"
import { getProjectDetail } from "@/actions/projects"
import { ProjectDetailClient } from "@/components/projects/project-detail-client"

interface ProjectDetailPageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}

export async function generateMetadata({ params }: ProjectDetailPageProps) {
  const { id } = await params
  const project = await getProjectDetail(id)
  return {
    title: project ? `${project.project_number ?? "Project"}: ${project.name}` : "Project",
  }
}

/**
 * ProjectDetailPage — Server component for a single project.
 *
 * Fetches the project with all relations (customer, phases, tasks, milestones,
 * activity log) and renders the tabbed detail view.
 *
 * Role guard: owner and office only. Techs see projects via route stops, not this page.
 */
export default async function ProjectDetailPage({
  params,
  searchParams,
}: ProjectDetailPageProps) {
  const user = await getCurrentUser()

  if (!user) redirect("/login")
  if (user.role === "tech") redirect("/routes")
  if (user.role === "customer") redirect("/portal")

  const { id } = await params
  const { tab } = await searchParams

  const project = await getProjectDetail(id)

  if (!project) {
    notFound()
  }

  return (
    <ProjectDetailClient
      project={project}
      userId={user.id}
      initialTab={tab ?? "overview"}
    />
  )
}
