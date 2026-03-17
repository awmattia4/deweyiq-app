"use client"

/**
 * InspectionTracker — Inspection scheduling and result recording UI.
 *
 * Phase 12 Plan 15 (PROJ-69, PROJ-70)
 *
 * Shows all inspections as cards with type, date, inspector, status badge.
 * Office can schedule new inspections and record pass/fail results.
 * Failed inspections display the rework task list auto-created on failure.
 */

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { toLocalDateString } from "@/lib/date-utils"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  createInspection,
  recordInspectionResult,
  type InspectionSummary,
} from "@/actions/projects-inspections"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusBadgeVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "passed":
      return "default"
    case "failed":
      return "destructive"
    case "scheduled":
      return "secondary"
    case "cancelled":
    case "rescheduled":
      return "outline"
    default:
      return "outline"
  }
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    scheduled: "Scheduled",
    passed: "Passed",
    failed: "Failed",
    cancelled: "Cancelled",
    rescheduled: "Rescheduled",
  }
  return map[status] ?? status
}

function inspectionTypeLabel(type: string): string {
  const map: Record<string, string> = {
    framing: "Framing",
    electrical: "Electrical",
    plumbing: "Plumbing",
    pool_spa: "Pool/Spa",
    final: "Final",
    health_dept: "Health Dept",
    structural: "Structural",
    other: "Other",
  }
  return map[type] ?? type
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "Not set"
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

// ---------------------------------------------------------------------------
// ScheduleInspectionDialog
// ---------------------------------------------------------------------------

function ScheduleInspectionDialog({
  projectId,
  onCreated,
  onClose,
}: {
  projectId: string
  onCreated: (inspection: InspectionSummary) => void
  onClose: () => void
}) {
  const [form, setForm] = useState({
    inspectionType: "final",
    scheduledDate: "",
    inspectorName: "",
    inspectorContact: "",
    phaseId: "",
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const result = await createInspection(null, projectId, {
      projectId,
      inspectionType: form.inspectionType,
      scheduledDate: form.scheduledDate || null,
      inspectorName: form.inspectorName || null,
      inspectorContact: form.inspectorContact || null,
    })

    setSaving(false)

    if ("error" in result) {
      setError(result.error)
      return
    }

    // Create a local summary to return to parent
    const newInspection: InspectionSummary = {
      id: result.data.inspectionId,
      inspectionType: form.inspectionType,
      scheduledDate: form.scheduledDate || null,
      actualDate: null,
      inspectorName: form.inspectorName || null,
      inspectorContact: form.inspectorContact || null,
      phaseId: null,
      status: "scheduled",
      resultNotes: null,
      correctionTasks: null,
      documents: null,
      createdAt: new Date(),
    }

    onCreated(newInspection)
    onClose()
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Schedule Inspection</DialogTitle>
          <DialogDescription>
            Add a new inspection to track for this project.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-2">
          <div className="flex flex-col gap-1.5">
            <Label>Inspection Type</Label>
            <Select
              value={form.inspectionType}
              onValueChange={(v) => setForm((f) => ({ ...f, inspectionType: v }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="framing">Framing</SelectItem>
                <SelectItem value="electrical">Electrical</SelectItem>
                <SelectItem value="plumbing">Plumbing</SelectItem>
                <SelectItem value="pool_spa">Pool/Spa</SelectItem>
                <SelectItem value="final">Final</SelectItem>
                <SelectItem value="health_dept">Health Dept</SelectItem>
                <SelectItem value="structural">Structural</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Scheduled Date</Label>
            <Input
              type="date"
              value={form.scheduledDate}
              onChange={(e) => setForm((f) => ({ ...f, scheduledDate: e.target.value }))}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Inspector Name</Label>
            <Input
              type="text"
              value={form.inspectorName}
              onChange={(e) => setForm((f) => ({ ...f, inspectorName: e.target.value }))}
              placeholder="Inspector name"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Inspector Contact</Label>
            <Input
              type="text"
              value={form.inspectorContact}
              onChange={(e) => setForm((f) => ({ ...f, inspectorContact: e.target.value }))}
              placeholder="Phone or email"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2 mt-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? "Scheduling..." : "Schedule Inspection"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// RecordResultDialog
// ---------------------------------------------------------------------------

function RecordResultDialog({
  inspection,
  onResult,
  onClose,
}: {
  inspection: InspectionSummary
  onResult: (updated: Partial<InspectionSummary>) => void
  onClose: () => void
}) {
  const [form, setForm] = useState({
    status: "passed" as "passed" | "failed" | "cancelled" | "rescheduled",
    actualDate: toLocalDateString(new Date()),
    resultNotes: "",
    correctionTasksText: "",
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    // Parse correction tasks from newline-separated text
    const correctionTasks =
      form.status === "failed" && form.correctionTasksText.trim()
        ? form.correctionTasksText
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
            .map((desc) => ({ description: desc, completed: false }))
        : null

    const result = await recordInspectionResult(null, inspection.id, {
      status: form.status,
      actualDate: form.actualDate || null,
      resultNotes: form.resultNotes || null,
      correctionTasks,
    })

    setSaving(false)

    if ("error" in result) {
      setError(result.error)
      return
    }

    onResult({
      status: form.status,
      actualDate: form.actualDate || null,
      resultNotes: form.resultNotes || null,
      correctionTasks,
    })
    onClose()
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record Result</DialogTitle>
          <DialogDescription>
            {inspectionTypeLabel(inspection.inspectionType)} inspection
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-2">
          <div className="flex flex-col gap-1.5">
            <Label>Result</Label>
            <Select
              value={form.status}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, status: v as typeof form.status }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="passed">Passed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="rescheduled">Rescheduled</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Date</Label>
            <Input
              type="date"
              value={form.actualDate}
              onChange={(e) => setForm((f) => ({ ...f, actualDate: e.target.value }))}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Notes</Label>
            <Textarea
              value={form.resultNotes}
              onChange={(e) => setForm((f) => ({ ...f, resultNotes: e.target.value }))}
              placeholder="Inspector notes, requirements, observations..."
              rows={3}
              className="resize-none"
            />
          </div>

          {form.status === "failed" && (
            <div className="flex flex-col gap-1.5">
              <Label>
                Correction Items Required{" "}
                <span className="text-muted-foreground font-normal">(one per line)</span>
              </Label>
              <Textarea
                value={form.correctionTasksText}
                onChange={(e) =>
                  setForm((f) => ({ ...f, correctionTasksText: e.target.value }))
                }
                placeholder={"Fix deficiency 1\nFix deficiency 2\nSchedule re-inspection"}
                rows={4}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">
                These will be added as required tasks on the relevant phase.
              </p>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2 mt-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? "Saving..." : "Save Result"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// InspectionTracker
// ---------------------------------------------------------------------------

interface InspectionTrackerProps {
  projectId: string
  initialInspections: InspectionSummary[]
}

export function InspectionTracker({ projectId, initialInspections }: InspectionTrackerProps) {
  const [inspections, setInspections] = useState(initialInspections)
  const [showScheduleDialog, setShowScheduleDialog] = useState(false)
  const [recordingFor, setRecordingFor] = useState<InspectionSummary | null>(null)

  function handleCreated(inspection: InspectionSummary) {
    setInspections((prev) => [...prev, inspection])
  }

  function handleResult(inspectionId: string, updates: Partial<InspectionSummary>) {
    setInspections((prev) =>
      prev.map((insp) => (insp.id === inspectionId ? { ...insp, ...updates } : insp))
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Inspections</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Schedule and track municipal and third-party inspections.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setShowScheduleDialog(true)}>
          Schedule Inspection
        </Button>
      </div>

      {inspections.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">No inspections scheduled yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {inspections.map((inspection) => (
            <Card key={inspection.id} className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-col gap-1 flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">
                      {inspectionTypeLabel(inspection.inspectionType)}
                    </span>
                    <Badge variant={statusBadgeVariant(inspection.status)} className="text-xs">
                      {statusLabel(inspection.status)}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-1">
                    {inspection.scheduledDate && (
                      <div>
                        <span className="text-xs text-muted-foreground">Scheduled: </span>
                        <span className="text-xs">{formatDate(inspection.scheduledDate)}</span>
                      </div>
                    )}
                    {inspection.actualDate && (
                      <div>
                        <span className="text-xs text-muted-foreground">Completed: </span>
                        <span className="text-xs">{formatDate(inspection.actualDate)}</span>
                      </div>
                    )}
                    {inspection.inspectorName && (
                      <div>
                        <span className="text-xs text-muted-foreground">Inspector: </span>
                        <span className="text-xs">{inspection.inspectorName}</span>
                      </div>
                    )}
                    {inspection.inspectorContact && (
                      <div>
                        <span className="text-xs text-muted-foreground">Contact: </span>
                        <span className="text-xs">{inspection.inspectorContact}</span>
                      </div>
                    )}
                  </div>

                  {inspection.resultNotes && (
                    <p className="text-xs text-muted-foreground mt-1">{inspection.resultNotes}</p>
                  )}

                  {inspection.status === "failed" &&
                    inspection.correctionTasks &&
                    inspection.correctionTasks.length > 0 && (
                      <div className="mt-2 p-2.5 bg-destructive/5 border border-destructive/20 rounded-md">
                        <p className="text-xs font-medium text-destructive mb-1.5">
                          Rework Required ({inspection.correctionTasks.length} item
                          {inspection.correctionTasks.length !== 1 ? "s" : ""})
                        </p>
                        <ul className="flex flex-col gap-1">
                          {inspection.correctionTasks.map((task, i) => (
                            <li key={i} className="flex items-start gap-1.5">
                              <span className="text-xs text-muted-foreground mt-0.5">•</span>
                              <span className="text-xs text-muted-foreground">
                                {task.description}
                              </span>
                            </li>
                          ))}
                        </ul>
                        <p className="text-xs text-muted-foreground mt-1.5">
                          These tasks have been added to the relevant phase.
                        </p>
                      </div>
                    )}
                </div>

                {inspection.status === "scheduled" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setRecordingFor(inspection)}
                    className="shrink-0"
                  >
                    Record Result
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {showScheduleDialog && (
        <ScheduleInspectionDialog
          projectId={projectId}
          onCreated={handleCreated}
          onClose={() => setShowScheduleDialog(false)}
        />
      )}

      {recordingFor && (
        <RecordResultDialog
          inspection={recordingFor}
          onResult={(updates) => handleResult(recordingFor.id, updates)}
          onClose={() => setRecordingFor(null)}
        />
      )}
    </div>
  )
}
