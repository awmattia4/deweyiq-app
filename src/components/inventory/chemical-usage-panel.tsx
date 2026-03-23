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
import { Badge } from "@/components/ui/badge"
import { getChemicalUsageReport } from "@/actions/reporting"
import type { ChemicalUsageReport, ChemicalUsageEntry } from "@/actions/reporting"

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
  const [groupBy, setGroupBy] = useState<"tech" | "route" | "customer" | "pool">("tech")
  const [sortKey, setSortKey] = useState<SortKey>("totalAmount")
  const [sortDir, setSortDir] = useState<SortDir>("desc")
  const [isPending, startTransition] = useTransition()

  function handleChange(
    newPeriod: "week" | "month" | "quarter",
    newGroupBy: "tech" | "route" | "customer" | "pool"
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

  const groupBys: Array<{ value: "tech" | "route" | "customer" | "pool"; label: string }> = [
    { value: "tech", label: "Tech" },
    { value: "route", label: "Route" },
    { value: "customer", label: "Customer" },
    { value: "pool", label: "Pool" },
  ]

  function SortIndicator({ k }: { k: SortKey }) {
    if (sortKey !== k) return <span className="opacity-30"> ↕</span>
    return <span>{sortDir === "asc" ? " ↑" : " ↓"}</span>
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
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Groups</p>
              <p className="text-2xl font-bold">
                {new Set(data.entries.map((e) => e.groupKey)).size}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Chemicals</p>
              <p className="text-2xl font-bold">
                {new Set(data.entries.map((e) => e.chemical)).size}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total Visits</p>
              <p className="text-2xl font-bold">
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
            <div className="overflow-x-auto">
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
                      <td className="px-4 py-2.5 text-muted-foreground">{entry.chemical}</td>
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
          )}
        </CardContent>
      </Card>
    </div>
  )
}
