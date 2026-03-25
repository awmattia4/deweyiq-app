"use client"

/**
 * Phase 13: Chemical Usage Panel
 *
 * Tracks dosing_amounts from service visits and surfaces over/under-dosing patterns.
 * Sortable table view with per-group, per-chemical breakdowns.
 *
 * Group by: tech | route | customer | pool
 * Period: week | month | quarter
 */

import { useState, useTransition } from "react"
import { cn } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getChemicalUsageReport } from "@/actions/reporting"
import type { ChemicalUsageReport, ChemicalUsageEntry } from "@/actions/reporting"

// ---------------------------------------------------------------------------
// Human-readable chemical labels
// ---------------------------------------------------------------------------

const CHEMICAL_LABELS: Record<string, string> = {
  sodiumHypochlorite_12pct: "Sodium Hypochlorite (12%)",
  calciumHypochlorite_67pct: "Calcium Hypochlorite (67%)",
  sodiumBicarbonate: "Sodium Bicarbonate",
  muriatic_31pct: "Muriatic Acid (31%)",
  sodaAsh: "Soda Ash",
  cyanuricAcid: "Cyanuric Acid",
  calciumChloride: "Calcium Chloride",
  diatomaceousEarth: "Diatomaceous Earth",
  aluminumSulfate: "Aluminum Sulfate",
  sodiumThiosulfate: "Sodium Thiosulfate",
}

function formatChemicalName(key: string): string {
  if (CHEMICAL_LABELS[key]) return CHEMICAL_LABELS[key]
  // Fallback: convert camelCase/snake_case to title case
  return key
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/(\d+)pct/g, "$1%")
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ChemicalUsagePanelProps {
  initialData: ChemicalUsageReport
}

// ---------------------------------------------------------------------------
// Sort types
// ---------------------------------------------------------------------------

type SortKey = "groupLabel" | "chemical" | "totalAmount" | "avgAmountPerVisit" | "visitCount"
type SortDir = "asc" | "desc"

// ---------------------------------------------------------------------------
// ChemicalUsagePanel
// ---------------------------------------------------------------------------

export function ChemicalUsagePanel({ initialData }: ChemicalUsagePanelProps) {
  const [data, setData] = useState<ChemicalUsageReport>(initialData)
  const [period, setPeriod] = useState<"week" | "month" | "quarter">("month")
  const [groupBy, setGroupBy] = useState<"tech" | "route" | "customer" | "pool" | "truck">("tech")
  const [sortKey, setSortKey] = useState<SortKey>("totalAmount")
  const [sortDir, setSortDir] = useState<SortDir>("desc")
  const [isPending, startTransition] = useTransition()

  function handleChange(
    newPeriod: "week" | "month" | "quarter",
    newGroupBy: "tech" | "route" | "customer" | "pool" | "truck"
  ) {
    startTransition(async () => {
      const fresh = await getChemicalUsageReport(newPeriod, newGroupBy)
      setData(fresh)
    })
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir("desc")
    }
  }

  const sorted = [...data.entries].sort((a, b) => {
    const av = a[sortKey]
    const bv = b[sortKey]
    if (typeof av === "number" && typeof bv === "number") {
      return sortDir === "asc" ? av - bv : bv - av
    }
    return sortDir === "asc"
      ? String(av).localeCompare(String(bv))
      : String(bv).localeCompare(String(av))
  })

  const periods: Array<{ value: "week" | "month" | "quarter"; label: string }> = [
    { value: "week", label: "7 Days" },
    { value: "month", label: "30 Days" },
    { value: "quarter", label: "90 Days" },
  ]

  const groupBys: Array<{ value: "tech" | "route" | "customer" | "pool" | "truck"; label: string }> = [
    { value: "tech", label: "Tech" },
    { value: "truck", label: "Truck" },
    { value: "route", label: "Route" },
    { value: "customer", label: "Customer" },
    { value: "pool", label: "Pool" },
  ]

  function SortIndicator({ k }: { k: SortKey }) {
    if (sortKey !== k) return <span className="ml-1 opacity-30 text-[10px]">▼</span>
    return <span className="ml-1 text-[10px]">{sortDir === "asc" ? "▲" : "▼"}</span>
  }

  function formatAmount(amount: number, unit: string) {
    return `${amount.toFixed(2)} ${unit}`
  }

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
                  handleChange(p.value, groupBy)
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
          <span className="text-sm text-muted-foreground">Group by:</span>
          <div className="flex rounded-md border border-border overflow-hidden">
            {groupBys.map((g, i) => (
              <button
                key={g.value}
                onClick={() => {
                  setGroupBy(g.value)
                  handleChange(period, g.value)
                }}
                disabled={isPending}
                className={cn(
                  "px-3 py-1.5 text-sm font-medium transition-colors",
                  i > 0 && "border-l border-border",
                  groupBy === g.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:bg-muted"
                )}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>

        {isPending && (
          <span className="text-xs text-muted-foreground animate-pulse">Loading...</span>
        )}
      </div>

      {/* Stats */}
      {data.entries.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wider mb-1">Groups</p>
              <p className="text-xl sm:text-2xl font-bold">
                {new Set(data.entries.map((e) => e.groupKey)).size}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wider mb-1">Chemicals</p>
              <p className="text-xl sm:text-2xl font-bold">
                {new Set(data.entries.map((e) => e.chemical)).size}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wider mb-1">Total Visits</p>
              <p className="text-xl sm:text-2xl font-bold">
                {Math.max(...data.entries.map((e) => e.visitCount), 0)}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">
            Chemical Usage by {groupBys.find((g) => g.value === groupBy)?.label}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {sorted.length === 0 ? (
            <p className="text-sm text-muted-foreground italic p-4">
              No chemical dosing data for this period.
            </p>
          ) : (
            <>
              {/* Sort controls for mobile */}
              <div className="flex flex-wrap gap-1.5 px-4 pt-3 pb-1 sm:hidden">
                <span className="text-xs text-muted-foreground mr-1 self-center">Sort:</span>
                {([
                  { key: "groupLabel" as SortKey, label: groupBys.find((g) => g.value === groupBy)?.label ?? "Group" },
                  { key: "chemical" as SortKey, label: "Chemical" },
                  { key: "totalAmount" as SortKey, label: "Total" },
                  { key: "visitCount" as SortKey, label: "Visits" },
                ]).map((s) => (
                  <button
                    key={s.key}
                    onClick={() => handleSort(s.key)}
                    className={cn(
                      "px-2 py-0.5 text-xs rounded-full border transition-colors",
                      sortKey === s.key
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted/50 text-muted-foreground border-border hover:text-foreground"
                    )}
                  >
                    {s.label}
                    {sortKey === s.key && <span className="ml-0.5">{sortDir === "asc" ? "↑" : "↓"}</span>}
                  </button>
                ))}
              </div>

              {/* Mobile: card layout */}
              <div className="sm:hidden divide-y divide-border">
                {sorted.map((entry, idx) => (
                  <div key={`${entry.groupKey}-${entry.chemical}-${idx}`} className="px-4 py-3 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium truncate">{entry.groupLabel}</span>
                      <span className="text-xs text-muted-foreground shrink-0">{entry.visitCount} visits</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{formatChemicalName(entry.chemical)}</p>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{formatAmount(entry.totalAmount, entry.unit)}</span>
                      <span className="text-xs text-muted-foreground">{formatAmount(entry.avgAmountPerVisit, entry.unit)}/visit</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop: table layout */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th
                        className="text-left px-4 py-2.5 font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                        onClick={() => handleSort("groupLabel")}
                      >
                        {groupBys.find((g) => g.value === groupBy)?.label}
                        <SortIndicator k="groupLabel" />
                      </th>
                      <th
                        className="text-left px-4 py-2.5 font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                        onClick={() => handleSort("chemical")}
                      >
                        Chemical
                        <SortIndicator k="chemical" />
                      </th>
                      <th
                        className="text-right px-4 py-2.5 font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                        onClick={() => handleSort("visitCount")}
                      >
                        Visits
                        <SortIndicator k="visitCount" />
                      </th>
                      <th
                        className="text-right px-4 py-2.5 font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                        onClick={() => handleSort("totalAmount")}
                      >
                        Total
                        <SortIndicator k="totalAmount" />
                      </th>
                      <th
                        className="text-right px-4 py-2.5 font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                        onClick={() => handleSort("avgAmountPerVisit")}
                      >
                        Avg/Visit
                        <SortIndicator k="avgAmountPerVisit" />
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {sorted.map((entry, idx) => (
                      <tr key={`${entry.groupKey}-${entry.chemical}-${idx}`} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-2.5 font-medium">{entry.groupLabel}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">{formatChemicalName(entry.chemical)}</td>
                        <td className="px-4 py-2.5 text-right">{entry.visitCount}</td>
                        <td className="px-4 py-2.5 text-right font-medium">
                          {formatAmount(entry.totalAmount, entry.unit)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-muted-foreground">
                          {formatAmount(entry.avgAmountPerVisit, entry.unit)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
