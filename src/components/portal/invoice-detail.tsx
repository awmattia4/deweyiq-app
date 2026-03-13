"use client"

import type { PortalInvoice } from "@/actions/portal-data"

interface InvoiceDetailProps {
  invoice: PortalInvoice
}

function fmt(amount: string | number): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(isNaN(num) ? 0 : num)
}

function formatDate(date: Date | string | null): string {
  if (!date) return "—"
  const d = date instanceof Date ? date : new Date(date)
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

/**
 * InvoiceDetail — line items table and payment history for a single invoice.
 *
 * Shown expanded inside an InvoiceList item when the customer clicks to see details.
 * Displays: line items (description, qty, unit price, total), subtotal, tax,
 * surcharge (if any), grand total, and payment history.
 */
export function InvoiceDetail({ invoice }: InvoiceDetailProps) {
  const subtotal = parseFloat(invoice.subtotal)
  const tax = parseFloat(invoice.tax_amount)
  const surcharge = invoice.surcharge_amount ? parseFloat(invoice.surcharge_amount) : 0
  const total = parseFloat(invoice.total)
  const hasSurcharge = surcharge > 0
  const hasTax = tax > 0
  const hasPayments = invoice.payments.length > 0

  return (
    <div className="border-t border-border/50 pt-4 space-y-5">
      {/* ── Line items ────────────────────────────────────────────────── */}
      {invoice.lineItems.length > 0 ? (
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            Line Items
          </p>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">
                    Description
                  </th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground w-16">
                    Qty
                  </th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground w-24">
                    Unit Price
                  </th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground w-24">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {invoice.lineItems.map((item, i) => (
                  <tr key={i} className="hover:bg-muted/20 transition-colors">
                    <td className="px-3 py-2.5 text-foreground">{item.description}</td>
                    <td className="px-3 py-2.5 text-right text-muted-foreground tabular-nums">
                      {parseFloat(item.quantity).toString()}
                    </td>
                    <td className="px-3 py-2.5 text-right text-muted-foreground tabular-nums">
                      {fmt(item.unit_price)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-medium tabular-nums">
                      {fmt(item.line_total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Totals section */}
            <div className="border-t border-border bg-muted/20 px-3 py-2.5 space-y-1.5">
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Subtotal</span>
                <span className="tabular-nums">{fmt(subtotal)}</span>
              </div>
              {hasTax && (
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Tax</span>
                  <span className="tabular-nums">{fmt(tax)}</span>
                </div>
              )}
              {hasSurcharge && (
                <div className="flex justify-between text-sm text-amber-600 dark:text-amber-400">
                  <span>Credit Card Fee</span>
                  <span className="tabular-nums">{fmt(surcharge)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-bold text-foreground pt-1 border-t border-border/50">
                <span>Total</span>
                <span className="tabular-nums">{fmt(total)}</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground italic">No line items on this invoice.</p>
      )}

      {/* ── Payment history ──────────────────────────────────────────── */}
      {hasPayments && (
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            Payment History
          </p>
          <div className="space-y-1.5">
            {invoice.payments.map((payment, i) => (
              <div
                key={i}
                className="flex items-center justify-between text-sm rounded-lg border border-border px-3 py-2.5"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex h-1.5 w-1.5 rounded-full shrink-0 ${
                      payment.status === "settled"
                        ? "bg-green-500"
                        : payment.status === "pending"
                        ? "bg-amber-500"
                        : "bg-destructive"
                    }`}
                  />
                  <span className="text-foreground capitalize">
                    {payment.method === "ach" ? "ACH Transfer" : payment.method}
                  </span>
                  {payment.settled_at && (
                    <span className="text-muted-foreground">
                      · {formatDate(payment.settled_at)}
                    </span>
                  )}
                </div>
                <span className="font-medium tabular-nums">{fmt(payment.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
