import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/actions/auth"
import { getProjects, getProjectPipelineMetrics, getProjectTemplates } from "@/actions/projects"
import type { ProjectTemplate } from "@/actions/projects"
import { ProjectsDashboard } from "@/components/projects/projects-dashboard"

export const metadata: Metadata = {
  title: "Projects",
}

/**
 * ProjectsPage — Server component. Fetches pipeline data and renders the
 * Projects dashboard with kanban/list view toggle.
 *
 * Role guard: owner and office only (projects are not visible to techs on this page).
 */
export default async function ProjectsPage() {
  const user = await getCurrentUser()

  if (!user) redirect("/login")
  if (user.role === "tech") redirect("/routes")
  if (user.role === "customer") redirect("/portal")

  const [projectsResult, metricsResult, templatesResult] = await Promise.all([
    getProjects(),
    getProjectPipelineMetrics(),
    getProjectTemplates(),
  ])

  const projects = "error" in projectsResult ? [] : projectsResult
  const metrics = "error" in metricsResult ? null : metricsResult
  const templates: ProjectTemplate[] =
    "error" in templatesResult ? [] : (templatesResult as ProjectTemplate[])

  return (
    <ProjectsDashboard
      initialProjects={projects}
      metrics={metrics}
      templates={templates}
    />
  )
}
