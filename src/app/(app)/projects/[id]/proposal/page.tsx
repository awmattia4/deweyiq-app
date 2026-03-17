import { notFound, redirect } from "next/navigation"
import { getCurrentUser } from "@/actions/auth"
import { getProjectDetail } from "@/actions/projects"
import { createProposal } from "@/actions/projects-proposals"
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

  const project = await getProjectDetail(id)
  if (!project) notFound()

  // Get or create the active proposal
  const proposalResult = await createProposal(id)

  if ("error" in proposalResult) {
    // Show builder with no proposal — it will prompt to create one
    return (
      <ProposalBuilder
        project={project}
        initialProposal={null}
        error={proposalResult.error}
      />
    )
  }

  return (
    <ProposalBuilder
      project={project}
      initialProposal={proposalResult.data}
    />
  )
}
