"use client"

/**
 * TierSelector — Side-by-side tier columns on desktop, stacked cards on mobile.
 *
 * Per user decision: "side-by-side columns on desktop, stacked cards on mobile."
 * Each column: tier name, description, features list (checkmarks), price at bottom, Select button.
 * Selected tier highlighted with primary border/shadow.
 * Responsive: grid-cols-1 md:grid-cols-3.
 */

import type { ProposalPublicTier } from "@/actions/projects-approval"

interface TierSelectorProps {
  tiers: ProposalPublicTier[]
  selectedTierId: string | null
  onSelect: (tierId: string) => void
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

const TIER_COLORS: Record<string, { badge: string; border: string; selected: string }> = {
  good: {
    badge: "bg-slate-100 text-slate-700",
    border: "border-gray-200",
    selected: "border-slate-800 ring-2 ring-slate-800",
  },
  better: {
    badge: "bg-blue-100 text-blue-700",
    border: "border-gray-200",
    selected: "border-blue-600 ring-2 ring-blue-600",
  },
  best: {
    badge: "bg-amber-100 text-amber-700",
    border: "border-gray-200",
    selected: "border-amber-500 ring-2 ring-amber-500",
  },
}

function getTierColors(tierLevel: string) {
  return TIER_COLORS[tierLevel.toLowerCase()] ?? TIER_COLORS.good
}

export function TierSelector({
  tiers,
  selectedTierId,
  onSelect,
  disabled = false,
}: TierSelectorProps) {
  if (tiers.length === 0) return null

  // Auto-select the first tier if none is selected (controlled by parent)
  const activeTierId = selectedTierId

  return (
    <div
      className={`grid gap-4 ${
        tiers.length === 1
          ? "grid-cols-1"
          : tiers.length === 2
            ? "grid-cols-1 md:grid-cols-2"
            : "grid-cols-1 md:grid-cols-3"
      }`}
    >
      {tiers.map((tier) => {
        const isSelected = activeTierId === tier.id
        const colors = getTierColors(tier.tier_level)

        return (
          <button
            key={tier.id}
            type="button"
            onClick={() => !disabled && onSelect(tier.id)}
            disabled={disabled}
            className={`
              relative flex flex-col text-left rounded-xl border-2 bg-white p-5 transition-all
              ${isSelected ? colors.selected + " shadow-md" : colors.border + " hover:border-gray-300 hover:shadow-sm"}
              ${disabled ? "opacity-60 cursor-default" : "cursor-pointer"}
            `}
          >
            {/* Tier badge */}
            <div className="mb-3">
              <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide ${colors.badge}`}>
                {tier.name}
              </span>
            </div>

            {/* Description */}
            {tier.description && (
              <p className="text-sm text-gray-600 mb-4 leading-relaxed flex-1">
                {tier.description}
              </p>
            )}

            {/* Features */}
            {tier.features && tier.features.length > 0 && (
              <ul className="space-y-1.5 mb-4 flex-1">
                {tier.features.map((feature, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-gray-700">
                    <svg
                      className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    {feature}
                  </li>
                ))}
              </ul>
            )}

            {/* Price */}
            <div className="mt-auto pt-4 border-t border-gray-100">
              <div className="text-2xl font-bold text-gray-900">
                {formatCurrency(tier.price)}
              </div>
              <div className="text-xs text-gray-500 mt-0.5">Total project cost</div>
            </div>

            {/* Selected indicator */}
            {isSelected && (
              <div className="absolute top-3 right-3">
                <div className="h-6 w-6 rounded-full bg-slate-900 flex items-center justify-center">
                  <svg
                    className="h-3.5 w-3.5 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={3}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </div>
            )}
          </button>
        )
      })}
    </div>
  )
}
