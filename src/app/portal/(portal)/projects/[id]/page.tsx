import type { Metadata } from "next"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { getCurrentUser } from "@/actions/auth"
import { resolveCustomerId } from "@/actions/portal-data"
import { getPortalProjectDetail } from "@/actions/projects-portal"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { PROJECT_TYPE_LABELS } from "@/lib/projects-constants"
import { cn } from "@/lib/utils"
import { CheckCircle2Icon, CircleDotIcon, CircleIcon, ChevronRightIcon } from "lucide-react"
import type { PortalPhase, PortalChangeOrderSummary } from "@/actions/projects-portal"

export const metadata: Metadata = {
  title: "Project Details",
}

export const dynamic = "force-dynamic"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function PhaseStatusIcon({ status }: { status: string }) {
  if (status === "complete") return <CheckCircle2Icon className="h-5 w-5 text-emerald-500 shrink-0" />
  if (status === "in_progress") return <CircleDotIcon className="h-5 w-5 text-primary shrink-0" />
  return <CircleIcon className="h-5 w-5 text-muted-foreground/40 shrink-0" />
}

function formatDateStr(dateStr: string | null): string | null {
  if (!dateStr) return null
  const [year, month, day] = dateStr.split("-").map(Number)
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

// ---------------------------------------------------------------------------
// PhaseTimeline
// ---------------------------------------------------------------------------

function PhaseTimeline({ phases }: { phases: PortalPhase[] }) {
  return (
    <div className="space-y-4">
      {phases.map((phase, idx) => (
        <div key={phase.id} className="flex gap-4">
          {/* Timeline connector */}
          <div className="flex flex-col items-center">
            <PhaseStatusIcon status={phase.status} />
            {idx < phases.length - 1 && (
              <div className="w-px flex-1 mt-1 bg-border/60 min-h-[16px]" />
            )}
          </div>

          {/* Phase content */}
          <div className="flex-1 pb-4">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={cn(
                  "text-sm font-semibold",
                  phase.status === "complete"
                    ? "text-foreground"
                    : phase.status === "in_progress"
                    ? "text-primary"
                    : "text-muted-foreground"
                )}
              >
                {phase.name}
              </span>
              <Badge
                variant={
                  phase.status === "complete"
                    ? "default"
                    : phase.status === "in_progress"
                    ? "secondary"
                    : "outline"
                }
                className="text-[10px] px-1.5"
              >
                {phase.status === "not_started"
                  ? "Upcoming"
                  : phase.status === "in_progress"
                  ? "In Progress"
                  : phase.status === "complete"
                  ? "Complete"
                  : phase.status}
              </Badge>
            </div>

            {/* Dates */}
            {(phase.actual_start_date || phase.estimated_start_date) && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {phase.actual_start_date
                  ? `Started ${formatDateStr(phase.actual_start_date)}`
                  : `Est. start ${formatDateStr(phase.estimated_start_date)}`}
                {(phase.actual_end_date || phase.estimated_end_date) && (
                  <> &mdash; {phase.actual_end_date
                    ? `Completed ${formatDateStr(phase.actual_end_date)}`
                    : `Est. complete ${formatDateStr(phase.estimated_end_date)}`}
                  </>
                )}
              </p>
            )}

            {/* Photos for this phase (show up to 4) */}
            {phase.photos.length > 0 && (
              <div className="mt-2 flex gap-2 flex-wrap">
                {phase.photos.slice(0, 4).map((photo) =>
                  photo.signed_url ? (
                    <a
                      key={photo.id}
                      href={photo.signed_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block"
                    >
                      <img
                        src={photo.signed_url}
                        alt={photo.caption ?? `${phase.name} photo`}
                        className="h-16 w-16 rounded-lg object-cover border border-border hover:opacity-80 transition-opacity"
                      />
                    </a>
                  ) : null
                )}
                {phase.photos.length > 4 && (
                  <div className="h-16 w-16 rounded-lg border border-border bg-muted flex items-center justify-center">
                    <span className="text-xs text-muted-foreground">+{phase.photos.length - 4}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// ChangeOrdersList
// ---------------------------------------------------------------------------

function ChangeOrdersList({ changeOrders, projectId }: { changeOrders: PortalChangeOrderSummary[]; projectId: string }) {
  if (changeOrders.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      {changeOrders.map((co) => (
        <div
          key={co.id}
          className="flex items-start justify-between gap-3 rounded-lg border border-border/60 bg-card p-4"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium">
                {co.change_order_number ?? "Change Order"}
              </span>
              <Badge
                variant={co.status === "approved" ? "default" : "secondary"}
                className="text-[10px] px-1.5"
              >
                {co.status === "pending_approval" ? "Awaiting Approval" : "Approved"}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{co.description}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Cost impact:{" "}
              <span className={cn("font-medium", parseFloat(co.cost_impact) >= 0 ? "text-amber-500" : "text-emerald-500")}>
                {parseFloat(co.cost_impact) >= 0 ? "+" : ""}
                {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(parseFloat(co.cost_impact))}
              </span>
              {co.schedule_impact_days !== 0 && (
                <>, {co.schedule_impact_days > 0 ? "+" : ""}{co.schedule_impact_days} days</>
              )}
            </p>
          </div>
          {co.status === "pending_approval" && (
            <p className="text-xs text-amber-500 mt-1">
              Pending your approval — check your email for the approval link
            </p>
          )}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function PortalProjectDetailPage({
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
        <h1 className="text-2xl font-bold tracking-tight">Project</h1>
        <p className="text-sm text-muted-foreground italic">
          Your account is being set up. Please check back shortly.
        </p>
      </div>
    )
  }

  const result = await getPortalProjectDetail(user.org_id, customerId, id)

  if ("error" in result) {
    notFound()
  }

  const project = result
  const isComplete = ["complete", "warranty_active"].includes(project.stage)
  const isPunchList = project.stage === "punch_list"
  const isWarrantyActive = project.stage === "warranty_active"

  return (
    <div className="flex flex-col gap-6">
      {/* Breadcrumb */}
      <nav className="text-sm text-muted-foreground">
        <Link href="/portal/projects" className="hover:text-foreground transition-colors">
          My Projects
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-foreground">{project.name}</span>
      </nav>

      {/* Header */}
      <div>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{project.name}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {PROJECT_TYPE_LABELS[project.project_type] ?? project.project_type}
              {project.project_number && ` — ${project.project_number}`}
            </p>
          </div>
          <Badge variant={isComplete ? "default" : "secondary"} className="text-sm px-3 py-1">
            {project.stageLabel}
          </Badge>
        </div>

        {/* Progress bar */}
        <div className="mt-4">
          <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
            <span>Overall progress</span>
            <span>{project.progress_pct}%</span>
          </div>
          <div className="h-2.5 rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                isComplete ? "bg-emerald-500" : "bg-primary"
              )}
              style={{ width: `${project.progress_pct}%` }}
            />
          </div>
        </div>

        {/* Key dates */}
        {(project.estimated_completion_date || project.actual_completion_date) && (
          <p className="text-sm text-muted-foreground mt-2">
            {project.actual_completion_date
              ? `Completed ${formatDateStr(project.actual_completion_date)}`
              : `Estimated completion: ${formatDateStr(project.estimated_completion_date)}`}
          </p>
        )}
      </div>

      {/* Quick navigation links */}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link href={`/portal/projects/${id}/financials`}>Financials</Link>
        </Button>
        {(isPunchList || isComplete) && (
          <Button variant="outline" size="sm" asChild>
            <Link href={`/portal/projects/${id}/punch-list`}>Punch List</Link>
          </Button>
        )}
        <Button variant="outline" size="sm" asChild>
          <Link href={`/portal/projects/${id}/messages`}>Messages</Link>
        </Button>
      </div>

      {/* Change Orders (if any pending approval) */}
      {project.changeOrders.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-base font-semibold">Change Orders</h2>
          <ChangeOrdersList changeOrders={project.changeOrders} projectId={id} />
        </div>
      )}

      {/* Timeline */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Project Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          {project.phases.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              Project phases will appear here once scheduled.
            </p>
          ) : (
            <PhaseTimeline phases={project.phases} />
          )}
        </CardContent>
      </Card>

      {/* Warranty info */}
      {isWarrantyActive && (
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <CheckCircle2Icon className="h-5 w-5 text-emerald-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                  Warranty Active
                </p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Your project warranty is in effect. You can submit warranty claims through the{" "}
                  <Link href={`/portal/projects/${id}/messages`} className="text-primary hover:underline">
                    Messages
                  </Link>{" "}
                  section.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
