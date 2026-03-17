import { notFound, redirect } from "next/navigation"
import { getCurrentUser } from "@/actions/auth"
import { getProjectDetail } from "@/actions/projects"
import { getProposalForProject, createProposal } from "@/actions/projects-proposals"
import { ProposalBuilder } from "@/components/projects/proposal-builder"

interface ProposalPageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: ProposalPageProps) {
  const { id } = await params
  const project = await getProjectDetail(id)
  return {
    title: project
      ? `Proposal — ${project.project_number ?? "Project"}: ${project.name}`
      : "Proposal",
  }
}

/**
 * ProposalPage — Server component for the project proposal builder.
 *
 * Fetches the project and its active proposal (creating a draft if none exists),
 * then renders the ProposalBuilder client component.
 *
 * Role guard: owner and office only.
 */
export default async function ProposalPage({ params }: ProposalPageProps) {
  const user = await getCurrentUser()

  if (!user) redirect("/login")
  if (user.role === "tech") redirect("/routes")
  if (user.role === "customer") redirect("/portal")

  const { id } = await params

  // Fetch project and existing proposal in parallel
  const [project, existingProposal] = await Promise.all([
    getProjectDetail(id),
    getProposalForProject(id),
  ])
  if (!project) notFound()

  // Use existing proposal or create a draft if none exists
  if (existingProposal && "data" in existingProposal) {
    return (
      <ProposalBuilder
        project={project}
        initialProposal={existingProposal.data}
      />
    )
  }

  // No existing proposal (null or error) — create a draft
  const createResult = await createProposal(id)

  if ("error" in createResult) {
    return (
      <ProposalBuilder
        project={project}
        initialProposal={null}
        error={createResult.error}
      />
    )
  }

  return (
    <ProposalBuilder
      project={project}
      initialProposal={createResult.data}
    />
  )
}
