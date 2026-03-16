"use client"

/**
 * PtoManager — PTO balance tracking, request/approval UI.
 *
 * Owner view:
 *   - PTO balances table with inline edit (balance + accrual rate per employee per type)
 *   - Pending requests section: approve/deny buttons
 *   - Full request history
 *
 * Tech view:
 *   - Own PTO balances (read-only)
 *   - "Request Time Off" button + dialog
 *   - Own request history
 */

import { useState, useTransition } from "react"
import {
  getPtoBalances,
  updatePtoBalance,
  requestPto,
  approvePto,
  getPtoRequests,
  type PtoBalance,
  type PtoRequest,
} from "@/actions/team-management"
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
  DialogTrigger,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"

// ─── Types ────────────────────────────────────────────────────────────────────

type PtoType = "vacation" | "sick" | "personal"

interface Props {
  initialBalances: PtoBalance[]
  initialRequests: PtoRequest[]
  userRole: string
  userId: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ptoTypeLabel(type: string): string {
  switch (type) {
    case "vacation": return "Vacation"
    case "sick": return "Sick"
    case "personal": return "Personal"
    default: return type
  }
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "pending": return "border-amber-500/40 text-amber-400 bg-amber-500/10"
    case "approved": return "border-emerald-500/40 text-emerald-400 bg-emerald-500/10"
    case "denied": return "border-red-500/40 text-red-400 bg-red-500/10"
    default: return ""
  }
}

function formatDateRange(start: string, end: string): string {
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }
  const s = new Date(start + "T12:00:00").toLocaleDateString("en-US", opts)
  const e = new Date(end + "T12:00:00").toLocaleDateString("en-US", opts)
  return s === e ? s : `${s} – ${e}`
}

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

// ─── Editable balance cell ────────────────────────────────────────────────────

function BalanceCell({
  balance,
  field,
  onSave,
}: {
  balance: PtoBalance
  field: "balance_hours" | "accrual_rate_hours"
  onSave: (techId: string, ptoType: string, balance: number, accrual: number) => void
}) {
  const currentValue = parseFloat(balance[field]) || 0
  const [editing, setEditing] = useState(false)
  // Use local string state to avoid parseFloat eating decimal points
  const [inputStr, setInputStr] = useState(String(currentValue))
  const [isPending, startTransition] = useTransition()

  function handleBlur() {
    const parsed = parseFloat(inputStr)
    if (!isNaN(parsed) && parsed !== currentValue) {
      const balHours = field === "balance_hours" ? parsed : parseFloat(balance.balance_hours) || 0
      const accrHours = field === "accrual_rate_hours" ? parsed : parseFloat(balance.accrual_rate_hours) || 0
      startTransition(() => onSave(balance.tech_id, balance.pto_type, balHours, accrHours))
    }
    setEditing(false)
  }

  if (!editing) {
    return (
      <button
        onClick={() => {
          setInputStr(String(parseFloat(balance[field]) || 0))
          setEditing(true)
        }}
        className="text-sm text-left hover:text-primary transition-colors px-1 rounded min-w-12"
        title="Click to edit"
      >
        {parseFloat(balance[field]).toFixed(1)} hrs
      </button>
    )
  }

  return (
    <Input
      type="number"
      step="0.5"
      min="0"
      value={inputStr}
      onChange={(e) => {
        const val = e.target.value
        // Only flush to parsed number if not ending in '.' or '-'
        if (!val.endsWith(".") && !val.endsWith("-")) {
          setInputStr(val)
        } else {
          setInputStr(val)
        }
      }}
      onBlur={handleBlur}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur()
        if (e.key === "Escape") {
          setInputStr(String(currentValue))
          setEditing(false)
        }
      }}
      disabled={isPending}
      autoFocus
      className="h-7 w-24 text-sm"
    />
  )
}

// ─── Request PTO dialog ───────────────────────────────────────────────────────

function RequestPtoDialog({ onSubmitted }: { onSubmitted: () => void }) {
  const [open, setOpen] = useState(false)
  const [ptoType, setPtoType] = useState<PtoType>("vacation")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [hoursStr, setHoursStr] = useState("8")
  const [notes, setNotes] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const hours = parseFloat(hoursStr)
    if (!startDate) { setError("Start date is required"); return }
    if (!endDate) { setError("End date is required"); return }
    if (endDate < startDate) { setError("End date must be on or after start date"); return }
    if (isNaN(hours) || hours <= 0) { setError("Hours must be greater than 0"); return }

    startTransition(async () => {
      const result = await requestPto({ ptoType, startDate, endDate, hours, notes: notes || undefined })
      if (result.success) {
        setOpen(false)
        setPtoType("vacation")
        setStartDate("")
        setEndDate("")
        setHoursStr("8")
        setNotes("")
        onSubmitted()
      } else {
        setError(result.error ?? "Failed to submit request")
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Request Time Off</Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Request Time Off</DialogTitle>
          <DialogDescription>
            Submit a PTO request for your manager to review.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 py-1">
          <div className="flex flex-col gap-1.5">
            <Label>Type</Label>
            <Select value={ptoType} onValueChange={(v) => setPtoType(v as PtoType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="vacation">Vacation</SelectItem>
                <SelectItem value="sick">Sick Leave</SelectItem>
                <SelectItem value="personal">Personal</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pto-start">Start Date</Label>
              <Input
                id="pto-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pto-end">End Date</Label>
              <Input
                id="pto-end"
                type="date"
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pto-hours">Total Hours</Label>
            <Input
              id="pto-hours"
              type="number"
              step="0.5"
              min="0.5"
              value={hoursStr}
              onChange={(e) => setHoursStr(e.target.value)}
              placeholder="8"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pto-notes">Notes (optional)</Label>
            <Textarea
              id="pto-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any details for your manager..."
              rows={2}
            />
          </div>

          {error && (
            <p className="text-sm text-destructive" role="alert">{error}</p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Submitting..." : "Submit Request"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function PtoManager({ initialBalances, initialRequests, userRole, userId }: Props) {
  const [balances, setBalances] = useState<PtoBalance[]>(initialBalances)
  const [requests, setRequests] = useState<PtoRequest[]>(initialRequests)
  const [isPending, startTransition] = useTransition()

  const isOwner = userRole === "owner"
  const pendingRequests = requests.filter((r) => r.status === "pending")
  const historyRequests = requests.filter((r) => r.status !== "pending")

  async function refreshData() {
    const [newBalances, newRequests] = await Promise.all([
      getPtoBalances(),
      getPtoRequests(),
    ])
    setBalances(newBalances)
    setRequests(newRequests)
  }

  function handleSaveBalance(techId: string, ptoType: string, balHours: number, accrHours: number) {
    startTransition(async () => {
      await updatePtoBalance(techId, ptoType, balHours, accrHours)
      await refreshData()
    })
  }

  function handleApprove(requestId: string, approved: boolean) {
    startTransition(async () => {
      await approvePto(requestId, approved)
      await refreshData()
    })
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ── PTO Balances ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">PTO Balances</h2>
          {!isOwner && <RequestPtoDialog onSubmitted={refreshData} />}
        </div>

        {balances.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            No PTO balances configured yet.
            {isOwner ? " Add balances by editing the hours below once employees are set up." : ""}
          </p>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  {isOwner && (
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">
                      Employee
                    </th>
                  )}
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Type</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">
                    Balance
                  </th>
                  {isOwner && (
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">
                      Accrual / Period
                    </th>
                  )}
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">
                    Last Accrual
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {balances.map((balance) => (
                  <tr key={balance.id} className="hover:bg-muted/20 transition-colors">
                    {isOwner && (
                      <td className="px-4 py-3 font-medium">{balance.tech_name}</td>
                    )}
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="text-xs">
                        {ptoTypeLabel(balance.pto_type)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      {isOwner ? (
                        <BalanceCell
                          balance={balance}
                          field="balance_hours"
                          onSave={handleSaveBalance}
                        />
                      ) : (
                        <span>{parseFloat(balance.balance_hours).toFixed(1)} hrs</span>
                      )}
                    </td>
                    {isOwner && (
                      <td className="px-4 py-3">
                        <BalanceCell
                          balance={balance}
                          field="accrual_rate_hours"
                          onSave={handleSaveBalance}
                        />
                      </td>
                    )}
                    <td className="px-4 py-3 text-muted-foreground">
                      {balance.last_accrual_at
                        ? formatDate(balance.last_accrual_at)
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Pending Requests (owner only) ─────────────────────────────────────── */}
      {isOwner && pendingRequests.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-base font-semibold">
            Pending Requests
            <span className="ml-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-500/20 text-amber-400 text-xs font-medium">
              {pendingRequests.length}
            </span>
          </h2>

          <div className="flex flex-col gap-2">
            {pendingRequests.map((req) => (
              <div
                key={req.id}
                className="flex items-start gap-4 rounded-xl border border-border bg-card p-4"
              >
                <div className="flex flex-1 flex-col gap-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{req.tech_name}</span>
                    <Badge variant="outline" className="text-xs">
                      {ptoTypeLabel(req.pto_type)}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={`text-xs ${statusBadgeClass(req.status)}`}
                    >
                      {req.status}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {formatDateRange(req.start_date, req.end_date)} &mdash; {parseFloat(req.hours).toFixed(1)} hrs
                  </p>
                  {req.notes && (
                    <p className="text-sm text-muted-foreground italic">&ldquo;{req.notes}&rdquo;</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Submitted {formatDate(req.created_at)}
                  </p>
                </div>

                <div className="flex gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-red-500/40 text-red-400 hover:bg-red-500/10"
                    onClick={() => handleApprove(req.id, false)}
                    disabled={isPending}
                  >
                    Deny
                  </Button>
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={() => handleApprove(req.id, true)}
                    disabled={isPending}
                  >
                    Approve
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Request History ───────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">
            {isOwner ? "Request History" : "My Requests"}
          </h2>
          {!isOwner && <RequestPtoDialog onSubmitted={refreshData} />}
        </div>

        {historyRequests.length === 0 && pendingRequests.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No PTO requests yet.</p>
        ) : historyRequests.length === 0 ? null : (
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="divide-y divide-border">
              {historyRequests.map((req) => (
                <div
                  key={req.id}
                  className="flex items-center gap-4 px-4 py-3 hover:bg-muted/20 transition-colors"
                >
                  <div className="flex flex-1 flex-col gap-0.5 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {isOwner && (
                        <span className="text-sm font-medium">{req.tech_name}</span>
                      )}
                      <span className="text-sm text-muted-foreground">
                        {ptoTypeLabel(req.pto_type)}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {formatDateRange(req.start_date, req.end_date)}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {parseFloat(req.hours).toFixed(1)} hrs
                      </span>
                    </div>
                    {req.notes && (
                      <p className="text-xs text-muted-foreground italic">{req.notes}</p>
                    )}
                  </div>

                  <Badge
                    variant="outline"
                    className={`text-xs shrink-0 ${statusBadgeClass(req.status)}`}
                  >
                    {req.status.charAt(0).toUpperCase() + req.status.slice(1)}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
