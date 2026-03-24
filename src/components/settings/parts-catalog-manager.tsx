"use client"

import { useRef, useState, useTransition } from "react"
import dynamic from "next/dynamic"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  PlusIcon,
  PencilIcon,
  Trash2Icon,
  SearchIcon,
  EyeOffIcon,
  EyeIcon,
} from "lucide-react"
import {
  getCatalogItems,
  addCatalogItem,
  updateCatalogItem,
  deleteCatalogItem,
  type CatalogItem,
  type AddCatalogItemInput,
} from "@/actions/parts-catalog"

const BarcodeScanner = dynamic(
  () => import("@/components/field/barcode-scanner").then((m) => m.BarcodeScanner),
  { ssr: false }
)

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORIES = [
  "All",
  "Pump",
  "Filter",
  "Chemical",
  "Plumbing",
  "Electrical",
  "Labor",
  "Other",
] as const

type CategoryFilter = (typeof CATEGORIES)[number]

const UNIT_OPTIONS = ["each", "hour", "foot", "gallon", "bag", "lb", "oz", "pair", "set", "kit"]

const CATEGORY_BADGE_CLASSES: Record<string, string> = {
  Pump: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  Filter: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  Chemical: "bg-green-500/15 text-green-400 border-green-500/30",
  Plumbing: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
  Electrical: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  Labor: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  Other: "bg-muted text-muted-foreground border-border/50",
}

// ---------------------------------------------------------------------------
// CatalogItemForm state
// ---------------------------------------------------------------------------

interface FormState {
  name: string
  description: string
  category: string
  sku: string
  // Decimal inputs as strings (MEMORY.md controlled input pattern)
  defaultCostPrice: string
  defaultSellPrice: string
  defaultUnit: string
  isLabor: boolean
}

function emptyForm(): FormState {
  return {
    name: "",
    description: "",
    category: "",
    sku: "",
    defaultCostPrice: "",
    defaultSellPrice: "",
    defaultUnit: "each",
    isLabor: false,
  }
}

function formFromItem(item: CatalogItem): FormState {
  return {
    name: item.name,
    description: item.description ?? "",
    category: item.category ?? "",
    sku: item.sku ?? "",
    defaultCostPrice: item.default_cost_price ?? "",
    defaultSellPrice: item.default_sell_price ?? "",
    defaultUnit: item.default_unit ?? "each",
    isLabor: item.is_labor,
  }
}

// ---------------------------------------------------------------------------
// PartsCatalogManager
// ---------------------------------------------------------------------------

interface PartsCatalogManagerProps {
  initialItems: CatalogItem[]
}

export function PartsCatalogManager({ initialItems }: PartsCatalogManagerProps) {
  const [items, setItems] = useState<CatalogItem[]>(initialItems)
  const [searchQuery, setSearchQuery] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("All")
  const [showInactive, setShowInactive] = useState(false)
  const [dialogMode, setDialogMode] = useState<"add" | "edit" | null>(null)
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [isRefreshing, startRefreshTransition] = useTransition()
  const [showScanner, setShowScanner] = useState(false)
  const [lookingUp, setLookingUp] = useState(false)

  function patchForm(patch: Partial<FormState>) {
    setForm((prev) => ({ ...prev, ...patch }))
  }

  function openAdd() {
    setForm(emptyForm())
    setEditingItemId(null)
    setDialogMode("add")
  }

  function openEdit(item: CatalogItem) {
    setForm(formFromItem(item))
    setEditingItemId(item.id)
    setDialogMode("edit")
  }

  function closeDialog() {
    setDialogMode(null)
    setEditingItemId(null)
    setShowScanner(false)
    setLookingUp(false)
  }

  async function handleBarcodeScan(code: string) {
    setShowScanner(false)
    setLookingUp(true)
    try {
      const { resolveBarcode } = await import("@/actions/barcode")
      const result = await resolveBarcode(code)
      if (result.found && result.item_name) {
        patchForm({ name: result.item_name, sku: code })
      } else {
        patchForm({ sku: code })
      }
    } catch (err) {
      console.error("[PartsCatalog] UPC lookup failed:", err)
      patchForm({ sku: code })
    } finally {
      setLookingUp(false)
    }
  }

  async function refreshItems() {
    startRefreshTransition(async () => {
      const all = await getCatalogItems(undefined, undefined)
      // Also fetch inactive ones if showing them — just re-fetch all
      setItems(all)
    })
  }

  function handleSave() {
    if (!form.name.trim()) {
      toast.error("Item name is required")
      return
    }

    startTransition(async () => {
      const input: AddCatalogItemInput = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        category: form.category || undefined,
        sku: form.sku.trim() || undefined,
        defaultCostPrice: form.defaultCostPrice || undefined,
        defaultSellPrice: form.defaultSellPrice || undefined,
        defaultUnit: form.defaultUnit || undefined,
        isLabor: form.isLabor,
      }

      if (dialogMode === "add") {
        const result = await addCatalogItem(input)
        if (!result.success) {
          toast.error("Failed to add item", { description: result.error })
          return
        }

        // Optimistic — add to local state
        const optimistic: CatalogItem = {
          id: result.id ?? crypto.randomUUID(),
          org_id: "",
          name: form.name.trim(),
          description: form.description.trim() || null,
          category: form.category || null,
          sku: form.sku.trim() || null,
          default_cost_price: form.defaultCostPrice || null,
          default_sell_price: form.defaultSellPrice || null,
          default_unit: form.defaultUnit || null,
          is_labor: form.isLabor,
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        }
        setItems((prev) => [optimistic, ...prev])
        toast.success("Item added to catalog")
      } else if (dialogMode === "edit" && editingItemId) {
        const result = await updateCatalogItem(editingItemId, input)
        if (!result.success) {
          toast.error("Failed to update item", { description: result.error })
          return
        }

        setItems((prev) =>
          prev.map((i) =>
            i.id === editingItemId
              ? {
                  ...i,
                  name: form.name.trim(),
                  description: form.description.trim() || null,
                  category: form.category || null,
                  sku: form.sku.trim() || null,
                  default_cost_price: form.defaultCostPrice || null,
                  default_sell_price: form.defaultSellPrice || null,
                  default_unit: form.defaultUnit || null,
                  is_labor: form.isLabor,
                  updated_at: new Date(),
                }
              : i
          )
        )
        toast.success("Item updated")
      }

      closeDialog()
    })
  }

  function handleDelete(itemId: string) {
    startTransition(async () => {
      const result = await deleteCatalogItem(itemId)
      if (!result.success) {
        toast.error("Failed to remove item", { description: result.error })
        return
      }
      setItems((prev) =>
        prev.map((i) => (i.id === itemId ? { ...i, is_active: false } : i))
      )
      setDeleteConfirmId(null)
      toast.success("Item removed from catalog")
    })
  }

  // Filter items
  const filtered = items.filter((item) => {
    if (!showInactive && !item.is_active) return false
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      if (!item.name.toLowerCase().includes(q)) return false
    }
    if (categoryFilter !== "All") {
      if (item.category !== categoryFilter) return false
    }
    return true
  })

  return (
    <div className="flex flex-col gap-4">
      {/* ── Toolbar ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-40">
          <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-8 h-8 text-sm"
            placeholder="Search items…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Button
          type="button"
          size="sm"
          onClick={openAdd}
          className="cursor-pointer shrink-0"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          Add Item
        </Button>
      </div>

      {/* ── Category filter tabs ──────────────────────────────────────── */}
      <div className="flex gap-1.5 flex-wrap">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setCategoryFilter(cat)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors cursor-pointer ${
              categoryFilter === cat
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:bg-accent"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* ── Show inactive toggle ──────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setShowInactive((v) => !v)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          {showInactive ? (
            <EyeOffIcon className="h-3.5 w-3.5" />
          ) : (
            <EyeIcon className="h-3.5 w-3.5" />
          )}
          {showInactive ? "Hide inactive items" : "Show inactive items"}
        </button>
        {isRefreshing && <span className="text-xs text-muted-foreground">Refreshing…</span>}
      </div>

      {/* ── Item list ─────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 bg-muted/5 px-4 py-6 text-center">
          <p className="text-sm text-muted-foreground">
            {searchQuery || categoryFilter !== "All"
              ? "No items match your filter."
              : "No catalog items yet. Add your first item."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {filtered.map((item) => (
            <div
              key={item.id}
              className={`flex items-start justify-between gap-3 p-3 rounded-xl border border-border/60 bg-muted/5 hover:bg-muted/10 transition-colors ${
                !item.is_active ? "opacity-50" : ""
              }`}
            >
              <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium leading-tight">{item.name}</span>
                  {item.category && (
                    <span
                      className={`text-[10px] px-1.5 py-0 rounded-sm border font-medium ${
                        CATEGORY_BADGE_CLASSES[item.category] ?? CATEGORY_BADGE_CLASSES.Other
                      }`}
                    >
                      {item.category}
                    </span>
                  )}
                  {item.is_labor && (
                    <span className="text-[10px] bg-amber-500/15 text-amber-400 border border-amber-500/30 px-1.5 py-0 rounded-sm font-medium">
                      Labor
                    </span>
                  )}
                  {!item.is_active && (
                    <span className="text-[10px] bg-muted text-muted-foreground border border-border/50 px-1.5 py-0 rounded-sm">
                      Inactive
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                  {item.sku && <span>SKU: {item.sku}</span>}
                  {item.default_cost_price && (
                    <span>Cost: ${parseFloat(item.default_cost_price as string).toFixed(2)}</span>
                  )}
                  {item.default_sell_price && (
                    <span className="text-foreground/70 font-medium">
                      Sell: ${parseFloat(item.default_sell_price as string).toFixed(2)}
                    </span>
                  )}
                  {item.default_unit && <span>{item.default_unit}</span>}
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => openEdit(item)}
                  disabled={!item.is_active}
                  className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="Edit item"
                >
                  <PencilIcon className="h-3.5 w-3.5" />
                </button>
                {item.is_active && (
                  <button
                    type="button"
                    onClick={() => setDeleteConfirmId(item.id)}
                    className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                    aria-label="Remove item"
                  >
                    <Trash2Icon className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Add / Edit dialog ────────────────────────────────────────── */}
      <Dialog
        open={dialogMode !== null}
        onOpenChange={(open) => { if (!open) closeDialog() }}
      >
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {showScanner ? "Scan Barcode" : dialogMode === "add" ? "Add Catalog Item" : "Edit Catalog Item"}
            </DialogTitle>
          </DialogHeader>

          {showScanner ? (
            <div className="flex flex-col gap-3 py-2">
              <BarcodeScanner
                onScan={handleBarcodeScan}
                onError={(err) => console.error("[PartsCatalog] scan error:", err)}
              />
              <Button variant="outline" onClick={() => setShowScanner(false)} className="w-full">
                Back to Form
              </Button>
            </div>
          ) : (
          <>
          <div className="flex flex-col gap-4">
            {lookingUp && (
              <p className="text-sm text-muted-foreground animate-pulse">Looking up product...</p>
            )}
            {/* Name */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ci-name" className="text-xs text-muted-foreground">
                Name <span className="text-destructive">*</span>
              </Label>
              <div className="flex gap-2">
                <Input
                  id="ci-name"
                  className="h-8 text-sm flex-1"
                  placeholder={lookingUp ? "Looking up..." : "e.g. Hayward Super Pump 1.5HP"}
                  value={form.name}
                  onChange={(e) => patchForm({ name: e.target.value })}
                  disabled={lookingUp}
                />
                {dialogMode === "add" && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowScanner(true)}
                  >
                    Scan
                  </Button>
                )}
              </div>
            </div>

            {/* Description */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ci-description" className="text-xs text-muted-foreground">
                Description
              </Label>
              <Input
                id="ci-description"
                className="h-8 text-sm"
                placeholder="Optional notes"
                value={form.description}
                onChange={(e) => patchForm({ description: e.target.value })}
              />
            </div>

            {/* Category + SKU row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ci-category" className="text-xs text-muted-foreground">
                  Category
                </Label>
                <Select
                  value={form.category || "_none"}
                  onValueChange={(v) => patchForm({ category: v === "_none" ? "" : v })}
                >
                  <SelectTrigger id="ci-category" className="h-8 text-sm">
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">None</SelectItem>
                    {CATEGORIES.filter((c) => c !== "All").map((cat) => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ci-sku" className="text-xs text-muted-foreground">SKU</Label>
                <Input
                  id="ci-sku"
                  className="h-8 text-sm"
                  placeholder="Optional"
                  value={form.sku}
                  onChange={(e) => patchForm({ sku: e.target.value })}
                />
              </div>
            </div>

            {/* Pricing row */}
            <div className="grid grid-cols-3 gap-2">
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">Cost Price</Label>
                <Input
                  className="h-8 text-sm"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={form.defaultCostPrice}
                  onChange={(e) => patchForm({ defaultCostPrice: e.target.value })}
                  onBlur={() => {
                    const n = parseFloat(form.defaultCostPrice)
                    if (!isNaN(n)) patchForm({ defaultCostPrice: n.toFixed(2) })
                    else if (form.defaultCostPrice !== "") patchForm({ defaultCostPrice: "" })
                  }}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">Sell Price</Label>
                <Input
                  className="h-8 text-sm"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={form.defaultSellPrice}
                  onChange={(e) => patchForm({ defaultSellPrice: e.target.value })}
                  onBlur={() => {
                    const n = parseFloat(form.defaultSellPrice)
                    if (!isNaN(n)) patchForm({ defaultSellPrice: n.toFixed(2) })
                    else if (form.defaultSellPrice !== "") patchForm({ defaultSellPrice: "" })
                  }}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">Unit</Label>
                <Select
                  value={form.defaultUnit}
                  onValueChange={(v) => patchForm({ defaultUnit: v })}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNIT_OPTIONS.map((u) => (
                      <SelectItem key={u} value={u}>{u}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Is labor checkbox */}
            <div className="flex items-center gap-2">
              <Checkbox
                id="ci-labor"
                checked={form.isLabor}
                onCheckedChange={(c) => patchForm({ isLabor: !!c })}
                className="cursor-pointer"
              />
              <Label htmlFor="ci-labor" className="text-xs cursor-pointer">
                This is a labor item (not a physical part)
              </Label>
            </div>
          </div>

          <DialogFooter className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={closeDialog}
              disabled={isPending}
              className="cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={isPending}
              className="cursor-pointer"
            >
              {isPending ? "Saving…" : dialogMode === "add" ? "Add Item" : "Save Changes"}
            </Button>
          </DialogFooter>
          </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Delete confirmation ───────────────────────────────────────── */}
      <Dialog
        open={deleteConfirmId !== null}
        onOpenChange={(open) => { if (!open) setDeleteConfirmId(null) }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove Catalog Item?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            The item will be marked inactive and hidden from new line item searches.
            Existing line items that reference it are unaffected.
          </p>
          <DialogFooter className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDeleteConfirmId(null)}
              disabled={isPending}
              className="cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
              disabled={isPending}
              className="cursor-pointer"
            >
              {isPending ? "Removing…" : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
