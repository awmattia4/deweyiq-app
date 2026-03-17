"use client"

/**
 * purchase-order-builder.tsx — PO creation dialog.
 *
 * Phase 12 Plan 09: Materials & Procurement
 *
 * Pre-populates with selected materials from the material list.
 * Allows editing quantities and prices before creating the PO.
 * After creation, offers to download the PO PDF.
 */

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { createPurchaseOrder } from "@/actions/projects-materials"
import type { ProjectMaterial, PurchaseOrder } from "@/actions/projects-materials"

// ---------------------------------------------------------------------------
// Line item state
// ---------------------------------------------------------------------------

interface LineItem {
  material_id: string
  materialName: string
  qtyStr: string
  unitPriceStr: string
  total: number
}

function buildLineItems(materials: ProjectMaterial[]): LineItem[] {
  return materials.map((m) => {
    const qty = parseFloat(m.quantity_estimated) || 1
    const unitPrice = parseFloat(m.unit_cost_estimated ?? "0") || 0
    return {
      material_id: m.id,
      materialName: m.name,
      qtyStr: qty.toString(),
      unitPriceStr: unitPrice > 0 ? unitPrice.toFixed(2) : "",
      total: qty * unitPrice,
    }
  })
}

function computeTotal(items: LineItem[]): number {
  return items.reduce((sum, li) => {
    const qty = parseFloat(li.qtyStr) || 0
    const price = parseFloat(li.unitPriceStr) || 0
    return sum + qty * price
  }, 0)
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PurchaseOrderBuilderProps {
  projectId: string
  selectedMaterials: ProjectMaterial[]
  open: boolean
  onClose: () => void
  onCreated: (po: PurchaseOrder) => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PurchaseOrderBuilder({
  projectId,
  selectedMaterials,
  open,
  onClose,
  onCreated,
}: PurchaseOrderBuilderProps) {
  const [supplierName, setSupplierName] = useState(
    // Pre-fill supplier from first selected material if all share the same supplier
    (() => {
      const suppliers = [...new Set(selectedMaterials.map((m) => m.supplier).filter(Boolean))]
      return suppliers.length === 1 ? (suppliers[0] ?? "") : ""
    })()
  )
  const [supplierContact, setSupplierContact] = useState("")
  const [notes, setNotes] = useState("")
  const [lineItems, setLineItems] = useState<LineItem[]>(() => buildLineItems(selectedMaterials))
  const [isPending, startTransition] = useTransition()
  const [createdPoId, setCreatedPoId] = useState<string | null>(null)

  const grandTotal = computeTotal(lineItems)

  function updateLineItem(index: number, field: "qtyStr" | "unitPriceStr", value: string) {
    setLineItems((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: value }
      return next
    })
  }

  function handleCreate() {
    if (!supplierName.trim()) {
      toast.error("Supplier name is required")
      return
    }

    const invalidItems = lineItems.filter((li) => {
      const qty = parseFloat(li.qtyStr)
      return isNaN(qty) || qty <= 0
    })

    if (invalidItems.length > 0) {
      toast.error("All line items must have a valid quantity")
      return
    }

    startTransition(async () => {
      const result = await createPurchaseOrder(projectId, {
        supplier_name: supplierName.trim(),
        supplier_contact: supplierContact.trim() || null,
        notes: notes.trim() || null,
        lineItems: lineItems.map((li) => ({
          material_id: li.material_id,
          materialName: li.materialName,
          quantity: li.qtyStr.endsWith(".") ? li.qtyStr.slice(0, -1) : li.qtyStr,
          unit_price: li.unitPriceStr
            ? (li.unitPriceStr.endsWith(".") ? li.unitPriceStr.slice(0, -1) : li.unitPriceStr)
            : "0",
        })),
      })

      if ("error" in result) {
        toast.error(result.error)
        return
      }

      toast.success(`Purchase order ${result.data.po_number ?? ""} created`)
      setCreatedPoId(result.data.id)
      onCreated(result.data)
    })
  }

  function handleClose() {
    setCreatedPoId(null)
    setSupplierName("")
    setSupplierContact("")
    setNotes("")
    onClose()
  }

  // After creation: show download option
  if (createdPoId) {
    return (
      <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Purchase Order Created</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              The purchase order was created successfully. You can download a PDF to send to the
              supplier.
            </p>
          </div>
          <DialogFooter className="flex-row gap-2">
            <Button variant="outline" onClick={handleClose}>
              Done
            </Button>
            <Button asChild>
              <a
                href={`/api/projects/purchase-orders/${createdPoId}/pdf`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Download PDF
              </a>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Purchase Order</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-5 py-2">
          {/* Supplier info */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="po-supplier">Supplier Name</Label>
              <Input
                id="po-supplier"
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                placeholder="e.g. Pool Supply World"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="po-contact">Contact / Email</Label>
              <Input
                id="po-contact"
                value={supplierContact}
                onChange={(e) => setSupplierContact(e.target.value)}
                placeholder="orders@supplier.com"
              />
            </div>
          </div>

          {/* Line items */}
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">Line Items</h3>
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Material</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground w-24">Qty</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground w-28">Unit Price</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground w-24">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((li, i) => {
                    const total = (parseFloat(li.qtyStr) || 0) * (parseFloat(li.unitPriceStr) || 0)
                    return (
                      <tr key={li.material_id} className="border-b border-border last:border-0">
                        <td className="px-3 py-2 font-medium">{li.materialName}</td>
                        <td className="px-3 py-2">
                          <Input
                            inputMode="decimal"
                            value={li.qtyStr}
                            onChange={(e) => updateLineItem(i, "qtyStr", e.target.value)}
                            onBlur={() => {
                              const n = parseFloat(li.qtyStr)
                              if (!isNaN(n)) updateLineItem(i, "qtyStr", n.toString())
                            }}
                            className="text-right h-8 text-sm"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <div className="relative">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                            <Input
                              inputMode="decimal"
                              value={li.unitPriceStr}
                              onChange={(e) => updateLineItem(i, "unitPriceStr", e.target.value)}
                              onBlur={() => {
                                const n = parseFloat(li.unitPriceStr)
                                if (!isNaN(n)) updateLineItem(i, "unitPriceStr", n.toFixed(2))
                              }}
                              className="text-right h-8 text-sm pl-6"
                            />
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                          ${total.toFixed(2)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border bg-muted/40">
                    <td className="px-3 py-2.5 font-semibold" colSpan={3} align="right">
                      Total
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums">
                      ${grandTotal.toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Notes */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="po-notes">Notes (optional)</Label>
            <Textarea
              id="po-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Delivery instructions, lead time requirements..."
              rows={2}
              className="text-sm"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={isPending || lineItems.length === 0}>
            {isPending ? "Creating..." : "Create Purchase Order"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
