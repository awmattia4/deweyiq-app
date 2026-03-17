import { notFound, redirect } from "next/navigation"
import { getCurrentUser } from "@/actions/auth"
import { getProjectDetail } from "@/actions/projects"
import { getGanttData, checkWeatherDelay } from "@/actions/projects-scheduling"
import { TimelinePageClient } from "@/components/projects/timeline-page-client"

interface TimelinePageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: TimelinePageProps) {
  const { id } = await params
  const project = await getProjectDetail(id)
  return {
    title: project
      ? `Timeline — ${project.project_number ?? "Project"}: ${project.name}`
      : "Timeline",
  }
}

/**
 * TimelinePage — Server component for /projects/[id]/timeline.
 *
 * Fetches project phases formatted for @svar-ui/react-gantt and weather alerts
 * for outdoor phases. Renders the interactive Gantt chart.
 *
 * Role guard: owner and office only.
 */
export default async function TimelinePage({ params }: TimelinePageProps) {
  const user = await getCurrentUser()

  if (!user) redirect("/login")
  if (user.role === "tech") redirect("/routes")
  if (user.role === "customer") redirect("/portal")

  const { id } = await params

  const [project, ganttResult, weatherResult] = await Promise.all([
    getProjectDetail(id),
    getGanttData(id),
    checkWeatherDelay(id),
  ])

  if (!project) notFound()

  const ganttData = "error" in ganttResult ? { tasks: [], links: [] } : ganttResult
  const weatherAlerts = "error" in weatherResult ? [] : weatherResult.alerts

  return (
    <TimelinePageClient
      project={project}
      initialTasks={ganttData.tasks}
      initialLinks={ganttData.links}
      initialWeatherAlerts={weatherAlerts}
    />
  )
}
