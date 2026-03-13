"use client"

/**
 * InvoiceList — sortable invoice cards for the customer portal.
 *
 * Sort order by actionability:
 *   1. Overdue (sent + due_date in the past)
 *   2. Unpaid / Sent (due_date in the future or null)
 *   3. Paid
 *
 * Each card is expandable to show InvoiceDetail (line items + payment history).
 * Unpaid invoices show a "Pay Now" button that opens a payment sheet.
 */

import { useState, useEffect, useCallback } from "react"
import { ChevronDownIcon, CreditCardIcon, CheckCircleIcon, AlertCircleIcon, Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { InvoiceDetail } from "./invoice-detail"
import { PaymentForm, PaymentSuccess } from "./payment-form"
import { createPortalPaymentIntent } from "@/actions/portal-data"
import type { PortalInvoice } from "@/actions/portal-data"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(amount: string | number): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    isNaN(num) ? 0 : num
  )
}

function formatDate(dateStr: string | Date | null): string {
  if (!dateStr) return ""
  const d = dateStr instanceof Date ? dateStr : new Date(dateStr + "T00:00:00")
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

function isOverdue(invoice: PortalInvoice): boolean {
  if (invoice.status !== "sent") return false
  if (!invoice.due_date) return false
  const due = new Date(invoice.due_date + "T00:00:00")
  return due < new Date()
}

type InvoiceStatus = "overdue" | "unpaid" | "paid"

function getInvoiceStatus(invoice: PortalInvoice): InvoiceStatus {
  if (invoice.status === "paid") return "paid"
  if (isOverdue(invoice)) return "overdue"
  return "unpaid"
}

function sortInvoices(invoices: PortalInvoice[]): PortalInvoice[] {
  const order: Record<InvoiceStatus, number> = { overdue: 0, unpaid: 1, paid: 2 }
  return [...invoices].sort((a, b) => {
    const diff = order[getInvoiceStatus(a)] - order[getInvoiceStatus(b)]
    if (diff !== 0) return diff
    // Within group: newest first (by issued_at, fallback created_at)
    const aDate = a.issued_at ? new Date(a.issued_at).getTime() : 0
    const bDate = b.issued_at ? new Date(b.issued_at).getTime() : 0
    return bDate - aDate
  })
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface InvoiceListProps {
  invoices: PortalInvoice[]
  orgId: string
  customerId: string
  stripeAvailable: boolean
  stripeAccountId: string | null
  publishableKey: string | null
  ccSurchargeEnabled: boolean
  ccSurchargePct: number
}

// ---------------------------------------------------------------------------
// InvoiceList
// ---------------------------------------------------------------------------

export function InvoiceList({
  invoices,
  orgId,
  customerId,
  stripeAvailable,
  stripeAccountId,
  publishableKey,
  ccSurchargeEnabled,
  ccSurchargePct,
}: InvoiceListProps) {
  // Handle ?payment=success redirect from Stripe
  const [successInvoiceId, setSuccessInvoiceId] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get("payment") === "success") {
      // Remove the query param from the URL without reloading
      window.history.replaceState({}, "", "/portal/invoices")
      // We don't know which invoice was just paid until webhook fires,
      // so just show a generic success toast via the notification
    }
  }, [])

  if (invoices.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <CreditCardIcon className="mx-auto h-8 w-8 text-muted-foreground/40 mb-3" />
        <p className="text-sm text-muted-foreground italic">No invoices yet.</p>
      </div>
    )
  }

  const sorted = sortInvoices(invoices)

  return (
    <div className="space-y-3">
      {sorted.map((invoice) => (
        <InvoiceCard
          key={invoice.id}
          invoice={invoice}
          orgId={orgId}
          customerId={customerId}
          stripeAvailable={stripeAvailable}
          stripeAccountId={stripeAccountId}
          publishableKey={publishableKey}
          ccSurchargeEnabled={ccSurchargeEnabled}
          ccSurchargePct={ccSurchargePct}
          initiallyPaid={successInvoiceId === invoice.id}
        />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// InvoiceCard — individual expandable invoice row
// ---------------------------------------------------------------------------

interface InvoiceCardProps {
  invoice: PortalInvoice
  orgId: string
  customerId: string
  stripeAvailable: boolean
  stripeAccountId: string | null
  publishableKey: string | null
  ccSurchargeEnabled: boolean
  ccSurchargePct: number
  initiallyPaid: boolean
}

function InvoiceCard({
  invoice,
  orgId,
  customerId,
  stripeAvailable,
  stripeAccountId,
  publishableKey,
  ccSurchargeEnabled,
  ccSurchargePct,
  initiallyPaid,
}: InvoiceCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [payOpen, setPayOpen] = useState(false)
  const [loadingPI, setLoadingPI] = useState(false)
  const [piData, setPiData] = useState<{
    clientSecret: string
    publishableKey: string
    stripeAccount: string
    amount: number
    surchargeAmount: number
  } | null>(null)
  const [piError, setPiError] = useState<string | null>(null)
  const [paid, setPaid] = useState(initiallyPaid)

  const status = paid ? "paid" : getInvoiceStatus(invoice)
  const isPayable = status === "overdue" || status === "unpaid"

  const handlePayNow = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation()
      if (!stripeAvailable || !stripeAccountId || !publishableKey) return

      setLoadingPI(true)
      setPiError(null)
      setPayOpen(true)

      try {
        const result = await createPortalPaymentIntent(orgId, customerId, invoice.id)
        if ("error" in result) {
          setPiError(result.error)
          setLoadingPI(false)
          return
        }
        setPiData(result)
      } catch (err) {
        setPiError(err instanceof Error ? err.message : "Failed to initialize payment")
      } finally {
        setLoadingPI(false)
      }
    },
    [orgId, customerId, invoice.id, stripeAvailable, stripeAccountId, publishableKey]
  )

  const handlePaymentSuccess = useCallback(() => {
    setPaid(true)
    setPayOpen(false)
    setPiData(null)
  }, [])

  // ── Status badge config ──────────────────────────────────────────────────
  const badgeConfig = {
    overdue: {
      label: "Overdue",
      className: "border-red-500/40 text-red-400 bg-red-500/10",
    },
    unpaid: {
      label: "Unpaid",
      className: "border-amber-500/40 text-amber-400 bg-amber-500/10",
    },
    paid: {
      label: "Paid",
      className: "border-green-500/40 text-green-400 bg-green-500/10",
    },
  }[status]

  return (
    <div
      className={`rounded-xl border bg-card overflow-hidden transition-colors ${
        status === "overdue" ? "border-red-500/30" : "border-border"
      }`}
    >
      {/* ── Card header ────────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-3 px-4 py-3.5 cursor-pointer hover:bg-muted/30 active:bg-muted/50 transition-colors"
        onClick={() => setExpanded((v) => !v)}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onKeyDown={(e) => e.key === "Enter" || e.key === " " ? setExpanded((v) => !v) : null}
      >
        {/* Left: invoice info */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-0.5">
            <span className="text-sm font-semibold text-foreground">
              {invoice.invoice_number ? `Invoice #${invoice.invoice_number}` : "Invoice"}
            </span>
            <Badge variant="outline" className={`text-[10px] h-4 px-1.5 ${badgeConfig.className}`}>
              {badgeConfig.label}
            </Badge>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            {invoice.billing_period_start && invoice.billing_period_end && (
              <span>
                {formatDate(invoice.billing_period_start)} – {formatDate(invoice.billing_period_end)}
              </span>
            )}
            {status === "paid" && invoice.paid_at && (
              <span className="text-green-500">
                Paid {formatDate(invoice.paid_at)}
              </span>
            )}
            {status === "overdue" && invoice.due_date && (
              <span className="text-red-400">
                Due {formatDate(invoice.due_date)}
              </span>
            )}
            {status === "unpaid" && invoice.due_date && (
              <span>Due {formatDate(invoice.due_date)}</span>
            )}
          </div>
        </div>

        {/* Right: amount + actions */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-sm font-bold tabular-nums">{fmt(invoice.total)}</span>

          {/* Status icon / pay button */}
          {status === "paid" && (
            <CheckCircleIcon className="h-4 w-4 text-green-500 shrink-0" />
          )}

          {isPayable && stripeAvailable && (
            <Button
              size="sm"
              variant="default"
              className="h-7 text-xs px-2.5"
              onClick={handlePayNow}
              disabled={loadingPI}
            >
              {loadingPI ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                "Pay Now"
              )}
            </Button>
          )}

          <ChevronDownIcon
            className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200 ${
              expanded ? "rotate-180" : ""
            }`}
          />
        </div>
      </div>

      {/* ── Payment form (shown when Pay Now is clicked) ─────────────────── */}
      {payOpen && isPayable && (
        <div className="border-t border-border/50 px-4 py-4">
          {loadingPI && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" />
              Preparing payment form...
            </div>
          )}

          {piError && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
              <AlertCircleIcon className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{piError}</span>
            </div>
          )}

          {piData && !loadingPI && (
            <>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium">Payment Details</p>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setPayOpen(false); setPiData(null) }}
                  className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  Cancel
                </button>
              </div>
              <PaymentForm
                invoiceId={invoice.id}
                invoiceNumber={invoice.invoice_number}
                clientSecret={piData.clientSecret}
                publishableKey={piData.publishableKey}
                stripeAccount={piData.stripeAccount}
                amount={piData.amount}
                surchargeAmount={piData.surchargeAmount}
                ccSurchargeEnabled={ccSurchargeEnabled}
                onSuccess={handlePaymentSuccess}
              />
            </>
          )}
        </div>
      )}

      {/* ── Success state (after payment) ───────────────────────────────── */}
      {paid && invoice.status !== "paid" && (
        <div className="border-t border-green-500/30 px-4 py-3 bg-green-500/5">
          <PaymentSuccess invoiceNumber={invoice.invoice_number} />
        </div>
      )}

      {/* ── Detail section (expandable) ─────────────────────────────────── */}
      {expanded && !payOpen && (
        <div className="px-4 pb-4">
          <InvoiceDetail invoice={invoice} />
        </div>
      )}
    </div>
  )
}
