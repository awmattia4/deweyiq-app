"use client"

import { useState, useTransition, useCallback } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  createProposalTier,
  updateProposalTier,
  deleteProposalTier,
} from "@/actions/projects-proposals"
import type { ProposalDetail, ProposalTier } from "@/actions/projects-proposals"

// ─── Tier config ──────────────────────────────────────────────────────────────

const TIER_CONFIG = [
  { level: "good" as const, label: "Good", colorClass: "border-border" },
  { level: "better" as const, label: "Better", colorClass: "border-primary/50" },
  { level: "best" as const, label: "Best", colorClass: "border-primary" },
]

interface TierBuilderProps {
  proposal: ProposalDetail
  onProposalUpdate: (proposal: ProposalDetail) => void
}

interface TierColumnProps {
  tierConfig: typeof TIER_CONFIG[number]
  tier: ProposalTier | undefined
  proposalId: string
  onProposalUpdate: (proposal: ProposalDetail) => void
}

// ─── Individual tier column ────────────────────────────────────────────────────

function TierColumn({ tierConfig, tier, proposalId, onProposalUpdate }: TierColumnProps) {
  const [isPending, startTransition] = useTransition()

  // Controlled decimal inputs per MEMORY.md pitfall
  const [nameInput, setNameInput] = useState(tier?.name ?? tierConfig.label)
  const [descInput, setDescInput] = useState(tier?.description ?? "")
  const [priceInput, setPriceInput] = useState(
    tier ? String(parseFloat(tier.price) || 0) : "0"
  )
  const [features, setFeatures] = useState<string[]>(tier?.features ?? [])
  const [newFeature, setNewFeature] = useState("")

  const handleCreateTier = useCallback(() => {
    startTransition(async () => {
      const result = await createProposalTier(proposalId, {
        tier_level: tierConfig.level,
        name: nameInput,
        description: descInput || null,
        price: priceInput,
        features,
      })
      if ("error" in result) {
        toast.error(result.error)
      } else {
        onProposalUpdate(result.data)
        toast.success(`${tierConfig.label} tier added`)
      }
    })
  }, [proposalId, tierConfig, nameInput, descInput, priceInput, features, onProposalUpdate])

  const handleUpdateField = useCallback(
    (field: Parameters<typeof updateProposalTier>[2]) => {
      if (!tier) return
      startTransition(async () => {
        const result = await updateProposalTier(tier.id, proposalId, field)
        if ("error" in result) {
          toast.error(result.error)
        } else {
          onProposalUpdate(result.data)
        }
      })
    },
    [tier, proposalId, onProposalUpdate]
  )

  const handleDeleteTier = useCallback(() => {
    if (!tier) return
    startTransition(async () => {
      const result = await deleteProposalTier(tier.id, proposalId)
      if ("error" in result) {
        toast.error(result.error)
      } else {
        onProposalUpdate(result.data)
        toast.success(`${tierConfig.label} tier removed`)
      }
    })
  }, [tier, proposalId, tierConfig.label, onProposalUpdate])

  const handleAddFeature = useCallback(() => {
    if (!newFeature.trim()) return
    const updated = [...features, newFeature.trim()]
    setFeatures(updated)
    setNewFeature("")
    if (tier) {
      handleUpdateField({ features: updated })
    }
  }, [newFeature, features, tier, handleUpdateField])

  const handleRemoveFeature = useCallback(
    (idx: number) => {
      const updated = features.filter((_, i) => i !== idx)
      setFeatures(updated)
      if (tier) {
        handleUpdateField({ features: updated })
      }
    },
    [features, tier, handleUpdateField]
  )

  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-lg border-2 p-5 transition-colors",
        tierConfig.colorClass,
        !tier && "border-dashed border-border/50"
      )}
    >
      {/* Tier header */}
      <div className="flex items-center justify-between">
        <Badge
          variant={tierConfig.level === "best" ? "default" : "secondary"}
          className="text-xs"
        >
          {tierConfig.label}
        </Badge>
        {tier && (
          <button
            type="button"
            onClick={handleDeleteTier}
            disabled={isPending}
            className="text-xs text-muted-foreground hover:text-destructive transition-colors"
          >
            Remove
          </button>
        )}
      </div>

      {/* Name */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Tier Name</Label>
        <Input
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          onBlur={() => {
            if (tier) handleUpdateField({ name: nameInput })
          }}
          placeholder={`e.g. ${tierConfig.label} Package`}
          className="h-8 text-sm"
        />
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Description</Label>
        <Textarea
          value={descInput}
          onChange={(e) => setDescInput(e.target.value)}
          onBlur={() => {
            if (tier) handleUpdateField({ description: descInput || null })
          }}
          placeholder="Brief description of what's included..."
          className="text-sm min-h-[64px] resize-none"
          rows={3}
        />
      </div>

      {/* Price */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Price</Label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            $
          </span>
          <Input
            value={priceInput}
            onChange={(e) => setPriceInput(e.target.value)}
            onBlur={() => {
              // Only flush if it's a valid number
              if (!priceInput.endsWith(".") && !isNaN(parseFloat(priceInput))) {
                if (tier) handleUpdateField({ price: priceInput })
              }
            }}
            placeholder="0.00"
            className="h-8 pl-6 text-sm font-medium"
            inputMode="decimal"
          />
        </div>
      </div>

      {/* Features */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Features / Inclusions</Label>
        <div className="space-y-1.5">
          {features.map((feature, idx) => (
            <div key={idx} className="flex items-center gap-2 text-sm">
              <span className="flex-1 text-foreground">{feature}</span>
              <button
                type="button"
                onClick={() => handleRemoveFeature(idx)}
                className="text-muted-foreground hover:text-destructive text-xs shrink-0"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            value={newFeature}
            onChange={(e) => setNewFeature(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                handleAddFeature()
              }
            }}
            placeholder="Add a feature..."
            className="h-7 text-xs"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddFeature}
            disabled={!newFeature.trim()}
            className="h-7 px-2 text-xs shrink-0"
          >
            Add
          </Button>
        </div>
      </div>

      {/* Add tier button (when not yet created) */}
      {!tier && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleCreateTier}
          disabled={isPending}
          className="mt-auto"
        >
          {isPending ? "Adding..." : `Add ${tierConfig.label} Tier`}
        </Button>
      )}
    </div>
  )
}

// ─── TierBuilder ──────────────────────────────────────────────────────────────

/**
 * TierBuilder — Good/Better/Best tier configuration in side-by-side SaaS pricing style.
 *
 * Three columns on desktop, stacked on mobile. Each column manages its own tier.
 * Per user decision: "Good/Better/Best tiers presented as side-by-side columns (SaaS pricing page style)."
 */
export function TierBuilder({ proposal, onProposalUpdate }: TierBuilderProps) {
  const getTierByLevel = (level: string) =>
    proposal.tiers.find((t) => t.tier_level === level)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {TIER_CONFIG.map((config) => (
          <TierColumn
            key={config.level}
            tierConfig={config}
            tier={getTierByLevel(config.level)}
            proposalId={proposal.id}
            onProposalUpdate={onProposalUpdate}
          />
        ))}
      </div>

      {proposal.tiers.length === 0 && (
        <p className="text-sm text-muted-foreground italic text-center py-2">
          Add tiers above to present Good/Better/Best pricing options to the customer.
        </p>
      )}
    </div>
  )
}
