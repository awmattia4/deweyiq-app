"use client"

/**
 * Phase 13: PO Builder
 *
 * Two-mode purchase order creation:
 * - Formal: Full PO form with supplier contact/email, line items, total calc, "Send to Supplier"
 * - Checklist: Simplified — supplier name, items list, "Mark as Ordered" (no formal PO doc)
 *
 * Uses local string state for decimal inputs per MEMORY.md controlled input pattern.
 * Opened as a Dialog from PurchasingDashboard.
 */

import { useState, useTransition } from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { createPurchaseOrder, sendPurchaseOrder } from "@/actions/purchasing"
import type { CreatePoData } from "@/actions/purchasing"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PoLineItem {
  id: string // local key for list rendering
  shoppingListItemId?: string
  itemName: string
  quantity: string // local string state — never parseFloat directly on change
  unit: string
  unitPrice: string
}

interface VendorOption {
  id: string
  vendor_name: string
  contact_email: string | null
  contact_phone: string | null
}

interface PoBuilderProps {
  open: boolean
  preselectedItems?: Array<{
    shoppingListItemId?: string
    itemName: string
    quantity: string
    unit: string
    unitPrice: string
  }>
  supplierName?: string
  vendors?: VendorOption[]
  onClose: () => void
}

// ---------------------------------------------------------------------------
// PoBuilder
// ---------------------------------------------------------------------------

export function PoBuilder({
  open,
  preselectedItems = [],
  supplierName: initialSupplierName,
  vendors = [],
  onClose,
}: PoBuilderProps) {
  const [mode, setMode] = useState<"formal" | "checklist">("checklist")
  const [supplierName, setSupplierName] = useState(initialSupplierName ?? "")
  const [supplierContact, setSupplierContact] = useState("")
  const [supplierEmail, setSupplierEmail] = useState("")
  const [selectedVendorId, setSelectedVendorId] = useState<string>("")

  function handleVendorSelect(vendorId: string) {
    if (vendorId === "__manual__") {
      setSelectedVendorId("")
      setSupplierName("")
      setSupplierEmail("")
      setSupplierContact("")
      return
    }
    setSelectedVendorId(vendorId)
    const vendor = vendors.find((v) => v.id === vendorId)
    if (vendor) {
      setSupplierName(vendor.vendor_name)
      setSupplierEmail(vendor.contact_email ?? "")
      setSupplierContact("")
    }
  }
  const [notes, setNotes] = useState("")
  const [lineItems, setLineItems] = useState<PoLineItem[]>(() =>
    preselectedItems.map((item, i) => ({
      id: `item-${i}`,
      shoppingListItemId: item.shoppingListItemId,
      itemName: item.itemName,
      quantity: item.quantity,
      unit: item.unit,
      unitPrice: item.unitPrice,
    }))
  )
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [isPending, startTransition] = useTransition()
  const [isSending, startSendTransition] = useTransition()

  // Total calculated from string inputs — parse only for display
  const total = lineItems.reduce((sum, item) => {
    const qty = parseFloat(item.quantity) || 0
    const price = parseFloat(item.unitPrice) || 0
    return sum + qty * price
  }, 0)

  function updateLineItem(id: string, field: keyof PoLineItem, value: string) {
    setLineItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    )
  }

  function addLineItem() {
    setLineItems((prev) => [
      ...prev,
      {
        id: `item-${Date.now()}`,
        itemName: "",
        quantity: "1",
        unit: "each",
        unitPrice: "0",
      },
    ])
  }

  function removeLineItem(id: string) {
    setLineItems((prev) => prev.filter((item) => item.id !== id))
  }

  function handleSave() {
    setError("")
    if (!supplierName.trim()) {
      setError("Supplier name is required.")
      return
    }
    if (lineItems.length === 0) {
      setError("Add at least one item.")
      return
    }
    if (lineItems.some((li) => !li.itemName.trim())) {
      setError("All items must have a name.")
      return
    }

    startTransition(async () => {
      try {
        const data: CreatePoData = {
          supplierName: supplierName.trim(),
          supplierContact: supplierContact.trim() || undefined,
          supplierEmail: supplierEmail.trim() || undefined,
          mode,
          notes: notes.trim() || undefined,
          items: lineItems.map((li) => ({
            shoppingListItemId: li.shoppingListItemId,
            itemName: li.itemName,
            quantity: li.quantity,
            unit: li.unit,
            unitPrice: li.unitPrice,
          })),
        }
        const result = await createPurchaseOrder(data)
        setSuccess(`PO ${result.poNumber} created.`)

        if (mode === "formal" && supplierEmail.trim()) {
          startSendTransition(async () => {
            await sendPurchaseOrder(result.poId)
          })
        }

        setTimeout(onClose, 1500)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create PO.")
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Purchase Order</DialogTitle>
        </DialogHeader>

        {/* Mode toggle */}
        <div className="flex items-center gap-2 mt-1">
          <span className="text-sm text-muted-foreground">Mode:</span>
          <div className="flex rounded-md border border-border overflow-hidden">
            <button
              onClick={() => setMode("checklist")}
              className={cn(
                "px-3 py-1.5 text-sm font-medium transition-colors",
                mode === "checklist"
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:bg-muted"
              )}
            >
              Checklist
            </button>
            <button
              onClick={() => setMode("formal")}
              className={cn(
                "px-3 py-1.5 text-sm font-medium transition-colors border-l border-border",
                mode === "formal"
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:bg-muted"
              )}
            >
              Formal PO
            </button>
          </div>
        </div>

        {mode === "checklist" && (
          <p className="text-xs text-muted-foreground">
            Checklist mode: marks items as ordered without generating a formal PO document. Use for phone/verbal orders.
          </p>
        )}
        {mode === "formal" && (
          <p className="text-xs text-muted-foreground">
            Formal mode: generates a PO and emails it to the supplier.
          </p>
        )}

        <div className="flex flex-col gap-4 mt-2">
          {/* Supplier info */}
          <div className="flex flex-col gap-3">
            {vendors.length > 0 && (
              <div>
                <Label>Select Vendor</Label>
                <Select value={selectedVendorId || "__manual__"} onValueChange={handleVendorSelect}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Choose a saved vendor..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__manual__">Enter manually</SelectItem>
                    {vendors.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.vendor_name}
                        {v.contact_email ? ` — ${v.contact_email}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {!selectedVendorId && (
              <div>
                <Label htmlFor="supplier-name">Supplier Name</Label>
                <Input
                  id="supplier-name"
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  placeholder="e.g. Pool Supply World"
                  className="mt-1"
                />
              </div>
            )}

            {mode === "formal" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="supplier-contact">Contact Name (optional)</Label>
                  <Input
                    id="supplier-contact"
                    value={supplierContact}
                    onChange={(e) => setSupplierContact(e.target.value)}
                    placeholder="e.g. Jane Smith"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="supplier-email">Supplier Email (optional)</Label>
                  <Input
                    id="supplier-email"
                    type="email"
                    value={supplierEmail}
                    onChange={(e) => setSupplierEmail(e.target.value)}
                    placeholder="orders@supplier.com"
                    className="mt-1"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Line items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Items</Label>
              <Button size="sm" variant="outline" onClick={addLineItem} className="h-7 text-xs">
                Add Item
              </Button>
            </div>

            <div className="flex flex-col gap-2">
              {lineItems.map((item) => (
                <div key={item.id} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-5">
                    <Input
                      value={item.itemName}
                      onChange={(e) => updateLineItem(item.id, "itemName", e.target.value)}
                      placeholder="Item name"
                      className="text-sm h-8"
                    />
                  </div>
                  <div className="col-span-2">
                    <Input
                      value={item.quantity}
                      onChange={(e) => {
                        const val = e.target.value
                        updateLineItem(item.id, "quantity", val)
                      }}
                      onBlur={(e) => {
                        // Flush to valid number on blur
                        const parsed = parseFloat(e.target.value)
                        if (!isNaN(parsed)) {
                          updateLineItem(item.id, "quantity", String(parsed))
                        }
                      }}
                      placeholder="Qty"
                      className="text-sm h-8"
                    />
                  </div>
                  <div className="col-span-2">
                    <Input
                      value={item.unit}
                      onChange={(e) => updateLineItem(item.id, "unit", e.target.value)}
                      placeholder="Unit"
                      className="text-sm h-8"
                    />
                  </div>
                  {mode === "formal" && (
                    <div className="col-span-2">
                      <Input
                        value={item.unitPrice}
                        onChange={(e) => {
                          const val = e.target.value
                          updateLineItem(item.id, "unitPrice", val)
                        }}
                        onBlur={(e) => {
                          const parsed = parseFloat(e.target.value)
                          if (!isNaN(parsed)) {
                            updateLineItem(item.id, "unitPrice", String(parsed))
                          }
                        }}
                        placeholder="$0.00"
                        className="text-sm h-8"
                      />
                    </div>
                  )}
                  <div className={cn("col-span-1 flex justify-end", mode !== "formal" && "col-span-3")}>
                    <button
                      onClick={() => removeLineItem(item.id)}
                      className="text-muted-foreground hover:text-destructive text-lg leading-none p-1"
                      aria-label="Remove item"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {lineItems.length === 0 && (
              <p className="text-sm text-muted-foreground italic">No items added.</p>
            )}
          </div>

          {/* Total (formal mode only) */}
          {mode === "formal" && lineItems.length > 0 && (
            <div className="flex justify-end text-sm font-semibold">
              Total: ${total.toFixed(2)}
            </div>
          )}

          {/* Notes */}
          <div>
            <Label htmlFor="po-notes">Notes (optional)</Label>
            <Textarea
              id="po-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Delivery instructions, account number, etc."
              className="mt-1 text-sm"
              rows={2}
            />
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          {success && (
            <p className="text-sm text-green-500">{success}</p>
          )}
        </div>

        <DialogFooter className="flex flex-col sm:flex-row gap-2 mt-4">
          <Button variant="outline" onClick={onClose} disabled={isPending || isSending}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isPending || isSending || Boolean(success)}
          >
            {isPending
              ? "Saving..."
              : mode === "formal" && supplierEmail.trim()
              ? "Save & Send to Supplier"
              : mode === "checklist"
              ? "Mark as Ordered"
              : "Save PO"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
