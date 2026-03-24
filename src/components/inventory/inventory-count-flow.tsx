"use client"

/**
 * Phase 13: Inventory Count / Audit Flow
 *
 * Three-stage flow: counting → review → done
 *
 * - counting: Show every item. User enters actual quantities.
 *             Controlled decimal string state per MEMORY.md.
 * - review:   Show only items where actual ≠ expected with delta colours.
 *             "No discrepancies" path if everything matches.
 * - done:     Summary of adjustments made.
 */

import { useState, useTransition } from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { submitInventoryCount } from "@/actions/truck-inventory"
import type { TruckInventoryItem, CountEntry } from "@/actions/truck-inventory"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FlowState = "idle" | "counting" | "review" | "done"

interface InventoryCountFlowProps {
  items: TruckInventoryItem[]
  /** tech_id for the items being counted — null = warehouse */
  techId: string | null
  /** Display label, e.g. "Marcus's Truck" or "Warehouse" */
  label: string
  onComplete: () => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CATEGORIES = ["chemical", "part", "tool", "equipment", "other"] as const
type Category = (typeof CATEGORIES)[number]

const CATEGORY_LABELS: Record<Category, string> = {
  chemical: "Chemicals",
  part: "Parts",
  tool: "Tools",
  equipment: "Equipment",
  other: "Other",
}

function formatQty(qty: string): string {
  return String(parseFloat(qty) || 0)
}

function groupAndSort(items: TruckInventoryItem[]): Array<{ cat: Category; items: TruckInventoryItem[] }> {
  const groups: Record<Category, TruckInventoryItem[]> = {
    chemical: [],
    part: [],
    tool: [],
    equipment: [],
    other: [],
  }
  for (const item of items) {
    const cat = item.category as Category
    if (groups[cat]) {
      groups[cat].push(item)
    } else {
      groups.other.push(item)
    }
  }
  // Sort each group by item name
  for (const cat of CATEGORIES) {
    groups[cat].sort((a, b) => a.item_name.localeCompare(b.item_name))
  }
  return CATEGORIES.filter((cat) => groups[cat].length > 0).map((cat) => ({
    cat,
    items: groups[cat],
  }))
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function InventoryCountFlow({
  items,
  label,
  onComplete,
}: InventoryCountFlowProps) {
  const [flowState, setFlowState] = useState<FlowState>("idle")
  // Map of itemId → controlled actual quantity string
  const [actualQtys, setActualQtys] = useState<Record<string, string>>({})
  const [adjustedCount, setAdjustedCount] = useState(0)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // ── Idle ──────────────────────────────────────────────────────────────────

  if (flowState === "idle") {
    return (
      <div className="flex flex-col gap-5">
        <div className="rounded-lg border border-border bg-card p-5">
          <p className="text-sm font-medium mb-1">{label}</p>
          <p className="text-sm text-muted-foreground mb-4">
            {items.length} item{items.length !== 1 ? "s" : ""} to count
          </p>
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              No items to count.
            </p>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                // Pre-populate actual quantities with expected values so the
                // user only needs to change what's different
                const initial: Record<string, string> = {}
                for (const item of items) {
                  initial[item.id] = formatQty(item.quantity)
                }
                setActualQtys(initial)
                setSubmitError(null)
                setFlowState("counting")
              }}
              className="cursor-pointer"
            >
              Start Count
            </Button>
          )}
        </div>
      </div>
    )
  }

  // ── Counting ──────────────────────────────────────────────────────────────

  if (flowState === "counting") {
    const grouped = groupAndSort(items)

    function updateActual(id: string, value: string) {
      // Controlled decimal: allow intermediate states like "1." per MEMORY.md
      if (/^-?\d*\.?\d*$/.test(value)) {
        setActualQtys((prev) => ({ ...prev, [id]: value }))
      }
    }

    function flushActual(id: string) {
      setActualQtys((prev) => {
        const v = prev[id] ?? ""
        if (v.endsWith(".") || v.endsWith("-")) return prev
        const parsed = parseFloat(v)
        if (isNaN(parsed)) return prev
        return { ...prev, [id]: String(parsed) }
      })
    }

    function handleReview() {
      // Flush any trailing decimals before moving to review
      setActualQtys((prev) => {
        const flushed = { ...prev }
        for (const [id, v] of Object.entries(flushed)) {
          if (v.endsWith(".") || v.endsWith("-")) {
            const parsed = parseFloat(v)
            flushed[id] = isNaN(parsed) ? "0" : String(parsed)
          }
        }
        return flushed
      })
      setFlowState("review")
    }

    return (
      <div className="flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">
              Enter the actual quantity for each item
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setFlowState("idle")}
            className="cursor-pointer"
          >
            Cancel
          </Button>
        </div>

        {/* Column headers */}
        <div className="grid grid-cols-[1fr_80px_80px] gap-3 px-3 py-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Item</span>
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">Expected</span>
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">Actual</span>
        </div>

        {/* Grouped rows */}
        {grouped.map(({ cat, items: catItems }) => (
          <div key={cat} className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {CATEGORY_LABELS[cat]}
            </h3>
            <div className="flex flex-col gap-1.5">
              {catItems.map((item) => {
                const actualStr = actualQtys[item.id] ?? formatQty(item.quantity)
                const expectedStr = formatQty(item.quantity)

                // Highlight row if value differs from expected
                const actualNum = parseFloat(actualStr)
                const expectedNum = parseFloat(expectedStr)
                const differs = !isNaN(actualNum) && actualNum !== expectedNum

                return (
                  <div
                    key={item.id}
                    className={cn(
                      "grid grid-cols-[1fr_80px_80px] items-center gap-3 rounded-lg border px-3 py-2 transition-colors",
                      differs
                        ? "border-primary/30 bg-primary/5"
                        : "border-border bg-card"
                    )}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{item.item_name}</p>
                      <p className="text-[11px] text-muted-foreground">{item.unit}</p>
                    </div>

                    {/* Expected (read-only) */}
                    <span className="text-sm font-mono text-right text-muted-foreground">
                      {expectedStr}
                    </span>

                    {/* Actual (editable) */}
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={actualStr}
                      onChange={(e) => updateActual(item.id, e.target.value)}
                      onBlur={() => flushActual(item.id)}
                      className="h-8 text-right text-sm font-mono"
                      aria-label={`Actual quantity for ${item.item_name}`}
                    />
                  </div>
                )
              })}
            </div>
          </div>
        ))}

        {/* Review button */}
        <div className="pt-2">
          <Button
            onClick={handleReview}
            size="sm"
            className="cursor-pointer"
          >
            Review
          </Button>
        </div>
      </div>
    )
  }

  // ── Review ────────────────────────────────────────────────────────────────

  if (flowState === "review") {
    const discrepancies = items.filter((item) => {
      const actual = parseFloat(actualQtys[item.id] ?? "")
      const expected = parseFloat(item.quantity)
      return !isNaN(actual) && actual !== expected
    })

    function handleConfirm() {
      if (discrepancies.length === 0) {
        setFlowState("done")
        setAdjustedCount(0)
        onComplete()
        return
      }

      const entries: CountEntry[] = discrepancies.map((item) => ({
        itemId: item.id,
        actualQuantity: parseFloat(actualQtys[item.id]),
      }))

      setSubmitError(null)
      startTransition(async () => {
        try {
          const result = await submitInventoryCount(entries)
          if (!result.success) {
            setSubmitError(result.error ?? "Submission failed")
            return
          }
          setAdjustedCount(result.adjusted)
          setFlowState("done")
        } catch (err) {
          setSubmitError(err instanceof Error ? err.message : "Submission failed")
        }
      })
    }

    return (
      <div className="flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {discrepancies.length === 0
              ? "Everything checked"
              : `${discrepancies.length} discrepanc${discrepancies.length !== 1 ? "ies" : "y"} found`}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setFlowState("counting")}
            className="cursor-pointer"
          >
            Back to Count
          </Button>
        </div>

        {submitError && (
          <p className="text-sm text-destructive">{submitError}</p>
        )}

        {/* No discrepancies */}
        {discrepancies.length === 0 && (
          <div className="rounded-lg border border-border bg-card p-5 text-center">
            <p className="text-sm text-muted-foreground italic">
              Everything matches — no adjustments needed.
            </p>
          </div>
        )}

        {/* Discrepancy rows */}
        {discrepancies.length > 0 && (
          <>
            {/* Column headers */}
            <div className="grid grid-cols-[1fr_70px_70px_70px] gap-3 px-3 py-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Item</span>
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">Expected</span>
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">Actual</span>
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">Delta</span>
            </div>

            <div className="flex flex-col gap-1.5">
              {discrepancies.map((item) => {
                const actual = parseFloat(actualQtys[item.id])
                const expected = parseFloat(item.quantity)
                const delta = actual - expected
                const isPositive = delta > 0

                return (
                  <div
                    key={item.id}
                    className="grid grid-cols-[1fr_70px_70px_70px] items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{item.item_name}</p>
                      <p className="text-[11px] text-muted-foreground">{item.unit}</p>
                    </div>

                    <span className="text-sm font-mono text-right text-muted-foreground">
                      {formatQty(item.quantity)}
                    </span>

                    <span className="text-sm font-mono text-right">
                      {String(actual)}
                    </span>

                    <span
                      className={cn(
                        "text-sm font-mono text-right font-semibold",
                        isPositive ? "text-green-400" : "text-destructive"
                      )}
                    >
                      {isPositive ? "+" : ""}{String(delta)}
                    </span>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {/* Confirm button */}
        <div className="pt-2">
          {discrepancies.length === 0 ? (
            <Button
              size="sm"
              onClick={handleConfirm}
              disabled={isPending}
              className="cursor-pointer"
            >
              Done
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={handleConfirm}
              disabled={isPending}
              className="cursor-pointer"
            >
              {isPending
                ? "Saving..."
                : `Confirm ${discrepancies.length} Adjustment${discrepancies.length !== 1 ? "s" : ""}`}
            </Button>
          )}
        </div>
      </div>
    )
  }

  // ── Done ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-lg border border-border bg-card p-5">
        <p className="text-sm font-medium mb-1">Count complete</p>
        <p className="text-sm text-muted-foreground mb-4">
          {adjustedCount === 0
            ? "No adjustments needed — inventory matches expected."
            : `${adjustedCount} item${adjustedCount !== 1 ? "s" : ""} adjusted.`}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setFlowState("idle")
            setActualQtys({})
            setAdjustedCount(0)
            setSubmitError(null)
            onComplete()
          }}
          className="cursor-pointer"
        >
          Done
        </Button>
      </div>
    </div>
  )
}
