"use client"

import { useState, useTransition, useCallback } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  addProposalAddon,
  updateProposalAddon,
  removeProposalAddon,
} from "@/actions/projects-proposals"
import type { ProposalDetail, ProposalAddon } from "@/actions/projects-proposals"

// ─── Addon row ────────────────────────────────────────────────────────────────

interface AddonRowProps {
  addon: ProposalAddon
  proposalId: string
  onProposalUpdate: (proposal: ProposalDetail) => void
}

function AddonRow({ addon, proposalId, onProposalUpdate }: AddonRowProps) {
  const [isPending, startTransition] = useTransition()
  const [nameInput, setNameInput] = useState(addon.name)
  const [descInput, setDescInput] = useState(addon.description ?? "")
  const [priceInput, setPriceInput] = useState(String(parseFloat(addon.price) || 0))

  const handleSave = useCallback(
    (patch: Parameters<typeof updateProposalAddon>[2]) => {
      startTransition(async () => {
        const result = await updateProposalAddon(addon.id, proposalId, patch)
        if ("error" in result) {
          toast.error(result.error)
        } else {
          onProposalUpdate(result.data)
        }
      })
    },
    [addon.id, proposalId, onProposalUpdate]
  )

  const handleRemove = useCallback(() => {
    startTransition(async () => {
      const result = await removeProposalAddon(addon.id, proposalId)
      if ("error" in result) {
        toast.error(result.error)
      } else {
        onProposalUpdate(result.data)
        toast.success("Add-on removed")
      }
    })
  }, [addon.id, proposalId, onProposalUpdate])

  return (
    <div className="flex items-start gap-3 py-3 border-b border-border/50 last:border-0">
      {/* Checkbox preview (customer sees this on approval page) */}
      <div className="mt-1 flex-shrink-0">
        <div className="h-4 w-4 rounded border border-border bg-background" />
      </div>

      {/* Name + description */}
      <div className="flex-1 min-w-0 space-y-1">
        <Input
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          onBlur={() => handleSave({ name: nameInput })}
          placeholder="Add-on name"
          className="h-8 text-sm font-medium"
        />
        <Input
          value={descInput}
          onChange={(e) => setDescInput(e.target.value)}
          onBlur={() => handleSave({ description: descInput || null })}
          placeholder="Brief description (optional)"
          className="h-7 text-xs text-muted-foreground"
        />
      </div>

      {/* Price */}
      <div className="relative w-28 shrink-0">
        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          +$
        </span>
        <Input
          value={priceInput}
          onChange={(e) => setPriceInput(e.target.value)}
          onBlur={() => {
            if (!priceInput.endsWith(".") && !isNaN(parseFloat(priceInput))) {
              handleSave({ price: priceInput })
            }
          }}
          placeholder="0.00"
          className="h-8 text-sm pl-7"
          inputMode="decimal"
        />
      </div>

      {/* Remove */}
      <button
        type="button"
        onClick={handleRemove}
        disabled={isPending}
        className="mt-1 text-muted-foreground hover:text-destructive text-lg leading-none shrink-0"
        aria-label="Remove add-on"
      >
        &times;
      </button>
    </div>
  )
}

// ─── Add addon form ───────────────────────────────────────────────────────────

interface AddAddonFormProps {
  proposalId: string
  onProposalUpdate: (proposal: ProposalDetail) => void
}

function AddAddonForm({ proposalId, onProposalUpdate }: AddAddonFormProps) {
  const [isPending, startTransition] = useTransition()
  const [nameInput, setNameInput] = useState("")
  const [descInput, setDescInput] = useState("")
  const [priceInput, setPriceInput] = useState("0")

  const handleAdd = () => {
    if (!nameInput.trim()) {
      toast.error("Add-on name is required")
      return
    }
    startTransition(async () => {
      const result = await addProposalAddon(proposalId, {
        name: nameInput.trim(),
        description: descInput.trim() || null,
        price: priceInput,
      })
      if ("error" in result) {
        toast.error(result.error)
      } else {
        onProposalUpdate(result.data)
        setNameInput("")
        setDescInput("")
        setPriceInput("0")
        toast.success("Add-on added")
      }
    })
  }

  return (
    <div className="flex items-end gap-3 pt-3 border-t border-border">
      <div className="flex-1 min-w-0 space-y-1">
        <Label className="text-xs text-muted-foreground">Name</Label>
        <Input
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              handleAdd()
            }
          }}
          placeholder="e.g. LED Color Light Upgrade"
          className="h-8 text-sm"
        />
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        <Label className="text-xs text-muted-foreground">Description</Label>
        <Input
          value={descInput}
          onChange={(e) => setDescInput(e.target.value)}
          placeholder="Optional details"
          className="h-8 text-sm"
        />
      </div>
      <div className="relative w-28 shrink-0 space-y-1">
        <Label className="text-xs text-muted-foreground">Price</Label>
        <div className="relative">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            +$
          </span>
          <Input
            value={priceInput}
            onChange={(e) => setPriceInput(e.target.value)}
            placeholder="0.00"
            className="h-8 text-sm pl-7"
            inputMode="decimal"
          />
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleAdd}
        disabled={isPending || !nameInput.trim()}
        className="h-8 shrink-0"
      >
        {isPending ? "Adding..." : "Add"}
      </Button>
    </div>
  )
}

// ─── AddonBuilder ──────────────────────────────────────────────────────────────

interface AddonBuilderProps {
  proposal: ProposalDetail
  onProposalUpdate: (proposal: ProposalDetail) => void
}

/**
 * AddonBuilder — Customer-selectable add-on upsells for the proposal.
 *
 * Per user decision: "Add-on upsells appear as checkboxes below the selected tier."
 * The checkbox preview here shows the customer-facing presentation.
 * Each add-on has a name, description, and price increment.
 */
export function AddonBuilder({ proposal, onProposalUpdate }: AddonBuilderProps) {
  const totalAddons = proposal.addons.reduce(
    (sum, a) => sum + (parseFloat(a.price) || 0),
    0
  )

  return (
    <div className="space-y-1">
      {proposal.addons.length === 0 ? (
        <p className="text-sm text-muted-foreground italic py-2">
          No add-ons yet. Add optional upgrades that the customer can select when approving.
        </p>
      ) : (
        <div>
          <p className="text-xs text-muted-foreground mb-3">
            These appear as checkboxes on the customer approval page.
          </p>
          {proposal.addons.map((addon) => (
            <AddonRow
              key={addon.id}
              addon={addon}
              proposalId={proposal.id}
              onProposalUpdate={onProposalUpdate}
            />
          ))}
          {proposal.addons.length > 0 && (
            <div className="flex justify-end text-sm font-medium pt-2">
              <span className="text-muted-foreground mr-4">Total Add-ons:</span>
              <span>
                +{totalAddons.toLocaleString("en-US", { style: "currency", currency: "USD" })}
              </span>
            </div>
          )}
        </div>
      )}
      <AddAddonForm proposalId={proposal.id} onProposalUpdate={onProposalUpdate} />
    </div>
  )
}
