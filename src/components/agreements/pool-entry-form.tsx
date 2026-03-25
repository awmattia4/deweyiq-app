"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChecklistTask {
  id: string
  label: string
  is_required: boolean
}

export interface PoolInfo {
  id: string
  name: string
  type: string
}

export type PricingModel = "monthly_flat" | "per_visit" | "tiered"
export type FrequencyType = "weekly" | "biweekly" | "monthly" | "custom"

export interface PoolEntryData {
  pool_id: string
  frequency: FrequencyType
  custom_interval_days: number | null
  preferred_day_of_week: number | null
  pricing_model: PricingModel
  monthly_amount: string | null
  per_visit_amount: string | null
  tiered_threshold_visits: number | null
  tiered_base_amount: string | null
  tiered_overage_amount: string | null
  checklist_task_ids: string[]
  notes: string
}

interface PoolEntryFormProps {
  pool: PoolInfo
  checklistTasks: ChecklistTask[]
  value: PoolEntryData
  onChange: (data: PoolEntryData) => void
  onRemove: () => void
  error?: string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FREQUENCY_OPTIONS: { value: FrequencyType; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Bi-weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "custom", label: "Custom interval" },
]

const DAY_OPTIONS = [
  { value: "0", label: "Sunday" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
]

const PRICING_MODELS: { value: PricingModel; label: string; description: string }[] = [
  { value: "monthly_flat", label: "Monthly Flat Rate", description: "Fixed monthly charge regardless of visit count" },
  { value: "per_visit", label: "Per Visit", description: "Charged per service visit completed" },
  { value: "tiered", label: "Tiered", description: "Base rate up to a threshold, then per-visit overage" },
]

// ---------------------------------------------------------------------------
// PoolEntryForm
// ---------------------------------------------------------------------------

export function PoolEntryForm({
  pool,
  checklistTasks,
  value,
  onChange,
  onRemove,
  error,
}: PoolEntryFormProps) {
  // Local string state for decimal inputs (MEMORY.md controlled decimal pattern)
  const [monthlyAmountStr, setMonthlyAmountStr] = useState<string>(value.monthly_amount ?? "")
  const [perVisitAmountStr, setPerVisitAmountStr] = useState<string>(value.per_visit_amount ?? "")
  const [tieredBaseStr, setTieredBaseStr] = useState<string>(value.tiered_base_amount ?? "")
  const [tieredOverageStr, setTieredOverageStr] = useState<string>(value.tiered_overage_amount ?? "")

  function update(partial: Partial<PoolEntryData>) {
    onChange({ ...value, ...partial })
  }

  function flushDecimal(
    strVal: string,
    field: "monthly_amount" | "per_visit_amount" | "tiered_base_amount" | "tiered_overage_amount"
  ) {
    const parsed = parseFloat(strVal)
    if (!isNaN(parsed)) {
      update({ [field]: parsed.toFixed(2) })
    } else if (strVal === "" || strVal === "-") {
      update({ [field]: null })
    }
  }

  function handleDecimalChange(
    raw: string,
    setter: (s: string) => void,
    field: "monthly_amount" | "per_visit_amount" | "tiered_base_amount" | "tiered_overage_amount"
  ) {
    setter(raw)
    // Only flush when value is a complete number (doesn't end in '.' or '-')
    if (raw === "" || raw === "-" || raw.endsWith(".")) return
    const parsed = parseFloat(raw)
    if (!isNaN(parsed)) {
      update({ [field]: parsed.toFixed(2) })
    }
  }

  function toggleTask(taskId: string) {
    const current = new Set(value.checklist_task_ids)
    if (current.has(taskId)) {
      current.delete(taskId)
    } else {
      current.add(taskId)
    }
    update({ checklist_task_ids: Array.from(current) })
  }

  const poolTypeLabel = pool.type === "spa" ? "Spa" : pool.type === "hot_tub" ? "Hot Tub" : "Pool"

  return (
    <Card className={cn("border", error ? "border-destructive/50" : "border-border")}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-sm font-semibold">{pool.name}</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">{poolTypeLabel}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-destructive h-7 px-2 text-xs"
            onClick={onRemove}
          >
            Remove
          </Button>
        </div>
        {error && <p className="text-xs text-destructive mt-1">{error}</p>}
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {/* Frequency */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Service Frequency</Label>
            <Select
              value={value.frequency}
              onValueChange={(v) => update({ frequency: v as FrequencyType, custom_interval_days: null })}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FREQUENCY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="text-xs">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Preferred Day</Label>
            <Select
              value={value.preferred_day_of_week !== null ? String(value.preferred_day_of_week) : "any"}
              onValueChange={(v) => update({ preferred_day_of_week: v === "any" ? null : parseInt(v) })}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any" className="text-xs">Any day</SelectItem>
                {DAY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="text-xs">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Custom interval (only when frequency = 'custom') */}
        {value.frequency === "custom" && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Interval (days)</Label>
            <Input
              type="number"
              min={1}
              className="h-8 text-xs w-32"
              placeholder="e.g. 10"
              value={value.custom_interval_days ?? ""}
              onChange={(e) => {
                const n = parseInt(e.target.value)
                update({ custom_interval_days: isNaN(n) ? null : n })
              }}
            />
          </div>
        )}

        {/* Pricing model */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Pricing Model</Label>
          <div className="grid grid-cols-1 gap-2">
            {PRICING_MODELS.map((model) => (
              <label
                key={model.value}
                className={cn(
                  "flex items-start gap-3 rounded-md border p-3 cursor-pointer transition-colors",
                  value.pricing_model === model.value
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-border/80 hover:bg-muted/30"
                )}
              >
                <input
                  type="radio"
                  name={`pricing-${pool.id}`}
                  value={model.value}
                  checked={value.pricing_model === model.value}
                  onChange={() => update({
                    pricing_model: model.value,
                    monthly_amount: null,
                    per_visit_amount: null,
                    tiered_threshold_visits: null,
                    tiered_base_amount: null,
                    tiered_overage_amount: null,
                  })}
                  className="mt-0.5 accent-primary"
                />
                <div>
                  <p className="text-xs font-medium">{model.label}</p>
                  <p className="text-xs text-muted-foreground">{model.description}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Pricing inputs — conditional on model */}
        {value.pricing_model === "monthly_flat" && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Monthly Amount ($)</Label>
            <Input
              type="text"
              inputMode="decimal"
              className="h-8 text-xs w-40"
              placeholder="0.00"
              value={monthlyAmountStr}
              onChange={(e) => handleDecimalChange(e.target.value, setMonthlyAmountStr, "monthly_amount")}
              onBlur={() => flushDecimal(monthlyAmountStr, "monthly_amount")}
            />
          </div>
        )}

        {value.pricing_model === "per_visit" && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Per Visit Amount ($)</Label>
            <Input
              type="text"
              inputMode="decimal"
              className="h-8 text-xs w-40"
              placeholder="0.00"
              value={perVisitAmountStr}
              onChange={(e) => handleDecimalChange(e.target.value, setPerVisitAmountStr, "per_visit_amount")}
              onBlur={() => flushDecimal(perVisitAmountStr, "per_visit_amount")}
            />
          </div>
        )}

        {value.pricing_model === "tiered" && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Base visits per month (threshold)</Label>
              <Input
                type="number"
                min={1}
                className="h-8 text-xs w-32"
                placeholder="e.g. 4"
                value={value.tiered_threshold_visits ?? ""}
                onChange={(e) => {
                  const n = parseInt(e.target.value)
                  update({ tiered_threshold_visits: isNaN(n) ? null : n })
                }}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">Base rate per visit ($)</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  className="h-8 text-xs"
                  placeholder="0.00"
                  value={tieredBaseStr}
                  onChange={(e) => handleDecimalChange(e.target.value, setTieredBaseStr, "tiered_base_amount")}
                  onBlur={() => flushDecimal(tieredBaseStr, "tiered_base_amount")}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">Overage rate per visit ($)</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  className="h-8 text-xs"
                  placeholder="0.00"
                  value={tieredOverageStr}
                  onChange={(e) => handleDecimalChange(e.target.value, setTieredOverageStr, "tiered_overage_amount")}
                  onBlur={() => flushDecimal(tieredOverageStr, "tiered_overage_amount")}
                />
              </div>
            </div>
          </div>
        )}

        {/* Service checklist */}
        {checklistTasks.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Services Included</Label>
            <div className="flex flex-col gap-1 rounded-md border border-border p-3 max-h-40 overflow-y-auto">
              {checklistTasks.map((task) => (
                <label key={task.id} className="flex items-center gap-2 cursor-pointer py-0.5">
                  <Checkbox
                    checked={value.checklist_task_ids.includes(task.id)}
                    onCheckedChange={() => toggleTask(task.id)}
                    className="h-3.5 w-3.5"
                  />
                  <span className="text-xs">{task.label}</span>
                  {task.is_required && (
                    <span className="text-xs text-muted-foreground">(required)</span>
                  )}
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Pool Notes</Label>
          <Textarea
            className="text-xs min-h-[60px] resize-none"
            placeholder="Special instructions for this pool..."
            value={value.notes}
            onChange={(e) => update({ notes: e.target.value })}
          />
        </div>
      </CardContent>
    </Card>
  )
}
