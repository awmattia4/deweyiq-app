"use client"

import { useState, useTransition } from "react"
import dynamic from "next/dynamic"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  PlusIcon,
  PencilIcon,
  Trash2Icon,
  EyeOffIcon,
  EyeIcon,
  ScanBarcodeIcon,
} from "lucide-react"
import {
  getChemicalProducts,
  addChemicalProduct,
  updateChemicalProduct,
  deleteChemicalProduct,
  type ChemicalProduct,
  type AddChemicalProductInput,
} from "@/actions/chemical-products"

const BarcodeScanner = dynamic(
  () => import("@/components/field/barcode-scanner").then((m) => m.BarcodeScanner),
  { ssr: false }
)

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHEMICAL_TYPES = [
  { value: "chlorine", label: "Chlorine (Liquid)" },
  { value: "shock", label: "Shock (Cal-Hypo)" },
  { value: "acid", label: "Acid (pH Down)" },
  { value: "soda_ash", label: "Soda Ash (pH Up)" },
  { value: "baking_soda", label: "Baking Soda (Alk Up)" },
  { value: "calcium", label: "Calcium Hardness" },
  { value: "cya", label: "CYA / Stabilizer" },
  { value: "algaecide", label: "Algaecide" },
  { value: "salt", label: "Salt" },
] as const

type ChemicalTypeValue = (typeof CHEMICAL_TYPES)[number]["value"]

const UNIT_OPTIONS = [
  { value: "floz", label: "fl oz" },
  { value: "oz", label: "oz (weight)" },
  { value: "lbs", label: "lbs" },
  { value: "gallon", label: "gallon" },
] as const

const CHEMICAL_TYPE_BADGE: Record<string, string> = {
  chlorine: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  shock: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  acid: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  soda_ash: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  baking_soda: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
  calcium: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  cya: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  algaecide: "bg-green-500/15 text-green-400 border-green-500/30",
  salt: "bg-slate-500/15 text-slate-400 border-slate-500/30",
}

// ---------------------------------------------------------------------------
// Form state
// ---------------------------------------------------------------------------

interface FormState {
  name: string
  chemicalType: string
  // Decimal inputs as strings per MEMORY.md controlled input pattern
  concentrationPct: string
  unit: string
  costPerUnit: string
}

function emptyForm(): FormState {
  return {
    name: "",
    chemicalType: "chlorine",
    concentrationPct: "",
    unit: "floz",
    costPerUnit: "",
  }
}

function formFromProduct(product: ChemicalProduct): FormState {
  return {
    name: product.name,
    chemicalType: product.chemical_type,
    concentrationPct: product.concentration_pct != null ? String(product.concentration_pct) : "",
    unit: product.unit,
    costPerUnit: product.cost_per_unit != null ? String(parseFloat(product.cost_per_unit)) : "",
  }
}

function chemicalTypeLabel(type: string): string {
  return CHEMICAL_TYPES.find((t) => t.value === type)?.label ?? type.replace(/_/g, " ")
}

function unitLabel(unit: string): string {
  return UNIT_OPTIONS.find((u) => u.value === unit)?.label ?? unit
}

// ---------------------------------------------------------------------------
// ChemicalProductsManager
// ---------------------------------------------------------------------------

interface ChemicalProductsManagerProps {
  initialProducts: ChemicalProduct[]
}

export function ChemicalProductsManager({ initialProducts }: ChemicalProductsManagerProps) {
  const [products, setProducts] = useState<ChemicalProduct[]>(initialProducts)
  const [showInactive, setShowInactive] = useState(false)
  const [dialogMode, setDialogMode] = useState<"add" | "edit" | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
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
    setEditingId(null)
    setDialogMode("add")
  }

  function openEdit(product: ChemicalProduct) {
    setForm(formFromProduct(product))
    setEditingId(product.id)
    setDialogMode("edit")
  }

  function closeDialog() {
    setDialogMode(null)
    setEditingId(null)
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
        patchForm({ name: result.item_name })
      }
    } catch (err) {
      console.error("[ChemicalProducts] UPC lookup failed:", err)
    } finally {
      setLookingUp(false)
    }
  }

  async function refreshProducts() {
    startRefreshTransition(async () => {
      const all = await getChemicalProducts()
      setProducts(all)
    })
  }

  function handleSave() {
    if (!form.name.trim()) {
      toast.error("Product name is required")
      return
    }
    if (!form.chemicalType) {
      toast.error("Chemical type is required")
      return
    }
    if (!form.unit) {
      toast.error("Unit is required")
      return
    }

    startTransition(async () => {
      const input: AddChemicalProductInput = {
        name: form.name.trim(),
        chemicalType: form.chemicalType,
        concentrationPct: form.concentrationPct || undefined,
        unit: form.unit,
        costPerUnit: form.costPerUnit || undefined,
      }

      if (dialogMode === "add") {
        const result = await addChemicalProduct(input)
        if (!result.success) {
          toast.error("Failed to add product", { description: result.error })
          return
        }

        const optimistic: ChemicalProduct = {
          id: result.id ?? crypto.randomUUID(),
          org_id: "",
          name: form.name.trim(),
          chemical_type: form.chemicalType,
          concentration_pct: form.concentrationPct ? parseFloat(form.concentrationPct) : null,
          unit: form.unit,
          cost_per_unit: form.costPerUnit || null,
          is_active: true,
          created_at: new Date(),
        }
        setProducts((prev) => [optimistic, ...prev])
        toast.success("Chemical product added")
      } else if (dialogMode === "edit" && editingId) {
        const result = await updateChemicalProduct(editingId, input)
        if (!result.success) {
          toast.error("Failed to update product", { description: result.error })
          return
        }

        setProducts((prev) =>
          prev.map((p) =>
            p.id === editingId
              ? {
                  ...p,
                  name: form.name.trim(),
                  chemical_type: form.chemicalType,
                  concentration_pct: form.concentrationPct ? parseFloat(form.concentrationPct) : null,
                  unit: form.unit,
                  cost_per_unit: form.costPerUnit || null,
                }
              : p
          )
        )
        toast.success("Product updated")
      }

      closeDialog()
    })
  }

  function handleDelete(productId: string) {
    startTransition(async () => {
      const result = await deleteChemicalProduct(productId)
      if (!result.success) {
        toast.error("Failed to remove product", { description: result.error })
        return
      }
      setProducts((prev) =>
        prev.map((p) => (p.id === productId ? { ...p, is_active: false } : p))
      )
      setDeleteConfirmId(null)
      toast.success("Product removed")
    })
  }

  const filtered = products.filter((p) => showInactive || p.is_active)

  return (
    <div className="flex flex-col gap-4">
      {/* ── Toolbar ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex-1" />
        <Button
          type="button"
          size="sm"
          onClick={openAdd}
          className="cursor-pointer shrink-0"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          Add Product
        </Button>
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
          {showInactive ? "Hide inactive products" : "Show inactive products"}
        </button>
        {isRefreshing && <span className="text-xs text-muted-foreground">Refreshing…</span>}
      </div>

      {/* ── Product list ─────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 bg-muted/5 px-4 py-6 text-center">
          <p className="text-sm text-muted-foreground italic">
            No chemical products yet. Add your first product.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {filtered.map((product) => (
            <div
              key={product.id}
              className={`flex items-start justify-between gap-3 p-3 rounded-xl border border-border/60 bg-muted/5 hover:bg-muted/10 transition-colors ${
                !product.is_active ? "opacity-50" : ""
              }`}
            >
              <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium leading-tight">{product.name}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0 rounded-sm border font-medium ${
                      CHEMICAL_TYPE_BADGE[product.chemical_type] ?? "bg-muted text-muted-foreground border-border/50"
                    }`}
                  >
                    {chemicalTypeLabel(product.chemical_type)}
                  </span>
                  {!product.is_active && (
                    <span className="text-[10px] bg-muted text-muted-foreground border border-border/50 px-1.5 py-0 rounded-sm">
                      Inactive
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                  {product.concentration_pct != null && (
                    <span>{product.concentration_pct}% concentration</span>
                  )}
                  <span>{unitLabel(product.unit)}</span>
                  {product.cost_per_unit && (
                    <span className="text-foreground/70 font-medium">
                      ${parseFloat(product.cost_per_unit).toFixed(4)} / {unitLabel(product.unit)}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => openEdit(product)}
                  disabled={!product.is_active}
                  className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="Edit product"
                >
                  <PencilIcon className="h-3.5 w-3.5" />
                </button>
                {product.is_active && (
                  <button
                    type="button"
                    onClick={() => setDeleteConfirmId(product.id)}
                    className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                    aria-label="Remove product"
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
              {showScanner
                ? "Scan Barcode"
                : dialogMode === "add"
                  ? "Add Chemical Product"
                  : "Edit Chemical Product"}
            </DialogTitle>
          </DialogHeader>

          {showScanner ? (
            <div className="flex flex-col gap-3 py-2">
              <BarcodeScanner
                onScan={handleBarcodeScan}
                onError={(err) => console.error("[ChemicalProducts] scan error:", err)}
              />
              <Button variant="outline" onClick={() => setShowScanner(false)} className="w-full">
                Enter Manually Instead
              </Button>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-4">
                {/* Scan button — primary action for adding */}
                {dialogMode === "add" && !form.name && (
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

                {lookingUp && (
                  <p className="text-sm text-muted-foreground animate-pulse">Looking up product...</p>
                )}

                {/* Name */}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="cp-name" className="text-xs text-muted-foreground">
                    Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="cp-name"
                    className="h-8 text-sm"
                    placeholder={lookingUp ? "Looking up..." : "e.g. 31.45% Muriatic Acid"}
                    value={form.name}
                    onChange={(e) => patchForm({ name: e.target.value })}
                    disabled={lookingUp}
                    autoFocus={!!form.name}
                  />
                </div>

                {/* Chemical type */}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="cp-type" className="text-xs text-muted-foreground">
                    Chemical Type <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={form.chemicalType}
                    onValueChange={(v) => patchForm({ chemicalType: v })}
                  >
                    <SelectTrigger id="cp-type" className="h-8 text-sm">
                      <SelectValue placeholder="Select type…" />
                    </SelectTrigger>
                    <SelectContent>
                      {CHEMICAL_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Concentration + Unit row */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="cp-conc" className="text-xs text-muted-foreground">
                      Concentration %
                    </Label>
                    <Input
                      id="cp-conc"
                      className="h-8 text-sm"
                      inputMode="decimal"
                      placeholder="e.g. 31.45"
                      value={form.concentrationPct}
                      onChange={(e) => patchForm({ concentrationPct: e.target.value })}
                      onBlur={() => {
                        const n = parseFloat(form.concentrationPct)
                        if (!isNaN(n)) patchForm({ concentrationPct: String(n) })
                        else if (form.concentrationPct !== "") patchForm({ concentrationPct: "" })
                      }}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="cp-unit" className="text-xs text-muted-foreground">
                      Unit <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      value={form.unit}
                      onValueChange={(v) => patchForm({ unit: v })}
                    >
                      <SelectTrigger id="cp-unit" className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {UNIT_OPTIONS.map((u) => (
                          <SelectItem key={u.value} value={u.value}>
                            {u.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Cost per unit */}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="cp-cost" className="text-xs text-muted-foreground">
                    Cost per Unit
                  </Label>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm text-muted-foreground">$</span>
                    <Input
                      id="cp-cost"
                      className="h-8 text-sm"
                      inputMode="decimal"
                      placeholder="0.0000"
                      value={form.costPerUnit}
                      onChange={(e) => patchForm({ costPerUnit: e.target.value })}
                      onBlur={() => {
                        const n = parseFloat(form.costPerUnit)
                        if (!isNaN(n)) patchForm({ costPerUnit: n.toFixed(4) })
                        else if (form.costPerUnit !== "") patchForm({ costPerUnit: "" })
                      }}
                    />
                    <span className="text-xs text-muted-foreground">
                      / {unitLabel(form.unit)}
                    </span>
                  </div>
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
                  {isPending
                    ? "Saving…"
                    : dialogMode === "add"
                      ? "Add Product"
                      : "Save Changes"}
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
            <DialogTitle>Remove Chemical Product?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            The product will be marked inactive and hidden from dosing and catalog lookups.
            Existing service records that reference it are unaffected.
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
