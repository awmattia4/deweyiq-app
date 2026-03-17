"use client"

/**
 * ProjectInvoiceList — Table of all project invoices.
 *
 * Shows: invoice number, type, date, amount, retainage held/released, status, payment status.
 * "View" links to /billing/[id] (full invoice detail).
 * "Send" action shown for draft invoices (navigates to billing detail to finalize/send).
 */

import Link from "next/link"
import type { ProjectInvoiceSummary } from "@/actions/projects-billing"
import { cn } from "@/lib/utils"

interface ProjectInvoiceListProps {
  invoices: ProjectInvoiceSummary[]
}

const INVOICE_TYPE_LABELS: Record<string, string> = {
  project_deposit: "Deposit",
  project_progress: "Progress",
  project_final: "Final",
  service: "Service",
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-muted text-muted-foreground" },
  sent: { label: "Sent", className: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  paid: { label: "Paid", className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  void: { label: "Void", className: "bg-muted/50 text-muted-foreground line-through" },
}

function formatCurrency(amount: string | null | undefined): string {
  if (!amount) return "$0.00"
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(parseFloat(amount))
}

function formatDate(date: Date | null): string {
  if (!date) return "—"
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export function ProjectInvoiceList({ invoices }: ProjectInvoiceListProps) {
  if (invoices.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic">
        No invoices yet. Progress invoices are auto-generated when phases are completed.
      </p>
    )
  }

  const totalBilled = invoices
    .filter((inv) => inv.status !== "void")
    .reduce((sum, inv) => sum + parseFloat(inv.total), 0)

  const totalPaid = invoices
    .filter((inv) => inv.status === "paid")
    .reduce((sum, inv) => sum + parseFloat(inv.total), 0)

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Invoice #</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Type</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Date</th>
              <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Amount</th>
              <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Retainage Held</th>
              <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Retainage Released</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Status</th>
              <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {invoices.map((inv) => {
              const badge = STATUS_BADGE[inv.status] ?? STATUS_BADGE.draft
              const typeLabel = INVOICE_TYPE_LABELS[inv.invoice_type] ?? inv.invoice_type

              return (
                <tr key={inv.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-3 py-2.5 font-mono text-xs">
                    {inv.invoice_number ?? (
                      <span className="text-muted-foreground italic">Draft</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={cn(
                        "text-xs font-medium px-1.5 py-0.5 rounded",
                        inv.invoice_type === "project_final"
                          ? "bg-primary/10 text-primary"
                          : inv.invoice_type === "project_deposit"
                          ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {typeLabel}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {formatDate(inv.created_at)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-medium">
                    {formatCurrency(inv.total)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-amber-500">
                    {parseFloat(inv.retainage_held ?? "0") > 0
                      ? formatCurrency(inv.retainage_held)
                      : <span className="text-muted-foreground">—</span>
                    }
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-emerald-500">
                    {parseFloat(inv.retainage_released ?? "0") > 0
                      ? formatCurrency(inv.retainage_released)
                      : <span className="text-muted-foreground">—</span>
                    }
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={cn("text-xs font-medium px-1.5 py-0.5 rounded capitalize", badge.className)}>
                      {badge.label}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {inv.status === "draft" && (
                        <Link
                          href={`/billing/${inv.id}`}
                          className="text-xs text-primary hover:underline"
                        >
                          Review
                        </Link>
                      )}
                      <Link
                        href={`/billing/${inv.id}`}
                        className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                      >
                        View
                      </Link>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-border bg-muted/30">
              <td colSpan={3} className="px-3 py-2 text-xs font-medium text-muted-foreground">Totals</td>
              <td className="px-3 py-2 text-right tabular-nums font-semibold">
                {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(totalBilled)}
              </td>
              <td colSpan={4} className="px-3 py-2 text-xs text-muted-foreground text-right">
                Paid: {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(totalPaid)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
