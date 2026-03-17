"use client"

/**
 * AddonSelector — Checkbox list of optional add-ons with live total.
 *
 * Per user decision: "checkboxes below the selected tier — separate section with
 * prices, total updates live as add-ons are toggled."
 *
 * Each item: name, optional description, price. Toggling updates the running total
 * in the parent via onSelectionChange([id1, id2, ...]).
 */

import type { ProposalPublicAddon } from "@/actions/projects-approval"

interface AddonSelectorProps {
  addons: ProposalPublicAddon[]
  selectedAddonIds: string[]
  onSelectionChange: (ids: string[]) => void
  disabled?: boolean
}

function formatCurrency(amount: string | number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(typeof amount === "string" ? parseFloat(amount) : amount)
}

export function AddonSelector({
  addons,
  selectedAddonIds,
  onSelectionChange,
  disabled = false,
}: AddonSelectorProps) {
  if (addons.length === 0) return null

  function toggle(addonId: string) {
    if (disabled) return
    const isSelected = selectedAddonIds.includes(addonId)
    if (isSelected) {
      onSelectionChange(selectedAddonIds.filter((id) => id !== addonId))
    } else {
      onSelectionChange([...selectedAddonIds, addonId])
    }
  }

  return (
    <div className="space-y-3">
      {addons.map((addon) => {
        const isSelected = selectedAddonIds.includes(addon.id)

        return (
          <label
            key={addon.id}
            className={`
              flex items-start gap-4 p-4 rounded-xl border-2 bg-white cursor-pointer transition-all
              ${isSelected
                ? "border-slate-800 bg-slate-50/50 shadow-sm"
                : "border-gray-200 hover:border-gray-300"
              }
              ${disabled ? "opacity-60 cursor-default" : ""}
            `}
          >
            {/* Checkbox */}
            <div className="pt-0.5 flex-shrink-0">
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggle(addon.id)}
                disabled={disabled}
                className="h-4 w-4 rounded border-gray-300 text-slate-900 focus:ring-slate-900"
              />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-gray-900 text-sm leading-tight">
                  {addon.name}
                </span>
                <span
                  className={`
                    text-sm font-semibold flex-shrink-0
                    ${isSelected ? "text-slate-900" : "text-gray-600"}
                  `}
                >
                  +{formatCurrency(addon.price)}
                </span>
              </div>
              {addon.description && (
                <p className="mt-0.5 text-xs text-gray-500 leading-relaxed">
                  {addon.description}
                </p>
              )}
            </div>
          </label>
        )
      })}
    </div>
  )
}
