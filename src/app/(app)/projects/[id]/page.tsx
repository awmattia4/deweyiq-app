import { notFound, redirect } from "next/navigation"
import { getCurrentUser } from "@/actions/auth"
import { getProjectDetail } from "@/actions/projects"
import { getSurveyData, getSurveySchedule, getSurveyChecklist } from "@/actions/projects-survey"
import { getTechProfiles } from "@/actions/work-orders"
import { getSubcontractors, getSubAssignmentsForProject, getSubPaymentSummary } from "@/actions/projects-subcontractors"
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
 * Also fetches survey data (schedule info + completed survey) for the overview tab.
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

  // Fetch project + survey data + sub data in parallel
  const [project, surveyData, surveySchedule, techProfiles, checklistCategories, subsResult, subAssignmentsResult, subPaymentsResult] =
    await Promise.all([
      getProjectDetail(id),
      getSurveyData(id),
      getSurveySchedule(id),
      getTechProfiles(),
      getSurveyChecklist(),
      getSubcontractors(false),
      getSubAssignmentsForProject(id),
      getSubPaymentSummary(id),
    ])

  if (!project) {
    notFound()
  }

  const availableSubs = !("error" in subsResult) ? subsResult : []
  const subAssignments = !("error" in subAssignmentsResult) ? subAssignmentsResult : []
  const subPayments = !("error" in subPaymentsResult) ? subPaymentsResult : []

  return (
    <ProjectDetailClient
      project={project}
      userId={user.id}
      initialTab={tab ?? "overview"}
      surveyData={surveyData}
      surveySchedule={surveySchedule}
      techProfiles={techProfiles}
      checklistCategories={checklistCategories}
      availableSubs={availableSubs}
      initialSubAssignments={subAssignments}
      initialSubPayments={subPayments}
    />
  )
}
