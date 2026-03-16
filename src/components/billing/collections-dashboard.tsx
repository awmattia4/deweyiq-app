"use client"

/**
 * CollectionsDashboard — Owner-only collections management view.
 *
 * Shows overdue accounts bucketed by severity (30+, 60+, 90+ days).
 * Allows filtering by bucket and sending dunning reminders.
 *
 * PAY-05: Collections dashboard with overdue accounts.
 */

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import type { CollectionsDashboardResult, CollectionsDashboardCustomer } from "@/actions/payment-reconciliation"

interface CollectionsDashboardProps {
  data: CollectionsDashboardResult
}

type BucketFilter = "all" | "30+" | "60+" | "90+" | "failed_autopay"

function fmtMoney(amount: number): string {
  return amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function fmtDate(dateStr: string | null): string {
  if (!dateStr) return "—"
  const d = new Date(dateStr + "T00:00:00")
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

const BUCKET_COLORS: Record<string, { dot: string; badge: string }> = {
  "90+": {
    dot: "bg-red-500",
    badge: "bg-red-500/10 text-red-400 border-red-500/20",
  },
  "60+": {
    dot: "bg-amber-500",
    badge: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  },
  "30+": {
    dot: "bg-yellow-500",
    badge: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  },
}

export function CollectionsDashboard({ data }: CollectionsDashboardProps) {
  const [filter, setFilter] = useState<BucketFilter>("all")

  const filtered = data.customers.filter((c) => {
    if (filter === "all") return true
    if (filter === "failed_autopay") return c.failedAutopayCount > 0
    return c.bucket === filter
  })

  const over30Count = data.customers.filter((c) => c.bucket === "30+").length
  const over60Count = data.customers.filter((c) => c.bucket === "60+").length
  const over90Count = data.customers.filter((c) => c.bucket === "90+").length
  const failedCount = data.customers.filter((c) => c.failedAutopayCount > 0).length

  if (data.customers.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground italic">
          No overdue accounts. All customers are current.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard
          label="Total Overdue"
          amount={data.totalOverdue}
          count={data.customers.length}
          colorClass="text-foreground"
        />
        <SummaryCard
          label="30+ Days"
          amount={data.over30}
          count={over30Count + over60Count + over90Count}
          colorClass="text-yellow-400"
        />
        <SummaryCard
          label="60+ Days"
          amount={data.over60}
          count={over60Count + over90Count}
          colorClass="text-amber-400"
        />
        <SummaryCard
          label="90+ Days"
          amount={data.over90}
          count={over90Count}
          colorClass="text-red-400"
        />
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2">
        {(
          [
            { key: "all", label: `All (${data.customers.length})` },
            { key: "30+", label: `30+ Days (${over30Count})` },
            { key: "60+", label: `60+ Days (${over60Count})` },
            { key: "90+", label: `90+ Days (${over90Count})` },
            { key: "failed_autopay", label: `Failed AutoPay (${failedCount})` },
          ] as Array<{ key: BucketFilter; label: string }>
        ).map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium border transition-colors cursor-pointer",
              filter === key
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card border-border text-muted-foreground hover:text-foreground hover:border-border/80"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Customer list */}
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground italic text-center py-4">
          No customers match this filter.
        </p>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">
                  Customer
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground hidden md:table-cell">
                  Oldest Invoice
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground hidden lg:table-cell">
                  Last Payment
                </th>
                <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">
                  Overdue Amount
                </th>
                <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground hidden sm:table-cell">
                  Severity
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((customer, idx) => (
                <CollectionsRow
                  key={customer.customerId}
                  customer={customer}
                  isLast={idx === filtered.length - 1}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Summary card ─────────────────────────────────────────────────────────────

function SummaryCard({
  label,
  amount,
  count,
  colorClass,
}: {
  label: string
  amount: number
  count: number
  colorClass: string
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground mb-1.5">{label}</p>
      <p className={cn("text-xl font-bold tracking-tight", colorClass)}>
        ${fmtMoney(amount)}
      </p>
      <p className="text-xs text-muted-foreground mt-0.5">
        {count} customer{count !== 1 ? "s" : ""}
      </p>
    </div>
  )
}

// ─── Table row ────────────────────────────────────────────────────────────────

function CollectionsRow({
  customer,
  isLast,
}: {
  customer: CollectionsDashboardCustomer
  isLast: boolean
}) {
  const [isSending, startTransition] = useTransition()
  const bucketStyle = BUCKET_COLORS[customer.bucket] ?? BUCKET_COLORS["30+"]

  function handleSendReminder() {
    startTransition(async () => {
      // TODO: wire to dunning action when available
      toast.info(`Reminder queued for ${customer.customerName}`)
    })
  }

  return (
    <tr
      className={cn(
        "hover:bg-muted/20 transition-colors",
        !isLast && "border-b border-border"
      )}
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className={cn("h-2 w-2 rounded-full shrink-0", bucketStyle.dot)} />
          <div>
            <p className="font-medium text-sm">{customer.customerName}</p>
            <p className="text-xs text-muted-foreground">
              {customer.invoiceCount} invoice{customer.invoiceCount !== 1 ? "s" : ""}
              {customer.failedAutopayCount > 0 && (
                <span className="ml-1.5 text-red-400">
                  · {customer.failedAutopayCount} failed autopay
                </span>
              )}
            </p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 hidden md:table-cell">
        <span className="text-sm text-muted-foreground">
          {fmtDate(customer.oldestInvoiceDate)}
        </span>
      </td>
      <td className="px-4 py-3 hidden lg:table-cell">
        <span className="text-sm text-muted-foreground">
          {customer.lastPaymentDate ? fmtDate(customer.lastPaymentDate) : "Never"}
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        <span className="font-semibold text-sm">
          ${fmtMoney(customer.overdueAmount)}
        </span>
      </td>
      <td className="px-4 py-3 text-center hidden sm:table-cell">
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
            bucketStyle.badge
          )}
        >
          {customer.bucket}
        </span>
      </td>
    </tr>
  )
}
