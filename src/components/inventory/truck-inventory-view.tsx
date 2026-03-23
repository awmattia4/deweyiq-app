"use client"

/**
 * Phase 13: Truck Inventory View
 *
 * Categorized list of items on a tech's truck.
 * Groups by category: chemical, part, tool, equipment, other.
 *
 * Features:
 * - Inline quantity editing (controlled decimal state per MEMORY.md)
 * - Below-threshold yellow highlight
 * - Add item dialog with optional barcode scan
 * - Transfer dialog (office view)
 * - Mark used (quick decrement)
 */

import { useState, useTransition } from "react"
import dynamic from "next/dynamic"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import {
  addTruckInventoryItem,
  updateTruckInventoryItem,
  deleteTruckInventoryItem,
  transferInventoryItem,
} from "@/actions/truck-inventory"
import type { TruckInventoryItem } from "@/actions/truck-inventory"

// Dynamic import for barcode scanner (camera API — SSR unsafe)
const BarcodeScannerDialog = dynamic(
  () => import("@/components/field/barcode-scanner").then((m) => m.BarcodeScannerDialog),
  { ssr: false }
)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TechProfile {
  id: string
  fullName: string
}

interface TruckInventoryViewProps {
  techId: string
  initialItems: TruckInventoryItem[]
  /** For office view: list of all techs to switch between / transfer to */
  allTechs?: TechProfile[]
  isOfficeView?: boolean
}

const CATEGORIES = ["chemical", "part", "tool", "equipment", "other"] as const
type Category = (typeof CATEGORIES)[number]

const CATEGORY_LABELS: Record<Category, string> = {
  chemical: "Chemicals",
  part: "Parts",
  tool: "Tools",
  equipment: "Equipment",
  other: "Other",
}

const COMMON_UNITS = ["oz", "floz", "gallon", "quart", "cup", "lbs", "each", "box", "bag", "roll"]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function groupByCategory(items: TruckInventoryItem[]): Record<Category, TruckInventoryItem[]> {
  const groups: Record<Category, TruckInventoryItem[]> = {
    chemical: [],
    part: [],
    tool: [],
    equipment: [],
    other: [],
  }
  for (const item of items) {
    const cat = item.category as Category
    if (groups[cat]) groups[cat].push(item)
    else groups.other.push(item)
  }
  return groups
}

function isBelowThreshold(item: TruckInventoryItem): boolean {
  const qty = parseFloat(item.quantity)
  const threshold = parseFloat(item.min_threshold)
  return threshold > 0 && qty <= threshold
}

function formatQuantity(qty: string): string {
  return String(parseFloat(qty) || 0)
}

// ---------------------------------------------------------------------------
// Add Item Dialog
// ---------------------------------------------------------------------------

interface AddItemDialogProps {
  techId: string
  onSuccess: (newItem: TruckInventoryItem) => void
  onClose: () => void
}

function AddItemDialog({ techId, onSuccess, onClose }: AddItemDialogProps) {
  const [isPending, startTransition] = useTransition()
  const [showScanner, setShowScanner] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form fields
  const [itemName, setItemName] = useState("")
  const [category, setCategory] = useState<string>("chemical")
  const [quantityStr, setQuantityStr] = useState("1")
  const [unit, setUnit] = useState("oz")
  const [thresholdStr, setThresholdStr] = useState("0")
  const [barcode, setBarcode] = useState("")

  function handleSubmit() {
    if (!itemName.trim()) {
      setError("Item name is required")
      return
    }
    const quantity = parseFloat(quantityStr)
    if (isNaN(quantity) || quantity < 0) {
      setError("Enter a valid quantity")
      return
    }
    setError(null)

    startTransition(async () => {
      try {
        const result = await addTruckInventoryItem({
          tech_id: techId,
          item_name: itemName.trim(),
          category,
          quantity,
          unit,
          min_threshold: parseFloat(thresholdStr) || 0,
          on_truck: true,
          barcode: barcode || null,
        })
        if (result) onSuccess(result)
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add item")
      }
    })
  }

  return (
    <>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Add Inventory Item</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="item-name">Item Name</Label>
            <Input
              id="item-name"
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              placeholder="e.g. Liquid Chlorine"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="category">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {CATEGORY_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="unit">Unit</Label>
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger id="unit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMMON_UNITS.map((u) => (
                    <SelectItem key={u} value={u}>
                      {u}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="quantity">Quantity</Label>
              <Input
                id="quantity"
                type="text"
                inputMode="decimal"
                value={quantityStr}
                onChange={(e) => {
                  // Controlled decimal: allow intermediate states like "1." or "-"
                  const v = e.target.value
                  if (/^-?\d*\.?\d*$/.test(v)) setQuantityStr(v)
                }}
                onBlur={() => {
                  const parsed = parseFloat(quantityStr)
                  if (!isNaN(parsed)) setQuantityStr(String(parsed))
                }}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="threshold">Min Threshold</Label>
              <Input
                id="threshold"
                type="text"
                inputMode="decimal"
                value={thresholdStr}
                onChange={(e) => {
                  const v = e.target.value
                  if (/^\d*\.?\d*$/.test(v)) setThresholdStr(v)
                }}
                onBlur={() => {
                  const parsed = parseFloat(thresholdStr)
                  if (!isNaN(parsed)) setThresholdStr(String(parsed))
                }}
                placeholder="Alert below this"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="barcode">Barcode (optional)</Label>
            <div className="flex gap-2">
              <Input
                id="barcode"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="Scan or enter barcode"
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowScanner(true)}
              >
                Scan
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? "Adding..." : "Add Item"}
          </Button>
        </DialogFooter>
      </DialogContent>

      {showScanner && (
        <BarcodeScannerDialog
          open={showScanner}
          onOpenChange={(open) => !open && setShowScanner(false)}
          onScan={(code) => {
            setBarcode(code)
            setShowScanner(false)
          }}
        />
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Transfer Dialog (office view)
// ---------------------------------------------------------------------------

interface TransferDialogProps {
  item: TruckInventoryItem
  fromTechId: string
  allTechs: TechProfile[]
  onSuccess: () => void
  onClose: () => void
}

function TransferDialog({ item, fromTechId, allTechs, onSuccess, onClose }: TransferDialogProps) {
  const [isPending, startTransition] = useTransition()
  const [targetTechId, setTargetTechId] = useState("")
  const [quantityStr, setQuantityStr] = useState("1")
  const [error, setError] = useState<string | null>(null)

  const otherTechs = allTechs.filter((t) => t.id !== fromTechId)
  const maxQty = parseFloat(item.quantity)

  function handleTransfer() {
    if (!targetTechId) {
      setError("Select a destination tech")
      return
    }
    const quantity = parseFloat(quantityStr)
    if (isNaN(quantity) || quantity <= 0 || quantity > maxQty) {
      setError(`Enter a quantity between 0.01 and ${formatQuantity(item.quantity)}`)
      return
    }
    setError(null)

    startTransition(async () => {
      try {
        await transferInventoryItem(fromTechId, targetTechId, item.id, quantity)
        onSuccess()
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Transfer failed")
      }
    })
  }

  return (
    <DialogContent className="sm:max-w-[380px]">
      <DialogHeader>
        <DialogTitle>Transfer {item.item_name}</DialogTitle>
      </DialogHeader>

      <div className="flex flex-col gap-4 py-2">
        <p className="text-sm text-muted-foreground">
          Available: {formatQuantity(item.quantity)} {item.unit}
        </p>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex flex-col gap-1.5">
          <Label>Transfer to</Label>
          <Select value={targetTechId} onValueChange={setTargetTechId}>
            <SelectTrigger>
              <SelectValue placeholder="Select tech..." />
            </SelectTrigger>
            <SelectContent>
              {otherTechs.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.fullName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Quantity to transfer</Label>
          <Input
            type="text"
            inputMode="decimal"
            value={quantityStr}
            onChange={(e) => {
              const v = e.target.value
              if (/^\d*\.?\d*$/.test(v)) setQuantityStr(v)
            }}
          />
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={isPending}>
          Cancel
        </Button>
        <Button onClick={handleTransfer} disabled={isPending}>
          {isPending ? "Transferring..." : "Transfer"}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}

// ---------------------------------------------------------------------------
// Inventory Row
// ---------------------------------------------------------------------------

interface InventoryRowProps {
  item: TruckInventoryItem
  onUpdate: (updated: TruckInventoryItem) => void
  onDelete: (id: string) => void
  onTransfer?: (item: TruckInventoryItem) => void
  isOfficeView: boolean
}

function InventoryRow({ item, onUpdate, onDelete, onTransfer, isOfficeView }: InventoryRowProps) {
  const [, startTransition] = useTransition()
  // Controlled decimal state per MEMORY.md
  const [quantityStr, setQuantityStr] = useState(formatQuantity(item.quantity))
  const [isEditing, setIsEditing] = useState(false)
  const belowThreshold = isBelowThreshold(item)

  function flushQuantityUpdate(value: string) {
    const parsed = parseFloat(value)
    if (isNaN(parsed) || parsed < 0) return
    if (parsed === parseFloat(item.quantity)) return

    startTransition(async () => {
      try {
        const updated = await updateTruckInventoryItem(item.id, { quantity: parsed })
        if (updated) onUpdate(updated)
      } catch (err) {
        console.error("Failed to update quantity:", err)
        // Reset to last known good
        setQuantityStr(formatQuantity(item.quantity))
      }
    })
  }

  function handleMarkUsed() {
    const current = parseFloat(item.quantity)
    if (current <= 0) return
    const newQty = Math.max(0, current - 1)
    setQuantityStr(String(newQty))
    startTransition(async () => {
      try {
        const updated = await updateTruckInventoryItem(item.id, { quantity: newQty })
        if (updated) onUpdate(updated)
      } catch (err) {
        console.error("Failed to mark used:", err)
        setQuantityStr(formatQuantity(item.quantity))
      }
    })
  }

  function handleDelete() {
    startTransition(async () => {
      try {
        await deleteTruckInventoryItem(item.id)
        onDelete(item.id)
      } catch (err) {
        console.error("Failed to delete item:", err)
      }
    })
  }

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors",
        belowThreshold
          ? "border-amber-500/40 bg-amber-500/5"
          : "border-border bg-card"
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{item.item_name}</span>
          {belowThreshold && (
            <Badge variant="outline" className="text-[10px] border-amber-500/60 text-amber-400 shrink-0">
              Low
            </Badge>
          )}
        </div>
        {belowThreshold && parseFloat(item.min_threshold) > 0 && (
          <p className="text-[11px] text-amber-400/80 mt-0.5">
            Threshold: {formatQuantity(item.min_threshold)} {item.unit}
          </p>
        )}
      </div>

      {/* Quantity input */}
      <div className="flex items-center gap-1.5 shrink-0">
        {isEditing ? (
          <Input
            type="text"
            inputMode="decimal"
            value={quantityStr}
            onChange={(e) => {
              const v = e.target.value
              if (/^-?\d*\.?\d*$/.test(v)) setQuantityStr(v)
            }}
            onBlur={() => {
              setIsEditing(false)
              // Flush on blur as safety net (MEMORY.md pattern)
              if (!quantityStr.endsWith(".") && !quantityStr.endsWith("-")) {
                flushQuantityUpdate(quantityStr)
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setIsEditing(false)
                flushQuantityUpdate(quantityStr)
              }
            }}
            className="w-20 h-8 text-right text-sm"
            autoFocus
          />
        ) : (
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="text-sm font-mono text-right w-16 hover:text-primary transition-colors"
            title="Click to edit quantity"
          >
            {quantityStr} {item.unit}
          </button>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-muted-foreground"
          onClick={handleMarkUsed}
          disabled={parseFloat(item.quantity) <= 0}
        >
          Use 1
        </Button>
        {isOfficeView && onTransfer && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-muted-foreground"
            onClick={() => onTransfer(item)}
          >
            Transfer
          </Button>
        )}
        {isOfficeView && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-destructive hover:text-destructive"
            onClick={handleDelete}
          >
            Remove
          </Button>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function TruckInventoryView({
  techId,
  initialItems,
  allTechs = [],
  isOfficeView = false,
}: TruckInventoryViewProps) {
  const [items, setItems] = useState<TruckInventoryItem[]>(initialItems)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [transferItem, setTransferItem] = useState<TruckInventoryItem | null>(null)

  const groups = groupByCategory(items)
  const lowCount = items.filter(isBelowThreshold).length

  function handleItemUpdated(updated: TruckInventoryItem) {
    setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)))
  }

  function handleItemDeleted(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id))
  }

  function handleItemAdded(newItem: TruckInventoryItem) {
    setItems((prev) => [...prev, newItem])
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          {lowCount > 0 && (
            <p className="text-sm text-amber-400">
              {lowCount} item{lowCount !== 1 ? "s" : ""} below threshold
            </p>
          )}
          {lowCount === 0 && items.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {items.length} item{items.length !== 1 ? "s" : ""} on truck
            </p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowAddDialog(true)}
        >
          Add Item
        </Button>
      </div>

      {/* Empty state */}
      {items.length === 0 && (
        <p className="text-sm text-muted-foreground italic text-center py-6">
          No items on truck. Add items to start tracking inventory.
        </p>
      )}

      {/* Categorized groups */}
      {CATEGORIES.map((cat) => {
        const catItems = groups[cat]
        if (catItems.length === 0) return null

        return (
          <div key={cat} className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {CATEGORY_LABELS[cat]}
            </h3>
            <div className="flex flex-col gap-1.5">
              {catItems.map((item) => (
                <InventoryRow
                  key={item.id}
                  item={item}
                  onUpdate={handleItemUpdated}
                  onDelete={handleItemDeleted}
                  onTransfer={isOfficeView ? (i) => setTransferItem(i) : undefined}
                  isOfficeView={isOfficeView}
                />
              ))}
            </div>
          </div>
        )
      })}

      {/* Add item dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <AddItemDialog
          techId={techId}
          onSuccess={handleItemAdded}
          onClose={() => setShowAddDialog(false)}
        />
      </Dialog>

      {/* Transfer dialog */}
      <Dialog open={!!transferItem} onOpenChange={() => setTransferItem(null)}>
        {transferItem && (
          <TransferDialog
            item={transferItem}
            fromTechId={techId}
            allTechs={allTechs}
            onSuccess={() => {
              // Refresh items after transfer — simple: just update transferred item qty
              // In production, could re-fetch; for now optimistic update
            }}
            onClose={() => setTransferItem(null)}
          />
        )}
      </Dialog>
    </div>
  )
}
