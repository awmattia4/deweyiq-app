import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/actions/auth"
import { getProjectPhaseDetail } from "@/actions/projects-field"
import { ProjectWorkflow } from "@/components/field/project-workflow"

export const metadata: Metadata = {
  title: "Project Work",
}

/**
 * Project workflow page — tech field view for a specific project phase.
 *
 * Loads phase detail server-side (tasks, timeLogs, photos, materials, equipment)
 * and passes to ProjectWorkflow client component.
 *
 * Route: /routes/project/[phaseId]
 * Phase 12 Plan 12
 */
export default async function ProjectWorkflowPage({
  params,
}: {
  params: Promise<{ phaseId: string }>
}) {
  const user = await getCurrentUser()

  if (!user) redirect("/login")
  if (user.role === "customer") redirect("/portal")

  const { phaseId } = await params

  const phaseDetail = await getProjectPhaseDetail(phaseId)

  if ("error" in phaseDetail) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4 text-center gap-3">
        <p className="text-sm text-muted-foreground">{phaseDetail.error}</p>
      </div>
    )
  }

  return (
    <ProjectWorkflow
      phaseDetail={phaseDetail}
      orgId={user.org_id}
    />
  )
}
