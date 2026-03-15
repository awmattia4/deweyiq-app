"use client"

import { useState } from "react"
import { ArrowUpRightIcon, ArrowDownRightIcon } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { toLocalDateString } from "@/lib/date-utils"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Chart colors — hex ONLY (no oklch). SVG/WebGL cannot parse oklch().
// ---------------------------------------------------------------------------

export const CHART_COLORS = {
  primary: "#0ea5e9",   // sky-500
  secondary: "#22d3ee", // cyan-400
  tertiary: "#2dd4bf",  // teal-400
  warning: "#fcd34d",   // amber-300
  danger: "#f87171",    // red-400
  muted: "#475569",     // slate-600
  grid: "#1e293b",      // slate-800
  text: "#94a3b8",      // slate-400
  bg: "#0f172a",        // slate-900
} as const

// ---------------------------------------------------------------------------
// Date math helpers (no toISOString — per MEMORY.md critical pattern)
// ---------------------------------------------------------------------------

function getStartOfWeek(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay() // 0=Sunday
  d.setDate(d.getDate() - day)
  d.setHours(0, 0, 0, 0)
  return d
}

function getStartOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function getStartOfQuarter(date: Date): Date {
  const quarter = Math.floor(date.getMonth() / 3)
  return new Date(date.getFullYear(), quarter * 3, 1)
}

function getStartOfYear(date: Date): Date {
  return new Date(date.getFullYear(), 0, 1)
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d
}

function subtractYears(date: Date, years: number): Date {
  const d = new Date(date)
  d.setFullYear(d.getFullYear() - years)
  return d
}

type Preset =
  | "this_week"
  | "this_month"
  | "last_month"
  | "this_quarter"
  | "this_year"
  | "last_year"
  | "custom"

function getPresetRange(preset: Preset): { start: Date; end: Date } {
  const today = new Date()
  switch (preset) {
    case "this_week":
      return { start: getStartOfWeek(today), end: today }
    case "this_month":
      return { start: getStartOfMonth(today), end: today }
    case "last_month": {
      const lastMonth = addMonths(today, -1)
      const start = getStartOfMonth(lastMonth)
      const end = new Date(today.getFullYear(), today.getMonth(), 0) // last day of last month
      return { start, end }
    }
    case "this_quarter":
      return { start: getStartOfQuarter(today), end: today }
    case "this_year":
      return { start: getStartOfYear(today), end: today }
    case "last_year": {
      const lastYear = subtractYears(today, 1)
      const start = getStartOfYear(lastYear)
      const end = new Date(today.getFullYear() - 1, 11, 31)
      return { start, end }
    }
    default:
      return { start: getStartOfMonth(today), end: today }
  }
}

// ---------------------------------------------------------------------------
// TimePeriodSelector
// ---------------------------------------------------------------------------

interface TimePeriodSelectorProps {
  startDate: string
  endDate: string
  onChange: (start: string, end: string) => void
  className?: string
}

const PRESET_OPTIONS: Array<{ value: Preset; label: string }> = [
  { value: "this_week", label: "This week" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "this_quarter", label: "This quarter" },
  { value: "this_year", label: "This year" },
  { value: "last_year", label: "Last year" },
  { value: "custom", label: "Custom" },
]

export function TimePeriodSelector({
  startDate,
  endDate,
  onChange,
  className,
}: TimePeriodSelectorProps) {
  const [selectedPreset, setSelectedPreset] = useState<Preset>("this_month")

  function handlePresetChange(value: string) {
    const preset = value as Preset
    setSelectedPreset(preset)
    if (preset !== "custom") {
      const { start, end } = getPresetRange(preset)
      onChange(toLocalDateString(start), toLocalDateString(end))
    }
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <Select value={selectedPreset} onValueChange={handlePresetChange}>
        <SelectTrigger className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PRESET_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {selectedPreset === "custom" && (
        <>
          <input
            type="date"
            value={startDate}
            onChange={(e) => onChange(e.target.value, endDate)}
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <span className="text-muted-foreground text-sm">to</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => onChange(startDate, e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// KpiCard
// ---------------------------------------------------------------------------

interface KpiCardProps {
  title: string
  value: string
  subtitle?: string
  trend?: {
    value: number
    label: string
  }
  icon?: React.ReactNode
  className?: string
}

export function KpiCard({ title, value, subtitle, trend, icon, className }: KpiCardProps) {
  const isPositive = trend ? trend.value >= 0 : null

  return (
    <Card className={cn("", className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        {icon && <div className="text-muted-foreground">{icon}</div>}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {(subtitle || trend) && (
          <div className="flex items-center gap-1 mt-1">
            {trend && (
              <>
                {isPositive ? (
                  <ArrowUpRightIcon className="h-4 w-4 text-emerald-400" />
                ) : (
                  <ArrowDownRightIcon className="h-4 w-4 text-red-400" />
                )}
                <span
                  className={cn(
                    "text-xs font-medium",
                    isPositive ? "text-emerald-400" : "text-red-400"
                  )}
                >
                  {trend.value > 0 ? "+" : ""}
                  {trend.value.toFixed(1)}%
                </span>
              </>
            )}
            {subtitle && (
              <span className="text-xs text-muted-foreground">{subtitle}</span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// downloadCsv
// ---------------------------------------------------------------------------

export function downloadCsv(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

// ---------------------------------------------------------------------------
// formatCurrency
// ---------------------------------------------------------------------------

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount)
}

// ---------------------------------------------------------------------------
// formatPercent
// ---------------------------------------------------------------------------

export function formatPercent(value: number, decimals = 1): string {
  return value.toFixed(decimals) + "%"
}
