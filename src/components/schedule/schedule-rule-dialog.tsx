"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  createScheduleRule,
  updateScheduleRule,
  type ScheduleFrequency,
  type ScheduleRule,
} from "@/actions/schedule"

// ─── Types ────────────────────────────────────────────────────────────────────

interface Customer {
  id: string
  full_name: string
}

interface Pool {
  id: string
  name: string
  customer_id: string
}

interface Tech {
  id: string
  full_name: string
}

interface ScheduleRuleDialogProps {
  customers: Customer[]
  pools: Pool[]
  techs: Tech[]
  /** If provided, opens in edit mode pre-populated with this rule */
  rule?: ScheduleRule
  trigger?: React.ReactNode
  onSuccess?: () => void
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const FREQUENCY_OPTIONS: { value: ScheduleFrequency; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Bi-weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "custom", label: "Custom" },
]

const DAY_OF_WEEK_OPTIONS = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 0, label: "Sunday" },
]

// ─── Component ─────────────────────────────────────────────────────────────────

/**
 * ScheduleRuleDialog — create or edit a recurring schedule rule.
 *
 * Uses plain React state + inline validation (matches project pattern —
 * NO zod/hookform per known incompatibility documented in MEMORY.md).
 *
 * The dialog receives customers, pools, and techs as props from the server
 * component parent (avoids client-side data fetching). Pool selector filters
 * to pools belonging to the selected customer.
 */
export function ScheduleRuleDialog({
  customers,
  pools,
  techs,
  rule,
  trigger,
  onSuccess,
}: ScheduleRuleDialogProps) {
  const isEdit = !!rule
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Form state — initialized from rule if in edit mode
  const [customerId, setCustomerId] = useState(rule?.customer_id ?? "")
  const [poolId, setPoolId] = useState(rule?.pool_id ?? "")
  const [techId, setTechId] = useState(rule?.tech_id ?? "")
  const [frequency, setFrequency] = useState<ScheduleFrequency>(rule?.frequency ?? "weekly")
  const [customIntervalDays, setCustomIntervalDays] = useState(
    rule?.custom_interval_days ? String(rule.custom_interval_days) : ""
  )
  const [anchorDate, setAnchorDate] = useState(rule?.anchor_date ?? "")
  const [preferredDayOfWeek, setPreferredDayOfWeek] = useState(
    rule?.preferred_day_of_week != null ? String(rule.preferred_day_of_week) : ""
  )
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Pools filtered to the selected customer
  const filteredPools = customerId
    ? pools.filter((p) => p.customer_id === customerId)
    : []

  function resetForm() {
    setCustomerId(rule?.customer_id ?? "")
    setPoolId(rule?.pool_id ?? "")
    setTechId(rule?.tech_id ?? "")
    setFrequency(rule?.frequency ?? "weekly")
    setCustomIntervalDays(rule?.custom_interval_days ? String(rule.custom_interval_days) : "")
    setAnchorDate(rule?.anchor_date ?? "")
    setPreferredDayOfWeek(
      rule?.preferred_day_of_week != null ? String(rule.preferred_day_of_week) : ""
    )
    setErrors({})
  }

  function validate(): boolean {
    const newErrors: Record<string, string> = {}

    if (!customerId) newErrors.customerId = "Customer is required"
    if (!anchorDate) newErrors.anchorDate = "Anchor date is required"
    if (!/^\d{4}-\d{2}-\d{2}$/.test(anchorDate)) newErrors.anchorDate = "Enter date as YYYY-MM-DD"
    if (frequency === "custom") {
      const days = parseInt(customIntervalDays, 10)
      if (!customIntervalDays || isNaN(days) || days < 1) {
        newErrors.customIntervalDays = "Enter a valid interval (minimum 1 day)"
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return

    startTransition(async () => {
      const data = {
        customerId,
        poolId: poolId || undefined,
        techId: techId || undefined,
        frequency,
        customIntervalDays: frequency === "custom" ? parseInt(customIntervalDays, 10) : undefined,
        anchorDate,
        preferredDayOfWeek: preferredDayOfWeek !== "" ? parseInt(preferredDayOfWeek, 10) : undefined,
      }

      let result: { success: boolean; error?: string }

      if (isEdit && rule) {
        result = await updateScheduleRule(rule.id, {
          poolId: poolId || null,
          techId: techId || null,
          frequency,
          customIntervalDays: frequency === "custom" ? parseInt(customIntervalDays, 10) : null,
          anchorDate,
          preferredDayOfWeek: preferredDayOfWeek !== "" ? parseInt(preferredDayOfWeek, 10) : null,
        })
      } else {
        result = await createScheduleRule(data)
      }

      if (result.success) {
        toast.success(isEdit ? "Schedule rule updated" : "Schedule rule created")
        setOpen(false)
        resetForm()
        onSuccess?.()
      } else {
        toast.error(result.error ?? "Something went wrong")
      }
    })
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) resetForm()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant={isEdit ? "outline" : "default"} size="sm">
            {isEdit ? "Edit Rule" : "Add Rule"}
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-[540px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Schedule Rule" : "New Schedule Rule"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the recurring service schedule for this customer."
              : "Set up a recurring service schedule for a customer. Stops will be auto-generated for the next 4 weeks."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4 py-2">
          {/* Customer selector */}
          <div className="grid gap-1.5">
            <Label htmlFor="schedule-customer">
              Customer <span className="text-destructive">*</span>
            </Label>
            <select
              id="schedule-customer"
              value={customerId}
              onChange={(e) => {
                setCustomerId(e.target.value)
                setPoolId("") // Reset pool when customer changes
              }}
              disabled={isEdit} // Customer cannot change on edit
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">Select customer...</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name}
                </option>
              ))}
            </select>
            {errors.customerId && (
              <p className="text-xs text-destructive">{errors.customerId}</p>
            )}
          </div>

          {/* Pool selector */}
          <div className="grid gap-1.5">
            <Label htmlFor="schedule-pool">Pool (optional)</Label>
            <select
              id="schedule-pool"
              value={poolId}
              onChange={(e) => setPoolId(e.target.value)}
              disabled={!customerId}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">All pools / no specific pool</option>
              {filteredPools.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {!customerId && (
              <p className="text-xs text-muted-foreground">Select a customer first</p>
            )}
          </div>

          {/* Tech selector */}
          <div className="grid gap-1.5">
            <Label htmlFor="schedule-tech">Assigned Tech (optional)</Label>
            <select
              id="schedule-tech"
              value={techId}
              onChange={(e) => setTechId(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">Unassigned</option>
              {techs.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.full_name}
                </option>
              ))}
            </select>
          </div>

          {/* Frequency + custom interval in one row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="schedule-frequency">Frequency</Label>
              <select
                id="schedule-frequency"
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as ScheduleFrequency)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                {FREQUENCY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {frequency === "custom" && (
              <div className="grid gap-1.5">
                <Label htmlFor="schedule-interval">
                  Every N days <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="schedule-interval"
                  type="number"
                  min="1"
                  max="365"
                  placeholder="e.g. 10"
                  value={customIntervalDays}
                  onChange={(e) => setCustomIntervalDays(e.target.value)}
                />
                {errors.customIntervalDays && (
                  <p className="text-xs text-destructive">{errors.customIntervalDays}</p>
                )}
              </div>
            )}
          </div>

          {/* Anchor date + preferred day in one row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="schedule-anchor">
                Start Date <span className="text-destructive">*</span>
              </Label>
              <Input
                id="schedule-anchor"
                type="date"
                value={anchorDate}
                onChange={(e) => setAnchorDate(e.target.value)}
              />
              {errors.anchorDate && (
                <p className="text-xs text-destructive">{errors.anchorDate}</p>
              )}
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="schedule-day-of-week">Preferred Day (optional)</Label>
              <select
                id="schedule-day-of-week"
                value={preferredDayOfWeek}
                onChange={(e) => setPreferredDayOfWeek(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">No preference</option>
                {DAY_OF_WEEK_OPTIONS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Frequency change warning in edit mode */}
          {isEdit && (
            <p className="text-xs text-muted-foreground rounded-md border border-border bg-muted/30 px-3 py-2">
              Changing frequency will delete all future stops and regenerate from today.
            </p>
          )}
        </form>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isPending}
            onClick={handleSubmit}
          >
            {isPending
              ? isEdit ? "Saving..." : "Creating..."
              : isEdit ? "Save Changes" : "Create Rule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
