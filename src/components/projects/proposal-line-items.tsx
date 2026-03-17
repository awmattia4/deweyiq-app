"use client"

import { useState, useTransition, useCallback } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
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
  addProposalLineItem,
  updateProposalLineItem,
  removeProposalLineItem,
} from "@/actions/projects-proposals"
import type { ProposalDetail, ProposalLineItem } from "@/actions/projects-proposals"

// ─── Category config ──────────────────────────────────────────────────────────

const CATEGORIES = [
  { value: "material", label: "Material" },
  { value: "labor", label: "Labor" },
  { value: "subcontractor", label: "Subcontractor" },
  { value: "equipment", label: "Equipment" },
  { value: "permit", label: "Permit" },
  { value: "other", label: "Other" },
]

// ─── Format helpers ───────────────────────────────────────────────────────────

function formatCurrency(value: string | number): string {
  const n = parseFloat(String(value)) || 0
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" })
}

// ─── Line item row ────────────────────────────────────────────────────────────

interface LineItemRowProps {
  item: ProposalLineItem
  tierOptions: Array<{ id: string; label: string }>
  proposalId: string
  onProposalUpdate: (proposal: ProposalDetail) => void
}

function LineItemRow({ item, tierOptions, proposalId, onProposalUpdate }: LineItemRowProps) {
  const [isPending, startTransition] = useTransition()
  const [descInput, setDescInput] = useState(item.description)
  const [qtyInput, setQtyInput] = useState(String(parseFloat(item.quantity) || 1))
  const [priceInput, setPriceInput] = useState(String(parseFloat(item.unit_price) || 0))
  const [markupInput, setMarkupInput] = useState(String(parseFloat(item.markup_pct) || 0))

  const computedTotal = (
    (parseFloat(qtyInput) || 0) *
    (parseFloat(priceInput) || 0) *
    (1 + (parseFloat(markupInput) || 0) / 100)
  ).toLocaleString("en-US", { style: "currency", currency: "USD" })

  const handleSave = useCallback(
    (patch: Parameters<typeof updateProposalLineItem>[2]) => {
      startTransition(async () => {
        const result = await updateProposalLineItem(item.id, proposalId, patch)
        if ("error" in result) {
          toast.error(result.error)
        } else {
          onProposalUpdate(result.data)
        }
      })
    },
    [item.id, proposalId, onProposalUpdate]
  )

  const handleRemove = useCallback(() => {
    startTransition(async () => {
      const result = await removeProposalLineItem(item.id, proposalId)
      if ("error" in result) {
        toast.error(result.error)
      } else {
        onProposalUpdate(result.data)
        toast.success("Line item removed")
      }
    })
  }, [item.id, proposalId, onProposalUpdate])

  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-2 items-start py-2 border-b border-border/50 last:border-0">
      {/* Description */}
      <div className="flex flex-col gap-1 min-w-0">
        <Input
          value={descInput}
          onChange={(e) => setDescInput(e.target.value)}
          onBlur={() => handleSave({ description: descInput })}
          placeholder="Description"
          className="h-8 text-sm"
        />
        <div className="flex gap-2">
          <Select
            value={item.category}
            onValueChange={(val) => handleSave({ category: val })}
          >
            <SelectTrigger className="h-6 text-xs w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value} className="text-xs">
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {tierOptions.length > 0 && (
            <Select
              value={item.tier_id ?? "shared"}
              onValueChange={(val) => handleSave({ tier_id: val === "shared" ? null : val })}
            >
              <SelectTrigger className="h-6 text-xs w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="shared" className="text-xs">
                  All Tiers
                </SelectItem>
                {tierOptions.map((t) => (
                  <SelectItem key={t.id} value={t.id} className="text-xs">
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* Quantity */}
      <div className="flex flex-col gap-1 w-16">
        <Label className="text-xs text-muted-foreground text-center">Qty</Label>
        <Input
          value={qtyInput}
          onChange={(e) => setQtyInput(e.target.value)}
          onBlur={() => {
            if (!qtyInput.endsWith(".") && !isNaN(parseFloat(qtyInput))) {
              handleSave({ quantity: qtyInput })
            }
          }}
          className="h-8 text-sm text-center"
          inputMode="decimal"
        />
      </div>

      {/* Unit price */}
      <div className="flex flex-col gap-1 w-24">
        <Label className="text-xs text-muted-foreground text-center">Unit $</Label>
        <div className="relative">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            $
          </span>
          <Input
            value={priceInput}
            onChange={(e) => setPriceInput(e.target.value)}
            onBlur={() => {
              if (!priceInput.endsWith(".") && !isNaN(parseFloat(priceInput))) {
                handleSave({ unit_price: priceInput })
              }
            }}
            className="h-8 text-sm pl-5"
            inputMode="decimal"
          />
        </div>
      </div>

      {/* Markup % */}
      <div className="flex flex-col gap-1 w-16">
        <Label className="text-xs text-muted-foreground text-center">Mkup%</Label>
        <div className="relative">
          <Input
            value={markupInput}
            onChange={(e) => setMarkupInput(e.target.value)}
            onBlur={() => {
              if (!markupInput.endsWith(".") && !isNaN(parseFloat(markupInput))) {
                handleSave({ markup_pct: markupInput })
              }
            }}
            className="h-8 text-sm pr-5"
            inputMode="decimal"
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            %
          </span>
        </div>
      </div>

      {/* Total */}
      <div className="flex flex-col gap-1 w-24">
        <Label className="text-xs text-muted-foreground text-right">Total</Label>
        <div className="h-8 flex items-center justify-end text-sm font-medium">
          {computedTotal}
        </div>
      </div>

      {/* Remove */}
      <div className="flex flex-col gap-1">
        <div className="h-4" />
        <button
          type="button"
          onClick={handleRemove}
          disabled={isPending}
          className="h-8 w-8 flex items-center justify-center text-muted-foreground hover:text-destructive text-sm"
          aria-label="Remove line item"
        >
          &times;
        </button>
      </div>
    </div>
  )
}

// ─── Add line item form ───────────────────────────────────────────────────────

interface AddLineItemFormProps {
  proposalId: string
  tierOptions: Array<{ id: string; label: string }>
  onProposalUpdate: (proposal: ProposalDetail) => void
}

function AddLineItemForm({ proposalId, tierOptions, onProposalUpdate }: AddLineItemFormProps) {
  const [isPending, startTransition] = useTransition()
  const [category, setCategory] = useState("material")
  const [description, setDescription] = useState("")
  const [quantity, setQuantity] = useState("1")
  const [unitPrice, setUnitPrice] = useState("0")
  const [markupPct, setMarkupPct] = useState("0")
  const [tierId, setTierId] = useState<string | null>(null)

  const handleAdd = () => {
    if (!description.trim()) {
      toast.error("Description is required")
      return
    }
    startTransition(async () => {
      const result = await addProposalLineItem(proposalId, {
        category,
        description: description.trim(),
        quantity,
        unit_price: unitPrice,
        markup_pct: markupPct,
        tier_id: tierId,
      })
      if ("error" in result) {
        toast.error(result.error)
      } else {
        onProposalUpdate(result.data)
        setDescription("")
        setQuantity("1")
        setUnitPrice("0")
        setMarkupPct("0")
        setTierId(null)
        toast.success("Line item added")
      }
    })
  }

  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 items-end pt-3 border-t border-border">
      <div className="flex flex-col gap-1">
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              handleAdd()
            }
          }}
          placeholder="Description"
          className="h-8 text-sm"
        />
        <div className="flex gap-2">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="h-6 text-xs w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value} className="text-xs">
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {tierOptions.length > 0 && (
            <Select
              value={tierId ?? "shared"}
              onValueChange={(val) => setTierId(val === "shared" ? null : val)}
            >
              <SelectTrigger className="h-6 text-xs w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="shared" className="text-xs">
                  All Tiers
                </SelectItem>
                {tierOptions.map((t) => (
                  <SelectItem key={t.id} value={t.id} className="text-xs">
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      <div className="w-16">
        <Input
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          className="h-8 text-sm text-center"
          placeholder="Qty"
          inputMode="decimal"
        />
      </div>

      <div className="relative w-24">
        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          $
        </span>
        <Input
          value={unitPrice}
          onChange={(e) => setUnitPrice(e.target.value)}
          className="h-8 text-sm pl-5"
          placeholder="0.00"
          inputMode="decimal"
        />
      </div>

      <div className="relative w-16">
        <Input
          value={markupPct}
          onChange={(e) => setMarkupPct(e.target.value)}
          className="h-8 text-sm pr-5"
          placeholder="0"
          inputMode="decimal"
        />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          %
        </span>
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleAdd}
        disabled={isPending || !description.trim()}
        className="h-8"
      >
        {isPending ? "Adding..." : "Add"}
      </Button>
    </div>
  )
}

// ─── ProposalLineItems ─────────────────────────────────────────────────────────

interface ProposalLineItemsProps {
  proposal: ProposalDetail
  onProposalUpdate: (proposal: ProposalDetail) => void
}

/**
 * ProposalLineItems — Line item editor for proposal cost breakdown.
 *
 * Supports all categories (material, labor, sub, equipment, permit, other),
 * markup percentage calculation, optional tier assignment (line items scoped
 * to a specific tier or shared across all tiers).
 *
 * Per MEMORY.md: server actions return fresh state, update local state from response.
 */
export function ProposalLineItems({ proposal, onProposalUpdate }: ProposalLineItemsProps) {
  const tierOptions = proposal.tiers.map((t) => ({
    id: t.id,
    label: t.name,
  }))

  // Group line items by tier for display
  const sharedItems = proposal.lineItems.filter((li) => !li.tier_id)
  const tierItems = proposal.tiers.map((tier) => ({
    tier,
    items: proposal.lineItems.filter((li) => li.tier_id === tier.id),
  }))

  const totalLineItems =
    proposal.lineItems.reduce((sum, li) => sum + (parseFloat(li.total) || 0), 0)

  return (
    <div className="space-y-5">
      {/* Shared line items */}
      {(sharedItems.length > 0 || proposal.tiers.length === 0) && (
        <div>
          {proposal.tiers.length > 0 && (
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Shared (All Tiers)
            </h4>
          )}
          <div>
            {sharedItems.map((item) => (
              <LineItemRow
                key={item.id}
                item={item}
                tierOptions={tierOptions}
                proposalId={proposal.id}
                onProposalUpdate={onProposalUpdate}
              />
            ))}
          </div>
        </div>
      )}

      {/* Per-tier line items */}
      {tierItems.map(({ tier, items }) =>
        items.length > 0 ? (
          <div key={tier.id}>
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              {tier.name} Only
            </h4>
            <div>
              {items.map((item) => (
                <LineItemRow
                  key={item.id}
                  item={item}
                  tierOptions={tierOptions}
                  proposalId={proposal.id}
                  onProposalUpdate={onProposalUpdate}
                />
              ))}
            </div>
          </div>
        ) : null
      )}

      {/* Empty state */}
      {proposal.lineItems.length === 0 && (
        <p className="text-sm text-muted-foreground italic">No line items yet.</p>
      )}

      {/* Total */}
      {proposal.lineItems.length > 0 && (
        <div className="flex justify-end text-sm font-medium pt-1 border-t border-border">
          <span className="text-muted-foreground mr-4">Line Items Total:</span>
          <span>
            {totalLineItems.toLocaleString("en-US", { style: "currency", currency: "USD" })}
          </span>
        </div>
      )}

      {/* Add item form */}
      <AddLineItemForm
        proposalId={proposal.id}
        tierOptions={tierOptions}
        onProposalUpdate={onProposalUpdate}
      />
    </div>
  )
}
