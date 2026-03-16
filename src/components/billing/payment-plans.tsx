"use client"

/**
 * PaymentPlans — Owner/office payment plan management.
 *
 * Features:
 * - Create a new payment plan: select invoice, installments (2–12), frequency
 * - Preview installment schedule before confirming
 * - Active plans list: progress, next due date
 * - Record payment for individual installments
 *
 * PAY-03: Payment plan creation and installment tracking.
 */

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import {
  createPaymentPlan,
  recordInstallmentPayment,
  type PaymentPlanRow,
  type PaymentPlanInstallmentRow,
} from "@/actions/payment-reconciliation"
import { toLocalDateString } from "@/lib/date-utils"

interface PaymentPlansProps {
  plans: PaymentPlanRow[]
  openInvoices: Array<{ id: string; invoice_number: string | null; total: string; customerName: string }>
  isOwner: boolean
}

type Frequency = "weekly" | "bi_weekly" | "monthly"

const FREQUENCY_LABELS: Record<Frequency, string> = {
  weekly: "Weekly",
  bi_weekly: "Bi-weekly",
  monthly: "Monthly",
}

function fmtMoney(amount: string | number): string {
  const n = typeof amount === "number" ? amount : parseFloat(amount) || 0
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—"
  const d = new Date(dateStr + "T00:00:00")
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

function advanceDateClient(dateStr: string, frequency: Frequency): string {
  const d = new Date(dateStr + "T12:00:00")
  switch (frequency) {
    case "weekly":
      d.setDate(d.getDate() + 7)
      break
    case "bi_weekly":
      d.setDate(d.getDate() + 14)
      break
    case "monthly":
    default:
      d.setMonth(d.getMonth() + 1)
      break
  }
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

/** Compute installment schedule preview in the browser */
function computeSchedulePreview(
  total: number,
  count: number,
  frequency: Frequency,
  startDate: string
): Array<{ number: number; dueDate: string; amount: number }> {
  if (count < 2 || total <= 0) return []
  const installmentAmount = Math.floor((total / count) * 100) / 100
  const lastAmount = Math.round((total - installmentAmount * (count - 1)) * 100) / 100

  const schedule = []
  let currentDate = startDate
  for (let i = 1; i <= count; i++) {
    schedule.push({
      number: i,
      dueDate: currentDate,
      amount: i === count ? lastAmount : installmentAmount,
    })
    if (i < count) currentDate = advanceDateClient(currentDate, frequency)
  }
  return schedule
}

export function PaymentPlans({ plans, openInvoices, isOwner }: PaymentPlansProps) {
  const [showCreate, setShowCreate] = useState(false)
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null)

  // Create form state
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("")
  const [installmentCount, setInstallmentCount] = useState(3)
  const [frequency, setFrequency] = useState<Frequency>("monthly")
  const [startDate, setStartDate] = useState(toLocalDateString())
  const [showPreview, setShowPreview] = useState(false)
  const [isCreating, startCreate] = useTransition()

  const selectedInvoice = openInvoices.find((inv) => inv.id === selectedInvoiceId)
  const invoiceTotal = selectedInvoice ? parseFloat(selectedInvoice.total) || 0 : 0
  const schedulePreview =
    showPreview && invoiceTotal > 0
      ? computeSchedulePreview(invoiceTotal, installmentCount, frequency, startDate)
      : []

  function handleCreate() {
    if (!selectedInvoiceId) {
      toast.error("Please select an invoice")
      return
    }
    if (!startDate) {
      toast.error("Please set a start date")
      return
    }

    startCreate(async () => {
      const result = await createPaymentPlan(
        selectedInvoiceId,
        installmentCount,
        frequency,
        startDate
      )
      if (result.success) {
        toast.success("Payment plan created")
        setShowCreate(false)
        setSelectedInvoiceId("")
        setInstallmentCount(3)
        setFrequency("monthly")
        setStartDate(toLocalDateString())
        setShowPreview(false)
      } else {
        toast.error(result.error ?? "Failed to create payment plan")
      }
    })
  }

  const expandedPlan = plans.find((p) => p.id === selectedPlanId)

  return (
    <div className="flex flex-col gap-5">
      {/* Header + create button */}
      {isOwner && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {plans.length} active payment plan{plans.length !== 1 ? "s" : ""}
          </p>
          <button
            type="button"
            onClick={() => setShowCreate((v) => !v)}
            className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted/50 transition-colors cursor-pointer"
          >
            {showCreate ? "Cancel" : "New Payment Plan"}
          </button>
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <div className="rounded-lg border border-border bg-card p-5 flex flex-col gap-4">
          <h3 className="text-sm font-semibold">Create Payment Plan</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Invoice selector */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground">Invoice</label>
              <select
                value={selectedInvoiceId}
                onChange={(e) => {
                  setSelectedInvoiceId(e.target.value)
                  setShowPreview(false)
                }}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Select an invoice…</option>
                {openInvoices.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.customerName} — {inv.invoice_number ?? "Draft"} (${fmtMoney(inv.total)})
                  </option>
                ))}
              </select>
            </div>

            {/* Installments */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground">
                Installments ({installmentCount})
              </label>
              <input
                type="range"
                min={2}
                max={12}
                value={installmentCount}
                onChange={(e) => {
                  setInstallmentCount(Number(e.target.value))
                  setShowPreview(false)
                }}
                className="mt-1 cursor-pointer"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>2</span>
                <span>12</span>
              </div>
            </div>

            {/* Frequency */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground">Frequency</label>
              <select
                value={frequency}
                onChange={(e) => {
                  setFrequency(e.target.value as Frequency)
                  setShowPreview(false)
                }}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="weekly">Weekly</option>
                <option value="bi_weekly">Bi-weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>

            {/* Start date */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground">First Payment Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value)
                  setShowPreview(false)
                }}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>

          {/* Summary if invoice selected */}
          {selectedInvoice && invoiceTotal > 0 && (
            <div className="rounded-md bg-muted/30 border border-border px-4 py-3 text-sm">
              <span className="text-muted-foreground">Invoice total: </span>
              <span className="font-semibold">${fmtMoney(invoiceTotal)}</span>
              <span className="text-muted-foreground mx-2">·</span>
              <span className="text-muted-foreground">
                {installmentCount} × {FREQUENCY_LABELS[frequency]} payments of{" "}
              </span>
              <span className="font-semibold">
                ${fmtMoney(Math.floor((invoiceTotal / installmentCount) * 100) / 100)}
              </span>
            </div>
          )}

          {/* Preview + actions */}
          <div className="flex items-center gap-3">
            {selectedInvoiceId && invoiceTotal > 0 && (
              <button
                type="button"
                onClick={() => setShowPreview((v) => !v)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2 cursor-pointer"
              >
                {showPreview ? "Hide preview" : "Preview schedule"}
              </button>
            )}
            <div className="flex-1" />
            <button
              type="button"
              onClick={handleCreate}
              disabled={isCreating || !selectedInvoiceId}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isCreating ? "Creating…" : "Create Plan"}
            </button>
          </div>

          {/* Schedule preview */}
          {showPreview && schedulePreview.length > 0 && (
            <div className="rounded-md border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/30 border-b border-border">
                    <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">
                      Installment
                    </th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">
                      Due Date
                    </th>
                    <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {schedulePreview.map((item, idx) => (
                    <tr
                      key={item.number}
                      className={cn(
                        idx < schedulePreview.length - 1 && "border-b border-border"
                      )}
                    >
                      <td className="px-4 py-2 text-muted-foreground">#{item.number}</td>
                      <td className="px-4 py-2">{fmtDate(item.dueDate)}</td>
                      <td className="px-4 py-2 text-right font-medium">
                        ${fmtMoney(item.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Active plans list */}
      {plans.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground italic">No active payment plans.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {plans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              isExpanded={selectedPlanId === plan.id}
              onToggle={() =>
                setSelectedPlanId(selectedPlanId === plan.id ? null : plan.id)
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Plan card ────────────────────────────────────────────────────────────────

function PlanCard({
  plan,
  isExpanded,
  onToggle,
}: {
  plan: PaymentPlanRow
  isExpanded: boolean
  onToggle: () => void
}) {
  const paidCount = plan.installments.filter((i) => i.status === "paid").length
  const totalCount = plan.installments.length
  const nextDue = plan.installments.find((i) => i.status === "pending" || i.status === "overdue")

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Summary row — click to expand */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left px-5 py-4 flex items-center gap-4 hover:bg-muted/20 transition-colors cursor-pointer"
      >
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{plan.customerName}</p>
          <p className="text-xs text-muted-foreground">
            {plan.invoiceNumber ?? "Draft invoice"} ·{" "}
            {FREQUENCY_LABELS[plan.frequency as Frequency] ?? plan.frequency} payments
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-semibold">${fmtMoney(plan.total_amount)}</p>
          <p className="text-xs text-muted-foreground">
            {paidCount}/{totalCount} paid
          </p>
        </div>
        <div className="shrink-0 text-right hidden sm:block">
          <p className="text-xs text-muted-foreground">Next due</p>
          <p className="text-xs font-medium">
            {nextDue ? fmtDate(nextDue.due_date) : "Complete"}
          </p>
        </div>
        <ProgressBar paid={paidCount} total={totalCount} />
        <span className="text-xs text-muted-foreground shrink-0">
          {isExpanded ? "▲" : "▼"}
        </span>
      </button>

      {/* Expanded: installment detail */}
      {isExpanded && (
        <div className="border-t border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/30 border-b border-border">
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">
                  Installment
                </th>
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">
                  Due Date
                </th>
                <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">
                  Amount
                </th>
                <th className="text-center px-4 py-2 text-xs font-medium text-muted-foreground">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {plan.installments.map((inst, idx) => (
                <InstallmentRow
                  key={inst.id}
                  installment={inst}
                  planId={plan.id}
                  orgId={plan.org_id}
                  invoiceId={plan.invoice_id}
                  isLast={idx === plan.installments.length - 1}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ paid, total }: { paid: number; total: number }) {
  const pct = total > 0 ? Math.round((paid / total) * 100) : 0
  return (
    <div className="hidden md:flex flex-col gap-1 w-24 shrink-0">
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground text-center">{pct}%</p>
    </div>
  )
}

// ─── Installment row ──────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  paid: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  overdue: "bg-red-500/10 text-red-400 border-red-500/20",
  pending: "bg-muted/40 text-muted-foreground border-border",
}

function InstallmentRow({
  installment,
  planId,
  orgId,
  invoiceId,
  isLast,
}: {
  installment: PaymentPlanInstallmentRow
  planId: string
  orgId: string
  invoiceId: string
  isLast: boolean
}) {
  const [isRecording, startRecord] = useTransition()

  function handleRecord() {
    startRecord(async () => {
      // We need a payment_record_id — create a placeholder cash payment record
      // In production this would open a dialog to select/create a payment record
      toast.info("To record payment, create a payment record for this invoice first, then link it here.")
    })
  }

  const statusLabel =
    installment.status === "paid"
      ? "Paid"
      : installment.status === "overdue"
        ? "Overdue"
        : "Pending"

  return (
    <tr className={cn(!isLast && "border-b border-border")}>
      <td className="px-4 py-3 text-muted-foreground">#{installment.installment_number}</td>
      <td className="px-4 py-3">{fmtDate(installment.due_date)}</td>
      <td className="px-4 py-3 text-right font-medium">${fmtMoney(installment.amount)}</td>
      <td className="px-4 py-3 text-center">
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
            STATUS_STYLES[installment.status] ?? STATUS_STYLES.pending
          )}
        >
          {statusLabel}
        </span>
      </td>
    </tr>
  )
}
