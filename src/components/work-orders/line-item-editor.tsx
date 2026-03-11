"use client"

import { useState, useTransition, useEffect, useRef } from "react"
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
  ChevronUpIcon,
  ChevronDownIcon,
  SearchIcon,
  XIcon,
} from "lucide-react"
import {
  addLineItemToWorkOrder,
  updateLineItem,
  deleteLineItem,
  reorderLineItems,
  type WorkOrderLineItem,
  type AddLineItemInput,
} from "@/actions/work-orders"
import { getCatalogItems, addCatalogItem, type CatalogItem } from "@/actions/parts-catalog"
import type { OrgSettings } from "@/actions/company-settings"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LineItemEditorProps {
  workOrderId: string
  lineItems: WorkOrderLineItem[]
  orgSettings: Pick<
    OrgSettings,
    | "default_hourly_rate"
    | "default_parts_markup_pct"
    | "default_tax_rate"
  > | null
  editable: boolean
  onLineItemsChange?: (items: WorkOrderLineItem[]) => void
}

type ItemType = "part" | "labor" | "other"
type LaborType = "hourly" | "flat_rate"
type DiscountType = "percent" | "fixed"

interface FormState {
  // Catalog
  catalogItemId: string | null
  catalogItemName: string | null
  searchQuery: string
  // Core fields
  description: string
  itemType: ItemType
  laborType: LaborType
  // Decimal inputs as strings to avoid parseFloat pitfall (MEMORY.md)
  quantity: string
  unit: string
  unitCost: string
  unitPrice: string
  markupPct: string
  actualHours: string
  // Discount
  showDiscount: boolean
  discountType: DiscountType
  discountValue: string
  // Flags
  isTaxable: boolean
  isOptional: boolean
  saveToCatalog: boolean
}

const DEFAULT_UNITS = ["each", "hour", "foot", "gallon", "bag", "lb", "oz", "pair", "set", "kit"]

function defaultForm(orgSettings: LineItemEditorProps["orgSettings"]): FormState {
  return {
    catalogItemId: null,
    catalogItemName: null,
    searchQuery: "",
    description: "",
    itemType: "part",
    laborType: "hourly",
    quantity: "1",
    unit: "each",
    unitCost: "",
    unitPrice: "",
    markupPct: (orgSettings?.default_parts_markup_pct ?? "30") as string,
    actualHours: "",
    showDiscount: false,
    discountType: "percent",
    discountValue: "",
    isTaxable: true,
    isOptional: false,
    saveToCatalog: false,
  }
}

function formFromLineItem(item: WorkOrderLineItem): FormState {
  return {
    catalogItemId: item.catalog_item_id,
    catalogItemName: null,
    searchQuery: "",
    description: item.description,
    itemType: (item.item_type as ItemType) ?? "part",
    laborType: (item.labor_type as LaborType) ?? "hourly",
    quantity: item.quantity,
    unit: item.unit,
    unitCost: item.unit_cost ?? "",
    unitPrice: item.unit_price ?? "",
    markupPct: item.markup_pct ?? "",
    actualHours: item.actual_hours ?? "",
    showDiscount: !!item.discount_type,
    discountType: (item.discount_type as DiscountType) ?? "percent",
    discountValue: item.discount_value ?? "",
    isTaxable: item.is_taxable,
    isOptional: item.is_optional,
    saveToCatalog: false,
  }
}

// ---------------------------------------------------------------------------
// Calculation helpers
// ---------------------------------------------------------------------------

function calcLineTotal(item: WorkOrderLineItem): number {
  const qty = parseFloat(item.quantity) || 0
  const price = parseFloat(item.unit_price ?? "0") || 0
  let lineTotal = qty * price

  if (item.discount_type && item.discount_value) {
    const dv = parseFloat(item.discount_value) || 0
    if (item.discount_type === "percent") {
      lineTotal = lineTotal * (1 - dv / 100)
    } else {
      lineTotal = lineTotal - dv
    }
  }

  return Math.max(0, lineTotal)
}

function calcTotals(
  items: WorkOrderLineItem[],
  orgSettings: LineItemEditorProps["orgSettings"],
  taxExempt = false
) {
  const activeItems = items.filter((i) => !i.is_optional)
  const subtotal = activeItems.reduce((sum, i) => sum + calcLineTotal(i), 0)

  const taxRate = taxExempt ? 0 : parseFloat((orgSettings?.default_tax_rate as string | null | undefined) ?? "0.0875") || 0.0875
  const taxableSubtotal = activeItems
    .filter((i) => i.is_taxable)
    .reduce((sum, i) => sum + calcLineTotal(i), 0)
  const tax = taxableSubtotal * taxRate
  const total = subtotal + tax

  return { subtotal, tax, total }
}

// ---------------------------------------------------------------------------
// Catalog search hook
// ---------------------------------------------------------------------------

function useCatalogSearch(query: string, open: boolean) {
  const [results, setResults] = useState<CatalogItem[]>([])
  const [searching, setSearching] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!open || query.length < 1) {
      setResults([])
      return
    }

    if (timeoutRef.current) clearTimeout(timeoutRef.current)

    timeoutRef.current = setTimeout(async () => {
      setSearching(true)
      const items = await getCatalogItems(query)
      setResults(items)
      setSearching(false)
    }, 300)

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [query, open])

  return { results, searching }
}

// ---------------------------------------------------------------------------
// Type/labor badge colors
// ---------------------------------------------------------------------------

const TYPE_BADGE_CLASSES: Record<ItemType, string> = {
  part: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  labor: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  other: "bg-muted text-muted-foreground",
}

// ---------------------------------------------------------------------------
// LineItemForm — shared between add and edit modes
// ---------------------------------------------------------------------------

interface LineItemFormProps {
  form: FormState
  onChange: (next: Partial<FormState>) => void
  orgSettings: LineItemEditorProps["orgSettings"]
  mode: "add" | "edit"
}

function LineItemForm({ form, onChange, orgSettings }: LineItemFormProps) {
  const [catalogOpen, setCatalogOpen] = useState(form.searchQuery.length > 0)
  const { results: catalogResults, searching } = useCatalogSearch(form.searchQuery, catalogOpen)

  function handleSelectCatalogItem(item: CatalogItem) {
    const markupPct = orgSettings?.default_parts_markup_pct
      ? String(parseFloat(orgSettings.default_parts_markup_pct as string))
      : "30"

    // Apply markup to cost to compute sell price if not set
    const computedSellPrice = item.default_sell_price
      ? (item.default_sell_price as string)
      : item.default_cost_price
        ? String(
            parseFloat(item.default_cost_price as string) * (1 + parseFloat(markupPct) / 100)
          )
        : ""

    onChange({
      catalogItemId: item.id,
      catalogItemName: item.name,
      description: item.name,
      itemType: item.is_labor ? "labor" : "part",
      unit: item.default_unit ?? "each",
      unitCost: (item.default_cost_price as string | null | undefined) ?? "",
      unitPrice: computedSellPrice,
      isTaxable: !item.is_labor,
      searchQuery: item.name,
    })
    setCatalogOpen(false)
  }

  function handleClearCatalog() {
    onChange({
      catalogItemId: null,
      catalogItemName: null,
      searchQuery: "",
    })
    setCatalogOpen(false)
  }

  // When item type changes, update taxability default
  function handleItemTypeChange(type: ItemType) {
    onChange({
      itemType: type,
      isTaxable: type !== "labor",
    })
  }

  // Apply markup to compute sell price when cost or markup changes
  function applyMarkup(costStr: string, markupStr: string) {
    const cost = parseFloat(costStr)
    const markup = parseFloat(markupStr)
    if (isNaN(cost) || isNaN(markup)) return
    const sell = cost * (1 + markup / 100)
    onChange({ unitPrice: sell.toFixed(2) })
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── Catalog search ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1.5 relative">
        <Label className="text-xs text-muted-foreground">Search catalog (optional)</Label>
        <div className="relative">
          <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-8 pr-8 h-8 text-sm"
            placeholder="Search parts & labor…"
            value={form.searchQuery}
            onChange={(e) => {
              onChange({ searchQuery: e.target.value })
              setCatalogOpen(true)
            }}
            onFocus={() => {
              if (form.searchQuery.length > 0) setCatalogOpen(true)
            }}
          />
          {form.catalogItemId && (
            <button
              type="button"
              onClick={handleClearCatalog}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <XIcon className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Dropdown results */}
        {catalogOpen && form.searchQuery.length > 0 && (
          <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
            {searching && (
              <div className="px-3 py-2 text-xs text-muted-foreground">Searching…</div>
            )}
            {!searching && catalogResults.length === 0 && (
              <div className="px-3 py-2 text-xs text-muted-foreground">No catalog items found</div>
            )}
            {!searching && catalogResults.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectCatalogItem(item)}
                className="w-full text-left px-3 py-2 hover:bg-accent text-sm flex items-center justify-between cursor-pointer"
              >
                <div>
                  <p className="font-medium leading-tight">{item.name}</p>
                  {item.category && (
                    <p className="text-xs text-muted-foreground">{item.category}</p>
                  )}
                </div>
                {item.default_sell_price && (
                  <span className="text-xs text-muted-foreground ml-2 shrink-0">
                    ${parseFloat(item.default_sell_price).toFixed(2)}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Description ────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="li-description" className="text-xs text-muted-foreground">
          Description <span className="text-destructive">*</span>
        </Label>
        <Input
          id="li-description"
          className="h-8 text-sm"
          placeholder="e.g. Hayward Super Pump Motor"
          value={form.description}
          onChange={(e) => onChange({ description: e.target.value })}
        />
      </div>

      {/* ── Item type ──────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs text-muted-foreground">Type</Label>
        <div className="flex gap-2">
          {(["part", "labor", "other"] as ItemType[]).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => handleItemTypeChange(type)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                form.itemType === type
                  ? TYPE_BADGE_CLASSES[type] + " ring-1 ring-current"
                  : "border-border text-muted-foreground hover:bg-accent"
              }`}
            >
              {type === "part" ? "Part" : type === "labor" ? "Labor" : "Other"}
            </button>
          ))}
        </div>
      </div>

      {/* ── Labor type (only for labor items) ──────────────────────────── */}
      {form.itemType === "labor" && (
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">Labor Type</Label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onChange({ laborType: "hourly" })}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                form.laborType === "hourly"
                  ? "bg-amber-500/15 text-amber-400 border-amber-500/30 ring-1 ring-amber-400/50"
                  : "border-border text-muted-foreground hover:bg-accent"
              }`}
            >
              Hourly
            </button>
            <button
              type="button"
              onClick={() => onChange({ laborType: "flat_rate" })}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                form.laborType === "flat_rate"
                  ? "bg-amber-500/15 text-amber-400 border-amber-500/30 ring-1 ring-amber-400/50"
                  : "border-border text-muted-foreground hover:bg-accent"
              }`}
            >
              Flat Rate
            </button>
          </div>
        </div>
      )}

      {/* ── Quantity, Unit, Hours ───────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="li-quantity" className="text-xs text-muted-foreground">
            {form.itemType === "labor" && form.laborType === "hourly" ? "Est. Hours" : "Quantity"}
          </Label>
          <Input
            id="li-quantity"
            className="h-8 text-sm"
            inputMode="decimal"
            value={form.quantity}
            onChange={(e) => {
              const v = e.target.value
              // Per MEMORY.md: keep string, don't flush parseFloat("7.") which loses decimal
              onChange({ quantity: v })
            }}
            onBlur={() => {
              const n = parseFloat(form.quantity)
              if (!isNaN(n)) onChange({ quantity: String(n) })
            }}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="li-unit" className="text-xs text-muted-foreground">Unit</Label>
          <Select value={form.unit} onValueChange={(v) => onChange({ unit: v })}>
            <SelectTrigger id="li-unit" className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DEFAULT_UNITS.map((u) => (
                <SelectItem key={u} value={u}>{u}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── Actual hours (labor only) ──────────────────────────────────── */}
      {form.itemType === "labor" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="li-actual-hours" className="text-xs text-muted-foreground">
            Actual Hours (logged)
          </Label>
          <Input
            id="li-actual-hours"
            className="h-8 text-sm"
            inputMode="decimal"
            placeholder="0.0"
            value={form.actualHours}
            onChange={(e) => onChange({ actualHours: e.target.value })}
            onBlur={() => {
              const n = parseFloat(form.actualHours)
              if (!isNaN(n)) onChange({ actualHours: String(n) })
              else if (form.actualHours !== "") onChange({ actualHours: "" })
            }}
          />
        </div>
      )}

      {/* ── Pricing ──────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        <Label className="text-xs text-muted-foreground">Pricing</Label>

        {form.itemType === "part" && (
          <div className="grid grid-cols-3 gap-2">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground/70">Cost</span>
              <Input
                className="h-8 text-sm"
                inputMode="decimal"
                placeholder="0.00"
                value={form.unitCost}
                onChange={(e) => {
                  onChange({ unitCost: e.target.value })
                }}
                onBlur={() => {
                  const n = parseFloat(form.unitCost)
                  if (!isNaN(n)) {
                    onChange({ unitCost: n.toFixed(2) })
                    applyMarkup(n.toFixed(2), form.markupPct)
                  } else if (form.unitCost !== "") {
                    onChange({ unitCost: "" })
                  }
                }}
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground/70">Markup %</span>
              <Input
                className="h-8 text-sm"
                inputMode="decimal"
                placeholder={(orgSettings?.default_parts_markup_pct as string | null | undefined) ?? "30"}
                value={form.markupPct}
                onChange={(e) => onChange({ markupPct: e.target.value })}
                onBlur={() => {
                  const n = parseFloat(form.markupPct)
                  if (!isNaN(n)) {
                    onChange({ markupPct: String(n) })
                    applyMarkup(form.unitCost, String(n))
                  } else if (form.markupPct !== "") {
                    onChange({ markupPct: "" })
                  }
                }}
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground/70">Sell Price</span>
              <Input
                className="h-8 text-sm"
                inputMode="decimal"
                placeholder="0.00"
                value={form.unitPrice}
                onChange={(e) => onChange({ unitPrice: e.target.value })}
                onBlur={() => {
                  const n = parseFloat(form.unitPrice)
                  if (!isNaN(n)) onChange({ unitPrice: n.toFixed(2) })
                  else if (form.unitPrice !== "") onChange({ unitPrice: "" })
                }}
              />
            </div>
          </div>
        )}

        {form.itemType !== "part" && (
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground/70">
                {form.itemType === "labor" && form.laborType === "hourly" ? "Rate / Hour" : "Price"}
              </span>
              <Input
                className="h-8 text-sm"
                inputMode="decimal"
                placeholder={
                  form.itemType === "labor" && form.laborType === "hourly"
                    ? ((orgSettings?.default_hourly_rate as string | null | undefined) ?? "0.00")
                    : "0.00"
                }
                value={form.unitPrice}
                onChange={(e) => onChange({ unitPrice: e.target.value })}
                onBlur={() => {
                  const n = parseFloat(form.unitPrice)
                  if (!isNaN(n)) onChange({ unitPrice: n.toFixed(2) })
                  else if (form.unitPrice !== "") onChange({ unitPrice: "" })
                }}
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground/70">Cost</span>
              <Input
                className="h-8 text-sm"
                inputMode="decimal"
                placeholder="0.00"
                value={form.unitCost}
                onChange={(e) => onChange({ unitCost: e.target.value })}
                onBlur={() => {
                  const n = parseFloat(form.unitCost)
                  if (!isNaN(n)) onChange({ unitCost: n.toFixed(2) })
                  else if (form.unitCost !== "") onChange({ unitCost: "" })
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Per-item discount ─────────────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Checkbox
            id="li-discount"
            checked={form.showDiscount}
            onCheckedChange={(c) => onChange({ showDiscount: !!c })}
            className="cursor-pointer"
          />
          <Label htmlFor="li-discount" className="text-xs cursor-pointer">
            Apply per-item discount
          </Label>
        </div>

        {form.showDiscount && (
          <div className="grid grid-cols-3 gap-2 pl-6">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground/70">Type</span>
              <Select
                value={form.discountType}
                onValueChange={(v) => onChange({ discountType: v as DiscountType })}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percent">%</SelectItem>
                  <SelectItem value="fixed">$</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 flex flex-col gap-1">
              <span className="text-xs text-muted-foreground/70">
                Value {form.discountType === "percent" ? "(%)" : "($)"}
              </span>
              <Input
                className="h-8 text-sm"
                inputMode="decimal"
                placeholder="0"
                value={form.discountValue}
                onChange={(e) => onChange({ discountValue: e.target.value })}
                onBlur={() => {
                  const n = parseFloat(form.discountValue)
                  if (!isNaN(n)) onChange({ discountValue: String(n) })
                  else if (form.discountValue !== "") onChange({ discountValue: "" })
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Flags ────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Checkbox
            id="li-taxable"
            checked={form.isTaxable}
            onCheckedChange={(c) => onChange({ isTaxable: !!c })}
            className="cursor-pointer"
          />
          <Label htmlFor="li-taxable" className="text-xs cursor-pointer">
            Taxable
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="li-optional"
            checked={form.isOptional}
            onCheckedChange={(c) => onChange({ isOptional: !!c })}
            className="cursor-pointer"
          />
          <Label htmlFor="li-optional" className="text-xs cursor-pointer">
            Optional (customer can include/exclude on quote approval)
          </Label>
        </div>

        {/* Save to catalog — only for custom items (no catalogItemId set) */}
        {!form.catalogItemId && (
          <div className="flex items-center gap-2">
            <Checkbox
              id="li-save-catalog"
              checked={form.saveToCatalog}
              onCheckedChange={(c) => onChange({ saveToCatalog: !!c })}
              className="cursor-pointer"
            />
            <Label htmlFor="li-save-catalog" className="text-xs cursor-pointer">
              Save to parts catalog for future use
            </Label>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main LineItemEditor component
// ---------------------------------------------------------------------------

export function LineItemEditor({
  workOrderId,
  lineItems: initialLineItems,
  orgSettings,
  editable,
  onLineItemsChange,
}: LineItemEditorProps) {
  const [items, setItems] = useState<WorkOrderLineItem[]>(initialLineItems)
  const [dialogMode, setDialogMode] = useState<"add" | "edit" | null>(null)
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(() => defaultForm(orgSettings))
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Sync when parent refreshes items
  useEffect(() => {
    setItems(initialLineItems)
  }, [initialLineItems])

  function patchForm(patch: Partial<FormState>) {
    setForm((prev) => ({ ...prev, ...patch }))
  }

  function openAdd() {
    setForm(defaultForm(orgSettings))
    setEditingItemId(null)
    setDialogMode("add")
  }

  function openEdit(item: WorkOrderLineItem) {
    setForm(formFromLineItem(item))
    setEditingItemId(item.id)
    setDialogMode("edit")
  }

  function closeDialog() {
    setDialogMode(null)
    setEditingItemId(null)
  }

  function buildInput(): AddLineItemInput {
    return {
      catalogItemId: form.catalogItemId ?? undefined,
      description: form.description.trim(),
      itemType: form.itemType,
      laborType: form.itemType === "labor" ? form.laborType : undefined,
      quantity: form.quantity || "1",
      unit: form.unit,
      unitCost: form.unitCost || undefined,
      unitPrice: form.unitPrice || undefined,
      markupPct: form.markupPct || undefined,
      discountType: form.showDiscount && form.discountType ? form.discountType : undefined,
      discountValue: form.showDiscount && form.discountValue ? form.discountValue : undefined,
      isTaxable: form.isTaxable,
      isOptional: form.isOptional,
      actualHours: form.actualHours || undefined,
    }
  }

  function handleSave() {
    if (!form.description.trim()) {
      toast.error("Description is required")
      return
    }

    startTransition(async () => {
      // If saving to catalog, save first
      if (form.saveToCatalog && form.description.trim() && !form.catalogItemId) {
        await addCatalogItem({
          name: form.description.trim(),
          defaultCostPrice: form.unitCost || undefined,
          defaultSellPrice: form.unitPrice || undefined,
          defaultUnit: form.unit,
          isLabor: form.itemType === "labor",
          category: form.itemType === "labor" ? "Labor" : undefined,
        })
      }

      if (dialogMode === "add") {
        const result = await addLineItemToWorkOrder(workOrderId, buildInput())
        if (!result.success) {
          toast.error("Failed to add item", { description: result.error })
          return
        }

        // Optimistic update
        const optimistic: WorkOrderLineItem = {
          id: result.id ?? crypto.randomUUID(),
          work_order_id: workOrderId,
          catalog_item_id: form.catalogItemId,
          description: form.description,
          item_type: form.itemType,
          labor_type: form.itemType === "labor" ? form.laborType : null,
          quantity: form.quantity || "1",
          unit: form.unit,
          unit_cost: form.unitCost || null,
          unit_price: form.unitPrice || null,
          markup_pct: form.markupPct || null,
          discount_type: form.showDiscount ? form.discountType : null,
          discount_value: form.showDiscount ? form.discountValue || null : null,
          is_taxable: form.isTaxable,
          is_optional: form.isOptional,
          actual_hours: form.actualHours || null,
          sort_order: items.length,
        }

        const next = [...items, optimistic]
        setItems(next)
        onLineItemsChange?.(next)
        toast.success("Item added")
      } else if (dialogMode === "edit" && editingItemId) {
        const result = await updateLineItem(editingItemId, {
          ...buildInput(),
          workOrderId,
        })
        if (!result.success) {
          toast.error("Failed to update item", { description: result.error })
          return
        }

        const next = items.map((i) =>
          i.id === editingItemId
            ? {
                ...i,
                catalog_item_id: form.catalogItemId,
                description: form.description,
                item_type: form.itemType,
                labor_type: form.itemType === "labor" ? form.laborType : null,
                quantity: form.quantity || "1",
                unit: form.unit,
                unit_cost: form.unitCost || null,
                unit_price: form.unitPrice || null,
                markup_pct: form.markupPct || null,
                discount_type: form.showDiscount ? form.discountType : null,
                discount_value: form.showDiscount ? form.discountValue || null : null,
                is_taxable: form.isTaxable,
                is_optional: form.isOptional,
                actual_hours: form.actualHours || null,
              }
            : i
        )
        setItems(next)
        onLineItemsChange?.(next)
        toast.success("Item updated")
      }

      closeDialog()
    })
  }

  function handleDelete(itemId: string) {
    startTransition(async () => {
      const result = await deleteLineItem(itemId, workOrderId)
      if (!result.success) {
        toast.error("Failed to delete item", { description: result.error })
        return
      }
      const next = items.filter((i) => i.id !== itemId)
      setItems(next)
      onLineItemsChange?.(next)
      setDeleteConfirmId(null)
      toast.success("Item removed")
    })
  }

  function handleMoveUp(index: number) {
    if (index === 0) return
    const next = [...items]
    ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
    setItems(next)
    onLineItemsChange?.(next)
    startTransition(async () => {
      await reorderLineItems(workOrderId, next.map((i) => i.id))
    })
  }

  function handleMoveDown(index: number) {
    if (index === items.length - 1) return
    const next = [...items]
    ;[next[index], next[index + 1]] = [next[index + 1], next[index]]
    setItems(next)
    onLineItemsChange?.(next)
    startTransition(async () => {
      await reorderLineItems(workOrderId, next.map((i) => i.id))
    })
  }

  const { subtotal, tax, total } = calcTotals(items, orgSettings)

  const taxRateDisplay = orgSettings?.default_tax_rate
    ? (parseFloat(orgSettings.default_tax_rate as string) * 100).toFixed(2)
    : "8.75"

  return (
    <div className="flex flex-col gap-4">
      {/* ── Line items table ──────────────────────────────────────────── */}
      {items.length > 0 ? (
        <div className="rounded-xl border border-border/60 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 bg-muted/20">
                <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">
                  Item
                </th>
                <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground hidden sm:table-cell">
                  Qty
                </th>
                <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground hidden sm:table-cell">
                  Price
                </th>
                <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">
                  Total
                </th>
                {editable && (
                  <th className="px-2 py-2 w-20" />
                )}
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => {
                const lineTotal = calcLineTotal(item)
                return (
                  <tr
                    key={item.id}
                    className={`border-b border-border/40 last:border-0 ${
                      item.is_optional ? "opacity-70" : ""
                    }`}
                  >
                    <td className="px-3 py-2.5">
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-medium leading-tight">
                            {item.description}
                          </span>
                          {item.is_optional && (
                            <span className="text-[10px] text-muted-foreground border border-border/50 rounded px-1 py-0 leading-tight">
                              optional
                            </span>
                          )}
                          {item.is_taxable && (
                            <span className="text-[10px] text-blue-400/80">T</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-[10px] px-1.5 py-0 rounded-sm border font-medium ${
                              TYPE_BADGE_CLASSES[item.item_type as ItemType] ?? TYPE_BADGE_CLASSES.other
                            }`}
                          >
                            {item.item_type.charAt(0).toUpperCase() + item.item_type.slice(1)}
                          </span>
                          {item.labor_type && (
                            <span className="text-[10px] text-muted-foreground">
                              {item.labor_type === "hourly" ? "Hourly" : "Flat Rate"}
                            </span>
                          )}
                          {item.discount_type && item.discount_value && (
                            <span className="text-[10px] text-green-400">
                              -{item.discount_type === "percent"
                                ? `${item.discount_value}%`
                                : `$${parseFloat(item.discount_value).toFixed(2)}`}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right text-muted-foreground hidden sm:table-cell">
                      {parseFloat(item.quantity).toString()} {item.unit}
                    </td>
                    <td className="px-3 py-2.5 text-right text-muted-foreground hidden sm:table-cell">
                      {item.unit_price ? `$${parseFloat(item.unit_price).toFixed(2)}` : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right font-medium">
                      ${lineTotal.toFixed(2)}
                    </td>
                    {editable && (
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-0.5 justify-end">
                          <button
                            type="button"
                            onClick={() => handleMoveUp(index)}
                            disabled={index === 0 || isPending}
                            className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                            aria-label="Move up"
                          >
                            <ChevronUpIcon className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveDown(index)}
                            disabled={index === items.length - 1 || isPending}
                            className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                            aria-label="Move down"
                          >
                            <ChevronDownIcon className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openEdit(item)}
                            className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer"
                            aria-label="Edit item"
                          >
                            <PencilIcon className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmId(item.id)}
                            className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive cursor-pointer"
                            aria-label="Delete item"
                          >
                            <Trash2Icon className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border/60 bg-muted/5 px-4 py-6 text-center">
          <p className="text-sm text-muted-foreground">No line items yet.</p>
          {editable && (
            <p className="text-xs text-muted-foreground/60 mt-1">
              Add parts and labor to build the job estimate.
            </p>
          )}
        </div>
      )}

      {/* ── Add item button ───────────────────────────────────────────── */}
      {editable && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={openAdd}
          className="self-start cursor-pointer"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          Add Item
        </Button>
      )}

      {/* ── Totals ───────────────────────────────────────────────────── */}
      {items.length > 0 && (
        <div className="rounded-xl border border-border/60 bg-muted/5 p-3 flex flex-col gap-1.5 self-end min-w-52">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Subtotal</span>
            <span>${subtotal.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Tax ({taxRateDisplay}%)</span>
            <span>${tax.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between text-sm font-semibold border-t border-border/60 pt-1.5 mt-0.5">
            <span>Total</span>
            <span>${total.toFixed(2)}</span>
          </div>
        </div>
      )}

      {/* ── Add / Edit dialog ────────────────────────────────────────── */}
      <Dialog open={dialogMode !== null} onOpenChange={(open) => { if (!open) closeDialog() }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dialogMode === "add" ? "Add Line Item" : "Edit Line Item"}</DialogTitle>
          </DialogHeader>

          <LineItemForm
            form={form}
            onChange={patchForm}
            orgSettings={orgSettings}
            mode={dialogMode ?? "add"}
          />

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
        </DialogContent>
      </Dialog>

      {/* ── Delete confirmation dialog ───────────────────────────────── */}
      <Dialog
        open={deleteConfirmId !== null}
        onOpenChange={(open) => { if (!open) setDeleteConfirmId(null) }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove Line Item?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently remove the line item from the work order.
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
