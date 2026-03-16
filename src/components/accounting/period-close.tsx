"use client"

/**
 * PeriodClose — Accounting period management UI.
 *
 * Features:
 * - List periods with open/closed status
 * - Create new period with overlap validation
 * - Close period with confirmation dialog
 * - Reopen period with warning (safety net for corrections)
 *
 * Accountant mode only — this is a financial control function.
 */

import { useState, useEffect } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  getAccountingPeriods,
  createAccountingPeriod,
  closePeriod,
  reopenPeriod,
} from "@/actions/accounting"
import type { AccountingPeriodRow } from "@/actions/accounting"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-")
  const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
}

// ---------------------------------------------------------------------------
// PeriodClose
// ---------------------------------------------------------------------------

export function PeriodClose() {
  const [periods, setPeriods] = useState<AccountingPeriodRow[]>([])
  const [loading, setLoading] = useState(true)

  // Create period form
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newStart, setNewStart] = useState("")
  const [newEnd, setNewEnd] = useState("")
  const [creating, setCreating] = useState(false)

  // Close confirmation dialog
  const [closeDialogPeriod, setCloseDialogPeriod] = useState<AccountingPeriodRow | null>(null)
  const [closing, setClosing] = useState(false)

  // Reopen warning dialog
  const [reopenDialogPeriod, setReopenDialogPeriod] = useState<AccountingPeriodRow | null>(null)
  const [reopening, setReopening] = useState(false)

  useEffect(() => {
    void loadPeriods()
  }, [])

  async function loadPeriods() {
    setLoading(true)
    try {
      const result = await getAccountingPeriods()
      if (result.success) {
        setPeriods(result.periods)
      } else {
        toast.error(result.error)
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate() {
    if (!newStart || !newEnd) {
      toast.error("Both start and end dates are required")
      return
    }
    if (newStart >= newEnd) {
      toast.error("Start date must be before end date")
      return
    }

    setCreating(true)
    try {
      const result = await createAccountingPeriod(newStart, newEnd)
      if (result.success) {
        toast.success("Accounting period created")
        setShowCreateForm(false)
        setNewStart("")
        setNewEnd("")
        await loadPeriods()
      } else {
        toast.error(result.error ?? "Failed to create period")
      }
    } finally {
      setCreating(false)
    }
  }

  async function handleClose() {
    if (!closeDialogPeriod) return
    setClosing(true)
    try {
      const result = await closePeriod(closeDialogPeriod.id)
      if (result.success) {
        toast.success("Period closed — no new entries can be posted to this date range")
        setCloseDialogPeriod(null)
        await loadPeriods()
      } else {
        toast.error(result.error ?? "Failed to close period")
      }
    } finally {
      setClosing(false)
    }
  }

  async function handleReopen() {
    if (!reopenDialogPeriod) return
    setReopening(true)
    try {
      const result = await reopenPeriod(reopenDialogPeriod.id)
      if (result.success) {
        toast.success("Period reopened — journal entries can now be posted to this date range")
        setReopenDialogPeriod(null)
        await loadPeriods()
      } else {
        toast.error(result.error ?? "Failed to reopen period")
      }
    } finally {
      setReopening(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Header + create button */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Closed periods prevent backdated journal entries. Use closing for month-end or year-end lock.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowCreateForm(!showCreateForm)}
        >
          {showCreateForm ? "Cancel" : "Create Period"}
        </Button>
      </div>

      {/* Create period form */}
      {showCreateForm && (
        <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-4">
          <h4 className="text-sm font-semibold">New Accounting Period</h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Start Date</Label>
              <Input
                type="date"
                value={newStart}
                onChange={(e) => setNewStart(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">End Date</Label>
              <Input
                type="date"
                value={newEnd}
                onChange={(e) => setNewEnd(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
          </div>
          <Button
            size="sm"
            onClick={handleCreate}
            disabled={creating || !newStart || !newEnd}
          >
            {creating ? "Creating..." : "Create Period"}
          </Button>
        </div>
      )}

      {/* Periods list */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="px-5 py-6 text-center text-sm text-muted-foreground italic">
            Loading periods...
          </div>
        ) : periods.length === 0 ? (
          <div className="px-5 py-6 text-center text-sm text-muted-foreground italic">
            No accounting periods created yet. Create one to lock past records.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {periods.map((period) => (
              <div key={period.id} className="px-5 py-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      {formatDate(period.period_start)} — {formatDate(period.period_end)}
                    </span>
                    <Badge
                      variant={period.status === "closed" ? "secondary" : "outline"}
                      className={
                        period.status === "closed"
                          ? "text-xs bg-amber-500/20 text-amber-400 border-amber-500/30"
                          : "text-xs bg-green-500/20 text-green-400 border-green-500/30"
                      }
                    >
                      {period.status === "closed" ? "Closed" : "Open"}
                    </Badge>
                  </div>
                  {period.status === "closed" && period.closed_at && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Closed{period.closed_by_name ? ` by ${period.closed_by_name}` : ""} on{" "}
                      {new Date(period.closed_at).toLocaleDateString()}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {period.status === "open" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 px-3 text-xs"
                      onClick={() => setCloseDialogPeriod(period)}
                    >
                      Close Period
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 px-3 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => setReopenDialogPeriod(period)}
                    >
                      Reopen
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Close confirmation dialog */}
      <Dialog open={!!closeDialogPeriod} onOpenChange={() => setCloseDialogPeriod(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Close Accounting Period</DialogTitle>
            <DialogDescription>
              {closeDialogPeriod && (
                <>
                  Closing this period will prevent posting journal entries dated{" "}
                  <strong>
                    {formatDate(closeDialogPeriod.period_start)} &ndash;{" "}
                    {formatDate(closeDialogPeriod.period_end)}
                  </strong>
                  . This affects auto-generated entries (invoices, payments) and manual entries.
                  <br /><br />
                  You can reopen the period later if corrections are needed.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseDialogPeriod(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleClose}
              disabled={closing}
            >
              {closing ? "Closing..." : "Close Period"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reopen warning dialog */}
      <Dialog open={!!reopenDialogPeriod} onOpenChange={() => setReopenDialogPeriod(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reopen Accounting Period</DialogTitle>
            <DialogDescription>
              {reopenDialogPeriod && (
                <>
                  Reopening{" "}
                  <strong>
                    {formatDate(reopenDialogPeriod.period_start)} &ndash;{" "}
                    {formatDate(reopenDialogPeriod.period_end)}
                  </strong>{" "}
                  will allow new journal entries to be posted to dates within this range.
                  <br /><br />
                  Use this only for corrections. Consult your accountant before reopening a
                  period that has already been reported on.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReopenDialogPeriod(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleReopen}
              disabled={reopening}
            >
              {reopening ? "Reopening..." : "Reopen Period"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
