"use client"

/**
 * ApWorkflow — Accounts payable management UI.
 *
 * Features:
 * - AP dashboard: 4 summary cards (total AP, overdue, due this week, due this month)
 * - Vendor bill entry form with auto AP journal entry generation
 * - Bills list with status filter chips and per-bill actions
 * - AP aging report with bucket breakdown and bar chart
 * - Payment scheduling and recording
 *
 * Visible in both simplified and accountant modes — AP is core business.
 */

import { useState, useEffect, useCallback } from "react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts"
import {
  createVendorBill,
  getVendorBills,
  updateVendorBill,
  schedulePayment,
  recordBillPayment,
  getApAging,
  getApSummary,
  getVendors,
  createVendorQuick,
} from "@/actions/vendor-bills"
import { getChartOfAccounts } from "@/actions/accounting"
import type { VendorBillRow, ApAging, ApSummary } from "@/actions/vendor-bills"
import type { AccountRow } from "@/actions/accounting"

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

const STATUS_LABELS: Record<string, string> = {
  all: "All",
  unpaid: "Unpaid",
  overdue: "Overdue",
  scheduled: "Scheduled",
  paid: "Paid",
  void: "Void",
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    unpaid: { label: "Unpaid", className: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
    overdue: { label: "Overdue", className: "bg-destructive/20 text-destructive border-destructive/30" },
    scheduled: { label: "Scheduled", className: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
    paid: { label: "Paid", className: "bg-green-500/20 text-green-400 border-green-500/30" },
    void: { label: "Void", className: "bg-muted text-muted-foreground" },
  }
  const cfg = config[status] ?? config.unpaid
  return (
    <Badge variant="outline" className={cn("text-xs px-1.5 py-0", cfg.className)}>
      {cfg.label}
    </Badge>
  )
}

// ---------------------------------------------------------------------------
// Summary cards
// ---------------------------------------------------------------------------

function SummaryCard({
  label,
  value,
  className,
}: {
  label: string
  value: string
  className?: string
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-2xl font-bold tabular-nums", className)}>{value}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ApWorkflow
// ---------------------------------------------------------------------------

type FilterChip = "all" | "unpaid" | "overdue" | "scheduled" | "paid"

export function ApWorkflow({ isOwner }: { isOwner: boolean }) {
  const [summary, setSummary] = useState<ApSummary | null>(null)
  const [bills, setBills] = useState<VendorBillRow[]>([])
  const [aging, setAging] = useState<ApAging | null>(null)
  const [vendors, setVendors] = useState<Array<{ id: string; vendor_name: string; contact_email: string | null; contact_phone: string | null }>>([])
  const [expenseAccounts, setExpenseAccounts] = useState<AccountRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filterChip, setFilterChip] = useState<FilterChip>("all")

  // Bill entry form
  const [showBillForm, setShowBillForm] = useState(false)
  const [formVendorId, setFormVendorId] = useState("")
  const [formBillNumber, setFormBillNumber] = useState("")
  const [formBillDate, setFormBillDate] = useState("")
  const [formDueDate, setFormDueDate] = useState("")
  const [formDescription, setFormDescription] = useState("")
  const [formAmountStr, setFormAmountStr] = useState("")
  const [formCategoryId, setFormCategoryId] = useState("")
  const [formSaving, setFormSaving] = useState(false)

  // Inline vendor creation
  const [showNewVendor, setShowNewVendor] = useState(false)
  const [newVendorName, setNewVendorName] = useState("")
  const [creatingVendor, setCreatingVendor] = useState(false)

  // Schedule payment dialog
  const [scheduleDialog, setScheduleDialog] = useState<VendorBillRow | null>(null)
  const [scheduledDate, setScheduledDate] = useState("")
  const [scheduling, setScheduling] = useState(false)

  // Record payment dialog
  const [paymentDialog, setPaymentDialog] = useState<VendorBillRow | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<"check" | "bank_transfer" | "cash">("check")
  const [paymentRef, setPaymentRef] = useState("")
  const [recording, setRecording] = useState(false)

  // Aging expanded buckets
  const [expandedBucket, setExpandedBucket] = useState<string | null>(null)

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [summaryResult, billsResult, agingResult, vendorsResult, accountsResult] =
        await Promise.all([
          getApSummary(),
          getVendorBills(),
          getApAging(),
          getVendors(),
          getChartOfAccounts(),
        ])

      if (summaryResult.success) setSummary(summaryResult.summary)
      if (billsResult.success) setBills(billsResult.bills)
      if (agingResult.success) setAging(agingResult.aging)
      if (vendorsResult.success) setVendors(vendorsResult.vendors)
      if (accountsResult.success) {
        setExpenseAccounts(accountsResult.accounts.filter((a) => a.account_type === "expense"))
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  // Filtered bills
  const filteredBills = bills.filter((b) => {
    if (filterChip === "all") return true
    return b.status === filterChip
  })

  const filterCounts: Record<FilterChip, number> = {
    all: bills.length,
    unpaid: bills.filter((b) => b.status === "unpaid").length,
    overdue: bills.filter((b) => b.status === "overdue").length,
    scheduled: bills.filter((b) => b.status === "scheduled").length,
    paid: bills.filter((b) => b.status === "paid").length,
  }

  // Create vendor inline
  async function handleCreateVendor() {
    if (!newVendorName.trim()) return
    setCreatingVendor(true)
    try {
      const result = await createVendorQuick(newVendorName)
      if (result.success && result.vendorId) {
        const newVendor = { id: result.vendorId, vendor_name: newVendorName.trim(), contact_email: null, contact_phone: null }
        setVendors((prev) => [...prev, newVendor])
        setFormVendorId(result.vendorId)
        setNewVendorName("")
        setShowNewVendor(false)
        toast.success("Vendor created")
      } else {
        toast.error(result.error ?? "Failed to create vendor")
      }
    } finally {
      setCreatingVendor(false)
    }
  }

  // Save bill
  async function handleSaveBill() {
    if (!formVendorId) { toast.error("Select a vendor"); return }
    if (!formBillDate) { toast.error("Bill date is required"); return }
    if (!formDueDate) { toast.error("Due date is required"); return }
    if (!formDescription.trim()) { toast.error("Description is required"); return }
    const parsedAmount = parseFloat(formAmountStr)
    if (isNaN(parsedAmount) || parsedAmount <= 0) { toast.error("Enter a valid amount"); return }

    setFormSaving(true)
    try {
      const result = await createVendorBill({
        vendorId: formVendorId,
        billNumber: formBillNumber || undefined,
        billDate: formBillDate,
        dueDate: formDueDate,
        description: formDescription,
        amount: parsedAmount.toFixed(2),
        categoryAccountId: formCategoryId || undefined,
      })

      if (result.success) {
        toast.success("Bill saved and journal entry created")
        setShowBillForm(false)
        setFormVendorId("")
        setFormBillNumber("")
        setFormBillDate("")
        setFormDueDate("")
        setFormDescription("")
        setFormAmountStr("")
        setFormCategoryId("")
        await loadAll()
      } else {
        toast.error(result.error ?? "Failed to save bill")
      }
    } finally {
      setFormSaving(false)
    }
  }

  // Schedule payment
  async function handleSchedule() {
    if (!scheduleDialog || !scheduledDate) return
    setScheduling(true)
    try {
      const result = await schedulePayment(scheduleDialog.id, scheduledDate)
      if (result.success) {
        toast.success("Payment scheduled")
        setScheduleDialog(null)
        setScheduledDate("")
        await loadAll()
      } else {
        toast.error(result.error ?? "Failed to schedule payment")
      }
    } finally {
      setScheduling(false)
    }
  }

  // Record payment
  async function handleRecord() {
    if (!paymentDialog) return
    setRecording(true)
    try {
      const result = await recordBillPayment(
        paymentDialog.id,
        paymentMethod,
        paymentRef || undefined
      )
      if (result.success) {
        toast.success("Payment recorded and journal entry created")
        setPaymentDialog(null)
        setPaymentRef("")
        setPaymentMethod("check")
        await loadAll()
      } else {
        toast.error(result.error ?? "Failed to record payment")
      }
    } finally {
      setRecording(false)
    }
  }

  // Aging chart data
  const agingChartData = aging
    ? [
        { name: "Current", total: aging.current.total, fill: "#60a5fa" },
        { name: "1-30 Days", total: aging.days1to30.total, fill: "#f59e0b" },
        { name: "31-60 Days", total: aging.days31to60.total, fill: "#f97316" },
        { name: "61-90 Days", total: aging.days61to90.total, fill: "#ef4444" },
        { name: "90+ Days", total: aging.days90plus.total, fill: "#991b1b" },
      ]
    : []

  if (loading) {
    return (
      <div className="text-center py-8 text-sm text-muted-foreground italic">
        Loading accounts payable...
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <SummaryCard
          label="Total AP Outstanding"
          value={formatCurrency(summary?.totalOutstanding ?? 0)}
        />
        <SummaryCard
          label="Overdue"
          value={formatCurrency(summary?.totalOverdue ?? 0)}
          className={(summary?.totalOverdue ?? 0) > 0 ? "text-destructive" : undefined}
        />
        <SummaryCard
          label="Due This Week"
          value={formatCurrency(summary?.dueThisWeek ?? 0)}
          className={(summary?.dueThisWeek ?? 0) > 0 ? "text-amber-400" : undefined}
        />
        <SummaryCard
          label="Due This Month"
          value={formatCurrency(summary?.dueThisMonth ?? 0)}
        />
      </div>

      {/* Bill entry form */}
      {isOwner && (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h3 className="font-semibold">Vendor Bills</h3>
            {!showBillForm && (
              <Button size="sm" variant="outline" onClick={() => setShowBillForm(true)}>
                Add Bill
              </Button>
            )}
          </div>

          {showBillForm && (
            <div className="px-5 py-4 border-b border-border bg-muted/10 space-y-4">
              <h4 className="text-sm font-semibold">New Vendor Bill</h4>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {/* Vendor selector */}
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">Vendor</Label>
                  {!showNewVendor ? (
                    <div className="flex gap-2">
                      <Select value={formVendorId} onValueChange={setFormVendorId}>
                        <SelectTrigger className="h-9 text-sm flex-1">
                          <SelectValue placeholder="Select vendor..." />
                        </SelectTrigger>
                        <SelectContent>
                          {vendors.map((v) => (
                            <SelectItem key={v.id} value={v.id}>
                              {v.vendor_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-9 text-xs shrink-0"
                        onClick={() => setShowNewVendor(true)}
                      >
                        + New
                      </Button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Input
                        value={newVendorName}
                        onChange={(e) => setNewVendorName(e.target.value)}
                        placeholder="New vendor name"
                        className="h-9 text-sm flex-1"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-9 text-xs"
                        onClick={handleCreateVendor}
                        disabled={creatingVendor || !newVendorName.trim()}
                      >
                        {creatingVendor ? "Adding..." : "Add"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-9 text-xs"
                        onClick={() => { setShowNewVendor(false); setNewVendorName("") }}
                      >
                        Cancel
                      </Button>
                    </div>
                  )}
                </div>

                {/* Bill number (optional) */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Bill Number (optional)</Label>
                  <Input
                    value={formBillNumber}
                    onChange={(e) => setFormBillNumber(e.target.value)}
                    placeholder="e.g. INV-001"
                    className="h-9 text-sm"
                  />
                </div>

                {/* Bill date */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Bill Date</Label>
                  <Input
                    type="date"
                    value={formBillDate}
                    onChange={(e) => setFormBillDate(e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>

                {/* Due date */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Due Date</Label>
                  <Input
                    type="date"
                    value={formDueDate}
                    onChange={(e) => setFormDueDate(e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>

                {/* Amount */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Amount</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                    <Input
                      value={formAmountStr}
                      onChange={(e) => {
                        const v = e.target.value
                        if (v === "" || v === "-" || v.endsWith(".")) {
                          setFormAmountStr(v)
                          return
                        }
                        const n = parseFloat(v)
                        if (!isNaN(n)) setFormAmountStr(v)
                      }}
                      onBlur={() => {
                        const n = parseFloat(formAmountStr)
                        if (!isNaN(n)) setFormAmountStr(n.toFixed(2))
                      }}
                      placeholder="0.00"
                      className="h-9 text-sm pl-7"
                    />
                  </div>
                </div>

                {/* Description */}
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">Description</Label>
                  <Input
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    placeholder="What is this bill for?"
                    className="h-9 text-sm"
                  />
                </div>

                {/* Expense category */}
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">Expense Category (optional)</Label>
                  <Select value={formCategoryId} onValueChange={setFormCategoryId}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="Default expense account" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Default expense account</SelectItem>
                      {expenseAccounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.account_number} — {a.display_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex gap-2">
                <Button size="sm" onClick={handleSaveBill} disabled={formSaving}>
                  {formSaving ? "Saving..." : "Save Bill"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowBillForm(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Filter chips */}
          <div className="px-5 py-3 flex items-center gap-2 flex-wrap border-b border-border">
            {(["all", "unpaid", "overdue", "scheduled", "paid"] as FilterChip[]).map((chip) => (
              <button
                key={chip}
                onClick={() => setFilterChip(chip)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  filterChip === chip
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                )}
              >
                {STATUS_LABELS[chip] ?? chip}
                {filterCounts[chip] > 0 && (
                  <span className="ml-1.5 opacity-70">({filterCounts[chip]})</span>
                )}
              </button>
            ))}
          </div>

          {/* Bills list */}
          {filteredBills.length === 0 ? (
            <div className="px-5 py-6 text-center text-sm text-muted-foreground italic">
              {filterChip === "all" ? "No vendor bills yet. Add one above." : `No ${filterChip} bills.`}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filteredBills.map((bill) => (
                <div
                  key={bill.id}
                  className={cn(
                    "px-5 py-4 flex items-start justify-between gap-4",
                    bill.status === "overdue" && "border-l-2 border-destructive"
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{bill.vendor_name}</span>
                      {bill.bill_number && (
                        <span className="text-xs text-muted-foreground font-mono">#{bill.bill_number}</span>
                      )}
                      <StatusBadge status={bill.status} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{bill.description}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-muted-foreground">
                        Due {formatDate(bill.due_date)}
                      </span>
                      {bill.days_until_due !== null && (
                        <span className={cn(
                          "text-xs",
                          bill.days_until_due < 0
                            ? "text-destructive"
                            : bill.days_until_due <= 7
                            ? "text-amber-400"
                            : "text-muted-foreground"
                        )}>
                          {bill.days_until_due < 0
                            ? `${Math.abs(bill.days_until_due)}d overdue`
                            : bill.days_until_due === 0
                            ? "Due today"
                            : `${bill.days_until_due}d remaining`}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-medium tabular-nums text-sm">
                      {formatCurrency(parseFloat(bill.amount))}
                    </span>

                    {/* Actions — only for owner on unpaid/overdue/scheduled */}
                    {isOwner && (bill.status === "unpaid" || bill.status === "overdue" || bill.status === "scheduled") && (
                      <div className="flex gap-1">
                        {bill.status !== "scheduled" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            onClick={() => {
                              setScheduleDialog(bill)
                              setScheduledDate("")
                            }}
                          >
                            Schedule
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          onClick={() => {
                            setPaymentDialog(bill)
                            setPaymentMethod("check")
                            setPaymentRef("")
                          }}
                        >
                          Pay
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* AP Aging Report */}
      {isOwner && aging && (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h3 className="font-semibold">AP Aging Report</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Outstanding bills by days past due — total {formatCurrency(aging.grandTotal)}
            </p>
          </div>

          {/* Bar chart */}
          {aging.grandTotal > 0 && (
            <div className="px-5 pt-4">
              <div style={{ height: 160 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={agingChartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 11, fill: "#94a3b8" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
                      tick={{ fontSize: 11, fill: "#94a3b8" }}
                      axisLine={false}
                      tickLine={false}
                      width={48}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: "8px" }}
                      labelStyle={{ color: "#f1f5f9", fontSize: 12 }}
                      formatter={(value) => [formatCurrency(Number(value)), "Amount"]}
                    />
                    <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                      {agingChartData.map((entry, index) => (
                        <Cell key={index} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Aging buckets table */}
          <div className="divide-y divide-border mt-2">
            {[
              { bucket: aging.current, key: "current" },
              { bucket: aging.days1to30, key: "1-30" },
              { bucket: aging.days31to60, key: "31-60" },
              { bucket: aging.days61to90, key: "61-90" },
              { bucket: aging.days90plus, key: "90+" },
            ].map(({ bucket, key }) => (
              <div key={key}>
                <button
                  onClick={() => setExpandedBucket(expandedBucket === key ? null : key)}
                  className="w-full px-5 py-3 flex items-center justify-between hover:bg-muted/30 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium">{bucket.label}</span>
                    <span className="text-xs text-muted-foreground">{bucket.days}</span>
                    {bucket.count > 0 && (
                      <Badge variant="outline" className="text-xs px-1.5 py-0">
                        {bucket.count} bill{bucket.count !== 1 ? "s" : ""}
                      </Badge>
                    )}
                  </div>
                  <span className={cn(
                    "font-medium tabular-nums text-sm",
                    key !== "current" && bucket.total > 0 ? "text-destructive" : "text-foreground"
                  )}>
                    {formatCurrency(bucket.total)}
                  </span>
                </button>

                {/* Expanded bill list */}
                {expandedBucket === key && bucket.bills.length > 0 && (
                  <div className="px-5 pb-3 bg-muted/10 space-y-2">
                    {bucket.bills.map((bill) => (
                      <div key={bill.id} className="flex items-center justify-between text-xs py-1">
                        <div>
                          <span className="font-medium">{bill.vendor_name}</span>
                          {bill.bill_number && (
                            <span className="text-muted-foreground ml-1 font-mono">#{bill.bill_number}</span>
                          )}
                          <span className="text-muted-foreground ml-2">{bill.description}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-muted-foreground">
                            Due {formatDate(bill.due_date)}
                          </span>
                          <span className="font-medium tabular-nums">
                            {formatCurrency(parseFloat(bill.amount))}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* Grand total */}
            <div className="px-5 py-3 flex items-center justify-between bg-muted/20">
              <span className="text-sm font-bold">Grand Total</span>
              <span className="font-bold tabular-nums">{formatCurrency(aging.grandTotal)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Schedule payment dialog */}
      <Dialog open={!!scheduleDialog} onOpenChange={() => setScheduleDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule Payment</DialogTitle>
            <DialogDescription>
              {scheduleDialog && (
                <>
                  Schedule payment for{" "}
                  <strong>{scheduleDialog.vendor_name}</strong> —{" "}
                  {formatCurrency(parseFloat(scheduleDialog.amount))}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Scheduled Payment Date</Label>
              <Input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleDialog(null)}>Cancel</Button>
            <Button onClick={handleSchedule} disabled={scheduling || !scheduledDate}>
              {scheduling ? "Scheduling..." : "Schedule Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Record payment dialog */}
      <Dialog open={!!paymentDialog} onOpenChange={() => setPaymentDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>
              {paymentDialog && (
                <>
                  Record payment of{" "}
                  <strong>{formatCurrency(parseFloat(paymentDialog.amount))}</strong> to{" "}
                  <strong>{paymentDialog.vendor_name}</strong>
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Payment Method</Label>
              <Select
                value={paymentMethod}
                onValueChange={(v) => setPaymentMethod(v as typeof paymentMethod)}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="check">Check</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Reference Number (optional)</Label>
              <Input
                value={paymentRef}
                onChange={(e) => setPaymentRef(e.target.value)}
                placeholder="Check # or transaction ID"
                className="h-9 text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentDialog(null)}>Cancel</Button>
            <Button onClick={handleRecord} disabled={recording}>
              {recording ? "Recording..." : "Record Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
