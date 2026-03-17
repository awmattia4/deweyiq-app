"use client"

/**
 * material-list.tsx — Material procurement list for a project.
 *
 * Phase 12 Plan 09: Materials & Procurement
 *
 * Shows all project materials with quantity tracking, cost variance color-coding,
 * and per-row actions (Edit, Receive, Return, Add to PO).
 *
 * Variance color rules (PROJ-31):
 * - Green: on or under budget (variance_pct <= 0)
 * - Amber: 0–10% over budget
 * - Red: >10% over budget
 */

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import {
  addMaterial,
  updateMaterial,
  receiveMaterial,
  returnMaterial,
} from "@/actions/projects-materials"
import type { ProjectMaterial } from "@/actions/projects-materials"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORIES = [
  { value: "pool_equipment", label: "Pool Equipment" },
  { value: "plumbing", label: "Plumbing" },
  { value: "electrical", label: "Electrical" },
  { value: "decking", label: "Decking" },
  { value: "surface", label: "Surface" },
  { value: "chemical", label: "Chemical" },
  { value: "material", label: "Material" },
  { value: "other", label: "Other" },
]

const ORDER_STATUS_LABELS: Record<string, string> = {
  not_ordered: "Not Ordered",
  ordered: "Ordered",
  partial: "Partial",
  received: "Received",
  returned: "Returned",
}

const ORDER_STATUS_VARIANTS: Record<
  string,
  "secondary" | "default" | "outline" | "destructive"
> = {
  not_ordered: "outline",
  ordered: "secondary",
  partial: "secondary",
  received: "default",
  returned: "destructive",
}

// ---------------------------------------------------------------------------
// Variance color helper
// ---------------------------------------------------------------------------

function getVarianceClass(pct: number | null, variance: number): string {
  if (variance <= 0) return "text-green-600"
  if (pct !== null && pct > 10) return "text-destructive"
  return "text-amber-600"
}

// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------

function fmt(value: string | null | undefined): string {
  if (!value) return "—"
  const n = parseFloat(value)
  if (isNaN(n)) return "—"
  return n.toString()
}

function fmtCurrency(value: number): string {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" })
}

function fmtQty(value: string | null | undefined): string {
  if (!value) return "0"
  const n = parseFloat(value)
  if (isNaN(n)) return "0"
  return n.toString()
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface MaterialListProps {
  projectId: string
  materials: ProjectMaterial[]
  onMaterialsChange: (materials: ProjectMaterial[]) => void
  onAddToPo: (material: ProjectMaterial) => void
  selectedForPo: Set<string>
  onTogglePoSelection: (materialId: string) => void
}

// ---------------------------------------------------------------------------
// Add / Edit dialog
// ---------------------------------------------------------------------------

interface EditDialogProps {
  projectId: string
  material?: ProjectMaterial | null
  open: boolean
  onClose: () => void
  onSaved: (materials: ProjectMaterial[]) => void
}

function EditMaterialDialog({
  projectId,
  material,
  open,
  onClose,
  onSaved,
}: EditDialogProps) {
  const isNew = !material
  const [name, setName] = useState(material?.name ?? "")
  const [category, setCategory] = useState(material?.category ?? "other")
  const [unit, setUnit] = useState(material?.unit ?? "each")
  const [supplier, setSupplier] = useState(material?.supplier ?? "")
  const [notes, setNotes] = useState(material?.notes ?? "")
  const [isPending, startTransition] = useTransition()

  // Local string states for decimal inputs — prevent decimal-eating bug
  const [qtyEstStr, setQtyEstStr] = useState(fmt(material?.quantity_estimated))
  const [costEstStr, setCostEstStr] = useState(
    material?.unit_cost_estimated ? fmt(material.unit_cost_estimated) : ""
  )

  function handleSave() {
    if (!name.trim()) {
      toast.error("Material name is required")
      return
    }

    startTransition(async () => {
      let result
      if (isNew) {
        result = await addMaterial(projectId, {
          name: name.trim(),
          category,
          quantity_estimated: qtyEstStr.endsWith(".") ? qtyEstStr.slice(0, -1) : qtyEstStr,
          unit: unit.trim() || "each",
          unit_cost_estimated: costEstStr ? (costEstStr.endsWith(".") ? costEstStr.slice(0, -1) : costEstStr) : null,
          supplier: supplier.trim() || null,
          notes: notes.trim() || null,
        })
      } else {
        result = await updateMaterial(material!.id, {
          name: name.trim(),
          category,
          quantity_estimated: qtyEstStr.endsWith(".") ? qtyEstStr.slice(0, -1) : qtyEstStr,
          unit: unit.trim() || "each",
          unit_cost_estimated: costEstStr ? (costEstStr.endsWith(".") ? costEstStr.slice(0, -1) : costEstStr) : null,
          supplier: supplier.trim() || null,
          notes: notes.trim() || null,
        })
      }

      if ("error" in result) {
        toast.error(result.error)
        return
      }

      toast.success(isNew ? "Material added" : "Material updated")
      onSaved(result.data)
      onClose()
    })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isNew ? "Add Material" : "Edit Material"}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mat-name">Name</Label>
            <Input
              id="mat-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Gunite mix, PVC pipe 2&quot;"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="mat-unit">Unit</Label>
              <Input
                id="mat-unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="each, lbs, bags..."
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="mat-qty">Est. Quantity</Label>
              <Input
                id="mat-qty"
                inputMode="decimal"
                value={qtyEstStr}
                onChange={(e) => setQtyEstStr(e.target.value)}
                onBlur={() => {
                  const n = parseFloat(qtyEstStr)
                  if (!isNaN(n)) setQtyEstStr(n.toString())
                }}
                placeholder="0"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="mat-cost">Est. Unit Cost</Label>
              <Input
                id="mat-cost"
                inputMode="decimal"
                value={costEstStr}
                onChange={(e) => setCostEstStr(e.target.value)}
                onBlur={() => {
                  const n = parseFloat(costEstStr)
                  if (!isNaN(n)) setCostEstStr(n.toFixed(2))
                }}
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mat-supplier">Supplier</Label>
            <Input
              id="mat-supplier"
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              placeholder="e.g. Pool Supply World"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mat-notes">Notes</Label>
            <Textarea
              id="mat-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any special requirements or notes..."
              rows={2}
              className="text-sm"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? "Saving..." : isNew ? "Add Material" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Receive dialog
// ---------------------------------------------------------------------------

interface ReceiveDialogProps {
  material: ProjectMaterial
  open: boolean
  onClose: () => void
  onSaved: (materials: ProjectMaterial[]) => void
}

function ReceiveMaterialDialog({ material, open, onClose, onSaved }: ReceiveDialogProps) {
  const [qtyStr, setQtyStr] = useState("")
  const [costStr, setCostStr] = useState("")
  const [notes, setNotes] = useState("")
  const [isPending, startTransition] = useTransition()

  function handleReceive() {
    const qty = parseFloat(qtyStr)
    if (isNaN(qty) || qty <= 0) {
      toast.error("Enter a valid quantity received")
      return
    }

    startTransition(async () => {
      const result = await receiveMaterial(material.id, {
        quantity_received: qtyStr.endsWith(".") ? qtyStr.slice(0, -1) : qtyStr,
        unit_cost_actual: costStr ? (costStr.endsWith(".") ? costStr.slice(0, -1) : costStr) : null,
        notes: notes.trim() || null,
      })

      if ("error" in result) {
        toast.error(result.error)
        return
      }

      toast.success("Delivery recorded")
      onSaved(result.data)
      onClose()
    })
  }

  const orderedQty = parseFloat(material.quantity_ordered)
  const receivedQty = parseFloat(material.quantity_received)
  const remainingQty = Math.max(0, orderedQty - receivedQty)

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Record Delivery</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div>
            <p className="text-sm font-medium">{material.name}</p>
            {orderedQty > 0 && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Ordered: {orderedQty} {material.unit} — Received so far: {receivedQty} {material.unit}
                {remainingQty > 0 && ` — Remaining: ${remainingQty}`}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="recv-qty">Quantity Received</Label>
            <Input
              id="recv-qty"
              inputMode="decimal"
              value={qtyStr}
              onChange={(e) => setQtyStr(e.target.value)}
              onBlur={() => {
                const n = parseFloat(qtyStr)
                if (!isNaN(n)) setQtyStr(n.toString())
              }}
              placeholder={`e.g. ${remainingQty > 0 ? remainingQty : orderedQty || 1}`}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="recv-cost">Actual Unit Cost (if different)</Label>
            <Input
              id="recv-cost"
              inputMode="decimal"
              value={costStr}
              onChange={(e) => setCostStr(e.target.value)}
              onBlur={() => {
                const n = parseFloat(costStr)
                if (!isNaN(n)) setCostStr(n.toFixed(2))
              }}
              placeholder={material.unit_cost_estimated ? `Est: $${parseFloat(material.unit_cost_estimated).toFixed(2)}` : "0.00"}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="recv-notes">Notes</Label>
            <Input
              id="recv-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Delivery notes, condition, etc."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleReceive} disabled={isPending}>
            {isPending ? "Saving..." : "Record Delivery"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Return dialog
// ---------------------------------------------------------------------------

interface ReturnDialogProps {
  material: ProjectMaterial
  open: boolean
  onClose: () => void
  onSaved: (materials: ProjectMaterial[]) => void
}

function ReturnMaterialDialog({ material, open, onClose, onSaved }: ReturnDialogProps) {
  const [qtyStr, setQtyStr] = useState("")
  const [creditStr, setCreditStr] = useState("")
  const [reason, setReason] = useState("")
  const [isPending, startTransition] = useTransition()

  function handleReturn() {
    const qty = parseFloat(qtyStr)
    if (isNaN(qty) || qty <= 0) {
      toast.error("Enter a valid return quantity")
      return
    }

    startTransition(async () => {
      const result = await returnMaterial(material.id, {
        quantity_returned: qtyStr.endsWith(".") ? qtyStr.slice(0, -1) : qtyStr,
        credit_amount: creditStr ? (creditStr.endsWith(".") ? creditStr.slice(0, -1) : creditStr) : null,
        return_reason: reason.trim() || null,
      })

      if ("error" in result) {
        toast.error(result.error)
        return
      }

      toast.success("Return recorded")
      onSaved(result.data)
      onClose()
    })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Record Return</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <p className="text-sm font-medium">{material.name}</p>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ret-qty">Quantity Returned</Label>
            <Input
              id="ret-qty"
              inputMode="decimal"
              value={qtyStr}
              onChange={(e) => setQtyStr(e.target.value)}
              onBlur={() => {
                const n = parseFloat(qtyStr)
                if (!isNaN(n)) setQtyStr(n.toString())
              }}
              placeholder="0"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ret-credit">Credit Amount</Label>
            <Input
              id="ret-credit"
              inputMode="decimal"
              value={creditStr}
              onChange={(e) => setCreditStr(e.target.value)}
              onBlur={() => {
                const n = parseFloat(creditStr)
                if (!isNaN(n)) setCreditStr(n.toFixed(2))
              }}
              placeholder="0.00"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ret-reason">Return Reason</Label>
            <Input
              id="ret-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Damaged, wrong item, excess..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleReturn} disabled={isPending}>
            {isPending ? "Saving..." : "Record Return"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Main MaterialList component
// ---------------------------------------------------------------------------

export function MaterialList({
  projectId,
  materials,
  onMaterialsChange,
  onAddToPo,
  selectedForPo,
  onTogglePoSelection,
}: MaterialListProps) {
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [editingMaterial, setEditingMaterial] = useState<ProjectMaterial | null>(null)
  const [receivingMaterial, setReceivingMaterial] = useState<ProjectMaterial | null>(null)
  const [returningMaterial, setReturningMaterial] = useState<ProjectMaterial | null>(null)

  // Summary totals
  const totalEstimated = materials.reduce((s, m) => s + m.total_estimated, 0)
  const totalActual = materials.reduce((s, m) => s + m.total_actual, 0)
  const totalVariance = totalActual - totalEstimated
  const totalVariancePct = totalEstimated > 0 ? (totalVariance / totalEstimated) * 100 : null

  return (
    <div className="flex flex-col gap-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold">Materials</h2>
          {materials.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {materials.length}
            </Badge>
          )}
        </div>
        <Button size="sm" onClick={() => setShowAddDialog(true)}>
          Add Material
        </Button>
      </div>

      {/* Table */}
      {materials.length === 0 ? (
        <p className="text-sm text-muted-foreground italic py-6 text-center">
          No materials yet. Add materials manually or populate from an approved proposal.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground w-6">
                  {/* PO checkbox col */}
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Name</th>
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Category</th>
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Supplier</th>
                <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">Est Qty</th>
                <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">Ordered</th>
                <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">Received</th>
                <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">Used</th>
                <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">Est Cost</th>
                <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">Actual Cost</th>
                <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">Variance</th>
                <th className="px-3 py-2.5 text-center font-medium text-muted-foreground">Status</th>
                <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {materials.map((mat, idx) => {
                const varClass = getVarianceClass(mat.variance_pct, mat.variance)
                const isSelected = selectedForPo.has(mat.id)

                return (
                  <tr
                    key={mat.id}
                    className={cn(
                      "border-b border-border last:border-0 transition-colors",
                      idx % 2 === 0 ? "bg-background" : "bg-muted/20",
                      isSelected && "bg-primary/5"
                    )}
                  >
                    {/* PO selection checkbox */}
                    <td className="px-3 py-2 w-6">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onTogglePoSelection(mat.id)}
                        className="w-4 h-4 rounded border-border cursor-pointer accent-primary"
                        title="Select for purchase order"
                      />
                    </td>

                    {/* Name */}
                    <td className="px-3 py-2 font-medium">{mat.name}</td>

                    {/* Category */}
                    <td className="px-3 py-2 text-muted-foreground capitalize">
                      {mat.category.replace("_", " ")}
                    </td>

                    {/* Supplier */}
                    <td className="px-3 py-2 text-muted-foreground">
                      {mat.supplier || <span className="italic text-muted-foreground/60">—</span>}
                    </td>

                    {/* Quantities */}
                    <td className="px-3 py-2 text-right tabular-nums">{fmtQty(mat.quantity_estimated)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtQty(mat.quantity_ordered)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtQty(mat.quantity_received)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtQty(mat.quantity_used)}</td>

                    {/* Costs */}
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {mat.total_estimated > 0 ? fmtCurrency(mat.total_estimated) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {mat.total_actual > 0 ? fmtCurrency(mat.total_actual) : "—"}
                    </td>

                    {/* Variance */}
                    <td className={cn("px-3 py-2 text-right tabular-nums font-medium", varClass)}>
                      {mat.total_estimated > 0 ? (
                        <>
                          {mat.variance >= 0 ? "+" : ""}
                          {fmtCurrency(mat.variance)}
                          {mat.variance_pct !== null && (
                            <span className="text-xs ml-1">
                              ({mat.variance >= 0 ? "+" : ""}{mat.variance_pct.toFixed(1)}%)
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-muted-foreground/60">—</span>
                      )}
                    </td>

                    {/* Order status badge */}
                    <td className="px-3 py-2 text-center">
                      <Badge
                        variant={ORDER_STATUS_VARIANTS[mat.order_status] ?? "outline"}
                        className="text-xs whitespace-nowrap"
                      >
                        {ORDER_STATUS_LABELS[mat.order_status] ?? mat.order_status}
                      </Badge>
                    </td>

                    {/* Actions */}
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={() => setEditingMaterial(mat)}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={() => setReceivingMaterial(mat)}
                        >
                          Receive
                        </Button>
                        {parseFloat(mat.quantity_received) > 0 && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                            onClick={() => setReturningMaterial(mat)}
                          >
                            Return
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>

            {/* Summary row */}
            {materials.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-border bg-muted/40 font-semibold">
                  <td className="px-3 py-2.5" colSpan={8}>
                    Total ({materials.length} items)
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {totalEstimated > 0 ? fmtCurrency(totalEstimated) : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {totalActual > 0 ? fmtCurrency(totalActual) : "—"}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2.5 text-right tabular-nums",
                      getVarianceClass(totalVariancePct, totalVariance)
                    )}
                  >
                    {totalEstimated > 0 ? (
                      <>
                        {totalVariance >= 0 ? "+" : ""}
                        {fmtCurrency(totalVariance)}
                        {totalVariancePct !== null && (
                          <span className="text-xs ml-1">
                            ({totalVariance >= 0 ? "+" : ""}{totalVariancePct.toFixed(1)}%)
                          </span>
                        )}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2.5" colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {/* Dialogs */}
      <EditMaterialDialog
        projectId={projectId}
        material={null}
        open={showAddDialog}
        onClose={() => setShowAddDialog(false)}
        onSaved={(mats) => {
          onMaterialsChange(mats)
          setShowAddDialog(false)
        }}
      />

      {editingMaterial && (
        <EditMaterialDialog
          projectId={projectId}
          material={editingMaterial}
          open
          onClose={() => setEditingMaterial(null)}
          onSaved={(mats) => {
            onMaterialsChange(mats)
            setEditingMaterial(null)
          }}
        />
      )}

      {receivingMaterial && (
        <ReceiveMaterialDialog
          material={receivingMaterial}
          open
          onClose={() => setReceivingMaterial(null)}
          onSaved={(mats) => {
            onMaterialsChange(mats)
            setReceivingMaterial(null)
          }}
        />
      )}

      {returningMaterial && (
        <ReturnMaterialDialog
          material={returningMaterial}
          open
          onClose={() => setReturningMaterial(null)}
          onSaved={(mats) => {
            onMaterialsChange(mats)
            setReturningMaterial(null)
          }}
        />
      )}
    </div>
  )
}
