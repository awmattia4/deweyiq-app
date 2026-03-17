import type { Metadata } from "next"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { getCurrentUser } from "@/actions/auth"
import { resolveCustomerId } from "@/actions/portal-data"
import { getPortalProjectDetail, getPortalPunchList } from "@/actions/projects-portal"
import { PortalPunchListClient } from "@/components/portal/portal-punch-list-client"

export const metadata: Metadata = {
  title: "Punch List",
}

export const dynamic = "force-dynamic"

export default async function PortalPunchListPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const user = await getCurrentUser()
  if (!user) redirect("/portal/login")
  if (user.role !== "customer") redirect("/dashboard")

  const customerId = await resolveCustomerId(user.org_id, user.email)
  if (!customerId) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold tracking-tight">Punch List</h1>
        <p className="text-sm text-muted-foreground italic">
          Your account is being set up. Please check back shortly.
        </p>
      </div>
    )
  }

  const [projectResult, punchListResult] = await Promise.all([
    getPortalProjectDetail(user.org_id, customerId, id),
    getPortalPunchList(user.org_id, customerId, id),
  ])

  if ("error" in projectResult || "error" in punchListResult) {
    notFound()
  }

  return (
    <div className="flex flex-col gap-6">
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
        <span className="text-foreground">Punch List</span>
      </nav>

      <PortalPunchListClient
        projectId={id}
        projectName={projectResult.name}
        punchList={punchListResult}
      />
    </div>
  )
}
