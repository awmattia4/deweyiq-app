"use client"

/**
 * invoice-prep.tsx — Invoice preparation/review screen.
 *
 * Shown when office clicks "Prepare Invoice" on a completed WO,
 * or opens an existing draft invoice.
 *
 * Features:
 * - Editable line items (quantity, price, description, add/remove)
 * - Multi-WO invoicing: "Add another Work Order" picker
 * - Totals section with order-level discount, tax (respects tax_exempt)
 * - Notes textarea
 * - "Preview PDF" opens /api/invoices/{id}/pdf in new tab
 * - "Finalize Invoice" with confirmation dialog → assigns invoice number
 *
 * MEMORY: Decimal inputs use local useState<string> per controlled-input pattern.
 * MEMORY: All price/quantity fields flush to server only on complete numbers.
 */

import { useState, useTransition, useCallback } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  ChevronLeftIcon,
  PlusIcon,
  TrashIcon,
  ExternalLinkIcon,
  Loader2Icon,
  CheckCircleIcon,
  XIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  updateInvoiceLineItem,
  addInvoiceLineItem,
  removeInvoiceLineItem,
  addWorkOrderToInvoice,
  finalizeInvoice,
  updateInvoiceNotes,
  getCompletedWorkOrdersForCustomer,
} from "@/actions/invoices"
import type { InvoiceDetail, InvoiceLineItemDetail } from "@/actions/invoices"

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  paid: "Paid",
  void: "Void",
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-zinc-700 text-zinc-200",
  sent: "bg-blue-900/60 text-blue-300",
  paid: "bg-emerald-900/60 text-emerald-300",
  void: "bg-red-900/60 text-red-300",
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface InvoicePrepProps {
  invoice: InvoiceDetail
  workOrderId: string
  backHref?: string
}

// ─── NumericInput — decimal-safe controlled input ─────────────────────────────

interface NumericInputProps {
  value: string
  onChange: (val: string) => void
  onBlur?: (val: string) => void
  className?: string
  placeholder?: string
  prefix?: string
  align?: "left" | "right"
}

function NumericInput({
  value,
  onChange,
  onBlur,
  className,
  placeholder = "0.00",
  prefix,
  align = "right",
}: NumericInputProps) {
  const [localValue, setLocalValue] = useState(value)

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value
    setLocalValue(raw)
    // Only flush complete numbers to parent (not ending in . or -)
    if (!raw.endsWith(".") && !raw.endsWith("-") && raw !== "") {
      const num = parseFloat(raw)
      if (!isNaN(num)) {
        onChange(num.toString())
      }
    } else if (raw === "") {
      onChange("0")
    }
  }

  function handleBlur() {
    // Safety net: flush whatever is in the field on blur
    const num = parseFloat(localValue)
    if (!isNaN(num)) {
      const formatted = num.toString()
      setLocalValue(formatted)
      onChange(formatted)
      onBlur?.(formatted)
    } else {
      setLocalValue("0")
      onChange("0")
      onBlur?.("0")
    }
  }

  return (
    <div className="relative">
      {prefix && (
        <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          {prefix}
        </span>
      )}
      <input
        type="text"
        inputMode="decimal"
        value={localValue}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        className={cn(
          "rounded-md border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring",
          prefix && "pl-4",
          align === "right" && "text-right",
          className
        )}
      />
    </div>
  )
}

// ─── AddItemForm ──────────────────────────────────────────────────────────────

interface AddItemFormProps {
  invoiceId: string
  onSuccess: () => void
  onCancel: () => void
}

function AddItemForm({ invoiceId, onSuccess, onCancel }: AddItemFormProps) {
  const [description, setDescription] = useState("")
  const [quantity, setQuantity] = useState("1")
  const [unit, setUnit] = useState("each")
  const [unitPrice, setUnitPrice] = useState("")
  const [isTaxable, setIsTaxable] = useState(true)
  const [itemType, setItemType] = useState("other")
  const [isPending, startTransition] = useTransition()

  function handleSubmit() {
    if (!description.trim()) {
      toast.error("Description is required")
      return
    }
    if (!unitPrice || parseFloat(unitPrice) < 0) {
      toast.error("Unit price is required")
      return
    }

    startTransition(async () => {
      const result = await addInvoiceLineItem(invoiceId, {
        description: description.trim(),
        item_type: itemType,
        quantity,
        unit,
        unit_price: unitPrice,
        is_taxable: isTaxable,
      })

      if (result.success) {
        toast.success("Item added")
        onSuccess()
      } else {
        toast.error(result.error ?? "Failed to add item")
      }
    })
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-dashed border-primary/40 bg-primary/5 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Add Line Item
      </p>

      <input
        type="text"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description"
        className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
      />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Type</label>
          <select
            value={itemType}
            onChange={(e) => setItemType(e.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="part">Part</option>
            <option value="labor">Labor</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Qty</label>
          <NumericInput value={quantity} onChange={setQuantity} align="left" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Unit</label>
          <input
            type="text"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="each"
            className="rounded-md border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Unit Price</label>
          <NumericInput value={unitPrice} onChange={setUnitPrice} prefix="$" />
        </div>
      </div>

      <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
        <input
          type="checkbox"
          checked={isTaxable}
          onChange={(e) => setIsTaxable(e.target.checked)}
          className="accent-primary"
        />
        Taxable
      </label>

      <div className="flex items-center justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={isPending}>
          Cancel
        </Button>
        <Button size="sm" onClick={handleSubmit} disabled={isPending || !description.trim()}>
          {isPending && <Loader2Icon className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          Add Item
        </Button>
      </div>
    </div>
  )
}

// ─── LineItemRow ──────────────────────────────────────────────────────────────

interface LineItemRowProps {
  item: InvoiceLineItemDetail
  onRemove: (id: string) => void
  onUpdate: (
    id: string,
    field: "quantity" | "unit_price" | "description",
    val: string
  ) => void
  removeLoading: boolean
}

function LineItemRow({ item, onRemove, onUpdate, removeLoading }: LineItemRowProps) {
  const qty = parseFloat(item.quantity) || 0
  const unitPrice = parseFloat(item.unit_price) || 0
  const lineTotal = parseFloat(item.line_total) || qty * unitPrice

  return (
    <tr className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
      {/* Description */}
      <td className="py-2 pr-2">
        <input
          type="text"
          defaultValue={item.description}
          onBlur={(e) => {
            if (e.target.value !== item.description) {
              onUpdate(item.id, "description", e.target.value)
            }
          }}
          className="w-full rounded border-0 bg-transparent px-1 py-0.5 text-sm focus:bg-muted/40 focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <span className="text-xs text-muted-foreground capitalize">{item.item_type}</span>
      </td>

      {/* Quantity */}
      <td className="py-2 pr-2 text-right">
        <input
          type="text"
          inputMode="decimal"
          defaultValue={item.quantity}
          onBlur={(e) => {
            const num = parseFloat(e.target.value)
            if (!isNaN(num) && e.target.value !== item.quantity) {
              onUpdate(item.id, "quantity", num.toString())
            }
          }}
          className="w-16 rounded border-0 bg-transparent px-1 py-0.5 text-right text-sm focus:bg-muted/40 focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <span className="ml-0.5 text-xs text-muted-foreground">{item.unit}</span>
      </td>

      {/* Unit Price */}
      <td className="py-2 pr-2 text-right">
        <span className="text-xs text-muted-foreground mr-0.5">$</span>
        <input
          type="text"
          inputMode="decimal"
          defaultValue={parseFloat(item.unit_price).toFixed(2)}
          onBlur={(e) => {
            const num = parseFloat(e.target.value)
            if (!isNaN(num) && e.target.value !== item.unit_price) {
              onUpdate(item.id, "unit_price", num.toString())
            }
          }}
          className="w-20 rounded border-0 bg-transparent px-1 py-0.5 text-right text-sm focus:bg-muted/40 focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </td>

      {/* Line total */}
      <td className="py-2 pr-2 text-right text-sm font-medium">
        ${lineTotal.toFixed(2)}
        {!item.is_taxable && (
          <span className="ml-1 text-xs text-muted-foreground/60">(NT)</span>
        )}
      </td>

      {/* Remove */}
      <td className="py-2 text-right">
        <button
          type="button"
          onClick={() => onRemove(item.id)}
          disabled={removeLoading}
          className="cursor-pointer rounded p-1 text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors"
          aria-label="Remove item"
        >
          <TrashIcon className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  )
}

// ─── AddWoPickerDialog ─────────────────────────────────────────────────────────

interface AddWoPickerDialogProps {
  open: boolean
  onClose: () => void
  invoiceId: string
  customerId: string
  currentWoIds: string[]
  onWoAdded: () => void
}

function AddWoPickerDialog({
  open,
  onClose,
  invoiceId,
  customerId,
  currentWoIds,
  onWoAdded,
}: AddWoPickerDialogProps) {
  const [workOrders, setWorkOrders] = useState<
    Array<{ id: string; title: string; completed_at: Date | null }>
  >([])
  const [loading, setLoading] = useState(false)
  const [adding, setAdding] = useState<string | null>(null)

  async function loadWos() {
    setLoading(true)
    const wos = await getCompletedWorkOrdersForCustomer(customerId, currentWoIds)
    setWorkOrders(wos)
    setLoading(false)
  }

  async function handleAdd(woId: string) {
    setAdding(woId)
    const result = await addWorkOrderToInvoice(invoiceId, woId)
    setAdding(null)
    if (result.success) {
      toast.success("Work order added to invoice")
      onWoAdded()
      onClose()
    } else {
      toast.error(result.error ?? "Failed to add work order")
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) loadWos()
        else onClose()
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Another Work Order</DialogTitle>
          <DialogDescription>
            Select a completed work order from the same customer to combine into this invoice.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2Icon className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : workOrders.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground italic">
            No other completed work orders found for this customer.
          </p>
        ) : (
          <div className="flex flex-col gap-2 max-h-72 overflow-y-auto">
            {workOrders.map((wo) => (
              <div
                key={wo.id}
                className="flex items-center justify-between rounded-lg border border-border bg-card/50 px-3 py-2"
              >
                <div>
                  <p className="text-sm font-medium">{wo.title}</p>
                  {wo.completed_at && (
                    <p className="text-xs text-muted-foreground">
                      Completed{" "}
                      {new Intl.DateTimeFormat("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      }).format(new Date(wo.completed_at))}
                    </p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleAdd(wo.id)}
                  disabled={adding === wo.id}
                >
                  {adding === wo.id && (
                    <Loader2Icon className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  )}
                  Add
                </Button>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─── FinalizeConfirmDialog ─────────────────────────────────────────────────────

interface FinalizeConfirmDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  isPending: boolean
}

function FinalizeConfirmDialog({
  open,
  onClose,
  onConfirm,
  isPending,
}: FinalizeConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Finalize Invoice</DialogTitle>
          <DialogDescription>
            This will assign the next invoice number and mark all referenced work
            orders as invoiced. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={isPending}>
            {isPending && <Loader2Icon className="mr-1.5 h-4 w-4 animate-spin" />}
            Finalize Invoice
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── InvoicePrep ──────────────────────────────────────────────────────────────

/**
 * InvoicePrep — Invoice preparation screen.
 *
 * Main entry point: displayed when office clicks "Prepare Invoice" on a WO,
 * or navigates to an existing draft invoice.
 */
export function InvoicePrep({ invoice: initialInvoice, workOrderId }: InvoicePrepProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [invoice, setInvoice] = useState(initialInvoice)

  // UI state
  const [showAddItem, setShowAddItem] = useState(false)
  const [removingItemId, setRemovingItemId] = useState<string | null>(null)
  const [addWoDialogOpen, setAddWoDialogOpen] = useState(false)
  const [finalizeDialogOpen, setFinalizeDialogOpen] = useState(false)
  const [finalizePending, setFinalizePending] = useState(false)
  const [notes, setNotes] = useState(invoice.notes ?? "")

  // ── Line item mutations ─────────────────────────────────────────────────

  const handleUpdateLineItem = useCallback(
    async (
      itemId: string,
      field: "quantity" | "unit_price" | "description",
      val: string
    ) => {
      const result = await updateInvoiceLineItem(itemId, { [field]: val })
      if (result.success) {
        router.refresh()
      } else {
        toast.error(result.error ?? "Failed to update item")
      }
    },
    [router]
  )

  async function handleRemoveLineItem(itemId: string) {
    setRemovingItemId(itemId)
    const result = await removeInvoiceLineItem(itemId)
    setRemovingItemId(null)
    if (result.success) {
      toast.success("Item removed")
      router.refresh()
    } else {
      toast.error(result.error ?? "Failed to remove item")
    }
  }

  // ── Notes save ─────────────────────────────────────────────────────────

  async function handleSaveNotes() {
    const result = await updateInvoiceNotes(invoice.id, notes)
    if (result.success) {
      toast.success("Notes saved")
    } else {
      toast.error(result.error ?? "Failed to save notes")
    }
  }

  // ── Finalize ────────────────────────────────────────────────────────────

  async function handleFinalize() {
    setFinalizePending(true)
    const result = await finalizeInvoice(invoice.id)
    setFinalizePending(false)
    setFinalizeDialogOpen(false)

    if (result.success) {
      toast.success(`Invoice ${result.invoiceNumber} finalized`)
      router.push(`/work-orders/${workOrderId}`)
    } else {
      toast.error(result.error ?? "Failed to finalize invoice")
    }
  }

  // ── Derived values ──────────────────────────────────────────────────────

  const subtotal = parseFloat(invoice.subtotal) || 0
  const taxAmount = parseFloat(invoice.tax_amount) || 0
  const discountAmount = parseFloat(invoice.discount_amount) || 0
  const total = parseFloat(invoice.total) || 0
  const statusLabel = STATUS_LABELS[invoice.status] ?? invoice.status
  const statusColor = STATUS_COLORS[invoice.status] ?? "bg-zinc-700 text-zinc-200"

  const isFinalized = invoice.status !== "draft"

  // ── WO comparison summary ───────────────────────────────────────────────
  // Compare current invoice line items against original (placeholder for stretch goal)
  const lineItemCount = invoice.lineItems.length

  return (
    <div className="flex flex-col gap-6">
      {/* ── Back navigation ───────────────────────────────────────────────── */}
      <Link
        href={`/work-orders/${workOrderId}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeftIcon className="h-4 w-4" />
        Back to Work Order
      </Link>

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              {isFinalized ? (
                <>Invoice {invoice.invoice_number}</>
              ) : (
                "Prepare Invoice"
              )}
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {invoice.customerName}
            </p>
            {invoice.customerAddress && (
              <p className="text-xs text-muted-foreground/70">
                {invoice.customerAddress}
              </p>
            )}
          </div>
          <span
            className={cn(
              "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium",
              statusColor
            )}
          >
            {statusLabel}
          </span>
        </div>

        {/* Tax exempt badge */}
        {invoice.taxExempt && (
          <div className="mt-3 flex items-center gap-1.5 rounded-md border border-green-500/30 bg-green-500/10 px-3 py-1.5 text-xs font-medium text-green-300">
            <CheckCircleIcon className="h-3.5 w-3.5" />
            Tax Exempt Customer — $0.00 tax applied
          </div>
        )}

        {/* Referenced work orders */}
        {invoice.workOrderTitles.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
              Work Order{invoice.workOrderTitles.length > 1 ? "s" : ""} Covered
            </p>
            <div className="flex flex-wrap gap-1.5">
              {(invoice.work_order_ids ?? []).map((woId, idx) => (
                <Link
                  key={woId}
                  href={`/work-orders/${woId}`}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2.5 py-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {invoice.workOrderTitles[idx] ?? `WO ${idx + 1}`}
                  <ExternalLinkIcon className="h-3 w-3" />
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Line items table ───────────────────────────────────────────────── */}
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Line Items
            <span className="ml-1.5 font-normal text-muted-foreground/60">
              ({lineItemCount})
            </span>
          </h2>
          {!isFinalized && (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setAddWoDialogOpen(true)}
              >
                <PlusIcon className="h-3.5 w-3.5 mr-1" />
                Add Work Order
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowAddItem(true)}
                disabled={showAddItem}
              >
                <PlusIcon className="h-3.5 w-3.5 mr-1" />
                Add Item
              </Button>
            </div>
          )}
        </div>

        {invoice.lineItems.length === 0 && !showAddItem ? (
          <p className="text-sm text-muted-foreground italic text-center py-4">
            No line items yet. Add items from the work order or manually.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[500px]">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="pb-2 font-medium">Description</th>
                  <th className="pb-2 font-medium text-right">Qty</th>
                  <th className="pb-2 font-medium text-right">Unit Price</th>
                  <th className="pb-2 font-medium text-right">Total</th>
                  {!isFinalized && <th className="pb-2 w-8" />}
                </tr>
              </thead>
              <tbody>
                {invoice.lineItems.map((item) => (
                  <LineItemRow
                    key={item.id}
                    item={item}
                    onRemove={handleRemoveLineItem}
                    onUpdate={handleUpdateLineItem}
                    removeLoading={removingItemId === item.id}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Add item form */}
        {showAddItem && !isFinalized && (
          <div className="mt-4">
            <AddItemForm
              invoiceId={invoice.id}
              onSuccess={() => {
                setShowAddItem(false)
                router.refresh()
              }}
              onCancel={() => setShowAddItem(false)}
            />
          </div>
        )}
      </div>

      {/* ── Totals section ────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-border bg-card p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-4">
          Invoice Totals
        </h2>

        <div className="flex flex-col gap-2 items-end">
          <div className="flex items-center gap-8 min-w-[240px] justify-between">
            <span className="text-sm text-muted-foreground">Subtotal</span>
            <span className="text-sm font-medium">${subtotal.toFixed(2)}</span>
          </div>

          {discountAmount > 0 && (
            <div className="flex items-center gap-8 min-w-[240px] justify-between">
              <span className="text-sm text-muted-foreground">Discount</span>
              <span className="text-sm font-medium text-green-400">
                -${discountAmount.toFixed(2)}
              </span>
            </div>
          )}

          <div className="flex items-center gap-8 min-w-[240px] justify-between">
            <span className="text-sm text-muted-foreground">
              {invoice.taxExempt ? (
                <span className="flex items-center gap-1">
                  Tax
                  <span className="rounded-full bg-green-900/40 px-1.5 py-0 text-xs text-green-300">
                    Exempt
                  </span>
                </span>
              ) : (
                "Tax"
              )}
            </span>
            <span className="text-sm font-medium">
              {invoice.taxExempt ? (
                <span className="text-muted-foreground">$0.00</span>
              ) : (
                `$${taxAmount.toFixed(2)}`
              )}
            </span>
          </div>

          <div className="flex items-center gap-8 min-w-[240px] justify-between border-t border-border pt-2">
            <span className="text-base font-bold">Total Due</span>
            <span className="text-base font-bold text-primary">
              ${total.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* ── Notes ─────────────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-border bg-card p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          Notes
        </h2>
        {isFinalized ? (
          <p className="text-sm text-muted-foreground">
            {invoice.notes ?? <span className="italic">No notes</span>}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add invoice notes (e.g., payment instructions, special terms)..."
              rows={3}
              className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="outline"
                onClick={handleSaveNotes}
                disabled={isPending}
              >
                Save Notes
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ── Actions bar ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card/50 px-4 py-3">
        <Link
          href={`/api/invoices/${invoice.id}/pdf`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted/50 transition-colors"
        >
          <ExternalLinkIcon className="h-4 w-4" />
          Preview PDF
        </Link>

        {!isFinalized && (
          <Button
            onClick={() => setFinalizeDialogOpen(true)}
            disabled={finalizePending || invoice.lineItems.length === 0}
            className="ml-auto"
          >
            {finalizePending && (
              <Loader2Icon className="mr-1.5 h-4 w-4 animate-spin" />
            )}
            Finalize Invoice
          </Button>
        )}

        {isFinalized && invoice.invoice_number && (
          <div className="ml-auto flex items-center gap-2">
            <CheckCircleIcon className="h-4 w-4 text-emerald-400" />
            <span className="text-sm font-medium text-emerald-400">
              Invoice {invoice.invoice_number} finalized
            </span>
          </div>
        )}
      </div>

      {/* ── Dialogs ───────────────────────────────────────────────────────── */}
      <AddWoPickerDialog
        open={addWoDialogOpen}
        onClose={() => setAddWoDialogOpen(false)}
        invoiceId={invoice.id}
        customerId={invoice.customer_id}
        currentWoIds={(invoice.work_order_ids as string[] | null) ?? []}
        onWoAdded={() => router.refresh()}
      />

      <FinalizeConfirmDialog
        open={finalizeDialogOpen}
        onClose={() => setFinalizeDialogOpen(false)}
        onConfirm={handleFinalize}
        isPending={finalizePending}
      />
    </div>
  )
}
