"use client"

import { useTransition } from "react"
import Link from "next/link"
import { DownloadIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { toLocalDateString } from "@/lib/date-utils"
import type { ArAgingResult } from "@/actions/reports"
import { exportFinancialCsv } from "@/actions/reports"

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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ArAgingViewProps {
  data: ArAgingResult
  isOwner: boolean
}

export function ArAgingView({ data, isOwner }: ArAgingViewProps) {
  const [isPending, startTransition] = useTransition()

  function handleExport() {
    startTransition(async () => {
      const result = await exportFinancialCsv("ar_aging")
      if (result.success && result.csv) {
        downloadCsv(result.csv, `ar-aging-${toLocalDateString()}.csv`)
      }
    })
  }

  if (data.customers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <p className="text-sm text-muted-foreground italic">
          No outstanding invoices
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Export button */}
      {isOwner && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={isPending}
          >
            <DownloadIcon className="h-3.5 w-3.5 mr-1.5" />
            {isPending ? "Exporting..." : "Export CSV"}
          </Button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                Customer
              </th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                Current
              </th>
              <th className="px-4 py-3 text-right font-medium text-amber-400">
                1-30
              </th>
              <th className="px-4 py-3 text-right font-medium text-orange-400">
                31-60
              </th>
              <th className="px-4 py-3 text-right font-medium text-red-400">
                61-90
              </th>
              <th className="px-4 py-3 text-right font-medium text-red-600">
                90+
              </th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {data.customers.map((customer) => (
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
                  {customer.current > 0 ? formatCurrency(customer.current) : "--"}
                </td>
                <td
                  className={cn(
                    "px-4 py-2.5 text-right tabular-nums",
                    customer.d1_30 > 0 && "text-amber-400"
                  )}
                >
                  {customer.d1_30 > 0 ? formatCurrency(customer.d1_30) : "--"}
                </td>
                <td
                  className={cn(
                    "px-4 py-2.5 text-right tabular-nums",
                    customer.d31_60 > 0 && "text-orange-400"
                  )}
                >
                  {customer.d31_60 > 0 ? formatCurrency(customer.d31_60) : "--"}
                </td>
                <td
                  className={cn(
                    "px-4 py-2.5 text-right tabular-nums",
                    customer.d61_90 > 0 && "text-red-400"
                  )}
                >
                  {customer.d61_90 > 0 ? formatCurrency(customer.d61_90) : "--"}
                </td>
                <td
                  className={cn(
                    "px-4 py-2.5 text-right tabular-nums",
                    customer.d90_plus > 0 && "text-red-600"
                  )}
                >
                  {customer.d90_plus > 0 ? formatCurrency(customer.d90_plus) : "--"}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums font-medium">
                  {formatCurrency(customer.total)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-muted/20 font-semibold">
              <td className="px-4 py-3">Total</td>
              <td className="px-4 py-3 text-right tabular-nums">
                {data.totals.current > 0 ? formatCurrency(data.totals.current) : "--"}
              </td>
              <td
                className={cn(
                  "px-4 py-3 text-right tabular-nums",
                  data.totals.d1_30 > 0 && "text-amber-400"
                )}
              >
                {data.totals.d1_30 > 0 ? formatCurrency(data.totals.d1_30) : "--"}
              </td>
              <td
                className={cn(
                  "px-4 py-3 text-right tabular-nums",
                  data.totals.d31_60 > 0 && "text-orange-400"
                )}
              >
                {data.totals.d31_60 > 0 ? formatCurrency(data.totals.d31_60) : "--"}
              </td>
              <td
                className={cn(
                  "px-4 py-3 text-right tabular-nums",
                  data.totals.d61_90 > 0 && "text-red-400"
                )}
              >
                {data.totals.d61_90 > 0 ? formatCurrency(data.totals.d61_90) : "--"}
              </td>
              <td
                className={cn(
                  "px-4 py-3 text-right tabular-nums",
                  data.totals.d90_plus > 0 && "text-red-600"
                )}
              >
                {data.totals.d90_plus > 0 ? formatCurrency(data.totals.d90_plus) : "--"}
              </td>
              <td className="px-4 py-3 text-right tabular-nums">
                {formatCurrency(data.totals.total)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
