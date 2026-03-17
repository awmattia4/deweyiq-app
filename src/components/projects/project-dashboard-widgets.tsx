"use client"

/**
 * project-dashboard-widgets.tsx — Dashboard overlay widgets for /projects page.
 *
 * Phase 12 Plan 16 (PROJ-80)
 *
 * Widgets:
 * - PipelineSummaryCards: active project counts, total value, stalled, at-risk
 * - CrewUtilizationWidget: per-tech project hours this week
 * - AlertsPanel: stalled projects, at-risk profitability, expiring permits, overdue inspections
 * - CalendarPreview: upcoming project milestones this week
 */

import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type {
  ProjectDashboardData,
  ProjectDashboardAlert,
  CrewUtilization,
  CalendarMilestone,
} from "@/actions/projects-reports"
import { AlertTriangleIcon, CalendarIcon, TrendingUpIcon, UsersIcon } from "lucide-react"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number)
  const date = new Date(year, month - 1, day)
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

// ---------------------------------------------------------------------------
// PipelineSummaryCards
// ---------------------------------------------------------------------------

interface PipelineSummaryCardsProps {
  data: ProjectDashboardData
}

export function PipelineSummaryCards({ data }: PipelineSummaryCardsProps) {
  const summaryItems = [
    {
      label: "Active Projects",
      value: data.activeCount,
      sublabel: `${formatCurrency(data.totalActiveValue)} total value`,
      highlight: false,
    },
    {
      label: "Stalled",
      value: data.stalledCount,
      sublabel: "No activity 14+ days",
      highlight: data.stalledCount > 0,
    },
    {
      label: "At Risk",
      value: data.atRiskCount,
      sublabel: "Past completion date",
      highlight: data.atRiskCount > 0,
    },
    {
      label: "Collected",
      value: formatCurrency(data.totalCollected),
      sublabel: "Total from projects",
      highlight: false,
    },
    {
      label: "Outstanding",
      value: formatCurrency(data.totalOutstanding),
      sublabel: "Unpaid invoices",
      highlight: data.totalOutstanding > 0,
    },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {summaryItems.map((item) => (
        <Card key={item.label} className="min-w-0">
          <CardContent className="p-4">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">{item.label}</span>
              <span
                className={cn(
                  "text-xl font-bold tracking-tight",
                  item.highlight && "text-amber-500"
                )}
              >
                {item.value}
              </span>
              <span className="text-xs text-muted-foreground">{item.sublabel}</span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// CrewUtilizationWidget
// ---------------------------------------------------------------------------

interface CrewUtilizationWidgetProps {
  utilization: CrewUtilization[]
}

export function CrewUtilizationWidget({ utilization }: CrewUtilizationWidgetProps) {
  if (utilization.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <UsersIcon className="h-4 w-4 text-muted-foreground" />
            Crew Utilization
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground italic">No crew assigned to active project phases.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <UsersIcon className="h-4 w-4 text-muted-foreground" />
          Crew Utilization — This Week
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {utilization.map((tech) => (
            <div key={tech.techId}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium">{tech.techName}</span>
                <span className="text-xs text-muted-foreground">
                  {tech.projectHoursAllocated}h project / {tech.routeHoursEstimated}h route
                </span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    tech.utilizationPct > 80 ? "bg-amber-500" : "bg-primary"
                  )}
                  style={{ width: `${Math.min(100, tech.utilizationPct)}%` }}
                />
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {tech.utilizationPct}% project utilization
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// AlertsPanel
// ---------------------------------------------------------------------------

interface AlertsPanelProps {
  alerts: ProjectDashboardAlert[]
}

export function AlertsPanel({ alerts }: AlertsPanelProps) {
  if (alerts.length === 0) {
    return null
  }

  const alertTypeLabels: Record<string, string> = {
    stalled: "Stalled",
    at_risk: "At Risk",
    permit_expiring: "Permit Expiring",
    inspection_overdue: "Inspection Overdue",
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <AlertTriangleIcon className="h-4 w-4 text-amber-500" />
          Project Alerts
          <Badge variant="secondary" className="ml-auto">
            {alerts.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-border/60">
          {alerts.map((alert, idx) => (
            <Link
              key={`${alert.projectId}-${idx}`}
              href={`/projects/${alert.projectId}`}
              className="flex items-start gap-3 px-5 py-3 hover:bg-muted/40 transition-colors"
            >
              <div
                className={cn(
                  "mt-0.5 h-2 w-2 rounded-full shrink-0",
                  alert.severity === "critical" ? "bg-destructive" : "bg-amber-500"
                )}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium truncate">{alert.projectName}</span>
                  <Badge
                    variant={alert.severity === "critical" ? "destructive" : "secondary"}
                    className="text-[10px] px-1.5 py-0"
                  >
                    {alertTypeLabels[alert.type] ?? alert.type}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{alert.message}</p>
              </div>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// CalendarPreview
// ---------------------------------------------------------------------------

interface CalendarPreviewProps {
  milestones: CalendarMilestone[]
}

export function CalendarPreview({ milestones }: CalendarPreviewProps) {
  const milestoneTypeLabels: Record<string, string> = {
    phase_end: "Phase Due",
    phase_start: "Phase Start",
    payment: "Payment Due",
    inspection: "Inspection",
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <CalendarIcon className="h-4 w-4 text-muted-foreground" />
          Upcoming Milestones
        </CardTitle>
      </CardHeader>
      <CardContent>
        {milestones.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No milestones in the next 14 days.</p>
        ) : (
          <div className="space-y-2">
            {milestones.map((ms, idx) => (
              <Link
                key={`${ms.projectId}-${idx}`}
                href={`/projects/${ms.projectId}`}
                className="flex items-center gap-3 py-1 hover:opacity-80 transition-opacity group"
              >
                <div className="w-14 shrink-0 text-xs font-medium text-muted-foreground">
                  {formatDate(ms.date)}
                </div>
                <div className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                    {ms.projectName}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {milestoneTypeLabels[ms.type] ?? ms.type}: {ms.label}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// ProjectDashboardWidgets (combined)
// ---------------------------------------------------------------------------

interface ProjectDashboardWidgetsProps {
  data: ProjectDashboardData
}

export function ProjectDashboardWidgets({ data }: ProjectDashboardWidgetsProps) {
  return (
    <div className="flex flex-col gap-4">
      {/* Pipeline summary cards */}
      <PipelineSummaryCards data={data} />

      {/* Alerts + Calendar in a 2-col grid */}
      <div className="grid gap-4 lg:grid-cols-2">
        {data.alerts.length > 0 && <AlertsPanel alerts={data.alerts} />}
        <CalendarPreview milestones={data.calendarMilestones} />
      </div>

      {/* Crew utilization (if any assigned) */}
      {data.crewUtilization.length > 0 && (
        <CrewUtilizationWidget utilization={data.crewUtilization} />
      )}
    </div>
  )
}
