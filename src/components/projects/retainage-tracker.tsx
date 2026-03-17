"use client"

/**
 * RetainageTracker — Displays retainage holdback and release status.
 *
 * Per research Pitfall 8: displays are computed from actual invoice records,
 * not a stored running total. Data is passed in from the server.
 *
 * Shows:
 * - Total retainage held (sum of all progress invoice retainage_held)
 * - Per-invoice breakdown: invoice #, date, amount held, status
 * - Expected release: on final invoice after walkthrough sign-off
 * - Total released (if any final invoice has released retainage)
 */

import type { RetainageSummary } from "@/actions/projects-billing"
import { cn } from "@/lib/utils"

interface RetainageTrackerProps {
  summary: RetainageSummary
  retainagePct: number
  estimatedCompletionDate: string | null
}

const INVOICE_TYPE_LABELS: Record<string, string> = {
  project_deposit: "Deposit",
  project_progress: "Progress",
  project_final: "Final",
  service: "Service",
}

const STATUS_CLASSES: Record<string, string> = {
  draft: "text-muted-foreground",
  sent: "text-amber-500",
  paid: "text-emerald-500",
  void: "text-muted-foreground line-through",
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount)
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export function RetainageTracker({
  summary,
  retainagePct,
  estimatedCompletionDate,
}: RetainageTrackerProps) {
  const { totalHeld, totalReleased, perInvoice } = summary
  const netHeld = totalHeld - totalReleased
  const hasReleased = totalReleased > 0

  // Only show rows that have retainage activity
  const retainageRows = perInvoice.filter(
    (inv) => inv.retainageHeld > 0 || inv.retainageReleased > 0
  )

  return (
    <div className="flex flex-col gap-4">
      {/* Summary row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="flex flex-col gap-0.5 p-3 rounded-lg bg-muted/50">
          <span className="text-xs text-muted-foreground uppercase tracking-wide">Total Held</span>
          <span className="text-lg font-semibold tabular-nums">
            {formatCurrency(totalHeld)}
          </span>
          <span className="text-xs text-muted-foreground">{retainagePct}% of each progress invoice</span>
        </div>
        <div className="flex flex-col gap-0.5 p-3 rounded-lg bg-muted/50">
          <span className="text-xs text-muted-foreground uppercase tracking-wide">Released</span>
          <span className={cn("text-lg font-semibold tabular-nums", hasReleased ? "text-emerald-500" : "text-muted-foreground")}>
            {formatCurrency(totalReleased)}
          </span>
          <span className="text-xs text-muted-foreground">
            {hasReleased ? "Released via final invoice" : "Pending project completion"}
          </span>
        </div>
        <div className="flex flex-col gap-0.5 p-3 rounded-lg bg-muted/50">
          <span className="text-xs text-muted-foreground uppercase tracking-wide">Net Held</span>
          <span className="text-lg font-semibold tabular-nums text-amber-500">
            {formatCurrency(netHeld)}
          </span>
          <span className="text-xs text-muted-foreground">
            {estimatedCompletionDate
              ? `Est. release: ${estimatedCompletionDate}`
              : "Released on final invoice"}
          </span>
        </div>
      </div>

      {/* Per-invoice breakdown */}
      {retainageRows.length > 0 ? (
        <div>
          <h4 className="text-sm font-medium mb-2">Per-Invoice Breakdown</h4>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Invoice</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Type</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Date</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Held</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Released</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {retainageRows.map((inv) => (
                  <tr key={inv.invoiceId} className="hover:bg-muted/20 transition-colors">
                    <td className="px-3 py-2 font-mono text-xs">
                      {inv.invoiceNumber ?? <span className="text-muted-foreground italic">Draft</span>}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {INVOICE_TYPE_LABELS[inv.invoiceType] ?? inv.invoiceType}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {formatDate(inv.createdAt)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {inv.retainageHeld > 0 ? formatCurrency(inv.retainageHeld) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-500">
                      {inv.retainageReleased > 0 ? formatCurrency(inv.retainageReleased) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className={cn("px-3 py-2 capitalize", STATUS_CLASSES[inv.status] ?? "")}>
                      {inv.status}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-muted/30">
                  <td colSpan={3} className="px-3 py-2 text-xs font-medium text-muted-foreground">Total</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">{formatCurrency(totalHeld)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium text-emerald-500">{formatCurrency(totalReleased)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground italic">
          No retainage activity yet. Retainage is held from each progress invoice and released with the final invoice.
        </p>
      )}

      {/* Release note */}
      {netHeld > 0 && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <div className="flex flex-col gap-0.5">
            <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
              {formatCurrency(netHeld)} retainage pending release
            </p>
            <p className="text-xs text-muted-foreground">
              Retainage is released on the final invoice after walkthrough sign-off and project completion.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
