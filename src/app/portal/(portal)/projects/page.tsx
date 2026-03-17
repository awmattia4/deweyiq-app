import type { Metadata } from "next"
import { redirect } from "next/navigation"
import Link from "next/link"
import { getCurrentUser } from "@/actions/auth"
import { resolveCustomerId } from "@/actions/portal-data"
import { getPortalProjects } from "@/actions/projects-portal"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { PROJECT_TYPE_LABELS } from "@/lib/projects-constants"
import { cn } from "@/lib/utils"

export const metadata: Metadata = {
  title: "My Projects",
}

export const dynamic = "force-dynamic"

/**
 * /portal/projects — Customer project list (PROJ-84).
 *
 * Shows active projects at top, completed at bottom.
 * Each card links to /portal/projects/[id].
 */
export default async function PortalProjectsPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/portal/login")
  if (user.role !== "customer") redirect("/dashboard")

  const customerId = await resolveCustomerId(user.org_id, user.email)
  if (!customerId) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold tracking-tight">My Projects</h1>
        <p className="text-sm text-muted-foreground italic">
          Your account is being set up. Please check back shortly.
        </p>
      </div>
    )
  }

  const result = await getPortalProjects(user.org_id, customerId)

  if ("error" in result) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold tracking-tight">My Projects</h1>
        <p className="text-sm text-muted-foreground italic">
          Unable to load projects. Please try again later.
        </p>
      </div>
    )
  }

  const projects = result

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My Projects</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Track the progress of your pool projects.
        </p>
      </div>

      {projects.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground italic">
              No projects on file yet.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {projects.map((project) => {
            const isComplete = ["complete", "warranty_active"].includes(project.stage)
            return (
              <Link key={project.id} href={`/portal/projects/${project.id}`} className="block">
                <Card className="hover:bg-muted/40 active:bg-muted transition-colors cursor-pointer">
                  <CardContent className="p-5">
                    <div className="flex flex-col gap-3">
                      {/* Header row */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold text-base">{project.name}</h3>
                            {project.project_number && (
                              <span className="text-xs text-muted-foreground">
                                #{project.project_number}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {PROJECT_TYPE_LABELS[project.project_type] ?? project.project_type}
                          </p>
                        </div>
                        <Badge
                          variant={isComplete ? "default" : "secondary"}
                          className="shrink-0"
                        >
                          {project.stageLabel}
                        </Badge>
                      </div>

                      {/* Progress bar */}
                      <div>
                        <div className="flex justify-between text-xs text-muted-foreground mb-1">
                          <span>Progress</span>
                          <span>{project.progress_pct}%</span>
                        </div>
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all",
                              isComplete ? "bg-emerald-500" : "bg-primary"
                            )}
                            style={{ width: `${project.progress_pct}%` }}
                          />
                        </div>
                      </div>

                      {/* Footer row */}
                      <div className="flex items-center justify-between text-xs text-muted-foreground flex-wrap gap-2">
                        {project.next_milestone_name && !isComplete && (
                          <span>Next: {project.next_milestone_name}</span>
                        )}
                        {project.estimated_completion_date && !isComplete && (
                          <span>
                            Est. completion:{" "}
                            {new Date(project.estimated_completion_date + "T12:00:00").toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </span>
                        )}
                        {isComplete && (
                          <span className="text-emerald-500 font-medium">Project complete</span>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
