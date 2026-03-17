"use client"

/**
 * project-reports.tsx — Project analytics section for the /reports page.
 *
 * Phase 12 Plan 16 (PROJ-82, PROJ-83)
 *
 * Sections:
 * - Revenue by period (monthly bar chart)
 * - Margin by project type (table)
 * - Lead-to-close conversion funnel (PROJ-83)
 * - Duration by type (table)
 * - Subcontractor spend (table)
 *
 * Filter controls: date range, project type
 */

import { useState, useTransition } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type {
  ProjectReportsData,
  ProjectReportsFilters,
  ProjectRevenueByPeriod,
  MarginByType,
  ConversionFunnelData,
  DurationByType,
  SubcontractorSpend,
} from "@/actions/projects-reports"
import { getProjectReports } from "@/actions/projects-reports"

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

function formatPeriod(period: string): string {
  const [year, month] = period.split("-")
  const date = new Date(Number(year), Number(month) - 1, 1)
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" })
}

const PROJECT_TYPE_LABELS: Record<string, string> = {
  new_pool: "New Pool",
  renovation: "Renovation",
  equipment: "Equipment",
  remodel: "Remodel",
  replaster: "Replaster",
  other: "Other",
}

// ---------------------------------------------------------------------------
// RevenueByPeriodChart
// ---------------------------------------------------------------------------

function RevenueByPeriodChart({ data }: { data: ProjectRevenueByPeriod[] }) {
  if (data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic">
        No completed project revenue in the selected period.
      </p>
    )
  }

  const maxRevenue = Math.max(...data.map((d) => d.revenue), 1)

  return (
    <div className="space-y-2">
      {data.map((row) => (
        <div key={row.period} className="flex items-center gap-3">
          <div className="w-20 shrink-0 text-xs text-muted-foreground text-right">
            {formatPeriod(row.period)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="h-6 rounded bg-muted relative overflow-hidden">
              <div
                className="h-full rounded bg-primary transition-all"
                style={{ width: `${(row.revenue / maxRevenue) * 100}%` }}
              />
              <span className="absolute inset-0 flex items-center pl-2 text-xs font-medium text-foreground">
                {formatCurrency(row.revenue)}
              </span>
            </div>
          </div>
          <div className="w-16 shrink-0 text-xs text-muted-foreground text-right">
            {row.projectCount} proj
          </div>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// MarginByTypeTable
// ---------------------------------------------------------------------------

function MarginByTypeTable({ data }: { data: MarginByType[] }) {
  if (data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic">
        No completed projects with cost data yet.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left font-medium text-muted-foreground pb-2 pr-4">Type</th>
            <th className="text-right font-medium text-muted-foreground pb-2 pr-4">Projects</th>
            <th className="text-right font-medium text-muted-foreground pb-2 pr-4">Total Revenue</th>
            <th className="text-right font-medium text-muted-foreground pb-2">Avg Margin</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.projectType} className="border-b border-border/40">
              <td className="py-2.5 pr-4 font-medium">
                {PROJECT_TYPE_LABELS[row.projectType] ?? row.projectType}
              </td>
              <td className="py-2.5 pr-4 text-right text-muted-foreground">{row.projectCount}</td>
              <td className="py-2.5 pr-4 text-right">{formatCurrency(row.totalRevenue)}</td>
              <td className="py-2.5 text-right">
                <Badge
                  variant={row.avgMarginPct >= 30 ? "default" : row.avgMarginPct >= 15 ? "secondary" : "destructive"}
                  className="text-xs"
                >
                  {row.avgMarginPct}%
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ConversionFunnel
// ---------------------------------------------------------------------------

function ConversionFunnel({ data }: { data: ConversionFunnelData }) {
  const stages = [
    { label: "Leads", value: data.leadsCreated, color: "bg-sky-500" },
    { label: "Proposals Sent", value: data.proposalsSent, color: "bg-violet-500" },
    { label: "Proposals Approved", value: data.proposalsApproved, color: "bg-teal-500" },
    { label: "Completed", value: data.projectsCompleted, color: "bg-emerald-500" },
  ]

  const maxValue = Math.max(...stages.map((s) => s.value), 1)

  return (
    <div className="space-y-3">
      {stages.map((stage, idx) => {
        const width = (stage.value / maxValue) * 100
        const conversionPct =
          idx > 0 && stages[idx - 1].value > 0
            ? Math.round((stage.value / stages[idx - 1].value) * 100)
            : null
        return (
          <div key={stage.label}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium">{stage.label}</span>
              <div className="flex items-center gap-2">
                {conversionPct !== null && (
                  <span className="text-xs text-muted-foreground">
                    {conversionPct}% conversion
                  </span>
                )}
                <span className="text-sm font-bold">{stage.value}</span>
              </div>
            </div>
            <div className="h-7 rounded bg-muted overflow-hidden">
              <div
                className={cn("h-full rounded transition-all", stage.color)}
                style={{ width: `${width}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// DurationByTypeTable
// ---------------------------------------------------------------------------

function DurationByTypeTable({ data }: { data: DurationByType[] }) {
  if (data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic">
        No completed projects with duration data.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left font-medium text-muted-foreground pb-2 pr-4">Type</th>
            <th className="text-right font-medium text-muted-foreground pb-2 pr-4">Projects</th>
            <th className="text-right font-medium text-muted-foreground pb-2">Avg Duration</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.projectType} className="border-b border-border/40">
              <td className="py-2.5 pr-4 font-medium">
                {PROJECT_TYPE_LABELS[row.projectType] ?? row.projectType}
              </td>
              <td className="py-2.5 pr-4 text-right text-muted-foreground">{row.projectCount}</td>
              <td className="py-2.5 text-right">{row.avgDaysToComplete} days</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// SubcontractorSpendTable
// ---------------------------------------------------------------------------

function SubcontractorSpendTable({ data }: { data: SubcontractorSpend[] }) {
  if (data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic">
        No subcontractor spend recorded.
      </p>
    )
  }

  const totalSpend = data.reduce((sum, s) => sum + s.totalSpend, 0)

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left font-medium text-muted-foreground pb-2 pr-4">Subcontractor</th>
            <th className="text-left font-medium text-muted-foreground pb-2 pr-4">Trade</th>
            <th className="text-right font-medium text-muted-foreground pb-2">Total Paid</th>
          </tr>
        </thead>
        <tbody>
          {data.sort((a, b) => b.totalSpend - a.totalSpend).map((row) => (
            <tr key={row.subId} className="border-b border-border/40">
              <td className="py-2.5 pr-4 font-medium">{row.subName}</td>
              <td className="py-2.5 pr-4 text-muted-foreground capitalize">{row.trade}</td>
              <td className="py-2.5 text-right">{formatCurrency(row.totalSpend)}</td>
            </tr>
          ))}
          <tr className="font-semibold">
            <td className="py-2.5 pr-4">Total</td>
            <td />
            <td className="py-2.5 text-right">{formatCurrency(totalSpend)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ProjectReports (main)
// ---------------------------------------------------------------------------

interface ProjectReportsProps {
  initialData: ProjectReportsData
  defaultStartDate: string
  defaultEndDate: string
}

export function ProjectReports({
  initialData,
  defaultStartDate,
  defaultEndDate,
}: ProjectReportsProps) {
  const [data, setData] = useState<ProjectReportsData>(initialData)
  const [startDate, setStartDate] = useState(defaultStartDate)
  const [endDate, setEndDate] = useState(defaultEndDate)
  const [projectType, setProjectType] = useState("all")
  const [isPending, startTransition] = useTransition()

  function handleApplyFilters() {
    const filters: ProjectReportsFilters = {
      startDate,
      endDate,
      projectType: projectType === "all" ? undefined : projectType,
    }
    startTransition(async () => {
      const result = await getProjectReports(filters)
      if (!("error" in result)) {
        setData(result)
      }
    })
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Filter Controls */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">From</label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-36 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">To</label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-36 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Project Type</label>
              <Select value={projectType} onValueChange={setProjectType}>
                <SelectTrigger className="w-40 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {Object.entries(PROJECT_TYPE_LABELS).map(([val, label]) => (
                    <SelectItem key={val} value={val}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              size="sm"
              onClick={handleApplyFilters}
              disabled={isPending}
            >
              {isPending ? "Loading..." : "Apply"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Revenue by Period */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Revenue by Period</CardTitle>
        </CardHeader>
        <CardContent>
          <RevenueByPeriodChart data={data.revenueByPeriod} />
        </CardContent>
      </Card>

      {/* Grid: Margin by type + Lead-to-close */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Margin by Project Type</CardTitle>
          </CardHeader>
          <CardContent>
            <MarginByTypeTable data={data.marginByType} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Lead-to-Close Funnel</CardTitle>
          </CardHeader>
          <CardContent>
            <ConversionFunnel data={data.conversionFunnel} />
          </CardContent>
        </Card>
      </div>

      {/* Grid: Duration + Sub spend */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Avg Duration by Type</CardTitle>
          </CardHeader>
          <CardContent>
            <DurationByTypeTable data={data.durationByType} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Subcontractor Spend</CardTitle>
          </CardHeader>
          <CardContent>
            <SubcontractorSpendTable data={data.subcontractorSpend} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
