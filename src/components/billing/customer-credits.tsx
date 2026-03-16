"use client"

/**
 * CustomerCredits — Owner/office credit management.
 *
 * Features:
 * - Issue a new credit: customer, amount, reason, source type
 * - Credits list: all org credits with status (available / applied / expired)
 * - Apply a credit to an open invoice
 *
 * PAY-04: Customer credits — issue and apply.
 */

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import {
  issueCustomerCredit,
  applyCustomerCredit,
  getOpenInvoicesForCustomer,
  type CustomerCreditRow,
} from "@/actions/payment-reconciliation"

interface CustomerCreditsProps {
  credits: CustomerCreditRow[]
  customers: Array<{ id: string; full_name: string }>
  isOwner: boolean
}

const SOURCE_TYPE_LABELS: Record<string, string> = {
  refund: "Refund",
  goodwill: "Goodwill",
  overpayment: "Overpayment",
}

const STATUS_STYLES: Record<string, string> = {
  available: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  applied: "bg-muted/40 text-muted-foreground border-border",
  expired: "bg-red-500/10 text-red-400 border-red-500/20",
}

function fmtMoney(amount: string | number): string {
  const n = typeof amount === "number" ? amount : parseFloat(amount) || 0
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(date: Date | null | undefined): string {
  if (!date) return "—"
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export function CustomerCredits({
  credits,
  customers,
  isOwner,
}: CustomerCreditsProps) {
  const [showIssue, setShowIssue] = useState(false)

  // Issue credit form
  const [selectedCustomer, setSelectedCustomer] = useState("")
  const [amountStr, setAmountStr] = useState("")
  const [reason, setReason] = useState("")
  const [sourceType, setSourceType] = useState<"refund" | "goodwill" | "overpayment">("goodwill")
  const [isIssuing, startIssue] = useTransition()

  // Apply credit state
  const [applyingCreditId, setApplyingCreditId] = useState<string | null>(null)
  const [openInvoices, setOpenInvoices] = useState<
    Array<{ id: string; invoice_number: string | null; total: string; status: string }>
  >([])
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("")
  const [isLoadingInvoices, setIsLoadingInvoices] = useState(false)
  const [isApplying, startApply] = useTransition()

  async function handleStartApply(credit: CustomerCreditRow) {
    setApplyingCreditId(credit.id)
    setSelectedInvoiceId("")
    setIsLoadingInvoices(true)
    try {
      const result = await getOpenInvoicesForCustomer(credit.customer_id)
      setOpenInvoices(result)
    } catch {
      toast.error("Failed to load open invoices")
    } finally {
      setIsLoadingInvoices(false)
    }
  }

  function handleCancelApply() {
    setApplyingCreditId(null)
    setSelectedInvoiceId("")
    setOpenInvoices([])
  }

  function handleApply(creditId: string) {
    if (!selectedInvoiceId) {
      toast.error("Please select an invoice")
      return
    }
    startApply(async () => {
      const result = await applyCustomerCredit(creditId, selectedInvoiceId)
      if (result.success) {
        toast.success("Credit applied to invoice")
        handleCancelApply()
      } else {
        toast.error(result.error ?? "Failed to apply credit")
      }
    })
  }

  function handleIssue() {
    if (!selectedCustomer) {
      toast.error("Please select a customer")
      return
    }
    const parsedAmount = parseFloat(amountStr)
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      toast.error("Enter a valid credit amount")
      return
    }
    if (!reason.trim()) {
      toast.error("Please enter a reason for the credit")
      return
    }

    startIssue(async () => {
      const result = await issueCustomerCredit(
        selectedCustomer,
        parsedAmount.toFixed(2),
        reason.trim(),
        sourceType
      )
      if (result.success) {
        toast.success("Credit issued successfully")
        setShowIssue(false)
        setSelectedCustomer("")
        setAmountStr("")
        setReason("")
        setSourceType("goodwill")
      } else {
        toast.error(result.error ?? "Failed to issue credit")
      }
    })
  }

  const availableCredits = credits.filter((c) => c.status === "available")
  const appliedCredits = credits.filter((c) => c.status !== "available")

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      {isOwner && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {availableCredits.length} available credit
            {availableCredits.length !== 1 ? "s" : ""} · $
            {fmtMoney(
              availableCredits.reduce((sum, c) => sum + parseFloat(c.amount), 0)
            )}{" "}
            total
          </p>
          <button
            type="button"
            onClick={() => setShowIssue((v) => !v)}
            className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted/50 transition-colors cursor-pointer"
          >
            {showIssue ? "Cancel" : "Issue Credit"}
          </button>
        </div>
      )}

      {/* Issue credit form */}
      {showIssue && (
        <div className="rounded-lg border border-border bg-card p-5 flex flex-col gap-4">
          <h3 className="text-sm font-semibold">Issue Customer Credit</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Customer */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground">Customer</label>
              <select
                value={selectedCustomer}
                onChange={(e) => setSelectedCustomer(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Select a customer…</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name}
                  </option>
                ))}
              </select>
            </div>

            {/* Amount */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground">Amount ($)</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                placeholder="0.00"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            {/* Source type */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground">Credit Type</label>
              <select
                value={sourceType}
                onChange={(e) =>
                  setSourceType(e.target.value as "refund" | "goodwill" | "overpayment")
                }
                className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="goodwill">Goodwill</option>
                <option value="refund">Refund</option>
                <option value="overpayment">Overpayment</option>
              </select>
            </div>

            {/* Reason */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground">Reason</label>
              <input
                type="text"
                placeholder="e.g. Service disruption compensation"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleIssue}
              disabled={isIssuing}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isIssuing ? "Issuing…" : "Issue Credit"}
            </button>
          </div>
        </div>
      )}

      {/* Credits list */}
      {credits.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground italic">No customer credits on file.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {/* Available credits */}
          {availableCredits.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Available
              </h3>
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/30 border-b border-border">
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">
                        Customer
                      </th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden md:table-cell">
                        Type
                      </th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden sm:table-cell">
                        Reason
                      </th>
                      <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">
                        Amount
                      </th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">
                        Status
                      </th>
                      {isOwner && (
                        <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground" />
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {availableCredits.map((credit, idx) => (
                      <CreditRow
                        key={credit.id}
                        credit={credit}
                        isLast={idx === availableCredits.length - 1}
                        isOwner={isOwner}
                        applyingCreditId={applyingCreditId}
                        openInvoices={openInvoices}
                        isLoadingInvoices={isLoadingInvoices}
                        selectedInvoiceId={selectedInvoiceId}
                        setSelectedInvoiceId={setSelectedInvoiceId}
                        isApplying={isApplying}
                        onStartApply={handleStartApply}
                        onCancelApply={handleCancelApply}
                        onApply={handleApply}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Applied/expired credits */}
          {appliedCredits.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Applied / Expired
              </h3>
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/30 border-b border-border">
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">
                        Customer
                      </th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden md:table-cell">
                        Type
                      </th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden sm:table-cell">
                        Applied To
                      </th>
                      <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">
                        Amount
                      </th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {appliedCredits.map((credit, idx) => (
                      <CreditRow
                        key={credit.id}
                        credit={credit}
                        isLast={idx === appliedCredits.length - 1}
                        isOwner={false}
                        applyingCreditId={null}
                        openInvoices={[]}
                        isLoadingInvoices={false}
                        selectedInvoiceId=""
                        setSelectedInvoiceId={() => {}}
                        isApplying={false}
                        onStartApply={async () => {}}
                        onCancelApply={() => {}}
                        onApply={() => {}}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Credit row ───────────────────────────────────────────────────────────────

function CreditRow({
  credit,
  isLast,
  isOwner,
  applyingCreditId,
  openInvoices,
  isLoadingInvoices,
  selectedInvoiceId,
  setSelectedInvoiceId,
  isApplying,
  onStartApply,
  onCancelApply,
  onApply,
}: {
  credit: CustomerCreditRow
  isLast: boolean
  isOwner: boolean
  applyingCreditId: string | null
  openInvoices: Array<{ id: string; invoice_number: string | null; total: string; status: string }>
  isLoadingInvoices: boolean
  selectedInvoiceId: string
  setSelectedInvoiceId: (id: string) => void
  isApplying: boolean
  onStartApply: (credit: CustomerCreditRow) => Promise<void>
  onCancelApply: () => void
  onApply: (creditId: string) => void
}) {
  const isThisApplying = applyingCreditId === credit.id

  return (
    <>
      <tr className={cn(!isLast && !isThisApplying && "border-b border-border")}>
        <td className="px-4 py-3 font-medium">{credit.customerName}</td>
        <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
          {SOURCE_TYPE_LABELS[credit.source_type] ?? credit.source_type}
        </td>
        <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell truncate max-w-[200px]">
          {credit.status === "applied" && credit.appliedInvoiceNumber
            ? `Applied to ${credit.appliedInvoiceNumber}`
            : credit.reason}
        </td>
        <td className="px-4 py-3 text-right font-semibold">${fmtMoney(credit.amount)}</td>
        <td className="px-4 py-3">
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
              STATUS_STYLES[credit.status] ?? STATUS_STYLES.applied
            )}
          >
            {credit.status.charAt(0).toUpperCase() + credit.status.slice(1)}
          </span>
        </td>
        {isOwner && (
          <td className="px-4 py-3 text-right">
            {credit.status === "available" && (
              <button
                type="button"
                onClick={() => (isThisApplying ? onCancelApply() : onStartApply(credit))}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2 cursor-pointer"
              >
                {isThisApplying ? "Cancel" : "Apply"}
              </button>
            )}
          </td>
        )}
      </tr>

      {/* Apply-to-invoice inline row */}
      {isThisApplying && (
        <tr className={cn("bg-muted/20", !isLast && "border-b border-border")}>
          <td colSpan={6} className="px-4 py-3">
            {isLoadingInvoices ? (
              <p className="text-sm text-muted-foreground">Loading open invoices…</p>
            ) : openInvoices.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">
                No open invoices for this customer.
              </p>
            ) : (
              <div className="flex items-center gap-3">
                <select
                  value={selectedInvoiceId}
                  onChange={(e) => setSelectedInvoiceId(e.target.value)}
                  className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring flex-1 max-w-xs"
                >
                  <option value="">Select invoice…</option>
                  {openInvoices.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.invoice_number ?? "Draft"} — ${fmtMoney(inv.total)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => onApply(credit.id)}
                  disabled={isApplying || !selectedInvoiceId}
                  className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {isApplying ? "Applying…" : "Apply Credit"}
                </button>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}
