"use client"

import { useState, useTransition } from "react"
import { ArrowUpRightIcon, ArrowDownRightIcon, DownloadIcon, TrophyIcon } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TimePeriodSelector, KpiCard, downloadCsv, formatCurrency, formatPercent } from "@/components/reports/report-shared"
import { getTeamMetrics, getPayrollPrep, exportPayrollCsv, exportTeamCsv } from "@/actions/reporting"
import { cn } from "@/lib/utils"
import type { TeamMetricsData, PayrollRow, TechScorecardRow } from "@/actions/reporting"

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TeamDashboardProps {
  initialTeamData: TeamMetricsData
  initialPayrollData: PayrollRow[]
  defaultStartDate: string
  defaultEndDate: string
  isOwner: boolean
}

// ---------------------------------------------------------------------------
// Trend indicator
// ---------------------------------------------------------------------------

function TrendBadge({
  value,
  inversed = false,
  unit = "",
}: {
  value: number
  inversed?: boolean
  unit?: string
}) {
  // inversed = true means lower is better (e.g. avg stop time)
  const isPositive = inversed ? value <= 0 : value >= 0
  const Icon = isPositive ? ArrowUpRightIcon : ArrowDownRightIcon
  const abs = Math.abs(value)

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-medium",
        isPositive ? "text-emerald-400" : "text-red-400"
      )}
    >
      <Icon className="h-3 w-3" />
      {value > 0 ? "+" : ""}{abs.toFixed(1)}{unit}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Leaderboard view
// ---------------------------------------------------------------------------

type SortMetric = "stopsPerDay" | "avgStopMinutes" | "onTimeRate" | "chemistryAccuracy"

const SORT_OPTIONS: Array<{ value: SortMetric; label: string }> = [
  { value: "stopsPerDay", label: "Stops/Day" },
  { value: "avgStopMinutes", label: "Avg Stop Time" },
  { value: "onTimeRate", label: "On-Time Rate" },
  { value: "chemistryAccuracy", label: "Chemistry Accuracy" },
]

function LeaderboardView({ techs }: { techs: TechScorecardRow[] }) {
  const [sortBy, setSortBy] = useState<SortMetric>("stopsPerDay")

  const sorted = [...techs].sort((a, b) => {
    if (sortBy === "avgStopMinutes") return a.avgStopMinutes - b.avgStopMinutes // lower is better
    return (b[sortBy] as number) - (a[sortBy] as number)
  })

  if (sorted.length === 0) {
    return (
      <div className="text-sm text-muted-foreground italic text-center py-8">
        No completed stops in this period.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Sort by:</span>
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortMetric)}>
          <SelectTrigger className="w-44 h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left px-3 py-2.5 font-medium text-muted-foreground w-8">#</th>
              <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Tech</th>
              <th className="text-right px-3 py-2.5 font-medium text-muted-foreground whitespace-nowrap">Stops/Day</th>
              <th className="text-right px-3 py-2.5 font-medium text-muted-foreground whitespace-nowrap">Avg Stop (min)</th>
              <th className="text-right px-3 py-2.5 font-medium text-muted-foreground whitespace-nowrap">On-Time</th>
              <th className="text-right px-3 py-2.5 font-medium text-muted-foreground whitespace-nowrap">Chem Accuracy</th>
              <th className="text-right px-3 py-2.5 font-medium text-muted-foreground whitespace-nowrap">Checklist</th>
              <th className="text-right px-3 py-2.5 font-medium text-muted-foreground whitespace-nowrap">Photo Rate</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((tech, idx) => (
              <tr key={tech.techId} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                <td className="px-3 py-2.5 text-muted-foreground">
                  {idx === 0 ? (
                    <TrophyIcon className="h-4 w-4 text-amber-400" aria-label="Top performer" />
                  ) : (
                    <span className="text-xs">{idx + 1}</span>
                  )}
                </td>
                <td className="px-3 py-2.5 font-medium">{tech.techName}</td>
                <td className="px-3 py-2.5 text-right">
                  <div>{tech.stopsPerDay.toFixed(1)}</div>
                  <TrendBadge value={tech.stopsPerDayTrend} />
                </td>
                <td className="px-3 py-2.5 text-right">
                  <div>{tech.avgStopMinutes > 0 ? tech.avgStopMinutes.toFixed(0) : "—"}</div>
                  {tech.avgStopMinutes > 0 && <TrendBadge value={tech.avgStopMinutesTrend} inversed />}
                </td>
                <td className="px-3 py-2.5 text-right">
                  <div>{formatPercent(tech.onTimeRate)}</div>
                  <TrendBadge value={tech.onTimeRateTrend} unit="%" />
                </td>
                <td className="px-3 py-2.5 text-right">
                  <div>{formatPercent(tech.chemistryAccuracy)}</div>
                  <TrendBadge value={tech.chemistryAccuracyTrend} unit="%" />
                </td>
                <td className="px-3 py-2.5 text-right">{formatPercent(tech.checklistCompletionRate)}</td>
                <td className="px-3 py-2.5 text-right">{formatPercent(tech.photoRate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Comparison view
// ---------------------------------------------------------------------------

function ComparisonView({ techs }: { techs: TechScorecardRow[] }) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(techs.slice(0, 2).map((t) => t.techId))
  )

  function toggleTech(id: string) {
    const next = new Set(selectedIds)
    if (next.has(id)) {
      if (next.size > 1) next.delete(id) // always keep at least 1
    } else {
      if (next.size < 3) next.add(id) // max 3
    }
    setSelectedIds(next)
  }

  const selected = techs.filter((t) => selectedIds.has(t.techId))

  // Compute max values for bar scaling
  const maxStopsPerDay = Math.max(...techs.map((t) => t.stopsPerDay), 1)
  const maxAvgMin = Math.max(...techs.map((t) => t.avgStopMinutes), 1)

  type MetricKey = "stopsPerDay" | "onTimeRate" | "chemistryAccuracy" | "checklistCompletionRate" | "photoRate" | "avgStopMinutes"
  const metrics: Array<{
    label: string
    key: MetricKey
    max: number
    unit: string
    inversed?: boolean
  }> = [
    { label: "Stops/Day", key: "stopsPerDay", max: maxStopsPerDay, unit: "" },
    { label: "On-Time Rate", key: "onTimeRate", max: 100, unit: "%" },
    { label: "Chem Accuracy", key: "chemistryAccuracy", max: 100, unit: "%" },
    { label: "Checklist Rate", key: "checklistCompletionRate", max: 100, unit: "%" },
    { label: "Photo Rate", key: "photoRate", max: 100, unit: "%" },
    { label: "Avg Stop (min)", key: "avgStopMinutes", max: maxAvgMin, unit: " min", inversed: true },
  ]

  const COLORS = ["#0ea5e9", "#22d3ee", "#2dd4bf"]

  if (techs.length === 0) {
    return (
      <div className="text-sm text-muted-foreground italic text-center py-8">
        No completed stops in this period.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Tech selector */}
      <div className="flex flex-wrap gap-2">
        {techs.map((t, idx) => {
          const active = selectedIds.has(t.techId)
          const colorIdx = [...selectedIds].indexOf(t.techId)
          return (
            <button
              key={t.techId}
              type="button"
              onClick={() => toggleTech(t.techId)}
              className={cn(
                "cursor-pointer rounded-full px-3 py-1 text-sm font-medium border transition-colors",
                active
                  ? "bg-primary/10 border-primary/40 text-foreground"
                  : "border-border text-muted-foreground hover:border-border/80"
              )}
              style={active && colorIdx >= 0 ? { borderColor: COLORS[colorIdx % COLORS.length] } : undefined}
            >
              {t.techName}
            </button>
          )
        })}
        <span className="text-xs text-muted-foreground self-center ml-1">Select up to 3</span>
      </div>

      {/* Side-by-side metric bars */}
      <div className="flex flex-col gap-4">
        {metrics.map((metric) => (
          <div key={metric.key}>
            <div className="text-xs font-medium text-muted-foreground mb-1.5">{metric.label}</div>
            <div className="flex flex-col gap-1.5">
              {selected.map((tech, i) => {
                const val = tech[metric.key] as number
                const pct = metric.max > 0 ? Math.min((val / metric.max) * 100, 100) : 0
                // For avg stop time, lower bar = better (inversed)
                const barPct = metric.inversed && metric.max > 0
                  ? Math.min((val / metric.max) * 100, 100)
                  : pct
                return (
                  <div key={tech.techId} className="flex items-center gap-2">
                    <span className="text-xs w-28 truncate text-muted-foreground">{tech.techName}</span>
                    <div className="flex-1 h-5 bg-muted/30 rounded-sm overflow-hidden">
                      <div
                        className="h-full rounded-sm transition-all"
                        style={{
                          width: `${barPct}%`,
                          backgroundColor: COLORS[i % COLORS.length],
                        }}
                      />
                    </div>
                    <span className="text-xs w-16 text-right font-medium">
                      {val > 0 ? val.toFixed(1) : "—"}{metric.unit}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Payroll section
// ---------------------------------------------------------------------------

function PayrollSection({
  payrollData,
  startDate,
  endDate,
}: {
  payrollData: PayrollRow[]
  startDate: string
  endDate: string
}) {
  const [exporting, startExport] = useTransition()

  const totalPayroll = payrollData.reduce((s, r) => s + r.totalGross, 0)
  const totalStops = payrollData.reduce((s, r) => s + r.completedStops, 0)
  const totalCommissions = payrollData.reduce((s, r) => s + r.upsellCommissions, 0)

  function handleExport() {
    startExport(async () => {
      const result = await exportPayrollCsv(startDate, endDate)
      if (result.success && result.csv) {
        downloadCsv(result.csv, `payroll-${startDate}-${endDate}.csv`)
      }
    })
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Summary KPIs */}
      <div className="grid grid-cols-3 gap-4">
        <KpiCard title="Total Payroll" value={formatCurrency(totalPayroll)} />
        <KpiCard title="Total Stops" value={String(totalStops)} />
        <KpiCard title="Total Commissions" value={formatCurrency(totalCommissions)} />
      </div>

      {/* Payroll table */}
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Employee</th>
              <th className="text-left px-3 py-2.5 font-medium text-muted-foreground whitespace-nowrap">Pay Type</th>
              <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">Stops</th>
              <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">Hours</th>
              <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">Rate</th>
              <th className="text-right px-3 py-2.5 font-medium text-muted-foreground whitespace-nowrap">Base Pay</th>
              <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">Commissions</th>
              <th className="text-right px-3 py-2.5 font-medium text-muted-foreground whitespace-nowrap">Total Gross</th>
            </tr>
          </thead>
          <tbody>
            {payrollData.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-sm text-muted-foreground italic">
                  No team members found.
                </td>
              </tr>
            )}
            {payrollData.map((row) => (
              <tr key={row.techId} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                <td className="px-3 py-2.5 font-medium">{row.name}</td>
                <td className="px-3 py-2.5">
                  <Badge variant="outline" className="text-xs">
                    {row.payType === "per_stop" ? "Per-Stop" : "Hourly"}
                  </Badge>
                </td>
                <td className="px-3 py-2.5 text-right">{row.completedStops}</td>
                <td className="px-3 py-2.5 text-right text-muted-foreground">
                  {row.payType === "hourly"
                    ? row.hoursWorked != null
                      ? row.hoursWorked.toFixed(1)
                      : <span className="text-xs italic">N/A (no timing data)</span>
                    : "—"}
                </td>
                <td className="px-3 py-2.5 text-right">
                  {row.payRateConfigured ? (
                    <span>
                      {formatCurrency(row.payRate)}
                      <span className="text-muted-foreground text-xs">
                        {row.payType === "per_stop" ? "/stop" : "/hr"}
                      </span>
                    </span>
                  ) : (
                    <span className="text-xs text-amber-400 italic">Not configured</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right">{formatCurrency(row.basePay)}</td>
                <td className="px-3 py-2.5 text-right">{formatCurrency(row.upsellCommissions)}</td>
                <td className="px-3 py-2.5 text-right font-semibold">{formatCurrency(row.totalGross)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Export + note */}
      <div className="flex flex-col gap-2">
        <div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={exporting}
            className="cursor-pointer"
          >
            <DownloadIcon className="h-4 w-4" />
            {exporting ? "Exporting…" : "Download Payroll CSV"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          This is a payroll prep export for import into Gusto, ADP, or similar. Phase 11 adds native payroll processing.
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// TeamDashboard
// ---------------------------------------------------------------------------

type Section = "scorecards" | "payroll"
type ViewMode = "leaderboard" | "compare"

export function TeamDashboard({
  initialTeamData,
  initialPayrollData,
  defaultStartDate,
  defaultEndDate,
  isOwner,
}: TeamDashboardProps) {
  const [section, setSection] = useState<Section>("scorecards")
  const [viewMode, setViewMode] = useState<ViewMode>("leaderboard")
  const [teamData, setTeamData] = useState(initialTeamData)
  const [payrollData, setPayrollData] = useState(initialPayrollData)
  const [startDate, setStartDate] = useState(defaultStartDate)
  const [endDate, setEndDate] = useState(defaultEndDate)
  const [loading, startTransition] = useTransition()
  const [exporting, startExport] = useTransition()

  function handlePeriodChange(start: string, end: string) {
    setStartDate(start)
    setEndDate(end)
    startTransition(async () => {
      const [newTeam, newPayroll] = await Promise.all([
        getTeamMetrics(start, end),
        isOwner ? getPayrollPrep(start, end) : Promise.resolve([] as PayrollRow[]),
      ])
      setTeamData(newTeam)
      if (isOwner) setPayrollData(newPayroll)
    })
  }

  function handleExportTeam() {
    startExport(async () => {
      const result = await exportTeamCsv(startDate, endDate)
      if (result.success && result.csv) {
        downloadCsv(result.csv, `team-scorecard-${startDate}-${endDate}.csv`)
      }
    })
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Section toggle */}
      <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/30 p-1 w-fit">
        {(["scorecards", "payroll"] as Section[])
          .filter((s) => s === "scorecards" || isOwner)
          .map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSection(s)}
              className={cn(
                "cursor-pointer rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
                section === s
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {s === "scorecards" ? "Scorecards" : "Payroll Prep"}
            </button>
          ))}
      </div>

      {/* Scorecards section */}
      {section === "scorecards" && (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <TimePeriodSelector
              startDate={startDate}
              endDate={endDate}
              onChange={handlePeriodChange}
            />
            <div className="flex items-center gap-2">
              {isOwner && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportTeam}
                  disabled={exporting}
                  className="cursor-pointer"
                >
                  <DownloadIcon className="h-4 w-4" />
                  {exporting ? "Exporting…" : "Export CSV"}
                </Button>
              )}
              <div className="flex items-center gap-1 rounded-md border border-border bg-muted/30 p-0.5">
                {(["leaderboard", "compare"] as ViewMode[]).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setViewMode(v)}
                    className={cn(
                      "cursor-pointer rounded px-3 py-1 text-xs font-medium transition-colors",
                      viewMode === v
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {v === "leaderboard" ? "Leaderboard" : "Compare"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {loading ? (
            <div className="text-sm text-muted-foreground italic text-center py-8">Loading…</div>
          ) : viewMode === "leaderboard" ? (
            <LeaderboardView techs={teamData.techs} />
          ) : (
            <ComparisonView techs={teamData.techs} />
          )}
        </div>
      )}

      {/* Payroll section — owner only */}
      {section === "payroll" && isOwner && (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-3">
            <TimePeriodSelector
              startDate={startDate}
              endDate={endDate}
              onChange={handlePeriodChange}
            />
          </div>
          {loading ? (
            <div className="text-sm text-muted-foreground italic text-center py-8">Loading…</div>
          ) : (
            <PayrollSection payrollData={payrollData} startDate={startDate} endDate={endDate} />
          )}
        </div>
      )}
    </div>
  )
}
