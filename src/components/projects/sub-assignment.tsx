"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { toLocalDateString } from "@/lib/date-utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  assignSubToPhase,
  updateSubAssignment,
  sendSubNotification,
} from "@/actions/projects-subcontractors"
import type { SubcontractorRow, SubAssignmentRow } from "@/actions/projects-subcontractors"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WORK_STATUS_LABELS: Record<string, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  complete: "Complete",
  needs_rework: "Needs Rework",
}

const WORK_STATUS_COLORS: Record<string, string> = {
  not_started: "bg-zinc-700 text-zinc-200",
  in_progress: "bg-blue-900/60 text-blue-300",
  complete: "bg-emerald-900/60 text-emerald-300",
  needs_rework: "bg-red-900/60 text-red-300",
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SubAssignmentSectionProps {
  phaseId: string
  phaseName: string
  assignments: SubAssignmentRow[]
  availableSubs: SubcontractorRow[]
  onAssignmentsChange: (updated: SubAssignmentRow[]) => void
}

// ---------------------------------------------------------------------------
// SubAssignmentSection — per-phase sub assignment UI
// ---------------------------------------------------------------------------

export function SubAssignmentSection({
  phaseId,
  phaseName,
  assignments,
  availableSubs,
  onAssignmentsChange,
}: SubAssignmentSectionProps) {
  const [isPending, startTransition] = useTransition()
  const [assignDialogOpen, setAssignDialogOpen] = useState(false)

  // Assign form
  const [selectedSubId, setSelectedSubId] = useState("")
  const [scopeOfWork, setScopeOfWork] = useState("")
  const [agreedPriceStr, setAgreedPriceStr] = useState("")
  const [agreedPriceNum, setAgreedPriceNum] = useState("")
  const [scheduledStart, setScheduledStart] = useState("")
  const [scheduledEnd, setScheduledEnd] = useState("")

  function openAssignDialog() {
    setSelectedSubId("")
    setScopeOfWork("")
    setAgreedPriceStr("")
    setAgreedPriceNum("")
    setScheduledStart("")
    setScheduledEnd("")
    setAssignDialogOpen(true)
  }

  function closeAssignDialog() {
    setAssignDialogOpen(false)
  }

  function handleAssign() {
    if (!selectedSubId) {
      toast.error("Please select a subcontractor")
      return
    }

    startTransition(async () => {
      const result = await assignSubToPhase(phaseId, {
        subcontractor_id: selectedSubId,
        scope_of_work: scopeOfWork.trim() || null,
        agreed_price: agreedPriceNum || null,
        scheduled_start: scheduledStart || null,
        scheduled_end: scheduledEnd || null,
      })

      if ("error" in result) {
        toast.error(result.error)
      } else {
        toast.success("Subcontractor assigned")
        closeAssignDialog()
        onAssignmentsChange([...assignments, result.data])
      }
    })
  }

  function handleStatusChange(assignmentId: string, newStatus: string) {
    startTransition(async () => {
      const result = await updateSubAssignment(assignmentId, { status: newStatus })
      if ("error" in result) {
        toast.error(result.error)
      } else {
        onAssignmentsChange(
          assignments.map((a) => (a.id === assignmentId ? result.data : a))
        )
      }
    })
  }

  function handleNotify(assignment: SubAssignmentRow) {
    if (!assignment.subEmail) {
      toast.error("This subcontractor has no email address on file")
      return
    }

    startTransition(async () => {
      const result = await sendSubNotification(assignment.id)
      if ("error" in result) {
        toast.error(result.error)
      } else {
        toast.success(`Schedule notification sent to ${assignment.subName}`)
      }
    })
  }

  const insuranceExpired = (expiry: string | null): boolean => {
    if (!expiry) return false
    return expiry < toLocalDateString(new Date())
  }

  // Subs not already assigned to this phase
  const unassignedSubs = availableSubs.filter(
    (s) => s.is_active && !assignments.some((a) => a.subcontractor_id === s.id)
  )

  return (
    <div className="flex flex-col gap-2">
      {/* Assignment list */}
      {assignments.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">No subs assigned to this phase.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {assignments.map((assignment) => {
            const isInsuranceExpired = insuranceExpired(assignment.subInsuranceExpiry)
            const tradeDef = assignment.subTrade

            return (
              <div
                key={assignment.id}
                className="flex flex-col gap-2 rounded-md border border-border bg-muted/10 p-3"
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{assignment.subName}</span>
                      <span className="text-xs text-muted-foreground capitalize">{tradeDef}</span>
                      <span
                        className={cn(
                          "inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium",
                          WORK_STATUS_COLORS[assignment.status] ?? "bg-muted text-muted-foreground"
                        )}
                      >
                        {WORK_STATUS_LABELS[assignment.status] ?? assignment.status}
                      </span>
                      {isInsuranceExpired && (
                        <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium bg-red-900/50 text-red-300 border border-red-800/50">
                          Insurance expired
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-muted-foreground">
                      {assignment.scheduled_start && (
                        <span>
                          {formatDate(assignment.scheduled_start)}
                          {assignment.scheduled_end && ` – ${formatDate(assignment.scheduled_end)}`}
                        </span>
                      )}
                      {assignment.agreed_price && (
                        <span>
                          ${parseFloat(assignment.agreed_price).toLocaleString("en-US", {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      )}
                    </div>

                    {assignment.scope_of_work && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {assignment.scope_of_work}
                      </p>
                    )}
                  </div>

                  {/* Status dropdown + notify button */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <select
                      className="flex h-7 rounded-md border border-input bg-background px-2 py-0 text-xs shadow-sm"
                      value={assignment.status}
                      onChange={(e) => handleStatusChange(assignment.id, e.target.value)}
                      disabled={isPending}
                    >
                      {Object.entries(WORK_STATUS_LABELS).map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs px-2"
                      onClick={() => handleNotify(assignment)}
                      disabled={isPending || !assignment.subEmail}
                      title={assignment.subEmail ? "Send schedule notification email" : "No email on file"}
                    >
                      Notify
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Assign button (only if there are subs to assign) */}
      {unassignedSubs.length > 0 && (
        <Button
          size="sm"
          variant="outline"
          className="w-fit mt-1"
          onClick={openAssignDialog}
          disabled={isPending}
        >
          Assign Sub
        </Button>
      )}

      {/* Assign Dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={(open) => { if (!open) closeAssignDialog() }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Subcontractor</DialogTitle>
            <DialogDescription>
              Assign a subcontractor to the &quot;{phaseName}&quot; phase with scope and pricing.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 mt-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="assign-sub">Subcontractor *</Label>
              <select
                id="assign-sub"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={selectedSubId}
                onChange={(e) => setSelectedSubId(e.target.value)}
              >
                <option value="">Select a subcontractor...</option>
                {unassignedSubs.map((sub) => (
                  <option key={sub.id} value={sub.id}>
                    {sub.name} ({sub.trade})
                    {sub.insurance_status === "expired" ? " — INSURANCE EXPIRED" : ""}
                    {sub.insurance_status === "expiring" ? " — insurance expiring" : ""}
                  </option>
                ))}
              </select>
              {selectedSubId && (() => {
                const sub = unassignedSubs.find((s) => s.id === selectedSubId)
                if (sub?.insurance_status === "expired") {
                  return (
                    <p className="text-xs text-red-400">
                      Warning: This subcontractor&apos;s insurance certificate is expired. Verify coverage before proceeding.
                    </p>
                  )
                }
                if (sub?.insurance_status === "expiring") {
                  return (
                    <p className="text-xs text-amber-400">
                      Note: This subcontractor&apos;s insurance expires on {sub.insurance_expiry}. Request renewal.
                    </p>
                  )
                }
                return null
              })()}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="assign-scope">Scope of Work</Label>
              <Textarea
                id="assign-scope"
                placeholder="Describe the work this subcontractor will perform..."
                value={scopeOfWork}
                onChange={(e) => setScopeOfWork(e.target.value)}
                rows={3}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="assign-price">Agreed Price</Label>
              <Input
                id="assign-price"
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={agreedPriceStr}
                onChange={(e) => {
                  const val = e.target.value
                  setAgreedPriceStr(val)
                  if (!val.endsWith(".") && !val.endsWith("-") && val !== "") {
                    const n = parseFloat(val)
                    if (!isNaN(n)) setAgreedPriceNum(n.toFixed(2))
                  } else if (val === "") {
                    setAgreedPriceNum("")
                  }
                }}
                onBlur={() => {
                  if (agreedPriceStr && !agreedPriceStr.endsWith(".")) {
                    const n = parseFloat(agreedPriceStr)
                    if (!isNaN(n)) {
                      setAgreedPriceStr(n.toFixed(2))
                      setAgreedPriceNum(n.toFixed(2))
                    }
                  }
                }}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="assign-start">Scheduled Start</Label>
                <Input
                  id="assign-start"
                  type="date"
                  value={scheduledStart}
                  onChange={(e) => setScheduledStart(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="assign-end">Scheduled End</Label>
                <Input
                  id="assign-end"
                  type="date"
                  value={scheduledEnd}
                  onChange={(e) => setScheduledEnd(e.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={closeAssignDialog}>Cancel</Button>
              <Button
                onClick={handleAssign}
                disabled={isPending || !selectedSubId}
              >
                Assign
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

function formatDate(dateStr: string): string {
  try {
    const [year, month, day] = dateStr.split("-").map(Number)
    return new Date(year, month - 1, day).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    })
  } catch {
    return dateStr
  }
}
