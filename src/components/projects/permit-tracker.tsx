"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
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
  createPermit,
  updatePermit,
  type Permit,
  type CreatePermitData,
  type UpdatePermitData,
} from "@/actions/projects-permits"

// ─── Constants ────────────────────────────────────────────────────────────────

const PERMIT_TYPE_LABELS: Record<string, string> = {
  building: "Building",
  electrical: "Electrical",
  plumbing: "Plumbing",
  mechanical: "Mechanical",
  demolition: "Demolition",
  excavation: "Excavation",
  pool_spa: "Pool / Spa",
  hoa: "HOA Approval",
  utility: "Utility",
  other: "Other",
}

const PERMIT_STATUS_LABELS: Record<string, string> = {
  not_applied: "Not Applied",
  applied: "Applied",
  under_review: "Under Review",
  approved: "Approved",
  denied: "Denied",
  expired: "Expired",
}

const STATUS_ORDER = ["not_applied", "applied", "under_review", "approved", "denied", "expired"]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getStatusColor(status: string): string {
  switch (status) {
    case "approved":
      return "bg-emerald-900/60 text-emerald-300"
    case "under_review":
    case "applied":
      return "bg-amber-900/60 text-amber-300"
    case "denied":
    case "expired":
      return "bg-red-900/60 text-red-300"
    case "not_applied":
    default:
      return "bg-zinc-700 text-zinc-400"
  }
}

function isExpiringSoon(expirationDate: string | null): boolean {
  if (!expirationDate) return false
  const today = new Date()
  const exp = new Date(expirationDate + "T00:00:00")
  const daysUntil = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  return daysUntil >= 0 && daysUntil <= 30
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return ""
  // Parse YYYY-MM-DD without timezone conversion
  const [year, month, day] = dateStr.split("-").map(Number)
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface PermitTrackerProps {
  projectId: string
  permits: Permit[]
  onPermitsChange: (permits: Permit[]) => void
}

// ─── Add Permit Dialog ────────────────────────────────────────────────────────

function AddPermitDialog({
  projectId,
  open,
  onClose,
  onAdded,
}: {
  projectId: string
  open: boolean
  onClose: () => void
  onAdded: (permit: Permit) => void
}) {
  const [isPending, startTransition] = useTransition()
  const [permitType, setPermitType] = useState("")
  const [status, setStatus] = useState("not_applied")
  const [fee, setFee] = useState("")
  const [notes, setNotes] = useState("")

  function handleSubmit() {
    if (!permitType) {
      toast.error("Please select a permit type")
      return
    }
    startTransition(async () => {
      const data: CreatePermitData = {
        permit_type: permitType,
        status,
        fee: fee.trim() || undefined,
        notes: notes.trim() || undefined,
      }
      const result = await createPermit(projectId, data)
      if ("error" in result) {
        toast.error(result.error)
      } else {
        toast.success("Permit added")
        onAdded(result.permit)
        onClose()
        // Reset form
        setPermitType("")
        setStatus("not_applied")
        setFee("")
        setNotes("")
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Permit</DialogTitle>
          <DialogDescription>
            Track a required permit for this project.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 mt-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="permit-type">Permit Type</Label>
            <Select value={permitType} onValueChange={setPermitType}>
              <SelectTrigger id="permit-type">
                <SelectValue placeholder="Select permit type..." />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PERMIT_TYPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="permit-status">Initial Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger id="permit-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_ORDER.map((s) => (
                  <SelectItem key={s} value={s}>
                    {PERMIT_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="permit-fee">Fee (optional)</Label>
            <Input
              id="permit-fee"
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={fee}
              onChange={(e) => setFee(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="permit-notes">Notes (optional)</Label>
            <Textarea
              id="permit-notes"
              placeholder="Any notes about this permit..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isPending || !permitType}>
              Add Permit
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Edit Permit Dialog ───────────────────────────────────────────────────────

function EditPermitDialog({
  permit,
  open,
  onClose,
  onUpdated,
}: {
  permit: Permit
  open: boolean
  onClose: () => void
  onUpdated: (permit: Permit) => void
}) {
  const [isPending, startTransition] = useTransition()
  const [permitType, setPermitType] = useState(permit.permit_type)
  const [permitNumber, setPermitNumber] = useState(permit.permit_number ?? "")
  const [status, setStatus] = useState(permit.status)
  const [appliedDate, setAppliedDate] = useState(permit.applied_date ?? "")
  const [approvedDate, setApprovedDate] = useState(permit.approved_date ?? "")
  const [expirationDate, setExpirationDate] = useState(permit.expiration_date ?? "")
  const [inspectorName, setInspectorName] = useState(permit.inspector_name ?? "")
  const [inspectorPhone, setInspectorPhone] = useState(permit.inspector_phone ?? "")
  const [fee, setFee] = useState(permit.fee ? String(parseFloat(permit.fee)) : "")
  const [notes, setNotes] = useState(permit.notes ?? "")

  function handleSubmit() {
    startTransition(async () => {
      const data: UpdatePermitData = {
        permit_type: permitType,
        permit_number: permitNumber || undefined,
        status,
        applied_date: appliedDate || undefined,
        approved_date: approvedDate || undefined,
        expiration_date: expirationDate || undefined,
        inspector_name: inspectorName || undefined,
        inspector_phone: inspectorPhone || undefined,
        fee: fee || undefined,
        notes: notes || undefined,
      }
      const result = await updatePermit(permit.id, data)
      if ("error" in result) {
        toast.error(result.error)
      } else {
        toast.success("Permit updated")
        onUpdated(result.permit)
        onClose()
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Permit</DialogTitle>
          <DialogDescription>
            Update permit details, status, and inspection information.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 mt-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Permit Type</Label>
              <Select value={permitType} onValueChange={setPermitType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PERMIT_TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_ORDER.map((s) => (
                    <SelectItem key={s} value={s}>
                      {PERMIT_STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="permit-number">Permit Number</Label>
            <Input
              id="permit-number"
              placeholder="e.g. BLD-2024-00123"
              value={permitNumber}
              onChange={(e) => setPermitNumber(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="applied-date">Applied Date</Label>
              <Input
                id="applied-date"
                type="date"
                value={appliedDate}
                onChange={(e) => setAppliedDate(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="approved-date">Approved Date</Label>
              <Input
                id="approved-date"
                type="date"
                value={approvedDate}
                onChange={(e) => setApprovedDate(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="expiration-date">Expiration Date</Label>
              <Input
                id="expiration-date"
                type="date"
                value={expirationDate}
                onChange={(e) => setExpirationDate(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="inspector-name">Inspector Name</Label>
              <Input
                id="inspector-name"
                placeholder="Inspector name"
                value={inspectorName}
                onChange={(e) => setInspectorName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="inspector-phone">Inspector Phone</Label>
              <Input
                id="inspector-phone"
                type="tel"
                placeholder="(555) 555-5555"
                value={inspectorPhone}
                onChange={(e) => setInspectorPhone(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-permit-fee">Fee</Label>
            <Input
              id="edit-permit-fee"
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={fee}
              onChange={(e) => setFee(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-permit-notes">Notes</Label>
            <Textarea
              id="edit-permit-notes"
              placeholder="Notes about this permit..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isPending}>
              Save Changes
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Permit Card ──────────────────────────────────────────────────────────────

function PermitCard({
  permit,
  onUpdated,
}: {
  permit: Permit
  onUpdated: (permit: Permit) => void
}) {
  const [editOpen, setEditOpen] = useState(false)
  const expiringSoon = permit.status === "approved" && isExpiringSoon(permit.expiration_date)

  return (
    <>
      <div className="rounded-md border border-border bg-card p-4 flex flex-col gap-3">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium">
                {PERMIT_TYPE_LABELS[permit.permit_type] ?? permit.permit_type}
              </span>
              {permit.permit_number && (
                <span className="text-xs text-muted-foreground font-mono">
                  #{permit.permit_number}
                </span>
              )}
              {expiringSoon && (
                <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium bg-amber-900/60 text-amber-300">
                  Expiring Soon
                </span>
              )}
            </div>
            {permit.fee && (
              <span className="text-xs text-muted-foreground">
                Fee: ${parseFloat(permit.fee).toFixed(2)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span
              className={cn(
                "inline-flex items-center rounded px-2 py-0.5 text-xs font-medium",
                getStatusColor(permit.status)
              )}
            >
              {PERMIT_STATUS_LABELS[permit.status] ?? permit.status}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEditOpen(true)}
              className="text-xs h-7"
            >
              Edit
            </Button>
          </div>
        </div>

        {/* Dates row */}
        {(permit.applied_date || permit.approved_date || permit.expiration_date) && (
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            {permit.applied_date && (
              <span>Applied: {formatDate(permit.applied_date)}</span>
            )}
            {permit.approved_date && (
              <span>Approved: {formatDate(permit.approved_date)}</span>
            )}
            {permit.expiration_date && (
              <span
                className={expiringSoon ? "text-amber-400" : undefined}
              >
                Expires: {formatDate(permit.expiration_date)}
              </span>
            )}
          </div>
        )}

        {/* Inspector row */}
        {(permit.inspector_name || permit.inspector_phone) && (
          <div className="text-xs text-muted-foreground">
            Inspector:{" "}
            {permit.inspector_name}
            {permit.inspector_phone && ` — ${permit.inspector_phone}`}
          </div>
        )}

        {/* Notes */}
        {permit.notes && (
          <p className="text-xs text-muted-foreground italic">{permit.notes}</p>
        )}
      </div>

      <EditPermitDialog
        permit={permit}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onUpdated={(updated) => {
          onUpdated(updated)
          setEditOpen(false)
        }}
      />
    </>
  )
}

// ─── PermitTracker ────────────────────────────────────────────────────────────

/**
 * PermitTracker — Permit management UI for a project.
 *
 * Shows:
 * - Permit gate banner if any permits are pending (not approved)
 * - List of permit cards with status badges and lifecycle info
 * - "Add Permit" button
 */
export function PermitTracker({ projectId, permits, onPermitsChange }: PermitTrackerProps) {
  const [addDialogOpen, setAddDialogOpen] = useState(false)

  const pendingPermits = permits.filter((p) => p.status !== "approved")
  const hasBlockers = pendingPermits.length > 0

  function handlePermitAdded(permit: Permit) {
    onPermitsChange([...permits, permit])
  }

  function handlePermitUpdated(updated: Permit) {
    onPermitsChange(permits.map((p) => (p.id === updated.id ? updated : p)))
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Permits</CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setAddDialogOpen(true)}
          >
            Add Permit
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {/* Gate banner */}
        {hasBlockers && (
          <div className="rounded-md border border-amber-800/50 bg-amber-950/30 p-3">
            <p className="text-sm font-medium text-amber-300">
              Permit required before scheduling
            </p>
            <div className="mt-2 flex flex-col gap-1">
              {pendingPermits.map((p) => (
                <div key={p.id} className="flex items-center gap-2 text-xs text-amber-400/80">
                  <span>{PERMIT_TYPE_LABELS[p.permit_type] ?? p.permit_type}</span>
                  <span className="text-amber-700">—</span>
                  <span>{PERMIT_STATUS_LABELS[p.status] ?? p.status}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Permit list */}
        {permits.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            No permits added yet. Add permits that are required for this project.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {permits.map((permit) => (
              <PermitCard
                key={permit.id}
                permit={permit}
                onUpdated={handlePermitUpdated}
              />
            ))}
          </div>
        )}
      </CardContent>

      <AddPermitDialog
        projectId={projectId}
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        onAdded={handlePermitAdded}
      />
    </Card>
  )
}
