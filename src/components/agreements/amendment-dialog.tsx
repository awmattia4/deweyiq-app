"use client"

/**
 * AmendmentDialog — Creates an amendment for an active service agreement.
 *
 * Classifies changes in real-time:
 * - Major (requires customer re-approval): price change, term_type change, frequency change
 * - Minor (takes effect immediately): checklist change, preferred_day change, notes change
 *
 * Shows a classification badge that updates as the user makes changes.
 */

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import type { AmendmentChanges } from "@/actions/agreements"

// ─── Types ─────────────────────────────────────────────────────────────────────

interface PoolEntry {
  id: string
  pool_id: string
  pool: { id: string; name: string } | null
  frequency: string
  preferred_day_of_week: number | null
  pricing_model: string
  monthly_amount: string | null
  per_visit_amount: string | null
  checklist_task_ids: string[] | null
  notes: string | null
}

interface AmendmentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  agreementNumber: string
  termType: string
  poolEntries: PoolEntry[]
  onSubmit: (changes: AmendmentChanges, changeSummary: string) => Promise<void>
  isSubmitting: boolean
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const TERM_TYPES = [
  { value: "month_to_month", label: "Month-to-Month" },
  { value: "6_month", label: "6-Month Term" },
  { value: "12_month", label: "12-Month Term" },
]

const FREQUENCIES = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Bi-Weekly" },
  { value: "monthly", label: "Monthly" },
]

const DAYS_OF_WEEK = [
  { value: "0", label: "Sunday" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
]

const PRICING_MODELS = [
  { value: "flat_monthly", label: "Flat Monthly" },
  { value: "per_visit", label: "Per Visit" },
]

// ─── Component ─────────────────────────────────────────────────────────────────

export function AmendmentDialog({
  open,
  onOpenChange,
  agreementNumber,
  termType,
  poolEntries,
  onSubmit,
  isSubmitting,
}: AmendmentDialogProps) {
  // Term changes
  const [newTermType, setNewTermType] = useState<string>("")

  // Per-entry price changes: Record<entryId, { pricing_model, monthly_amount, per_visit_amount }>
  const [priceChanges, setPriceChanges] = useState<
    Record<string, { pricing_model?: string; monthly_amount?: string; per_visit_amount?: string }>
  >({})

  // Per-entry frequency changes: Record<entryId, { frequency, preferred_day_of_week }>
  const [frequencyChanges, setFrequencyChanges] = useState<
    Record<string, { frequency?: string; preferred_day_of_week?: number | null }>
  >({})

  // Change summary (auto-populated, editable)
  const [changeSummary, setChangeSummary] = useState("")

  // ── Classification ──────────────────────────────────────────────────────────

  const hasMajorChanges =
    Boolean(newTermType && newTermType !== termType) ||
    Object.keys(priceChanges).length > 0 ||
    Object.keys(frequencyChanges).some((entryId) => {
      const fc = frequencyChanges[entryId]
      return fc.frequency !== undefined
    })

  const hasAnyChanges =
    hasMajorChanges ||
    Boolean(newTermType && newTermType !== termType)

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function updatePriceChange(
    entryId: string,
    field: "pricing_model" | "monthly_amount" | "per_visit_amount",
    value: string
  ) {
    setPriceChanges((prev) => ({
      ...prev,
      [entryId]: { ...(prev[entryId] ?? {}), [field]: value },
    }))
    updateSummary()
  }

  function updateFrequencyChange(
    entryId: string,
    field: "frequency" | "preferred_day_of_week",
    value: string | null
  ) {
    setFrequencyChanges((prev) => ({
      ...prev,
      [entryId]: {
        ...(prev[entryId] ?? {}),
        [field]: field === "preferred_day_of_week" && value !== null ? parseInt(value) : value,
      },
    }))
    updateSummary()
  }

  function updateSummary() {
    // Auto-generate summary (can be overridden)
    setTimeout(() => {
      const parts: string[] = []
      if (newTermType && newTermType !== termType) {
        const label = TERM_TYPES.find((t) => t.value === newTermType)?.label ?? newTermType
        parts.push(`Term changed to ${label}`)
      }
      if (Object.keys(priceChanges).length > 0) {
        parts.push(`Pricing updated for ${Object.keys(priceChanges).length} pool(s)`)
      }
      if (Object.keys(frequencyChanges).length > 0) {
        parts.push(`Service frequency updated for ${Object.keys(frequencyChanges).length} pool(s)`)
      }
      if (parts.length > 0) {
        setChangeSummary((prev) => {
          // Only auto-fill if user hasn't typed a custom summary
          if (!prev) return parts.join(". ")
          return prev
        })
      }
    }, 0)
  }

  function buildChanges(): AmendmentChanges {
    const changes: AmendmentChanges = {}

    if (newTermType && newTermType !== termType) {
      changes.term_type = newTermType
    }

    if (Object.keys(priceChanges).length > 0) {
      changes.priceChanges = priceChanges
    }

    if (Object.keys(frequencyChanges).length > 0) {
      changes.frequencyChanges = frequencyChanges as Record<string, { frequency?: string; preferred_day_of_week?: number | null }>
    }

    return changes
  }

  async function handleSubmit() {
    const changes = buildChanges()
    const summary = changeSummary.trim() || "Agreement amended"
    await onSubmit(changes, summary)
  }

  function handleClose() {
    // Reset state on close
    setNewTermType("")
    setPriceChanges({})
    setFrequencyChanges({})
    setChangeSummary("")
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Amend Agreement {agreementNumber}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Classification indicator */}
          {hasAnyChanges && (
            <div className={`flex items-center gap-2 rounded-md px-3 py-2.5 text-sm ${
              hasMajorChanges
                ? "bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400"
                : "bg-green-500/10 border border-green-500/30 text-green-700 dark:text-green-400"
            }`}>
              <Badge
                variant="outline"
                className={`text-xs font-semibold ${
                  hasMajorChanges
                    ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30"
                    : "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30"
                }`}
              >
                {hasMajorChanges ? "Major Change" : "Minor Change"}
              </Badge>
              <span>
                {hasMajorChanges
                  ? "This will require customer re-approval before taking effect."
                  : "This will take effect immediately and notify the customer."}
              </span>
            </div>
          )}

          {/* Term type */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Term Type</Label>
            <p className="text-xs text-muted-foreground">
              Current: <span className="font-medium">{TERM_TYPES.find((t) => t.value === termType)?.label ?? termType}</span>
            </p>
            <Select value={newTermType} onValueChange={(v) => { setNewTermType(v); updateSummary() }}>
              <SelectTrigger className="h-8">
                <SelectValue placeholder="Select new term type (leave blank to keep current)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Keep current</SelectItem>
                {TERM_TYPES.filter((t) => t.value !== termType).map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* Per-pool entry changes */}
          {poolEntries.map((entry) => (
            <div key={entry.id} className="space-y-3">
              <p className="text-sm font-semibold">
                {entry.pool?.name ?? "Pool"}
              </p>

              {/* Pricing changes */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Pricing Model</Label>
                <p className="text-xs text-muted-foreground">
                  Current: <span className="font-medium">
                    {PRICING_MODELS.find((m) => m.value === entry.pricing_model)?.label ?? entry.pricing_model}
                  </span>
                  {entry.monthly_amount ? ` — $${parseFloat(entry.monthly_amount).toFixed(2)}/mo` : ""}
                  {entry.per_visit_amount ? ` — $${parseFloat(entry.per_visit_amount).toFixed(2)}/visit` : ""}
                </p>
                <div className="flex gap-2">
                  <Select
                    value={priceChanges[entry.id]?.pricing_model ?? ""}
                    onValueChange={(v) => updatePriceChange(entry.id, "pricing_model", v)}
                  >
                    <SelectTrigger className="h-8 flex-1">
                      <SelectValue placeholder="Keep current" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Keep current</SelectItem>
                      {PRICING_MODELS.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {(priceChanges[entry.id]?.pricing_model ?? entry.pricing_model) === "flat_monthly" ? (
                    <div className="relative flex-1">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder={entry.monthly_amount ? parseFloat(entry.monthly_amount).toFixed(2) : "0.00"}
                        value={priceChanges[entry.id]?.monthly_amount ?? ""}
                        onChange={(e) => updatePriceChange(entry.id, "monthly_amount", e.target.value)}
                        className="h-8 w-full rounded-md border border-input bg-background pl-6 pr-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                    </div>
                  ) : (priceChanges[entry.id]?.pricing_model ?? entry.pricing_model) === "per_visit" ? (
                    <div className="relative flex-1">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder={entry.per_visit_amount ? parseFloat(entry.per_visit_amount).toFixed(2) : "0.00"}
                        value={priceChanges[entry.id]?.per_visit_amount ?? ""}
                        onChange={(e) => updatePriceChange(entry.id, "per_visit_amount", e.target.value)}
                        className="h-8 w-full rounded-md border border-input bg-background pl-6 pr-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Frequency changes */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Service Frequency</Label>
                <p className="text-xs text-muted-foreground">
                  Current: <span className="font-medium">
                    {FREQUENCIES.find((f) => f.value === entry.frequency)?.label ?? entry.frequency}
                    {entry.preferred_day_of_week != null ? ` — ${DAYS_OF_WEEK[entry.preferred_day_of_week]?.label}s` : ""}
                  </span>
                </p>
                <div className="flex gap-2">
                  <Select
                    value={frequencyChanges[entry.id]?.frequency ?? ""}
                    onValueChange={(v) => updateFrequencyChange(entry.id, "frequency", v || undefined as unknown as string)}
                  >
                    <SelectTrigger className="h-8 flex-1">
                      <SelectValue placeholder="Keep current" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Keep current</SelectItem>
                      {FREQUENCIES.map((f) => (
                        <SelectItem key={f.value} value={f.value}>
                          {f.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={
                      frequencyChanges[entry.id]?.preferred_day_of_week != null
                        ? String(frequencyChanges[entry.id]?.preferred_day_of_week)
                        : ""
                    }
                    onValueChange={(v) => updateFrequencyChange(entry.id, "preferred_day_of_week", v || null)}
                  >
                    <SelectTrigger className="h-8 flex-1">
                      <SelectValue placeholder="Keep preferred day" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Keep current</SelectItem>
                      {DAYS_OF_WEEK.map((d) => (
                        <SelectItem key={d.value} value={d.value}>
                          {d.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {poolEntries.indexOf(entry) < poolEntries.length - 1 && <Separator />}
            </div>
          ))}

          <Separator />

          {/* Change summary */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">
              Change Summary
              <span className="text-xs font-normal text-muted-foreground ml-1">(sent to customer)</span>
            </Label>
            <Textarea
              value={changeSummary}
              onChange={(e) => setChangeSummary(e.target.value)}
              placeholder="Describe what is changing and why..."
              rows={3}
              className="text-sm"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={isSubmitting || !changeSummary.trim()}
          >
            {isSubmitting ? "Submitting…" : hasMajorChanges ? "Submit for Re-Approval" : "Apply Amendment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
