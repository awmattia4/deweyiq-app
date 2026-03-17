import { notFound, redirect } from "next/navigation"
import { getCurrentUser } from "@/actions/auth"
import { getProjectDetail } from "@/actions/projects"
import { getSurveyData, getSurveySchedule, getSurveyChecklist } from "@/actions/projects-survey"
import { getTechProfiles } from "@/actions/work-orders"
import { getSubcontractors, getSubAssignmentsForProject, getSubPaymentSummary } from "@/actions/projects-subcontractors"
import { getChangeOrders, getChangeOrderImpact } from "@/actions/projects-change-orders"
import { getInspections, getPunchList } from "@/actions/projects-inspections"
import { getWarrantyTerms } from "@/actions/projects-warranty"
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
 * Also fetches survey data, inspection data, punch list, and warranty data.
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

  // Fetch all project data in parallel — including new Plan 15 data
  const [
    project,
    surveyData,
    surveySchedule,
    techProfiles,
    checklistCategories,
    subsResult,
    subAssignmentsResult,
    subPaymentsResult,
    changeOrders,
    changeOrderImpact,
    inspectionsResult,
    punchListResult,
    warrantyTermsResult,
  ] = await Promise.all([
    getProjectDetail(id),
    getSurveyData(id),
    getSurveySchedule(id),
    getTechProfiles(),
    getSurveyChecklist(),
    getSubcontractors(false),
    getSubAssignmentsForProject(id),
    getSubPaymentSummary(id),
    getChangeOrders(id),
    getChangeOrderImpact(id),
    // Plan 15: Inspections
    getInspections(null, id),
    // Plan 15: Punch list
    getPunchList(null, id),
    // Plan 15: Warranty terms (for settings/display)
    getWarrantyTerms(null),
  ])

  if (!project) {
    notFound()
  }

  const availableSubs = !("error" in subsResult) ? subsResult : []
  const subAssignments = !("error" in subAssignmentsResult) ? subAssignmentsResult : []
  const subPayments = !("error" in subPaymentsResult) ? subPaymentsResult : []
  const inspections = !("error" in inspectionsResult) ? inspectionsResult : []
  const punchListItems = !("error" in punchListResult) ? punchListResult : []
  const warrantyTerms = !("error" in warrantyTermsResult) ? warrantyTermsResult : []

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
      initialChangeOrders={changeOrders}
      initialChangeOrderImpact={changeOrderImpact}
      initialInspections={inspections}
      initialPunchList={punchListItems}
      warrantyTerms={warrantyTerms}
    />
  )
}
