"use client"

/**
 * Phase 13: Shopping List View
 *
 * Shows shopping list items grouped by status with lifecycle transition buttons.
 * Supports full procurement lifecycle: needed -> ordered -> received -> loaded -> used.
 *
 * Features:
 * - Status group cards with transition actions
 * - Source badges (WO/project/manual/forecast/low_inventory)
 * - Urgency flag toggle
 * - Add item dialog with optional barcode scan
 * - Vendor prompt on "Mark Ordered"
 * - Barcode scan on "Mark Loaded"
 */

import { useRef, useState, useTransition } from "react"
import { ScanBarcodeIcon } from "lucide-react"
import dynamic from "next/dynamic"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
import {
  addShoppingListItem,
  transitionShoppingListItem,
  deleteShoppingListItem,
  flagUrgent,
  unflagUrgent,
} from "@/actions/shopping-lists"
import type { ShoppingListItem, ShoppingListStatus } from "@/actions/shopping-lists"

// Dynamic imports for barcode scanner (camera API — SSR unsafe)
const BarcodeScannerDialog = dynamic(
  () => import("@/components/field/barcode-scanner").then((m) => m.BarcodeScannerDialog),
  { ssr: false }
)
const BarcodeScanner = dynamic(
  () => import("@/components/field/barcode-scanner").then((m) => m.BarcodeScanner),
  { ssr: false }
)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ShoppingListViewProps {
  techId?: string | null
  initialItems: ShoppingListItem[]
  isOfficeView?: boolean
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_ORDER: ShoppingListStatus[] = ["needed", "ordered", "received", "loaded", "used"]

const STATUS_LABELS: Record<ShoppingListStatus, string> = {
  needed: "Needed",
  ordered: "Ordered",
  received: "Received",
  loaded: "Loaded on Truck",
  used: "Used",
}

const NEXT_ACTION_LABELS: Partial<Record<ShoppingListStatus, string>> = {
  needed: "Mark Ordered",
  ordered: "Mark Received",
  received: "Mark Loaded",
  loaded: "Mark Used",
}

const SOURCE_BADGE_LABELS: Record<string, string> = {
  manual: "Manual",
  work_order: "WO",
  project: "Project",
  low_inventory: "Low Stock",
  forecast: "Forecast",
}

const COMMON_UNITS = ["oz", "floz", "gallon", "quart", "cup", "lbs", "each", "box", "bag", "roll"]
const CATEGORIES = ["chemical", "part", "tool", "equipment", "other"]

// ---------------------------------------------------------------------------
// Source badge
// ---------------------------------------------------------------------------

function SourceBadge({ sourceType }: { sourceType: string | null }) {
  if (!sourceType || sourceType === "manual") return null

  const label = SOURCE_BADGE_LABELS[sourceType] ?? sourceType
  const colorMap: Record<string, string> = {
    work_order: "border-blue-500/40 text-blue-400",
    project: "border-purple-500/40 text-purple-400",
    low_inventory: "border-amber-500/40 text-amber-400",
    forecast: "border-cyan-500/40 text-cyan-400",
  }

  return (
    <Badge
      variant="outline"
      className={cn("text-[10px] shrink-0", colorMap[sourceType] ?? "border-muted-foreground/30 text-muted-foreground")}
    >
      {label}
    </Badge>
  )
}

// ---------------------------------------------------------------------------
// Order Dialog (prompt for vendor info)
// ---------------------------------------------------------------------------

interface OrderDialogProps {
  item: ShoppingListItem
  onConfirm: (vendor: string, poReference: string) => void
  onClose: () => void
}

function OrderDialog({ item, onConfirm, onClose }: OrderDialogProps) {
  const [vendor, setVendor] = useState("")
  const [poRef, setPoRef] = useState("")

  return (
    <DialogContent className="sm:max-w-[380px]">
      <DialogHeader>
        <DialogTitle>Mark as Ordered</DialogTitle>
      </DialogHeader>

      <div className="flex flex-col gap-4 py-2">
        <p className="text-sm text-muted-foreground">
          {item.item_name} — {item.quantity_needed} {item.unit}
        </p>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="vendor">Vendor (optional)</Label>
          <Input
            id="vendor"
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
            placeholder="e.g. Pool Supply World"
            autoFocus
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="po-ref">PO / Order Reference (optional)</Label>
          <Input
            id="po-ref"
            value={poRef}
            onChange={(e) => setPoRef(e.target.value)}
            placeholder="e.g. PO-2024-001"
          />
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={() => onConfirm(vendor, poRef)}>Confirm Order</Button>
      </DialogFooter>
    </DialogContent>
  )
}

// ---------------------------------------------------------------------------
// Add Item Dialog
// ---------------------------------------------------------------------------

interface AddItemDialogProps {
  techId?: string | null
  onSuccess: (item: ShoppingListItem) => void
  onClose: () => void
}

function AddItemDialog({ techId, onSuccess, onClose }: AddItemDialogProps) {
  const [isPending, startTransition] = useTransition()
  const [showScanner, setShowScanner] = useState(false)
  const [lookingUp, setLookingUp] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [itemName, setItemName] = useState("")
  const [category, setCategory] = useState("chemical")
  const [quantityStr, setQuantityStr] = useState("1")
  const [unit, setUnit] = useState("oz")
  const [isUrgent, setIsUrgent] = useState(false)
  const [notes, setNotes] = useState("")

  // Catalog search
  const [searchResults, setSearchResults] = useState<Array<{ id: string; name: string; category: string; unit: string; source: string }>>([])
  const [showResults, setShowResults] = useState(false)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleNameChange(value: string) {
    setItemName(value)
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

  async function handleBarcodeScan(code: string) {
    setItemName(code)
    setShowScanner(false)
    setLookingUp(true)
    try {
      const { resolveBarcode } = await import("@/actions/barcode")
      const result = await resolveBarcode(code)
      if (result.found && result.item_name) {
        setItemName(result.item_name)
      }
    } catch (err) {
      console.error("[AddItemDialog] UPC lookup failed:", err)
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
    if (isNaN(quantity) || quantity <= 0) {
      setError("Enter a valid quantity")
      return
    }
    setError(null)

    startTransition(async () => {
      try {
        const result = await addShoppingListItem({
          itemName: itemName.trim(),
          category,
          quantityNeeded: quantity,
          unit,
          techId: techId ?? null,
          sourceType: "manual",
          isUrgent,
          notes: notes.trim() || null,
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
          <DialogTitle>{showScanner ? "Scan Barcode" : "Add to Shopping List"}</DialogTitle>
        </DialogHeader>

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
          {/* Scan button — primary action */}
          {!itemName && (
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

          {error && <p className="text-sm text-destructive">{error}</p>}
          {lookingUp && (
            <p className="text-sm text-muted-foreground animate-pulse">Looking up product...</p>
          )}

          <div className="flex flex-col gap-1.5 relative">
            <Label htmlFor="add-item-name">Item Name</Label>
            <Input
              id="add-item-name"
              value={itemName}
              onChange={(e) => handleNameChange(e.target.value)}
              onFocus={() => searchResults.length > 0 && setShowResults(true)}
              onBlur={() => setTimeout(() => setShowResults(false), 200)}
              placeholder={lookingUp ? "Looking up..." : "Search catalog or type name..."}
              autoFocus={!!itemName}
              autoComplete="off"
              className="flex-1"
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
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c.charAt(0).toUpperCase() + c.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Unit</Label>
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMMON_UNITS.map((u) => (
                    <SelectItem key={u} value={u}>{u}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="add-quantity">Quantity Needed</Label>
            <Input
              id="add-quantity"
              type="text"
              inputMode="decimal"
              value={quantityStr}
              onChange={(e) => {
                const v = e.target.value
                if (/^\d*\.?\d*$/.test(v)) setQuantityStr(v)
              }}
              onBlur={() => {
                const p = parseFloat(quantityStr)
                if (!isNaN(p)) setQuantityStr(String(p))
              }}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="add-notes">Notes (optional)</Label>
            <Input
              id="add-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any details..."
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isUrgent}
              onChange={(e) => setIsUrgent(e.target.checked)}
              className="h-4 w-4 rounded border-border accent-primary"
            />
            <span className="text-sm">Mark as urgent</span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? "Adding..." : "Add to List"}
          </Button>
        </DialogFooter>
        </>
        )}
      </DialogContent>
    </>
  )
}

// ---------------------------------------------------------------------------
// Shopping List Item Row
// ---------------------------------------------------------------------------

interface ItemRowProps {
  item: ShoppingListItem
  onTransitioned: (updated: ShoppingListItem) => void
  onDeleted: (id: string) => void
  onFlagToggled: (updated: ShoppingListItem) => void
  isOfficeView: boolean
}

function ItemRow({ item, onTransitioned, onDeleted, onFlagToggled, isOfficeView }: ItemRowProps) {
  const [, startTransition] = useTransition()
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [showOrderDialog, setShowOrderDialog] = useState(false)
  const [showLoadScanner, setShowLoadScanner] = useState(false)

  const status = item.status as ShoppingListStatus
  const nextActionLabel = NEXT_ACTION_LABELS[status]

  function handleTransition(newStatus: ShoppingListStatus, data?: { vendor?: string; po_reference?: string }) {
    if (pendingAction) return
    setPendingAction(newStatus)

    startTransition(async () => {
      try {
        const updated = await transitionShoppingListItem(item.id, newStatus, data)
        if (updated) onTransitioned(updated)
      } catch (err) {
        console.error("Transition failed:", err)
      } finally {
        setPendingAction(null)
      }
    })
  }

  function handleNextAction() {
    if (status === "needed") {
      setShowOrderDialog(true)
    } else if (status === "received") {
      // Load can use barcode scan
      setShowLoadScanner(true)
    } else if (status === "ordered") {
      handleTransition("received")
    } else if (status === "loaded") {
      handleTransition("used")
    }
  }

  function handleFlagToggle() {
    startTransition(async () => {
      try {
        let updated: ShoppingListItem
        if (item.is_urgent) {
          updated = await unflagUrgent(item.id)
        } else {
          updated = await flagUrgent(item.id, "Flagged as urgent")
        }
        if (updated) onFlagToggled(updated)
      } catch (err) {
        console.error("Flag toggle failed:", err)
      }
    })
  }

  function handleDelete() {
    if (!isOfficeView) return
    startTransition(async () => {
      try {
        await deleteShoppingListItem(item.id)
        onDeleted(item.id)
      } catch (err) {
        console.error("Delete failed:", err)
      }
    })
  }

  return (
    <>
      <div
        className={cn(
          "flex items-start gap-3 rounded-lg border px-3 py-2.5",
          item.is_urgent ? "border-destructive/40 bg-destructive/5" : "border-border bg-card"
        )}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{item.item_name}</span>
            {item.is_urgent && (
              <Badge variant="destructive" className="text-[10px]">Urgent</Badge>
            )}
            <SourceBadge sourceType={item.source_type} />
          </div>

          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
            <span>{item.quantity_needed} {item.unit}</span>
            {item.vendor && <span>· {item.vendor}</span>}
            {item.po_reference && <span>· {item.po_reference}</span>}
          </div>

          {item.urgent_reason && item.is_urgent && (
            <p className="text-[11px] text-destructive/80 mt-0.5">{item.urgent_reason}</p>
          )}

          {item.notes && (
            <p className="text-[11px] text-muted-foreground mt-0.5 italic">{item.notes}</p>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
          {/* Urgency toggle */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn(
              "h-7 px-2 text-xs",
              item.is_urgent ? "text-destructive" : "text-muted-foreground"
            )}
            onClick={handleFlagToggle}
            title={item.is_urgent ? "Remove urgent flag" : "Flag as urgent"}
          >
            {item.is_urgent ? "! Urgent" : "Flag"}
          </Button>

          {/* Main action button */}
          {nextActionLabel && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={handleNextAction}
              disabled={!!pendingAction}
            >
              {pendingAction ? "..." : nextActionLabel}
            </Button>
          )}

          {/* Office can delete */}
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

      {/* Order dialog */}
      <Dialog open={showOrderDialog} onOpenChange={setShowOrderDialog}>
        <OrderDialog
          item={item}
          onConfirm={(vendor, poRef) => {
            setShowOrderDialog(false)
            handleTransition("ordered", { vendor, po_reference: poRef })
          }}
          onClose={() => setShowOrderDialog(false)}
        />
      </Dialog>

      {/* Barcode scan on load */}
      {showLoadScanner && (
        <BarcodeScannerDialog
          open={showLoadScanner}
          onOpenChange={(open) => {
            if (!open) {
              setShowLoadScanner(false)
              // Allow skipping scan — just mark loaded without barcode
              handleTransition("loaded")
            }
          }}
          onScan={() => {
            setShowLoadScanner(false)
            handleTransition("loaded")
          }}
        />
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Status Group
// ---------------------------------------------------------------------------

interface StatusGroupProps {
  status: ShoppingListStatus
  items: ShoppingListItem[]
  onTransitioned: (updated: ShoppingListItem) => void
  onDeleted: (id: string) => void
  onFlagToggled: (updated: ShoppingListItem) => void
  isOfficeView: boolean
  defaultCollapsed?: boolean
}

function StatusGroup({
  status,
  items,
  onTransitioned,
  onDeleted,
  onFlagToggled,
  isOfficeView,
  defaultCollapsed = false,
}: StatusGroupProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)

  if (items.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex items-center justify-between w-full text-left"
      >
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {STATUS_LABELS[status]}
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{items.length}</span>
          <span className="text-xs text-muted-foreground">{collapsed ? "+" : "−"}</span>
        </div>
      </button>

      {!collapsed && (
        <div className="flex flex-col gap-1.5">
          {items.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              onTransitioned={onTransitioned}
              onDeleted={onDeleted}
              onFlagToggled={onFlagToggled}
              isOfficeView={isOfficeView}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function ShoppingListView({ techId, initialItems, isOfficeView = false }: ShoppingListViewProps) {
  const [items, setItems] = useState<ShoppingListItem[]>(initialItems)
  const [showAddDialog, setShowAddDialog] = useState(false)

  // Group items by status
  const grouped = STATUS_ORDER.reduce<Record<ShoppingListStatus, ShoppingListItem[]>>(
    (acc, status) => {
      acc[status] = items.filter((i) => i.status === status)
      return acc
    },
    { needed: [], ordered: [], received: [], loaded: [], used: [] }
  )

  // Sort: urgent items first within each group
  for (const group of Object.values(grouped)) {
    group.sort((a, b) => {
      if (a.is_urgent && !b.is_urgent) return -1
      if (!a.is_urgent && b.is_urgent) return 1
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
  }

  const activeCount = grouped.needed.length + grouped.ordered.length + grouped.received.length + grouped.loaded.length

  function handleTransitioned(updated: ShoppingListItem) {
    setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)))
  }

  function handleDeleted(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id))
  }

  function handleFlagToggled(updated: ShoppingListItem) {
    setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)))
  }

  function handleAdded(newItem: ShoppingListItem) {
    setItems((prev) => [newItem, ...prev])
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {activeCount > 0
            ? `${activeCount} active item${activeCount !== 1 ? "s" : ""}`
            : items.length === 0
              ? "Shopping list is empty"
              : "All items fulfilled"}
        </p>
        <Button variant="outline" size="sm" onClick={() => setShowAddDialog(true)}>
          Add Item
        </Button>
      </div>

      {/* Empty state */}
      {items.length === 0 && (
        <p className="text-sm text-muted-foreground italic text-center py-6">
          No items on the shopping list. Add items manually or generate from work orders.
        </p>
      )}

      {/* Status groups */}
      {STATUS_ORDER.map((status) => (
        <StatusGroup
          key={status}
          status={status}
          items={grouped[status]}
          onTransitioned={handleTransitioned}
          onDeleted={handleDeleted}
          onFlagToggled={handleFlagToggled}
          isOfficeView={isOfficeView}
          // Collapse "used" by default to reduce clutter
          defaultCollapsed={status === "used"}
        />
      ))}

      {/* Add item dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        {showAddDialog && (
          <AddItemDialog
            techId={techId}
            onSuccess={handleAdded}
            onClose={() => setShowAddDialog(false)}
          />
        )}
      </Dialog>
    </div>
  )
}
