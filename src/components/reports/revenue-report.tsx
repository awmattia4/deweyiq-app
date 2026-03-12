"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { DownloadIcon, ArrowUpDownIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { getRevenueByCustomer, exportFinancialCsv } from "@/actions/reports"
import type { RevenueResult, RevenueCustomer } from "@/actions/reports"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value)
}

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

type SortKey = "name" | "invoiceCount" | "totalRevenue"

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface RevenueReportProps {
  initialData: RevenueResult
  defaultStartDate: string
  defaultEndDate: string
  isOwner: boolean
}

export function RevenueReport({
  initialData,
  defaultStartDate,
  defaultEndDate,
  isOwner,
}: RevenueReportProps) {
  const [data, setData] = useState<RevenueResult>(initialData)
  const [startDate, setStartDate] = useState(defaultStartDate)
  const [endDate, setEndDate] = useState(defaultEndDate)
  const [sortKey, setSortKey] = useState<SortKey>("totalRevenue")
  const [sortAsc, setSortAsc] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [isExporting, startExportTransition] = useTransition()

  function handleDateChange(start: string, end: string) {
    setStartDate(start)
    setEndDate(end)
    startTransition(async () => {
      const result = await getRevenueByCustomer(start, end)
      setData(result)
    })
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc)
    } else {
      setSortKey(key)
      setSortAsc(false)
    }
  }

  function handleExport() {
    startExportTransition(async () => {
      const result = await exportFinancialCsv("invoices", startDate, endDate)
      if (result.success && result.csv) {
        downloadCsv(result.csv, `invoices-${startDate}-to-${endDate}.csv`)
      }
    })
  }

  // Sort customers
  const sortedCustomers = [...data.customers].sort((a, b) => {
    let cmp = 0
    switch (sortKey) {
      case "name":
        cmp = a.name.localeCompare(b.name)
        break
      case "invoiceCount":
        cmp = a.invoiceCount - b.invoiceCount
        break
      case "totalRevenue":
        cmp = a.totalRevenue - b.totalRevenue
        break
    }
    return sortAsc ? cmp : -cmp
  })

  return (
    <div className="flex flex-col gap-4">
      {/* Date range and export */}
      <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rev-start" className="text-xs text-muted-foreground">
            Start Date
          </Label>
          <Input
            id="rev-start"
            type="date"
            value={startDate}
            onChange={(e) => handleDateChange(e.target.value, endDate)}
            className="w-40"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rev-end" className="text-xs text-muted-foreground">
            End Date
          </Label>
          <Input
            id="rev-end"
            type="date"
            value={endDate}
            onChange={(e) => handleDateChange(startDate, e.target.value)}
            className="w-40"
          />
        </div>
        <div className="flex-1" />
        {isOwner && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={isExporting}
          >
            <DownloadIcon className="h-3.5 w-3.5 mr-1.5" />
            {isExporting ? "Exporting..." : "Export CSV"}
          </Button>
        )}
      </div>

      {/* Loading indicator */}
      {isPending && (
        <p className="text-xs text-muted-foreground animate-pulse">
          Loading...
        </p>
      )}

      {/* Empty state */}
      {!isPending && data.customers.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16">
          <p className="text-sm text-muted-foreground italic">
            No revenue recorded for this period
          </p>
        </div>
      )}

      {/* Table */}
      {data.customers.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <SortableHeader
                  label="Customer"
                  sortKey="name"
                  currentSortKey={sortKey}
                  sortAsc={sortAsc}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="Invoices"
                  sortKey="invoiceCount"
                  currentSortKey={sortKey}
                  sortAsc={sortAsc}
                  onSort={handleSort}
                  className="text-right"
                />
                <SortableHeader
                  label="Total Revenue"
                  sortKey="totalRevenue"
                  currentSortKey={sortKey}
                  sortAsc={sortAsc}
                  onSort={handleSort}
                  className="text-right"
                />
              </tr>
            </thead>
            <tbody>
              {sortedCustomers.map((customer) => (
                <tr
                  key={customer.id}
                  className="border-b border-border/50 hover:bg-muted/10 transition-colors"
                >
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/customers/${customer.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {customer.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {customer.invoiceCount}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-medium">
                    {formatCurrency(customer.totalRevenue)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-muted/20 font-semibold">
                <td className="px-4 py-3">Total</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {data.customers.reduce((sum, c) => sum + c.invoiceCount, 0)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {formatCurrency(data.grandTotal)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// SortableHeader
// ---------------------------------------------------------------------------

function SortableHeader({
  label,
  sortKey,
  currentSortKey,
  sortAsc,
  onSort,
  className,
}: {
  label: string
  sortKey: SortKey
  currentSortKey: SortKey
  sortAsc: boolean
  onSort: (key: SortKey) => void
  className?: string
}) {
  const isActive = sortKey === currentSortKey

  return (
    <th className={cn("px-4 py-3 font-medium text-muted-foreground", className)}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer"
      >
        {label}
        <ArrowUpDownIcon
          className={cn(
            "h-3 w-3",
            isActive ? "text-foreground" : "text-muted-foreground/40"
          )}
        />
      </button>
    </th>
  )
}
