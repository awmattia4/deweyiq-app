import type { Metadata } from "next"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { getCurrentUser } from "@/actions/auth"
import { resolveCustomerId, getOrgBranding } from "@/actions/portal-data"
import { getPortalProjectDetail } from "@/actions/projects-portal"
import { getProjectMessages, markProjectMessagesRead } from "@/actions/portal-project-messages"
import { ProjectMessageThread } from "@/components/portal/project-message-thread"

export const metadata: Metadata = {
  title: "Project Messages",
}

export const dynamic = "force-dynamic"

/**
 * /portal/projects/[id]/messages — Project-scoped messaging thread (PROJ-88).
 *
 * Uses the same portal_messages table as general messaging, filtered by project_id.
 * Extends the existing MessageThread to support project context.
 */
export default async function PortalProjectMessagesPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const user = await getCurrentUser()
  if (!user) redirect("/portal/login")
  if (user.role !== "customer") redirect("/dashboard")

  const [customerId, branding] = await Promise.all([
    resolveCustomerId(user.org_id, user.email),
    getOrgBranding(user.org_id),
  ])

  if (!customerId) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold tracking-tight">Project Messages</h1>
        <p className="text-sm text-muted-foreground italic">
          Your account is being set up. Please check back shortly.
        </p>
      </div>
    )
  }

  const projectResult = await getPortalProjectDetail(user.org_id, customerId, id)
  if ("error" in projectResult) {
    notFound()
  }

  const companyName = branding?.name ?? "Your Pool Company"

  const [initialMessages] = await Promise.all([
    getProjectMessages(user.org_id, customerId, id),
    markProjectMessagesRead(user.org_id, customerId, id, "customer"),
  ])

  const senderName = user.full_name || user.email

  return (
    <div className="flex flex-col gap-4">
      {/* Breadcrumb */}
      <nav className="text-sm text-muted-foreground">
        <Link href="/portal/projects" className="hover:text-foreground transition-colors">
          My Projects
        </Link>
        <span className="mx-1.5">/</span>
        <Link href={`/portal/projects/${id}`} className="hover:text-foreground transition-colors">
          {projectResult.name}
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-foreground">Messages</span>
      </nav>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Messages</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Chat with {companyName} about {projectResult.name}
        </p>
      </div>

      <div
        className="rounded-xl border border-border/60 bg-card overflow-hidden"
        style={{ height: "calc(100vh - 280px)", minHeight: "400px" }}
      >
        <ProjectMessageThread
          customerId={customerId}
          orgId={user.org_id}
          projectId={id}
          initialMessages={initialMessages}
          senderName={senderName}
          senderRole="customer"
        />
      </div>
    </div>
  )
}
