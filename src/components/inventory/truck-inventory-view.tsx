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

import { useRef, useState, useTransition } from "react"
import { ScanBarcodeIcon } from "lucide-react"
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
  returnToWarehouse,
} from "@/actions/truck-inventory"
import type { TruckInventoryItem } from "@/actions/truck-inventory"

// Dynamic import for barcode scanner (camera API — SSR unsafe)
// Use raw BarcodeScanner (not Dialog wrapper) to avoid nested Dialog issues
const BarcodeScanner = dynamic(
  () => import("@/components/field/barcode-scanner").then((m) => m.BarcodeScanner),
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
  const [lookingUp, setLookingUp] = useState(false)
  const [scanMessage, setScanMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Form fields
  const [itemName, setItemName] = useState("")
  const [category, setCategory] = useState<string>("chemical")
  const [quantityStr, setQuantityStr] = useState("1")
  const [unit, setUnit] = useState("oz")
  const [thresholdStr, setThresholdStr] = useState("0")
  const [barcode, setBarcode] = useState("")

  // Catalog search
  const [searchResults, setSearchResults] = useState<Array<{ id: string; name: string; category: string; unit: string; source: string }>>([])
  const [showResults, setShowResults] = useState(false)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleNameChange(value: string) {
    setItemName(value)
    if (scanMessage) setScanMessage(null)
    // Debounced catalog search
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (value.length >= 2) {
      searchTimer.current = setTimeout(async () => {
        try {
          const { searchCatalogAndChemicals } = await import("@/actions/parts-catalog")
          const results = await searchCatalogAndChemicals(value)
          setSearchResults(results)
          setShowResults(results.length > 0)
        } catch {
          setSearchResults([])
        }
      }, 300)
    } else {
      setSearchResults([])
      setShowResults(false)
    }
  }

  function selectCatalogItem(item: typeof searchResults[0]) {
    setItemName(item.name)
    setCategory(item.category)
    setUnit(item.unit)
    setShowResults(false)
  }

  // Barcode scan → UPC lookup → autofill
  async function handleBarcodeScan(code: string) {
    setBarcode(code)
    setShowScanner(false)
    setLookingUp(true)
    setScanMessage(null)
    try {
      const { resolveBarcode } = await import("@/actions/barcode")
      const result = await resolveBarcode(code)
      if (result.found && result.item_name) {
        setItemName(result.item_name)
        setScanMessage(null)

        // Map catalog category → truck inventory category
        const srcCat = (result.catalog_category ?? result.upc_data?.category ?? "").toLowerCase()
        if (srcCat.includes("chemical") || srcCat.includes("chlorine") || srcCat.includes("pool")) {
          setCategory("chemical")
        } else if (srcCat.includes("pump") || srcCat.includes("filter") || srcCat.includes("plumbing") || srcCat.includes("electrical")) {
          setCategory("part")
        } else if (srcCat.includes("tool")) {
          setCategory("tool")
        } else if (srcCat.includes("equip")) {
          setCategory("equipment")
        } else if (srcCat === "labor") {
          setCategory("other")
        } else if (srcCat) {
          setCategory("part")
        }

        // Use catalog unit if available
        if (result.catalog_unit) {
          setUnit(result.catalog_unit)
        }
      } else {
        setScanMessage(`Barcode ${code} scanned but no product found — enter the name manually`)
      }
    } catch (err) {
      console.error("[AddItemDialog] UPC lookup failed:", err)
      setScanMessage(`Barcode ${code} scanned but lookup failed — enter the name manually`)
    } finally {
      setLookingUp(false)
    }
  }

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
          <DialogTitle>{showScanner ? "Scan Barcode" : "Add Inventory Item"}</DialogTitle>
        </DialogHeader>

        {/* Inline barcode scanner — replaces form temporarily */}
        {showScanner ? (
          <div className="flex flex-col gap-3 py-2">
            <BarcodeScanner
              onScan={handleBarcodeScan}
              onError={(err) => console.error("[AddItemDialog] scan error:", err)}
            />
            <Button variant="outline" onClick={() => setShowScanner(false)} className="w-full">
              Enter Manually Instead
            </Button>
          </div>
        ) : (
        <>
        <div className="flex flex-col gap-4 py-2">
          {/* Scan button — primary action, big and prominent */}
          {!itemName && !barcode && (
            <Button
              type="button"
              variant="outline"
              className="w-full h-14 text-base font-medium border-primary/30 hover:border-primary/60 hover:bg-primary/5 transition-colors cursor-pointer"
              onClick={() => setShowScanner(true)}
            >
              <ScanBarcodeIcon className="h-5 w-5 mr-2.5" />
              Scan Barcode to Add
            </Button>
          )}

          {barcode && (
            <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2">
              <ScanBarcodeIcon className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm text-muted-foreground truncate">Scanned: {barcode}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="ml-auto h-6 px-2 text-xs cursor-pointer"
                onClick={() => setShowScanner(true)}
              >
                Rescan
              </Button>
            </div>
          )}

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          {scanMessage && (
            <p className="text-sm text-amber-400">{scanMessage}</p>
          )}
          {lookingUp && (
            <p className="text-sm text-muted-foreground animate-pulse">Looking up product...</p>
          )}

          <div className="flex flex-col gap-1.5 relative">
            <Label htmlFor="item-name">Item Name</Label>
            <Input
              id="item-name"
              value={itemName}
              onChange={(e) => handleNameChange(e.target.value)}
              onFocus={() => searchResults.length > 0 && setShowResults(true)}
              onBlur={() => setTimeout(() => setShowResults(false), 200)}
              placeholder={lookingUp ? "Looking up..." : "Search catalog or type name..."}
              autoFocus={!!itemName || !!barcode}
              autoComplete="off"
              disabled={lookingUp}
            />
            {/* Catalog search dropdown */}
            {showResults && searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 z-50 mt-1 max-h-48 overflow-y-auto rounded-md border border-border bg-popover shadow-md">
                {searchResults.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm hover:bg-muted/50 transition-colors flex items-center justify-between cursor-pointer"
                    onMouseDown={(e) => {
                      e.preventDefault()
                      selectCatalogItem(item)
                    }}
                  >
                    <span className="truncate">{item.name}</span>
                    <span className="text-xs text-muted-foreground ml-2 shrink-0 capitalize">{item.category}</span>
                  </button>
                ))}
              </div>
            )}
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

        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? "Adding..." : "Add Item"}
          </Button>
        </DialogFooter>
        </>
        )}
      </DialogContent>
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
// Return to Warehouse Dialog (tech view only)
// ---------------------------------------------------------------------------

interface ReturnToWarehouseDialogProps {
  item: TruckInventoryItem
  techId: string
  onSuccess: (updatedItem: TruckInventoryItem) => void
  onClose: () => void
}

function ReturnToWarehouseDialog({ item, techId, onSuccess, onClose }: ReturnToWarehouseDialogProps) {
  const [isPending, startTransition] = useTransition()
  const [quantityStr, setQuantityStr] = useState("1")
  const [error, setError] = useState<string | null>(null)

  const maxQty = parseFloat(item.quantity)

  function handleReturn() {
    const quantity = parseFloat(quantityStr)
    if (isNaN(quantity) || quantity <= 0) {
      setError("Enter a valid quantity greater than 0")
      return
    }
    if (quantity > maxQty) {
      setError(`Only ${formatQuantity(item.quantity)} ${item.unit} on truck`)
      return
    }
    setError(null)

    startTransition(async () => {
      try {
        const result = await returnToWarehouse(item.id, techId, quantity)
        if (!result.success) {
          setError(result.error ?? "Return failed")
          return
        }
        const newQty = Math.max(0, maxQty - quantity)
        onSuccess({ ...item, quantity: String(newQty) })
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Return failed")
      }
    })
  }

  return (
    <DialogContent className="sm:max-w-[360px]">
      <DialogHeader>
        <DialogTitle>Return to Warehouse</DialogTitle>
      </DialogHeader>

      <div className="flex flex-col gap-4 py-2">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{item.item_name}</span>
          {" — "}
          {formatQuantity(item.quantity)} {item.unit} on truck
        </p>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex flex-col gap-1.5">
          <Label>Quantity to return</Label>
          <Input
            type="text"
            inputMode="decimal"
            value={quantityStr}
            onChange={(e) => {
              const v = e.target.value
              if (/^\d*\.?\d*$/.test(v)) setQuantityStr(v)
            }}
            onBlur={() => {
              if (!quantityStr.endsWith(".")) {
                const parsed = parseFloat(quantityStr)
                if (!isNaN(parsed)) setQuantityStr(String(parsed))
              }
            }}
            autoFocus
          />
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={isPending} className="cursor-pointer">
          Cancel
        </Button>
        <Button onClick={handleReturn} disabled={isPending} className="cursor-pointer">
          {isPending ? "Returning..." : "Return to Warehouse"}
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
  onReturnToWarehouse?: (item: TruckInventoryItem) => void
  isOfficeView: boolean
}

function InventoryRow({ item, onUpdate, onDelete, onTransfer, onReturnToWarehouse, isOfficeView }: InventoryRowProps) {
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
        {!isOfficeView && onReturnToWarehouse && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-muted-foreground cursor-pointer"
            onClick={() => onReturnToWarehouse(item)}
            disabled={parseFloat(item.quantity) <= 0}
          >
            Return
          </Button>
        )}
        {isOfficeView && onTransfer && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-muted-foreground cursor-pointer"
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
  const [returnItem, setReturnItem] = useState<TruckInventoryItem | null>(null)

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
                  onReturnToWarehouse={!isOfficeView ? (i) => setReturnItem(i) : undefined}
                  isOfficeView={isOfficeView}
                />
              ))}
            </div>
          </div>
        )
      })}

      {/* Add item dialog — only mount AddItemDialog when open so scanner state resets */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        {showAddDialog && (
          <AddItemDialog
            techId={techId}
            onSuccess={handleItemAdded}
            onClose={() => setShowAddDialog(false)}
          />
        )}
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

      {/* Return to Warehouse dialog */}
      <Dialog open={!!returnItem} onOpenChange={() => setReturnItem(null)}>
        {returnItem && (
          <ReturnToWarehouseDialog
            item={returnItem}
            techId={techId}
            onSuccess={(updated) => {
              handleItemUpdated(updated)
              setReturnItem(null)
            }}
            onClose={() => setReturnItem(null)}
          />
        )}
      </Dialog>
    </div>
  )
}
