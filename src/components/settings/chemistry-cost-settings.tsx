"use client"

import { useState } from "react"
import { CheckIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { updateChemicalProductCost } from "@/actions/reporting"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChemicalProductRow {
  id: string
  name: string
  chemicalType: string
  unit: string
  costPerUnit: string | null
}

interface ChemistryCostSettingsProps {
  chemicalProducts: ChemicalProductRow[]
  marginThreshold: string
}

// ---------------------------------------------------------------------------
// RowEditor — one row per product with controlled decimal input
// ---------------------------------------------------------------------------

function ProductCostRow({ product }: { product: ChemicalProductRow }) {
  // Per MEMORY.md: use local string state for decimal inputs — parseFloat("7.") = 7, eats the decimal
  const [inputValue, setInputValue] = useState(
    product.costPerUnit != null ? String(parseFloat(product.costPerUnit)) : ""
  )
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isDirty =
    inputValue !== (product.costPerUnit != null ? String(parseFloat(product.costPerUnit)) : "")

  async function handleSave() {
    const parsed = parseFloat(inputValue)
    if (isNaN(parsed) || parsed < 0) {
      setError("Enter a valid cost (e.g. 0.05)")
      return
    }
    setError(null)
    setSaving(true)
    const result = await updateChemicalProductCost(product.id, parsed)
    setSaving(false)
    if (result.success) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } else {
      setError(result.error ?? "Failed to save")
    }
  }

  return (
    <tr className="border-b border-border/30 last:border-0">
      <td className="py-2 pr-4">
        <div>
          <p className="text-sm font-medium">{product.name}</p>
          <p className="text-xs text-muted-foreground capitalize">{product.chemicalType.replace(/_/g, " ")}</p>
        </div>
      </td>
      <td className="py-2 pr-4 text-sm text-muted-foreground">{product.unit}</td>
      <td className="py-2 pr-4">
        <div className="flex items-center gap-1">
          <span className="text-sm text-muted-foreground">$</span>
          <input
            type="text"
            inputMode="decimal"
            value={inputValue}
            onChange={(e) => {
              const v = e.target.value
              // Allow typing decimal — only flush to state if complete
              setInputValue(v)
              setError(null)
              setSaved(false)
            }}
            onBlur={() => {
              // Safety net: flush completed number on blur
              const parsed = parseFloat(inputValue)
              if (!isNaN(parsed) && inputValue.trim() !== "") {
                setInputValue(String(parsed))
              }
            }}
            placeholder="0.00"
            className="w-20 h-7 rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <span className="text-xs text-muted-foreground">/ {product.unit}</span>
        </div>
        {error && <p className="text-xs text-destructive mt-0.5">{error}</p>}
      </td>
      <td className="py-2">
        {isDirty && !saved && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleSave}
            disabled={saving}
            className="cursor-pointer h-7 text-xs"
          >
            {saving ? "Saving..." : "Save"}
          </Button>
        )}
        {saved && (
          <span className="flex items-center gap-1 text-xs text-emerald-400">
            <CheckIcon className="h-3.5 w-3.5" />
            Saved
          </span>
        )}
      </td>
    </tr>
  )
}

// ---------------------------------------------------------------------------
// ChemistryCostSettings component
// ---------------------------------------------------------------------------

export function ChemistryCostSettings({
  chemicalProducts,
  marginThreshold,
}: ChemistryCostSettingsProps) {
  if (chemicalProducts.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground italic">
          No chemical products configured yet. Add products in the service catalog to set costs.
        </p>
        <p className="text-xs text-muted-foreground">
          Chemical costs are used to calculate per-pool profitability on the Reports &rsaquo; Profitability tab.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">
        Set the cost per unit for each chemical product. Used to calculate per-pool profitability on the{" "}
        <span className="text-foreground">Reports &rsaquo; Profitability</span> tab.
        {marginThreshold && (
          <span>
            {" "}
            Pools below <span className="font-semibold text-foreground">{parseFloat(marginThreshold).toFixed(0)}%</span> margin
            are flagged — configure this threshold on the Profitability tab.
          </span>
        )}
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/50 text-muted-foreground">
              <th className="text-left pb-2 pr-4 font-medium">Product</th>
              <th className="text-left pb-2 pr-4 font-medium">Unit</th>
              <th className="text-left pb-2 pr-4 font-medium">Cost per Unit</th>
              <th className="text-left pb-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {chemicalProducts.map((product) => (
              <ProductCostRow key={product.id} product={product} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
