"use client"

/**
 * Phase 13: Warehouse Inventory View
 *
 * Central stock (tech_id = null). Office can add items and load them
 * to any tech's truck. No "Mark Used" — warehouse items aren't consumed
 * directly. No "Transfer" — use "Load to Truck" instead.
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
  loadFromWarehouse,
} from "@/actions/truck-inventory"
import type { TruckInventoryItem } from "@/actions/truck-inventory"

// Dynamic import for barcode scanner (camera API — SSR unsafe)
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

interface WarehouseInventoryViewProps {
  initialItems: TruckInventoryItem[]
  allTechs: Array<{ id: string; fullName: string }>
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

function formatQuantity(qty: string): string {
  return String(parseFloat(qty) || 0)
}

// ---------------------------------------------------------------------------
// Add Item Dialog (warehouse: tech_id = null)
// ---------------------------------------------------------------------------

interface AddWarehouseItemDialogProps {
  onSuccess: (newItem: TruckInventoryItem) => void
  onClose: () => void
}

function AddWarehouseItemDialog({ onSuccess, onClose }: AddWarehouseItemDialogProps) {
  const [isPending, startTransition] = useTransition()
  const [showScanner, setShowScanner] = useState(false)
  const [lookingUp, setLookingUp] = useState(false)
  const [scanMessage, setScanMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [itemName, setItemName] = useState("")
  const [category, setCategory] = useState<string>("chemical")
  const [quantityStr, setQuantityStr] = useState("1")
  const [unit, setUnit] = useState("oz")
  const [thresholdStr, setThresholdStr] = useState("0")
  const [barcode, setBarcode] = useState("")

  const [searchResults, setSearchResults] = useState<Array<{ id: string; name: string; category: string; unit: string; source: string }>>([])
  const [showResults, setShowResults] = useState(false)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleNameChange(value: string) {
    setItemName(value)
    if (scanMessage) setScanMessage(null)
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

  function mapCatalogCategory(cat: string): string {
    const c = cat.toLowerCase()
    if (c === "chemical" || c.includes("chlorine") || c.includes("pool")) return "chemical"
    if (c === "tool") return "tool"
    if (c === "equipment") return "equipment"
    if (c === "pump" || c === "filter" || c === "plumbing" || c === "electrical") return "part"
    if (c === "other" || c === "labor") return "other"
    return "part"
  }

  function selectCatalogItem(item: typeof searchResults[0]) {
    setItemName(item.name)
    setCategory(mapCatalogCategory(item.category))
    setUnit(item.unit)
    setShowResults(false)
  }

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

        if (result.catalog_unit) setUnit(result.catalog_unit)
      } else {
        setScanMessage(`Barcode ${code} scanned but no product found — enter the name manually`)
      }
    } catch (err) {
      console.error("[AddWarehouseItemDialog] UPC lookup failed:", err)
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
          tech_id: null,
          item_name: itemName.trim(),
          category,
          quantity,
          unit,
          min_threshold: parseFloat(thresholdStr) || 0,
          on_truck: false,
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
          <DialogTitle>{showScanner ? "Scan Barcode" : "Add Warehouse Item"}</DialogTitle>
        </DialogHeader>

        {showScanner ? (
          <div className="flex flex-col gap-3 py-2">
            <BarcodeScanner
              onScan={handleBarcodeScan}
              onError={(err) => console.error("[AddWarehouseItemDialog] scan error:", err)}
            />
            <Button variant="outline" onClick={() => setShowScanner(false)} className="w-full cursor-pointer">
              Enter Manually Instead
            </Button>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-4 py-2">
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

              {error && <p className="text-sm text-destructive">{error}</p>}
              {scanMessage && <p className="text-sm text-amber-400">{scanMessage}</p>}
              {lookingUp && <p className="text-sm text-muted-foreground animate-pulse">Looking up product...</p>}

              <div className="flex flex-col gap-1.5 relative">
                <Label htmlFor="wh-item-name">Item Name</Label>
                <Input
                  id="wh-item-name"
                  value={itemName}
                  onChange={(e) => handleNameChange(e.target.value)}
                  onFocus={() => searchResults.length > 0 && setShowResults(true)}
                  onBlur={() => setTimeout(() => setShowResults(false), 200)}
                  placeholder={lookingUp ? "Looking up..." : "Search catalog or type name..."}
                  autoFocus={!!itemName || !!barcode}
                  autoComplete="off"
                  disabled={lookingUp}
                />
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
                  <Label htmlFor="wh-category">Category</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger id="wh-category">
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
                  <Label htmlFor="wh-unit">Unit</Label>
                  <Select value={unit} onValueChange={setUnit}>
                    <SelectTrigger id="wh-unit">
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
                  <Label htmlFor="wh-quantity">Quantity</Label>
                  <Input
                    id="wh-quantity"
                    type="text"
                    inputMode="decimal"
                    value={quantityStr}
                    onChange={(e) => {
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
                  <Label htmlFor="wh-threshold">Min Threshold</Label>
                  <Input
                    id="wh-threshold"
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
              <Button variant="outline" onClick={onClose} disabled={isPending} className="cursor-pointer">
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={isPending} className="cursor-pointer">
                {isPending ? "Adding..." : "Add to Warehouse"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </>
  )
}

// ---------------------------------------------------------------------------
// Load to Truck Dialog
// ---------------------------------------------------------------------------

interface LoadToTruckDialogProps {
  item: TruckInventoryItem
  allTechs: TechProfile[]
  onSuccess: (updatedItem: TruckInventoryItem) => void
  onClose: () => void
}

function LoadToTruckDialog({ item, allTechs, onSuccess, onClose }: LoadToTruckDialogProps) {
  const [isPending, startTransition] = useTransition()
  const [targetTechId, setTargetTechId] = useState("")
  const [quantityStr, setQuantityStr] = useState("1")
  const [error, setError] = useState<string | null>(null)

  const maxQty = parseFloat(item.quantity)

  function handleLoad() {
    if (!targetTechId) {
      setError("Select a tech to load to")
      return
    }
    const quantity = parseFloat(quantityStr)
    if (isNaN(quantity) || quantity <= 0) {
      setError("Enter a valid quantity greater than 0")
      return
    }
    if (quantity > maxQty) {
      setError(`Only ${formatQuantity(item.quantity)} ${item.unit} available`)
      return
    }
    setError(null)

    startTransition(async () => {
      try {
        const result = await loadFromWarehouse(item.id, targetTechId, quantity)
        if (!result.success) {
          setError(result.error ?? "Load failed")
          return
        }
        // Optimistically update warehouse item qty in UI
        const newQty = Math.max(0, maxQty - quantity)
        onSuccess({ ...item, quantity: String(newQty) })
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Load failed")
      }
    })
  }

  return (
    <DialogContent className="sm:max-w-[380px]">
      <DialogHeader>
        <DialogTitle>Load to Truck</DialogTitle>
      </DialogHeader>

      <div className="flex flex-col gap-4 py-2">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{item.item_name}</span>
          {" — "}
          {formatQuantity(item.quantity)} {item.unit} in warehouse
        </p>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex flex-col gap-1.5">
          <Label>Load to tech</Label>
          <Select value={targetTechId} onValueChange={setTargetTechId}>
            <SelectTrigger>
              <SelectValue placeholder="Select tech..." />
            </SelectTrigger>
            <SelectContent>
              {allTechs.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.fullName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Quantity to load</Label>
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
          />
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={isPending} className="cursor-pointer">
          Cancel
        </Button>
        <Button onClick={handleLoad} disabled={isPending} className="cursor-pointer">
          {isPending ? "Loading..." : "Load to Truck"}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}

// ---------------------------------------------------------------------------
// Warehouse Item Row
// ---------------------------------------------------------------------------

interface WarehouseItemRowProps {
  item: TruckInventoryItem
  allTechs: TechProfile[]
  onUpdate: (updated: TruckInventoryItem) => void
}

function WarehouseItemRow({ item, allTechs, onUpdate }: WarehouseItemRowProps) {
  const [loadDialogOpen, setLoadDialogOpen] = useState(false)

  const qty = parseFloat(item.quantity)
  const threshold = parseFloat(item.min_threshold)
  const belowThreshold = threshold > 0 && qty <= threshold

  return (
    <>
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
          {belowThreshold && threshold > 0 && (
            <p className="text-[11px] text-amber-400/80 mt-0.5">
              Threshold: {formatQuantity(item.min_threshold)} {item.unit}
            </p>
          )}
        </div>

        <span className="text-sm font-mono text-right shrink-0 text-muted-foreground">
          {formatQuantity(item.quantity)} {item.unit}
        </span>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-muted-foreground shrink-0 cursor-pointer"
          onClick={() => setLoadDialogOpen(true)}
          disabled={qty <= 0}
        >
          Load to Truck
        </Button>
      </div>

      <Dialog open={loadDialogOpen} onOpenChange={setLoadDialogOpen}>
        {loadDialogOpen && (
          <LoadToTruckDialog
            item={item}
            allTechs={allTechs}
            onSuccess={(updated) => {
              onUpdate(updated)
              setLoadDialogOpen(false)
            }}
            onClose={() => setLoadDialogOpen(false)}
          />
        )}
      </Dialog>
    </>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function WarehouseInventoryView({ initialItems, allTechs }: WarehouseInventoryViewProps) {
  const [items, setItems] = useState<TruckInventoryItem[]>(initialItems)
  const [showAddDialog, setShowAddDialog] = useState(false)

  const groups = groupByCategory(items)
  const lowCount = items.filter((i) => {
    const qty = parseFloat(i.quantity)
    const threshold = parseFloat(i.min_threshold)
    return threshold > 0 && qty <= threshold
  }).length

  function handleItemUpdated(updated: TruckInventoryItem) {
    setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)))
  }

  function handleItemAdded(newItem: TruckInventoryItem) {
    setItems((prev) => [...prev, newItem])
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Central stock — not assigned to any truck
          </p>
          {lowCount > 0 && (
            <p className="text-sm text-amber-400 mt-0.5">
              {lowCount} item{lowCount !== 1 ? "s" : ""} below threshold
            </p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowAddDialog(true)}
          className="cursor-pointer"
        >
          Add Item
        </Button>
      </div>

      {/* Empty state */}
      {items.length === 0 && (
        <p className="text-sm text-muted-foreground italic text-center py-6">
          No warehouse inventory. Add items to track central stock.
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
                <WarehouseItemRow
                  key={item.id}
                  item={item}
                  allTechs={allTechs}
                  onUpdate={handleItemUpdated}
                />
              ))}
            </div>
          </div>
        )
      })}

      {/* Add item dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        {showAddDialog && (
          <AddWarehouseItemDialog
            onSuccess={handleItemAdded}
            onClose={() => setShowAddDialog(false)}
          />
        )}
      </Dialog>
    </div>
  )
}
