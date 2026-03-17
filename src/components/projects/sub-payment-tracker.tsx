"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { recordSubPayment } from "@/actions/projects-subcontractors"
import type { SubPaymentSummary } from "@/actions/projects-subcontractors"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAYMENT_STATUS_STYLES: Record<string, { label: string; class: string }> = {
  unpaid: { label: "Unpaid", class: "bg-red-900/50 text-red-300 border-red-800/50" },
  partial: { label: "Partial", class: "bg-amber-900/50 text-amber-300 border-amber-800/50" },
  paid: { label: "Paid", class: "bg-emerald-900/50 text-emerald-300 border-emerald-800/50" },
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SubPaymentTrackerProps {
  projectId: string
  initialPayments: SubPaymentSummary[]
  onPaymentsChange: (updated: SubPaymentSummary[]) => void
}

interface RecordPaymentDialogState {
  open: boolean
  assignmentId: string
  subName: string
  agreedPrice: string | null
  currentAmountPaid: string
  currentLienWaiver: string | null
}

// ---------------------------------------------------------------------------
// SubPaymentTracker component
// ---------------------------------------------------------------------------

export function SubPaymentTracker({
  projectId,
  initialPayments,
  onPaymentsChange,
}: SubPaymentTrackerProps) {
  const [payments, setPayments] = useState(initialPayments)
  const [isPending, startTransition] = useTransition()
  const [recordDialog, setRecordDialog] = useState<RecordPaymentDialogState>({
    open: false,
    assignmentId: "",
    subName: "",
    agreedPrice: null,
    currentAmountPaid: "0",
    currentLienWaiver: null,
  })

  // Payment form
  const [amountPaidStr, setAmountPaidStr] = useState("")
  const [amountPaidNum, setAmountPaidNum] = useState("")
  const [lienWaiverPath, setLienWaiverPath] = useState("")

  function openRecordDialog(payment: SubPaymentSummary) {
    setAmountPaidStr(parseFloat(payment.amount_paid || "0").toFixed(2))
    setAmountPaidNum(parseFloat(payment.amount_paid || "0").toFixed(2))
    setLienWaiverPath(payment.lien_waiver_path ?? "")
    setRecordDialog({
      open: true,
      assignmentId: payment.assignmentId,
      subName: payment.subName,
      agreedPrice: payment.agreed_price,
      currentAmountPaid: payment.amount_paid,
      currentLienWaiver: payment.lien_waiver_path,
    })
  }

  function closeRecordDialog() {
    setRecordDialog((d) => ({ ...d, open: false }))
  }

  function handleRecordPayment() {
    startTransition(async () => {
      const result = await recordSubPayment(recordDialog.assignmentId, {
        amount_paid: amountPaidNum || "0",
        lien_waiver_path: lienWaiverPath.trim() || null,
      })

      if ("error" in result) {
        toast.error(result.error)
      } else {
        toast.success("Payment recorded")
        const updated = payments.map((p) =>
          p.assignmentId === recordDialog.assignmentId
            ? {
                ...p,
                amount_paid: result.data.amount_paid,
                payment_status: result.data.payment_status,
                lien_waiver_path: result.data.lien_waiver_path,
              }
            : p
        )
        setPayments(updated)
        onPaymentsChange(updated)
        closeRecordDialog()
      }
    })
  }

  // Summary totals
  const totalAgreed = payments.reduce(
    (sum, p) => sum + (parseFloat(p.agreed_price ?? "0") || 0),
    0
  )
  const totalPaid = payments.reduce(
    (sum, p) => sum + (parseFloat(p.amount_paid || "0") || 0),
    0
  )
  const totalOutstanding = totalAgreed - totalPaid

  if (payments.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic py-4 text-center">
        No subcontractor assignments yet. Assign subs to project phases to track payments here.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Payment table */}
      <div className="rounded-md border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Subcontractor
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide hidden sm:table-cell">
                Phase
              </th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Agreed
              </th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Paid
              </th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide hidden sm:table-cell">
                Outstanding
              </th>
              <th className="px-4 py-2.5 text-center text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Status
              </th>
              <th className="px-4 py-2.5 text-center text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Lien Waiver
              </th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Action
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {payments.map((payment) => {
              const agreed = parseFloat(payment.agreed_price ?? "0") || 0
              const paid = parseFloat(payment.amount_paid || "0") || 0
              const outstanding = agreed - paid
              const statusStyle = PAYMENT_STATUS_STYLES[payment.payment_status] ?? PAYMENT_STATUS_STYLES.unpaid
              const tradeDef = payment.subTrade

              return (
                <tr key={payment.assignmentId} className="hover:bg-accent/20 transition-colors">
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium">{payment.subName}</p>
                      <p className="text-xs text-muted-foreground capitalize">{tradeDef}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                    {payment.phaseName}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {agreed > 0 ? formatCurrency(agreed) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {paid > 0 ? formatCurrency(paid) : <span className="text-muted-foreground">$0</span>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums hidden sm:table-cell">
                    {agreed > 0 ? (
                      <span className={cn(outstanding > 0 ? "text-amber-400" : "text-emerald-400")}>
                        {formatCurrency(outstanding)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={cn(
                        "inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium border",
                        statusStyle.class
                      )}
                    >
                      {statusStyle.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {payment.lien_waiver_path ? (
                      <span className="text-emerald-400 text-xs font-medium">Uploaded</span>
                    ) : (
                      <span className="text-red-400 text-xs">Missing</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs px-2"
                      onClick={() => openRecordDialog(payment)}
                      disabled={isPending}
                    >
                      Record Payment
                    </Button>
                  </td>
                </tr>
              )
            })}
          </tbody>

          {/* Summary row */}
          <tfoot>
            <tr className="border-t-2 border-border bg-muted/20">
              <td colSpan={2} className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide hidden sm:table-cell">
                Total
              </td>
              <td colSpan={1} className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide sm:hidden">
                Total
              </td>
              <td className="px-4 py-3 text-right font-semibold tabular-nums">
                {formatCurrency(totalAgreed)}
              </td>
              <td className="px-4 py-3 text-right font-semibold tabular-nums">
                {formatCurrency(totalPaid)}
              </td>
              <td className="px-4 py-3 text-right font-semibold tabular-nums hidden sm:table-cell">
                <span className={cn(totalOutstanding > 0 ? "text-amber-400" : "text-emerald-400")}>
                  {formatCurrency(totalOutstanding)}
                </span>
              </td>
              <td colSpan={3} />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Record Payment Dialog */}
      <Dialog open={recordDialog.open} onOpenChange={(open) => { if (!open) closeRecordDialog() }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>
              Update payment amount and lien waiver status for {recordDialog.subName}.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 mt-2">
            {recordDialog.agreedPrice && (
              <div className="rounded-md bg-muted/30 border border-border px-3 py-2 text-sm">
                <span className="text-muted-foreground">Agreed price: </span>
                <span className="font-medium">
                  {formatCurrency(parseFloat(recordDialog.agreedPrice))}
                </span>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="payment-amount">Total Amount Paid</Label>
              <Input
                id="payment-amount"
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={amountPaidStr}
                onChange={(e) => {
                  const val = e.target.value
                  setAmountPaidStr(val)
                  if (!val.endsWith(".") && !val.endsWith("-") && val !== "") {
                    const n = parseFloat(val)
                    if (!isNaN(n)) setAmountPaidNum(n.toFixed(2))
                  } else if (val === "") {
                    setAmountPaidNum("0")
                  }
                }}
                onBlur={() => {
                  if (amountPaidStr) {
                    const n = parseFloat(amountPaidStr)
                    if (!isNaN(n)) {
                      setAmountPaidStr(n.toFixed(2))
                      setAmountPaidNum(n.toFixed(2))
                    }
                  }
                }}
              />
              <p className="text-xs text-muted-foreground">
                Enter the cumulative total paid to this subcontractor for this phase.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lien-waiver">Lien Waiver (storage path or URL)</Label>
              <Input
                id="lien-waiver"
                type="text"
                placeholder="e.g. lien-waivers/proj-123/abc-plumbing.pdf"
                value={lienWaiverPath}
                onChange={(e) => setLienWaiverPath(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Paste the Supabase Storage path or URL of the signed lien waiver document.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={closeRecordDialog}>Cancel</Button>
              <Button onClick={handleRecordPayment} disabled={isPending}>
                Save Payment
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function formatCurrency(amount: number): string {
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
}
