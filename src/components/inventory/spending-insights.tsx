"use client"

/**
 * Phase 13: Spending Insights
 *
 * Time-based spending trends and comparative breakdowns using recharts.
 * - Line chart: daily/weekly spend over time (period selector)
 * - Bar chart: spend by supplier or category (compare-by selector)
 *
 * All chart colors use hex — no oklch (per MEMORY.md).
 */

import { useState, useTransition } from "react"
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getSpendingInsights } from "@/actions/purchasing"
import type { SpendingInsightsData } from "@/actions/purchasing"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Chart colors — hex ONLY per MEMORY.md
// ---------------------------------------------------------------------------

const CHART_COLORS = {
  primary: "#0ea5e9",    // sky-500
  secondary: "#22d3ee",  // cyan-400
  grid: "#1e293b",       // slate-800
  text: "#94a3b8",       // slate-400
  bars: ["#0ea5e9", "#22d3ee", "#2dd4bf", "#4ade80", "#fcd34d", "#f87171"],
} as const

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SpendingInsightsProps {
  initialData: SpendingInsightsData
}

// ---------------------------------------------------------------------------
// SpendingInsights
// ---------------------------------------------------------------------------

export function SpendingInsights({ initialData }: SpendingInsightsProps) {
  const [data, setData] = useState<SpendingInsightsData>(initialData)
  const [period, setPeriod] = useState<"week" | "month" | "quarter">("month")
  const [compareBy, setCompareBy] = useState<"supplier" | "category">("supplier")
  const [isPending, startTransition] = useTransition()

  function handleChange(newPeriod: "week" | "month" | "quarter", newCompareBy: "supplier" | "category") {
    startTransition(async () => {
      const fresh = await getSpendingInsights(newPeriod, newCompareBy)
      setData(fresh)
    })
  }

  function formatCurrency(val: number) {
    return `$${val.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
  }

  function formatDate(dateStr: string) {
    // dateStr from Postgres is YYYY-MM-DD
    const parts = dateStr.split("-")
    if (parts.length < 3) return dateStr
    return `${parts[1]}/${parts[2]}`
  }

  const periods: Array<{ value: "week" | "month" | "quarter"; label: string }> = [
    { value: "week", label: "7 Days" },
    { value: "month", label: "30 Days" },
    { value: "quarter", label: "90 Days" },
  ]

  return (
    <div className="flex flex-col gap-5">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Period:</span>
          <div className="flex rounded-md border border-border overflow-hidden">
            {periods.map((p, i) => (
              <button
                key={p.value}
                onClick={() => {
                  setPeriod(p.value)
                  handleChange(p.value, compareBy)
                }}
                disabled={isPending}
                className={cn(
                  "px-3 py-1.5 text-sm font-medium transition-colors",
                  i > 0 && "border-l border-border",
                  period === p.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:bg-muted"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Compare by:</span>
          <div className="flex rounded-md border border-border overflow-hidden">
            <button
              onClick={() => {
                setCompareBy("supplier")
                handleChange(period, "supplier")
              }}
              disabled={isPending}
              className={cn(
                "px-3 py-1.5 text-sm font-medium transition-colors",
                compareBy === "supplier"
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:bg-muted"
              )}
            >
              Supplier
            </button>
            <button
              onClick={() => {
                setCompareBy("category")
                handleChange(period, "category")
              }}
              disabled={isPending}
              className={cn(
                "px-3 py-1.5 text-sm font-medium transition-colors border-l border-border",
                compareBy === "category"
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:bg-muted"
              )}
            >
              Category
            </button>
          </div>
        </div>

        {isPending && (
          <span className="text-xs text-muted-foreground animate-pulse">Loading...</span>
        )}
      </div>

      {/* Time-series chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Spending Over Time</CardTitle>
        </CardHeader>
        <CardContent>
          {data.timeSeries.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No spending data for this period.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={data.timeSeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDate}
                  tick={{ fontSize: 11, fill: CHART_COLORS.text }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={formatCurrency}
                  tick={{ fontSize: 11, fill: CHART_COLORS.text }}
                  axisLine={false}
                  tickLine={false}
                  width={60}
                />
                <Tooltip
                  formatter={(value: any) => [formatCurrency(Number(value)), "Spend"]}
                  labelFormatter={(label: any) => formatDate(String(label))}
                  contentStyle={{
                    background: "#1e293b",
                    border: "1px solid #334155",
                    borderRadius: "6px",
                    fontSize: "12px",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="total"
                  stroke={CHART_COLORS.primary}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: CHART_COLORS.primary }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Breakdown chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">
            Spend by {compareBy === "supplier" ? "Supplier" : "Category"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.breakdown.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No breakdown data for this period.</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.breakdown} margin={{ top: 8, right: 8, left: 0, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: CHART_COLORS.text }}
                    axisLine={false}
                    tickLine={false}
                    angle={-35}
                    textAnchor="end"
                    interval={0}
                  />
                  <YAxis
                    tickFormatter={formatCurrency}
                    tick={{ fontSize: 11, fill: CHART_COLORS.text }}
                    axisLine={false}
                    tickLine={false}
                    width={60}
                  />
                  <Tooltip
                    formatter={(value: any) => [formatCurrency(Number(value)), "Spend"]}
                    contentStyle={{
                      background: "#1e293b",
                      border: "1px solid #334155",
                      borderRadius: "6px",
                      fontSize: "12px",
                    }}
                  />
                  <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                    {data.breakdown.map((_entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={CHART_COLORS.bars[index % CHART_COLORS.bars.length]}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>

              {/* Breakdown table */}
              <div className="mt-4 space-y-1.5">
                {data.breakdown.map((item, index) => (
                  <div key={item.key} className="flex items-center gap-2 text-sm">
                    <div
                      className="w-2.5 h-2.5 rounded-sm shrink-0"
                      style={{ background: CHART_COLORS.bars[index % CHART_COLORS.bars.length] }}
                    />
                    <span className="flex-1 truncate text-muted-foreground">{item.label}</span>
                    <span className="font-medium">{formatCurrency(item.total)}</span>
                    <span className="text-muted-foreground w-10 text-right">{item.percentage}%</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
