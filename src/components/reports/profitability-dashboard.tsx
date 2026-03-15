"use client"

import { useState, useTransition } from "react"
import { DownloadIcon, PencilIcon, CheckIcon, XIcon } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  TimePeriodSelector,
  KpiCard,
  downloadCsv,
  formatCurrency,
  formatPercent,
  CHART_COLORS,
} from "@/components/reports/report-shared"
import {
  getProfitabilityAnalysis,
  exportProfitabilityCsv,
  updateProfitMarginThreshold,
} from "@/actions/reporting"
import type { ProfitabilityData, PoolProfitability, TechDosingCost } from "@/actions/reporting"
import { cn } from "@/lib/utils"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts"

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ProfitabilityDashboardProps {
  initialData: ProfitabilityData
  defaultStartDate: string
  defaultEndDate: string
  isOwner: boolean
}

// ---------------------------------------------------------------------------
// Margin cell helper
// ---------------------------------------------------------------------------

function MarginCell({ marginPct, flagSeverity }: { marginPct: number; flagSeverity: "red" | "yellow" | null }) {
  return (
    <span
      className={cn(
        "inline-block rounded px-1.5 py-0.5 text-xs font-semibold tabular-nums",
        flagSeverity === "red" && "bg-red-500/20 text-red-400",
        flagSeverity === "yellow" && "bg-amber-400/20 text-amber-400",
        flagSeverity === null && "bg-emerald-500/20 text-emerald-400"
      )}
    >
      {formatPercent(marginPct)}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Flagged Pools Section (at top per locked decision)
// ---------------------------------------------------------------------------

function FlaggedPoolsSection({
  flaggedPools,
  thresholdPct,
}: {
  flaggedPools: PoolProfitability[]
  thresholdPct: number
}) {
  if (flaggedPools.length === 0) {
    return (
      <Card className="border-emerald-500/30">
        <CardContent className="pt-5">
          <p className="text-sm text-emerald-400">
            All pools are above the {thresholdPct}% margin threshold.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-red-500/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-base text-red-400">
          Flagged Pools ({flaggedPools.length})
        </CardTitle>
        <CardDescription>
          These pools cost more in chemicals than their revenue margin supports. Chemical cost vs service revenue analysis.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-2">
          {flaggedPools.map((pool) => (
            <div
              key={pool.poolId}
              className={cn(
                "flex items-center justify-between rounded-md border p-3",
                pool.flagSeverity === "red"
                  ? "border-red-500/30 bg-red-500/5"
                  : "border-amber-400/30 bg-amber-400/5"
              )}
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">{pool.poolName}</span>
                <span className="text-xs text-muted-foreground">{pool.customerName}</span>
              </div>
              <div className="flex items-center gap-4 text-right">
                <div className="hidden sm:flex flex-col gap-0.5">
                  <span className="text-xs text-muted-foreground">Chem Cost</span>
                  <span className="text-sm font-medium">{formatCurrency(pool.totalChemicalCost)}</span>
                </div>
                <div className="hidden sm:flex flex-col gap-0.5">
                  <span className="text-xs text-muted-foreground">Revenue</span>
                  <span className="text-sm font-medium">{formatCurrency(pool.recurringRevenue)}</span>
                </div>
                <div className="flex flex-col items-end gap-0.5">
                  <span className="text-xs text-muted-foreground">Margin</span>
                  <MarginCell marginPct={pool.marginPct} flagSeverity={pool.flagSeverity} />
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-xs border",
                    pool.flagSeverity === "red"
                      ? "border-red-500/50 text-red-400"
                      : "border-amber-400/50 text-amber-400"
                  )}
                >
                  {pool.flagSeverity === "red" ? "Negative" : "Below threshold"}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Per-Pool Profitability Table
// ---------------------------------------------------------------------------

function PoolProfitabilityTable({ pools }: { pools: PoolProfitability[] }) {
  if (pools.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic py-4">
        No service visits with chemical data found for this period.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/50 text-muted-foreground">
            <th className="text-left pb-2 pr-4 font-medium">Pool</th>
            <th className="text-left pb-2 pr-4 font-medium hidden md:table-cell">Customer</th>
            <th className="text-right pb-2 pr-4 font-medium hidden sm:table-cell">Revenue</th>
            <th className="text-right pb-2 pr-4 font-medium">Chem Cost</th>
            <th className="text-right pb-2 pr-4 font-medium hidden sm:table-cell">Visits</th>
            <th className="text-right pb-2 pr-4 font-medium hidden lg:table-cell">Avg/Visit</th>
            <th className="text-right pb-2 pr-4 font-medium">Margin</th>
            <th className="text-right pb-2 font-medium">Margin %</th>
          </tr>
        </thead>
        <tbody>
          {pools.map((pool) => (
            <tr key={pool.poolId} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
              <td className="py-2 pr-4">
                <div className="flex flex-col">
                  <span className="font-medium">{pool.poolName}</span>
                  {pool.hasEstimatedCosts && (
                    <span
                      className="text-xs text-muted-foreground"
                      title="Chemical cost estimated from readings — dosing amounts not recorded for these visits"
                    >
                      Est.
                    </span>
                  )}
                </div>
              </td>
              <td className="py-2 pr-4 text-muted-foreground hidden md:table-cell">{pool.customerName}</td>
              <td className="py-2 pr-4 text-right hidden sm:table-cell">{formatCurrency(pool.recurringRevenue)}</td>
              <td className="py-2 pr-4 text-right">{formatCurrency(pool.totalChemicalCost)}</td>
              <td className="py-2 pr-4 text-right text-muted-foreground hidden sm:table-cell">{pool.visitCount}</td>
              <td className="py-2 pr-4 text-right text-muted-foreground hidden lg:table-cell">
                {formatCurrency(pool.avgCostPerVisit)}
              </td>
              <td className="py-2 pr-4 text-right">{formatCurrency(pool.margin)}</td>
              <td className="py-2 text-right">
                <MarginCell marginPct={pool.marginPct} flagSeverity={pool.flagSeverity} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Per-Tech Chemical Cost Section
// ---------------------------------------------------------------------------

function TechDosingSection({ techCosts }: { techCosts: TechDosingCost[] }) {
  const [expandedTechId, setExpandedTechId] = useState<string | null>(null)

  if (techCosts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic py-4">
        No chemical dosing data found for this period.
      </p>
    )
  }

  const chartData = techCosts.map((t) => ({
    name: t.techName.split(" ")[0], // First name for chart labels
    avgCost: parseFloat(t.avgCostPerVisit.toFixed(2)),
    fullName: t.techName,
  }))

  return (
    <div className="flex flex-col gap-4">
      {/* Bar chart comparing avg cost per visit */}
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
            <XAxis
              dataKey="name"
              tick={{ fill: CHART_COLORS.text, fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: CHART_COLORS.text, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `$${v}`}
              width={42}
            />
            <Tooltip
              contentStyle={{
                background: CHART_COLORS.bg,
                border: `1px solid ${CHART_COLORS.grid}`,
                borderRadius: "6px",
                fontSize: "12px",
              }}
              formatter={(value, _name, props) => [
                `$${Number(value).toFixed(2)}`,
                (props.payload as { fullName?: string } | undefined)?.fullName ?? "Tech",
              ]}
              labelFormatter={() => "Avg cost/visit"}
            />
            <Bar dataKey="avgCost" radius={[4, 4, 0, 0]}>
              {chartData.map((_, i) => (
                <Cell
                  key={i}
                  fill={Object.values(CHART_COLORS)[i % (Object.values(CHART_COLORS).length - 3)]}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Tech table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/50 text-muted-foreground">
              <th className="text-left pb-2 pr-4 font-medium">Technician</th>
              <th className="text-right pb-2 pr-4 font-medium">Total Chem Cost</th>
              <th className="text-right pb-2 pr-4 font-medium">Visits</th>
              <th className="text-right pb-2 font-medium">Avg Cost/Visit</th>
            </tr>
          </thead>
          <tbody>
            {techCosts.map((tech) => (
              <>
                <tr
                  key={tech.techId}
                  className="border-b border-border/30 hover:bg-muted/20 transition-colors cursor-pointer"
                  onClick={() =>
                    setExpandedTechId(expandedTechId === tech.techId ? null : tech.techId)
                  }
                >
                  <td className="py-2 pr-4 font-medium">{tech.techName}</td>
                  <td className="py-2 pr-4 text-right">{formatCurrency(tech.totalChemicalCost)}</td>
                  <td className="py-2 pr-4 text-right text-muted-foreground">{tech.visitCount}</td>
                  <td className="py-2 text-right">{formatCurrency(tech.avgCostPerVisit)}</td>
                </tr>
                {expandedTechId === tech.techId && tech.costByChemical.length > 0 && (
                  <tr key={`${tech.techId}-expand`} className="border-b border-border/30 bg-muted/10">
                    <td colSpan={4} className="py-2 px-4">
                      <div className="flex flex-wrap gap-3">
                        {tech.costByChemical.map((chem) => (
                          <div key={chem.chemical} className="text-xs">
                            <span className="capitalize text-muted-foreground">{chem.chemical.replace(/_/g, " ")}</span>
                            <span className="ml-1 font-medium">{formatCurrency(chem.totalCost)}</span>
                            <span className="ml-1 text-muted-foreground">
                              ({chem.totalAmount.toFixed(1)} {chem.unit})
                            </span>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Threshold inline editor
// ---------------------------------------------------------------------------

function ThresholdEditor({
  thresholdPct,
  onUpdate,
}: {
  thresholdPct: number
  onUpdate: (value: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [inputValue, setInputValue] = useState(String(thresholdPct))
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    const parsed = parseFloat(inputValue)
    if (isNaN(parsed) || parsed < 0 || parsed > 100) return
    setSaving(true)
    const result = await updateProfitMarginThreshold(parsed)
    setSaving(false)
    if (result.success) {
      onUpdate(parsed)
      setEditing(false)
    }
  }

  function handleCancel() {
    setInputValue(String(thresholdPct))
    setEditing(false)
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>
          Pools below <span className="font-semibold text-foreground">{thresholdPct}%</span> margin are flagged
        </span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Edit margin threshold"
        >
          <PencilIcon className="h-3.5 w-3.5" />
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">Margin threshold:</span>
      <input
        type="number"
        min={0}
        max={100}
        step={1}
        value={inputValue}
        onChange={(e) => {
          const v = e.target.value
          if (!v.endsWith(".") && !v.endsWith("-")) {
            // flush only complete numbers
          }
          setInputValue(v)
        }}
        onBlur={() => {
          // flush on blur as safety net
          const parsed = parseFloat(inputValue)
          if (!isNaN(parsed)) setInputValue(String(parsed))
        }}
        className="w-16 h-7 rounded-md border border-input bg-background px-2 py-1 text-sm text-center shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
      <span className="text-sm text-muted-foreground">%</span>
      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="cursor-pointer text-emerald-400 hover:text-emerald-300 disabled:opacity-50"
        aria-label="Save threshold"
      >
        <CheckIcon className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={handleCancel}
        className="cursor-pointer text-muted-foreground hover:text-foreground"
        aria-label="Cancel"
      >
        <XIcon className="h-4 w-4" />
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ProfitabilityDashboard({
  initialData,
  defaultStartDate,
  defaultEndDate,
  isOwner,
}: ProfitabilityDashboardProps) {
  const [data, setData] = useState<ProfitabilityData>(initialData)
  const [startDate, setStartDate] = useState(defaultStartDate)
  const [endDate, setEndDate] = useState(defaultEndDate)
  const [thresholdPct, setThresholdPct] = useState(initialData.thresholdPct)
  const [isPending, startTransition] = useTransition()
  const [isExporting, startExport] = useTransition()

  function handlePeriodChange(start: string, end: string) {
    setStartDate(start)
    setEndDate(end)
    startTransition(async () => {
      const fresh = await getProfitabilityAnalysis(start, end)
      setData(fresh)
    })
  }

  function handleExportCsv() {
    startExport(async () => {
      const result = await exportProfitabilityCsv(startDate, endDate)
      if (result.success && result.csv) {
        downloadCsv(result.csv, `profitability-${startDate}-to-${endDate}.csv`)
      }
    })
  }

  // Re-derive flagged pools from current threshold state (threshold may change locally)
  const displayPools = data.pools.map((p) => ({
    ...p,
    isFlagged: p.marginPct < thresholdPct,
    flagSeverity: p.marginPct < thresholdPct ? (p.margin < 0 ? "red" as const : "yellow" as const) : null,
  }))
  const displayFlagged = displayPools.filter((p) => p.isFlagged)

  const overallMargin = data.totalRecurringRevenue > 0
    ? ((data.totalRecurringRevenue - data.totalChemicalCost) / data.totalRecurringRevenue) * 100
    : 0

  return (
    <div className="flex flex-col gap-6" aria-busy={isPending}>
      {/* ── Controls row ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TimePeriodSelector
          startDate={startDate}
          endDate={endDate}
          onChange={handlePeriodChange}
        />
        {isOwner && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCsv}
            disabled={isExporting || isPending || data.pools.length === 0}
            className="cursor-pointer"
          >
            <DownloadIcon className="h-4 w-4 mr-1" />
            Export CSV
          </Button>
        )}
      </div>

      {/* ── KPI Cards ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard
          title="Total Chemical Cost"
          value={formatCurrency(data.totalChemicalCost)}
        />
        <KpiCard
          title="Service Revenue"
          value={formatCurrency(data.totalRecurringRevenue)}
        />
        <KpiCard
          title="Overall Margin"
          value={formatPercent(overallMargin)}
          className={cn(
            overallMargin < 0 && "border-red-500/30",
            overallMargin >= 0 && overallMargin < thresholdPct && "border-amber-400/30"
          )}
        />
        <KpiCard
          title="Flagged Pools"
          value={String(displayFlagged.length)}
          className={displayFlagged.length > 0 ? "border-red-500/30" : undefined}
        />
      </div>

      {/* ── Flagged Pools (at TOP per locked decision) ────────────────────── */}
      <FlaggedPoolsSection flaggedPools={displayFlagged} thresholdPct={thresholdPct} />

      {/* ── Per-Pool Profitability Table ───────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base">Per-Pool Profitability</CardTitle>
            <ThresholdEditor
              thresholdPct={thresholdPct}
              onUpdate={(v) => {
                setThresholdPct(v)
              }}
            />
          </div>
          <CardDescription>
            Sorted worst margin first. Chemical costs compared to recurring service revenue for each pool.
            {data.pools.some((p) => p.hasEstimatedCosts) && (
              <span className="ml-1">
                &ldquo;Est.&rdquo; indicates historical visits where dosing amounts were not recorded — costs estimated from chemistry readings.
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isPending ? (
            <div className="text-sm text-muted-foreground italic py-4">Loading profitability data...</div>
          ) : (
            <PoolProfitabilityTable pools={displayPools} />
          )}
        </CardContent>
      </Card>

      {/* ── Per-Tech Chemical Cost ────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Chemical Cost by Technician</CardTitle>
          <CardDescription>
            Compare dosing costs across techs to identify over-dosing patterns. Click a row to expand per-chemical breakdown.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isPending ? (
            <div className="text-sm text-muted-foreground italic py-4">Loading tech cost data...</div>
          ) : (
            <TechDosingSection techCosts={data.techCosts} />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
