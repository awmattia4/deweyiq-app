"use client"

/**
 * AuditTrail — Financial audit trail viewer.
 *
 * Features:
 * - Chronological list of all journal entries
 * - Filter by date range, event type, user
 * - Reversed entries shown with strikethrough and Reversed badge
 * - Reversal entries show "Reversal of: {description}" context
 * - Pagination (100 entries per page)
 *
 * Accountant mode only.
 */

import { useState, useEffect } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { getAuditTrail } from "@/actions/accounting"
import type { AuditTrailEntry, AuditTrailFilters } from "@/actions/accounting"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount)
}

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-")
  const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

function formatDateTime(date: Date): string {
  return new Date(date).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

const SOURCE_TYPE_LABELS: Record<string, string> = {
  invoice: "Invoice",
  payment: "Payment",
  expense: "Expense",
  refund: "Refund",
  manual: "Manual Entry",
  vendor_bill: "Vendor Bill",
  bill_payment: "Bill Payment",
  credit: "Customer Credit",
  payout: "Payout",
}

function getSourceLabel(sourceType: string): string {
  return SOURCE_TYPE_LABELS[sourceType] ?? sourceType
}

// ---------------------------------------------------------------------------
// AuditTrail
// ---------------------------------------------------------------------------

export function AuditTrail() {
  const [entries, setEntries] = useState<AuditTrailEntry[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 100

  // Filters
  const [filterStart, setFilterStart] = useState("")
  const [filterEnd, setFilterEnd] = useState("")
  const [filterType, setFilterType] = useState<string>("all")

  useEffect(() => {
    void loadEntries(0)
  }, [])

  async function loadEntries(pageNum: number) {
    setLoading(true)
    try {
      const filters: AuditTrailFilters = {
        limit: PAGE_SIZE,
        offset: pageNum * PAGE_SIZE,
      }
      if (filterStart) filters.startDate = filterStart
      if (filterEnd) filters.endDate = filterEnd
      if (filterType && filterType !== "all") filters.entityType = filterType

      const result = await getAuditTrail(filters)
      if (result.success) {
        setEntries(result.entries)
        setTotal(result.total)
        setPage(pageNum)
      } else {
        toast.error(result.error)
      }
    } finally {
      setLoading(false)
    }
  }

  function applyFilters() {
    void loadEntries(0)
  }

  function clearFilters() {
    setFilterStart("")
    setFilterEnd("")
    setFilterType("all")
    // Reload with no filters
    void (async () => {
      setLoading(true)
      try {
        const result = await getAuditTrail({ limit: PAGE_SIZE, offset: 0 })
        if (result.success) {
          setEntries(result.entries)
          setTotal(result.total)
          setPage(0)
        }
      } finally {
        setLoading(false)
      }
    })()
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="rounded-lg border border-border bg-muted/20 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">From</Label>
            <Input
              type="date"
              value={filterStart}
              onChange={(e) => setFilterStart(e.target.value)}
              className="h-8 text-sm w-36"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">To</Label>
            <Input
              type="date"
              value={filterEnd}
              onChange={(e) => setFilterEnd(e.target.value)}
              className="h-8 text-sm w-36"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Event Type</Label>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="h-8 w-40 text-sm">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="invoice">Invoice</SelectItem>
                <SelectItem value="payment">Payment</SelectItem>
                <SelectItem value="expense">Expense</SelectItem>
                <SelectItem value="refund">Refund</SelectItem>
                <SelectItem value="manual">Manual Entry</SelectItem>
                <SelectItem value="vendor_bill">Vendor Bill</SelectItem>
                <SelectItem value="bill_payment">Bill Payment</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={applyFilters} className="h-8">
              Apply
            </Button>
            {(filterStart || filterEnd || filterType !== "all") && (
              <Button size="sm" variant="ghost" onClick={clearFilters} className="h-8">
                Clear
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Entry count */}
      {!loading && (
        <p className="text-xs text-muted-foreground">
          {total === 0 ? "No entries found" : `${total.toLocaleString()} entries`}
          {totalPages > 1 && ` — page ${page + 1} of ${totalPages}`}
        </p>
      )}

      {/* Audit log */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground italic">
            Loading audit trail...
          </div>
        ) : entries.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground italic">
            No financial events found for the selected filters.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className={cn(
                  "px-5 py-3 flex items-start justify-between gap-4",
                  entry.is_reversed && "opacity-60"
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Date */}
                    <span className="text-xs text-muted-foreground font-mono whitespace-nowrap">
                      {formatDate(entry.date)}
                    </span>

                    {/* Source type badge */}
                    <Badge variant="outline" className="text-xs px-1.5 py-0">
                      {getSourceLabel(entry.source_type)}
                    </Badge>

                    {/* Reversal badges */}
                    {entry.reversal_of && (
                      <Badge
                        variant="outline"
                        className="text-xs px-1.5 py-0 bg-blue-500/10 text-blue-400 border-blue-500/30"
                      >
                        Reversal
                      </Badge>
                    )}
                    {entry.is_reversed && !entry.reversal_of && (
                      <Badge
                        variant="outline"
                        className="text-xs px-1.5 py-0 bg-amber-500/10 text-amber-400 border-amber-500/30"
                      >
                        Reversed
                      </Badge>
                    )}
                  </div>

                  {/* Description */}
                  <p
                    className={cn(
                      "text-sm mt-0.5",
                      entry.is_reversed && !entry.reversal_of ? "line-through text-muted-foreground" : "text-foreground"
                    )}
                  >
                    {entry.description}
                  </p>

                  {/* Metadata row */}
                  <div className="flex items-center gap-3 mt-0.5">
                    {entry.user_name && (
                      <span className="text-xs text-muted-foreground">{entry.user_name}</span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(entry.created_at)}
                    </span>
                  </div>
                </div>

                {/* Amount */}
                {entry.amount !== null && (
                  <span
                    className={cn(
                      "text-sm font-medium tabular-nums whitespace-nowrap",
                      entry.is_reversed ? "text-muted-foreground line-through" : "text-foreground",
                      entry.reversal_of ? "text-destructive" : ""
                    )}
                  >
                    {entry.reversal_of ? "-" : ""}{formatCurrency(entry.amount)}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <Button
            size="sm"
            variant="outline"
            disabled={page === 0 || loading}
            onClick={() => void loadEntries(page - 1)}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page + 1} of {totalPages}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= totalPages - 1 || loading}
            onClick={() => void loadEntries(page + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  )
}
