"use client"

/**
 * invoice-detail-view.tsx — Read-only invoice detail for sent/paid/void/overdue invoices.
 *
 * Shows full invoice with line items table, totals breakdown, billing period,
 * customer info, payment info, WO references, and action bar (PDF, Send).
 */

import { useState, useTransition } from "react"
import Link from "next/link"
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ExternalLinkIcon,
  Loader2Icon,
  MailIcon,
  MessageSquareIcon,
  SendIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { sendInvoice } from "@/actions/invoices"
import type { InvoiceDetail } from "@/actions/invoices"

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  overdue: "Overdue",
  paid: "Paid",
  void: "Void",
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-zinc-700 text-zinc-200",
  sent: "bg-blue-900/60 text-blue-300",
  overdue: "bg-amber-900/60 text-amber-300",
  paid: "bg-emerald-900/60 text-emerald-300",
  void: "bg-red-900/60 text-red-300",
}

const BILLING_MODEL_LABELS: Record<string, string> = {
  per_stop: "Per Stop",
  flat_rate: "Monthly Flat Rate",
  plus_chemicals: "Plus Chemicals",
  custom: "Custom",
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  card: "Credit Card",
  ach: "ACH / Bank Transfer",
  check: "Check",
  cash: "Cash",
  qbo: "QuickBooks",
}

type DeliveryMethod = "email" | "sms" | "both"

// ─── Component ────────────────────────────────────────────────────────────────

interface InvoiceDetailViewProps {
  invoice: InvoiceDetail
  hasPhone?: boolean
}

export function InvoiceDetailView({ invoice, hasPhone = false }: InvoiceDetailViewProps) {
  const [showSendMenu, setShowSendMenu] = useState(false)
  const [isSending, startTransition] = useTransition()

  const subtotal = parseFloat(invoice.subtotal) || 0
  const taxAmount = parseFloat(invoice.tax_amount) || 0
  const discountAmount = parseFloat(invoice.discount_amount) || 0
  const surchargeAmount = parseFloat(invoice.surcharge_amount ?? "0") || 0
  const total = parseFloat(invoice.total) || 0

  const statusLabel = STATUS_LABELS[invoice.status] ?? invoice.status
  const statusColor = STATUS_COLORS[invoice.status] ?? "bg-zinc-700 text-zinc-200"

  const canSend = invoice.status === "sent" || invoice.status === "overdue"

  function handleSend(method: DeliveryMethod) {
    setShowSendMenu(false)
    startTransition(async () => {
      const options = {
        email: method === "email" || method === "both",
        sms: method === "sms" || method === "both",
      }
      const result = await sendInvoice(invoice.id, options)
      if (result.success) {
        toast.success(
          `Invoice ${result.invoiceNumber ?? ""} sent via ${
            method === "both" ? "email + SMS" : method
          }`
        )
      } else {
        toast.error(result.error ?? "Failed to send invoice")
      }
    })
  }

  function formatDate(d: Date | string | null) {
    if (!d) return null
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(d))
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ── Back navigation ───────────────────────────────────────────────── */}
      <Link
        href="/billing"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeftIcon className="h-4 w-4" />
        Back to Billing
      </Link>

      {/* ── Header card ───────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              {invoice.invoice_number
                ? `Invoice ${invoice.invoice_number}`
                : "Invoice"}
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {invoice.customerName}
            </p>
            {invoice.customerAddress && (
              <p className="text-xs text-muted-foreground/70">
                {invoice.customerAddress}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span
              className={cn(
                "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium",
                statusColor
              )}
            >
              {statusLabel}
            </span>
          </div>
        </div>

        {/* Tax exempt badge */}
        {invoice.taxExempt && (
          <div className="mt-3 inline-flex items-center rounded-md border border-green-500/30 bg-green-500/10 px-3 py-1.5 text-xs font-medium text-green-300">
            Tax Exempt
          </div>
        )}

        {/* ── Date details grid ──────────────────────────────────────────── */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          {invoice.issued_at && (
            <div>
              <span className="text-xs text-muted-foreground">Issued</span>
              <p className="font-medium">{formatDate(invoice.issued_at)}</p>
            </div>
          )}
          {invoice.due_date && (
            <div>
              <span className="text-xs text-muted-foreground">Due</span>
              <p className="font-medium">{formatDate(invoice.due_date)}</p>
            </div>
          )}
          {invoice.paid_at && (
            <div>
              <span className="text-xs text-muted-foreground">Paid</span>
              <p className="font-medium text-emerald-400">{formatDate(invoice.paid_at)}</p>
            </div>
          )}
          {invoice.billing_model && (
            <div>
              <span className="text-xs text-muted-foreground">Billing Model</span>
              <p className="font-medium">
                {BILLING_MODEL_LABELS[invoice.billing_model] ?? invoice.billing_model}
              </p>
            </div>
          )}
        </div>

        {/* Billing period */}
        {invoice.billing_period_start && invoice.billing_period_end && (
          <div className="mt-3 text-sm">
            <span className="text-xs text-muted-foreground">Billing Period</span>
            <p className="font-medium">
              {formatDate(invoice.billing_period_start)} — {formatDate(invoice.billing_period_end)}
            </p>
          </div>
        )}

        {/* Sent timestamps */}
        {(invoice.sent_at || invoice.sent_sms_at) && (
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
            {invoice.sent_at && (
              <span>Email sent {formatDate(invoice.sent_at)}</span>
            )}
            {invoice.sent_sms_at && (
              <span>SMS sent {formatDate(invoice.sent_sms_at)}</span>
            )}
          </div>
        )}
      </div>

      {/* ── Line items ────────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold">
            Line Items ({invoice.lineItems.length})
          </h2>
        </div>

        {invoice.lineItems.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground italic">
            No line items
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="px-5 py-2 text-left font-medium">Description</th>
                  <th className="px-3 py-2 text-right font-medium">Qty</th>
                  <th className="px-3 py-2 text-left font-medium">Unit</th>
                  <th className="px-3 py-2 text-right font-medium">Unit Price</th>
                  <th className="px-5 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {invoice.lineItems.map((li) => {
                  const qty = parseFloat(li.quantity) || 0
                  const unitPrice = parseFloat(li.unit_price) || 0
                  const lineTotal = parseFloat(li.line_total) || 0

                  return (
                    <tr
                      key={li.id}
                      className="border-b border-border/50 last:border-0"
                    >
                      <td className="px-5 py-2.5">
                        <span className="font-medium">{li.description}</span>
                        {li.is_taxable && (
                          <span className="ml-1.5 text-[10px] text-muted-foreground">
                            taxable
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {qty % 1 === 0 ? qty.toFixed(0) : qty.toFixed(2)}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">
                        {li.unit}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        ${unitPrice.toFixed(2)}
                      </td>
                      <td className="px-5 py-2.5 text-right font-medium tabular-nums">
                        ${lineTotal.toFixed(2)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Totals */}
        <div className="border-t border-border px-5 py-4">
          <div className="ml-auto flex w-full max-w-xs flex-col gap-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="tabular-nums">${subtotal.toFixed(2)}</span>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-green-400">
                <span>Discount</span>
                <span className="tabular-nums">−${discountAmount.toFixed(2)}</span>
              </div>
            )}
            {surchargeAmount > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Surcharge</span>
                <span className="tabular-nums">${surchargeAmount.toFixed(2)}</span>
              </div>
            )}
            {taxAmount > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tax</span>
                <span className="tabular-nums">${taxAmount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-border pt-1.5 font-semibold">
              <span>Total</span>
              <span className="tabular-nums">${total.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Notes ─────────────────────────────────────────────────────────── */}
      {invoice.notes && (
        <div className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-sm font-semibold mb-2">Notes</h2>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
            {invoice.notes}
          </p>
        </div>
      )}

      {/* ── Work Order References ─────────────────────────────────────────── */}
      {invoice.workOrderTitles.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-sm font-semibold mb-2">Work Orders</h2>
          <div className="flex flex-wrap gap-2">
            {invoice.workOrderTitles.map((title, i) => {
              const woId = (invoice.work_order_ids ?? [])[i]
              return woId ? (
                <Link
                  key={woId}
                  href={`/work-orders/${woId}`}
                  className="rounded-md border border-border bg-muted/50 px-3 py-1.5 text-sm hover:bg-muted transition-colors"
                >
                  {title}
                </Link>
              ) : (
                <span
                  key={i}
                  className="rounded-md border border-border bg-muted/50 px-3 py-1.5 text-sm"
                >
                  {title}
                </span>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Payment info ──────────────────────────────────────────────────── */}
      {invoice.paid_at && invoice.payment_method && (
        <div className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-sm font-semibold mb-2">Payment</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-xs text-muted-foreground">Method</span>
              <p className="font-medium">
                {PAYMENT_METHOD_LABELS[invoice.payment_method] ?? invoice.payment_method}
              </p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Paid</span>
              <p className="font-medium text-emerald-400">{formatDate(invoice.paid_at)}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Action bar ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        {invoice.invoice_number && (
          <Link
            href={`/api/invoices/${invoice.id}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted transition-colors"
          >
            <ExternalLinkIcon className="h-4 w-4" />
            View PDF
          </Link>
        )}

        {canSend && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowSendMenu(!showSendMenu)}
              disabled={isSending}
              className="cursor-pointer inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {isSending ? (
                <Loader2Icon className="h-4 w-4 animate-spin" />
              ) : (
                <SendIcon className="h-4 w-4" />
              )}
              Send
              <ChevronDownIcon className="h-3.5 w-3.5" />
            </button>

            {showSendMenu && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowSendMenu(false)}
                />
                <div className="absolute left-0 top-full z-50 mt-1 min-w-[160px] rounded-lg border border-border bg-popover p-1 shadow-lg">
                  <button
                    type="button"
                    onClick={() => handleSend("email")}
                    className="cursor-pointer flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                  >
                    <MailIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    Email Only
                  </button>
                  {hasPhone && (
                    <button
                      type="button"
                      onClick={() => handleSend("sms")}
                      className="cursor-pointer flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                    >
                      <MessageSquareIcon className="h-3.5 w-3.5 text-muted-foreground" />
                      SMS Only
                    </button>
                  )}
                  {hasPhone && (
                    <button
                      type="button"
                      onClick={() => handleSend("both")}
                      className="cursor-pointer flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                    >
                      <SendIcon className="h-3.5 w-3.5 text-muted-foreground" />
                      Email + SMS
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
