"use client"

/**
 * Phase 13: Inventory Deduct Prompt
 *
 * Post-dosing confirmation/adjustment prompt shown after stop completion.
 * Lists auto-deducted inventory items. Tech can adjust if actual amount
 * differed from calculated dosing amount.
 *
 * UX: Auto-dismisses after 10 seconds with no interaction (non-blocking).
 * Per MEMORY.md: Uses local string state for decimal inputs to avoid
 * parseFloat("7.") eating the trailing decimal point.
 */

import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export interface DeductionRecord {
  inventoryItemId: string
  itemName: string
  unit: string
  deductedAmount: number
  newQuantity: number
}

interface AdjustedDeduction {
  inventoryItemId: string
  adjustedAmount: number
}

interface InventoryDeductPromptProps {
  deductions: DeductionRecord[]
  onConfirm: (adjustments: AdjustedDeduction[]) => void
  onDismiss: () => void
}

const AUTO_DISMISS_SECONDS = 10

export function InventoryDeductPrompt({
  deductions,
  onConfirm,
  onDismiss,
}: InventoryDeductPromptProps) {
  // Local string state per item — avoids parseFloat eating trailing decimal
  const [adjustments, setAdjustments] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const d of deductions) {
      init[d.inventoryItemId] = String(d.deductedAmount)
    }
    return init
  })

  const [countdown, setCountdown] = useState(AUTO_DISMISS_SECONDS)
  const [interacted, setInteracted] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Auto-dismiss countdown
  useEffect(() => {
    if (interacted) {
      if (intervalRef.current) clearInterval(intervalRef.current)
      return
    }

    intervalRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(intervalRef.current!)
          onDismiss()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [interacted, onDismiss])

  function handleInputChange(itemId: string, value: string) {
    setInteracted(true)
    setAdjustments((prev) => ({ ...prev, [itemId]: value }))
  }

  function handleInputBlur(itemId: string) {
    // Safety net: flush partial input on blur
    const raw = adjustments[itemId] ?? ""
    const parsed = parseFloat(raw)
    if (!isNaN(parsed)) {
      setAdjustments((prev) => ({ ...prev, [itemId]: String(parsed) }))
    }
  }

  function handleConfirm() {
    const result: AdjustedDeduction[] = deductions.map((d) => {
      const rawValue = adjustments[d.inventoryItemId] ?? ""
      const parsed = parseFloat(rawValue)
      return {
        inventoryItemId: d.inventoryItemId,
        adjustedAmount: isNaN(parsed) ? d.deductedAmount : parsed,
      }
    })
    onConfirm(result)
  }

  if (deductions.length === 0) return null

  return (
    <Card className="border-primary/20 shadow-lg">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Inventory Updated</CardTitle>
        <p className="text-sm text-muted-foreground">
          Chemicals were auto-deducted from your truck inventory.
          {!interacted && countdown > 0 && (
            <span className="ml-1">Dismissing in {countdown}s...</span>
          )}
        </p>
      </CardHeader>

      <CardContent className="space-y-3 pb-3">
        {deductions.map((d) => (
          <div key={d.inventoryItemId} className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{d.itemName}</p>
              <p className="text-xs text-muted-foreground">
                Remaining: {d.newQuantity} {d.unit}
              </p>
            </div>

            <div className="flex items-center gap-1.5">
              <div className="w-20">
                <Label htmlFor={`adj-${d.inventoryItemId}`} className="sr-only">
                  Amount used
                </Label>
                <Input
                  id={`adj-${d.inventoryItemId}`}
                  type="text"
                  inputMode="decimal"
                  value={adjustments[d.inventoryItemId] ?? ""}
                  onChange={(e) => handleInputChange(d.inventoryItemId, e.target.value)}
                  onBlur={() => handleInputBlur(d.inventoryItemId)}
                  className="h-8 text-right text-sm"
                  aria-label={`Adjust amount used for ${d.itemName}`}
                />
              </div>
              <span className="text-xs text-muted-foreground">{d.unit}</span>
            </div>
          </div>
        ))}
      </CardContent>

      <CardFooter className="gap-2 pt-0">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={onDismiss}
        >
          Looks Good
        </Button>
        <Button
          size="sm"
          className="flex-1"
          onClick={handleConfirm}
        >
          Confirm
        </Button>
      </CardFooter>
    </Card>
  )
}
