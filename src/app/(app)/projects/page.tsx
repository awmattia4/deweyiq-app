import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/actions/auth"
import { getProjects, getProjectPipelineMetrics, getProjectTemplates } from "@/actions/projects"
import type { ProjectTemplate } from "@/actions/projects"
import { getProjectDashboardData } from "@/actions/projects-reports"
import { ProjectsDashboard } from "@/components/projects/projects-dashboard"
import { ProjectDashboardWidgets } from "@/components/projects/project-dashboard-widgets"

export const metadata: Metadata = {
  title: "Projects",
}

/**
 * ProjectsPage — Server component. Fetches pipeline data and renders the
 * Projects dashboard with kanban/list view toggle.
 *
 * Phase 12 Plan 16: Added dashboard widgets (PROJ-80) — pipeline overview,
 * crew utilization, alerts panel, and calendar milestones shown above kanban.
 *
 * Role guard: owner and office only (projects are not visible to techs on this page).
 */
export default async function ProjectsPage() {
  const user = await getCurrentUser()

  if (!user) redirect("/login")
  if (user.role === "tech") redirect("/routes")
  if (user.role === "customer") redirect("/portal")

  const [projectsResult, metricsResult, templatesResult, dashboardResult] = await Promise.all([
    getProjects(),
    getProjectPipelineMetrics(),
    getProjectTemplates(),
    getProjectDashboardData(),
  ])

  const projects = "error" in projectsResult ? [] : projectsResult
  const metrics = "error" in metricsResult ? null : metricsResult
  const templates: ProjectTemplate[] =
    "error" in templatesResult ? [] : (templatesResult as ProjectTemplate[])
  const dashboardData = "error" in dashboardResult ? null : dashboardResult

  return (
    <div className="flex flex-col gap-6">
      {/* Dashboard widgets: pipeline summary, alerts, calendar, crew utilization */}
      {dashboardData && (
        <ProjectDashboardWidgets data={dashboardData} />
      )}

      {/* Kanban/list pipeline view */}
      <ProjectsDashboard
        initialProjects={projects}
        metrics={metrics}
        templates={templates}
      />
    </div>
  )
}
