"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { updateWorkOrderLabor } from "@/actions/work-orders"

interface WoLaborSectionProps {
  workOrderId: string
  laborHours: string | null
  laborRate: string | null
  laborActualHours: string | null
  defaultHourlyRate: string | null
  editable: boolean
  showActualHours: boolean
  onLaborChange?: (laborCost: number) => void
}

export function WoLaborSection({
  workOrderId,
  laborHours,
  laborRate,
  laborActualHours,
  defaultHourlyRate,
  editable,
  showActualHours,
  onLaborChange,
}: WoLaborSectionProps) {
  // Local string state for decimal inputs (per MEMORY.md)
  const [localHours, setLocalHours] = useState(laborHours ?? "")
  const [localRate, setLocalRate] = useState(
    laborRate ?? defaultHourlyRate ?? ""
  )
  const [localActual, setLocalActual] = useState(laborActualHours ?? "")
  const [isPending, startTransition] = useTransition()

  const hours = parseFloat(localHours) || 0
  const rate = parseFloat(localRate) || 0
  const laborCost = hours * rate

  function saveField(
    field: "laborHours" | "laborRate" | "laborActualHours",
    value: string,
    setter: (v: string) => void
  ) {
    const n = parseFloat(value)
    const cleaned = isNaN(n) ? null : String(n)
    if (cleaned) setter(String(n))
    else if (value === "") setter("")

    startTransition(async () => {
      const result = await updateWorkOrderLabor(workOrderId, {
        [field]: cleaned,
      })
      if (!result.success) {
        toast.error("Failed to save labor", { description: result.error })
      }
    })

    // Notify parent of the new labor cost
    const newHours = field === "laborHours" ? (parseFloat(cleaned ?? "0") || 0) : hours
    const newRate = field === "laborRate" ? (parseFloat(cleaned ?? "0") || 0) : rate
    onLaborChange?.(newHours * newRate)
  }

  if (!editable && !laborHours && !laborRate) {
    return (
      <p className="text-sm text-muted-foreground italic">No labor set.</p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="labor-hours" className="text-xs text-muted-foreground">
            Est. Hours
          </Label>
          {editable ? (
            <Input
              id="labor-hours"
              className="h-8 text-sm"
              inputMode="decimal"
              placeholder="0"
              value={localHours}
              onChange={(e) => setLocalHours(e.target.value)}
              onBlur={() => saveField("laborHours", localHours, setLocalHours)}
              disabled={isPending}
            />
          ) : (
            <p className="text-sm font-medium">{hours || "—"}</p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="labor-rate" className="text-xs text-muted-foreground">
            Rate / Hour
          </Label>
          {editable ? (
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                $
              </span>
              <Input
                id="labor-rate"
                className="h-8 text-sm pl-6"
                inputMode="decimal"
                placeholder={defaultHourlyRate ?? "0.00"}
                value={localRate}
                onChange={(e) => setLocalRate(e.target.value)}
                onBlur={() => saveField("laborRate", localRate, setLocalRate)}
                disabled={isPending}
              />
            </div>
          ) : (
            <p className="text-sm font-medium">${rate.toFixed(2)}</p>
          )}
        </div>
      </div>

      {laborCost > 0 && (
        <p className="text-sm text-muted-foreground">
          {hours} hrs × ${rate.toFixed(2)}/hr ={" "}
          <span className="font-medium text-foreground">
            ${laborCost.toFixed(2)}
          </span>
        </p>
      )}

      {showActualHours && (
        <div className="flex flex-col gap-1.5 max-w-[50%]">
          <Label htmlFor="labor-actual" className="text-xs text-muted-foreground">
            Actual Hours
          </Label>
          {editable ? (
            <Input
              id="labor-actual"
              className="h-8 text-sm"
              inputMode="decimal"
              placeholder="0"
              value={localActual}
              onChange={(e) => setLocalActual(e.target.value)}
              onBlur={() =>
                saveField("laborActualHours", localActual, setLocalActual)
              }
              disabled={isPending}
            />
          ) : (
            <p className="text-sm font-medium">
              {localActual ? `${localActual} hrs` : "—"}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
