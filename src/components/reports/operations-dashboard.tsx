"use client"

/**
 * OperationsDashboard — Phase 9 Plan 03
 *
 * Route operations command center:
 * - KPI cards: Completion Rate (with trend), On-Time Rate (with trend), Total Stops, Missed Stops
 * - Stacked bar chart: Daily stop outcomes (completed / skipped / missed)
 * - Per-tech completion table: color-coded by performance, includes on-time rate
 * - Time period selector
 * - CSV export (owner-only)
 *
 * All chart colors use hex — no oklch (SVG/WebGL cannot parse oklch per MEMORY.md).
 */

import { useState, useTransition } from "react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts"
import { DownloadIcon, LoaderIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  TimePeriodSelector,
  KpiCard,
  downloadCsv,
  formatPercent,
  CHART_COLORS,
} from "@/components/reports/report-shared"
import { getOperationsMetrics, exportOperationsCsv } from "@/actions/reporting"
import type { OperationsMetricsData } from "@/actions/reporting"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface OperationsDashboardProps {
  initialData: OperationsMetricsData
  defaultStartDate: string
  defaultEndDate: string
  isOwner: boolean
}

// ---------------------------------------------------------------------------
// Date label formatter for XAxis: "Mar 12" style
// ---------------------------------------------------------------------------

function formatDateLabel(dateStr: string): string {
  // dateStr is YYYY-MM-DD from the server
  const [year, month, day] = dateStr.split("-").map(Number)
  const d = new Date(year, month - 1, day)
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

// ---------------------------------------------------------------------------
// Completion rate color
// ---------------------------------------------------------------------------

function completionRateColor(rate: number): string {
  if (rate >= 90) return "text-emerald-400"
  if (rate >= 70) return "text-amber-400"
  return "text-red-400"
}

// ---------------------------------------------------------------------------
// OperationsDashboard
// ---------------------------------------------------------------------------

export function OperationsDashboard({
  initialData,
  defaultStartDate,
  defaultEndDate,
  isOwner,
}: OperationsDashboardProps) {
  const [data, setData] = useState<OperationsMetricsData>(initialData)
  const [startDate, setStartDate] = useState(defaultStartDate)
  const [endDate, setEndDate] = useState(defaultEndDate)
  const [isPending, startTransition] = useTransition()
  const [isExporting, startExportTransition] = useTransition()

  // ------------------------------------------------------------------
  // Handlers
  // ------------------------------------------------------------------

  function handlePeriodChange(start: string, end: string) {
    setStartDate(start)
    setEndDate(end)
    startTransition(async () => {
      const result = await getOperationsMetrics(start, end)
      setData(result)
    })
  }

  function handleExport() {
    startExportTransition(async () => {
      const result = await exportOperationsCsv(startDate, endDate)
      if (result.success && result.csv) {
        downloadCsv(
          result.csv,
          `operations-${startDate}-to-${endDate}.csv`
        )
      }
    })
  }

  // ------------------------------------------------------------------
  // Trend calculations
  // ------------------------------------------------------------------

  const completionTrendPct =
    data.previousCompletionRate > 0
      ? data.completionRate - data.previousCompletionRate
      : data.completionRate > 0
      ? data.completionRate
      : 0

  const onTimeTrendPct =
    data.previousOnTimeRate > 0
      ? data.onTimeRate - data.previousOnTimeRate
      : data.onTimeRate > 0
      ? data.onTimeRate
      : 0

  // ------------------------------------------------------------------
  // Chart data: add formatted date label
  // ------------------------------------------------------------------

  const chartData = data.dailyCompletion.map((d) => ({
    ...d,
    label: formatDateLabel(d.date),
  }))

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  return (
    <div className="flex flex-col gap-6">

      {/* Time period selector + export */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 justify-between">
        <TimePeriodSelector
          startDate={startDate}
          endDate={endDate}
          onChange={handlePeriodChange}
        />
        {isOwner && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={isExporting || isPending}
          >
            {isExporting ? (
              <LoaderIcon className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <DownloadIcon className="h-3.5 w-3.5 mr-1.5" />
            )}
            {isExporting ? "Exporting..." : "Export CSV"}
          </Button>
        )}
      </div>

      {/* Loading shimmer */}
      {isPending && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-28" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-32 mb-2" />
                <Skeleton className="h-3 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* KPI cards */}
      {!isPending && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            title="Completion Rate"
            value={formatPercent(data.completionRate)}
            trend={
              data.previousCompletionRate > 0 || data.completionRate > 0
                ? { value: completionTrendPct, label: "vs previous period" }
                : undefined
            }
            subtitle={
              data.previousCompletionRate === 0 && data.completionRate === 0
                ? "No data for this period"
                : undefined
            }
          />
          <KpiCard
            title="On-Time Rate"
            value={formatPercent(data.onTimeRate)}
            trend={
              data.previousOnTimeRate > 0 || data.onTimeRate > 0
                ? { value: onTimeTrendPct, label: "vs previous period" }
                : undefined
            }
            subtitle={
              data.previousOnTimeRate === 0 && data.onTimeRate === 0
                ? "No data for this period"
                : undefined
            }
          />
          <KpiCard
            title="Total Stops"
            value={String(data.totalStops)}
            subtitle={data.totalStops > 0 ? "past scheduled stops" : "No stops in period"}
          />
          <KpiCard
            title="Missed Stops"
            value={String(data.missedStops)}
            subtitle={
              data.missedStops > 0
                ? "not completed or skipped"
                : "None missed"
            }
            className={data.missedStops > 0 ? "border-red-900/40" : undefined}
          />
        </div>
      )}

      {/* Stacked bar chart — daily stop outcomes */}
      {!isPending && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Daily Route Outcomes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {chartData.length === 0 ? (
              <div className="flex items-center justify-center h-[280px]">
                <p className="text-sm text-muted-foreground italic">
                  No route data for this period
                </p>
              </div>
            ) : (
              <div style={{ height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke={CHART_COLORS.grid}
                      vertical={false}
                    />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: CHART_COLORS.text, fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fill: CHART_COLORS.text, fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                      allowDecimals={false}
                      width={32}
                    />
                    <Tooltip
                      contentStyle={{
                        background: CHART_COLORS.bg,
                        border: `1px solid ${CHART_COLORS.grid}`,
                        borderRadius: 8,
                        color: "#f8fafc",
                        fontSize: 13,
                      }}
                      labelStyle={{ color: CHART_COLORS.text }}
                      cursor={{ fill: "rgba(255,255,255,0.04)" }}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: 12, color: CHART_COLORS.text }}
                    />
                    <Bar
                      dataKey="completed"
                      name="Completed"
                      stackId="outcomes"
                      fill={CHART_COLORS.primary}
                      radius={[0, 0, 0, 0]}
                    />
                    <Bar
                      dataKey="skipped"
                      name="Skipped"
                      stackId="outcomes"
                      fill={CHART_COLORS.warning}
                      radius={[0, 0, 0, 0]}
                    />
                    <Bar
                      dataKey="missed"
                      name="Missed"
                      stackId="outcomes"
                      fill={CHART_COLORS.danger}
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Per-tech completion table */}
      {!isPending && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Completion by Tech
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {data.techMetrics.length === 0 ? (
              <p className="text-sm text-muted-foreground italic px-5 pb-5">
                No tech route data for this period
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                        Tech
                      </th>
                      <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">
                        Total
                      </th>
                      <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">
                        Completed
                      </th>
                      <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">
                        Skipped
                      </th>
                      <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">
                        Missed
                      </th>
                      <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">
                        Completion
                      </th>
                      <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">
                        On-Time
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.techMetrics.map((tech) => (
                      <tr
                        key={tech.techId}
                        className={cn(
                          "border-b border-border/50 transition-colors hover:bg-muted/10",
                          tech.missedStops > 2 && "bg-red-950/20"
                        )}
                      >
                        <td className="px-4 py-2.5 font-medium">
                          {tech.techName}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                          {tech.totalStops}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-emerald-400">
                          {tech.completedStops}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-amber-400">
                          {tech.skippedStops}
                        </td>
                        <td className={cn(
                          "px-4 py-2.5 text-right tabular-nums",
                          tech.missedStops > 0 ? "text-red-400 font-medium" : "text-muted-foreground"
                        )}>
                          {tech.missedStops}
                        </td>
                        <td className={cn(
                          "px-4 py-2.5 text-right tabular-nums font-medium",
                          completionRateColor(tech.completionRate)
                        )}>
                          {formatPercent(tech.completionRate)}
                        </td>
                        <td className={cn(
                          "px-4 py-2.5 text-right tabular-nums",
                          completionRateColor(tech.onTimeRate)
                        )}>
                          {tech.completedStops > 0
                            ? formatPercent(tech.onTimeRate)
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

    </div>
  )
}
